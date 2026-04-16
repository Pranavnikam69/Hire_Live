import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import toast from "react-hot-toast";
import { playWarningSound } from "@/lib/audio";
import { useCall } from "@stream-io/video-react-sdk";

export const useFaceTracking = (
  videoElement: HTMLVideoElement | null,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null,
  );
  const call = useCall();
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const animationRef = useRef<number>();
  const lastVideoTimeRef = useRef(-1);
  const consecutiveNoFaceFrames = useRef(0);
  const consecutiveMultiFaceFrames = useRef(0);
  const consecutiveLookingAwayFrames = useRef(0);

  // Initialize MediaPipe Face Landmarker
  useEffect(() => {
    if (!enabled) return;

    const initModel = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
        );
        const landmarker = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "GPU",
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 2, // We want to detect if >1 person is in the frame
          },
        );
        setFaceLandmarker(landmarker);
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Failed to load Face Tracking model:", error);
      }
    };
    initModel();

    return () => {
      if (faceLandmarker) {
        faceLandmarker.close();
      }
    };
  }, []);

  // Run predictions when video is playing
  useEffect(() => {
    if (!enabled || !videoElement || !isModelLoaded || !faceLandmarker) return;

    const predict = () => {
      if (videoElement.readyState >= 2) {
        let startTimeMs = performance.now();
        if (lastVideoTimeRef.current !== videoElement.currentTime) {
          lastVideoTimeRef.current = videoElement.currentTime;

          try {
            // Pass the video element to the detector
            const results = faceLandmarker.detectForVideo(
              videoElement,
              startTimeMs,
            );

            // Evaluate results:
            if (results.faceLandmarks.length === 0) {
              consecutiveNoFaceFrames.current++;
              consecutiveMultiFaceFrames.current = 0;
              // Trigger warning after ~3 seconds (90 frames)
              if (consecutiveNoFaceFrames.current === 90) {
                playWarningSound(
                  "Warning! Face not detected. Please look at the camera immediately.",
                );
                toast.error(
                  "Warning: Face not detected. Please look at the camera!",
                  {
                    id: "no-face-warning",
                    duration: 3000,
                  },
                );
                call?.sendCustomEvent({
                  type: "cheat-alert",
                  reason: "Student's face is not visible!"
                });
                // reset counter to allow subsequent warnings
                consecutiveNoFaceFrames.current = 0;
              }
            } else if (results.faceLandmarks.length > 1) {
              consecutiveMultiFaceFrames.current++;
              consecutiveNoFaceFrames.current = 0;
              if (consecutiveMultiFaceFrames.current === 60) {
                playWarningSound(
                  "Warning! Multiple faces detected in the interview.",
                );
                toast.error("Warning: Multiple faces detected!", {
                  id: "multi-face-warning",
                  duration: 3000,
                });
                call?.sendCustomEvent({
                  type: "cheat-alert",
                  reason: "Multiple faces detected!"
                });
                consecutiveMultiFaceFrames.current = 0;
              }
            } else {
              // Normal (1 face)
              consecutiveNoFaceFrames.current = 0;
              consecutiveMultiFaceFrames.current = 0;

              // Default eye tracking variables
              let lookRight = 0, lookLeft = 0, lookUp = 0, lookDown = 0;

              // Check blendshapes for eye tracking
              if (results.faceBlendshapes && results.faceBlendshapes[0]) {
                const blendshapes = results.faceBlendshapes[0].categories;
                
                const eyeLookInLeft = blendshapes.find(b => b.categoryName === "eyeLookInLeft")?.score || 0;
                const eyeLookOutRight = blendshapes.find(b => b.categoryName === "eyeLookOutRight")?.score || 0;
                const eyeLookOutLeft = blendshapes.find(b => b.categoryName === "eyeLookOutLeft")?.score || 0;
                const eyeLookInRight = blendshapes.find(b => b.categoryName === "eyeLookInRight")?.score || 0;
                const eyeLookUpLeft = blendshapes.find(b => b.categoryName === "eyeLookUpLeft")?.score || 0;
                const eyeLookUpRight = blendshapes.find(b => b.categoryName === "eyeLookUpRight")?.score || 0;
                const eyeLookDownLeft = blendshapes.find(b => b.categoryName === "eyeLookDownLeft")?.score || 0;
                const eyeLookDownRight = blendshapes.find(b => b.categoryName === "eyeLookDownRight")?.score || 0;

                // Use Math.max instead of average so if even ONE eye rolls up, it triggers
                lookRight = Math.max(eyeLookInLeft, eyeLookOutRight);
                lookLeft = Math.max(eyeLookOutLeft, eyeLookInRight);
                lookUp = Math.max(eyeLookUpLeft, eyeLookUpRight);
                lookDown = Math.max(eyeLookDownLeft, eyeLookDownRight);
              }

              // Check Eyesight / Head Pose (Looking Away)
              const landmarks = results.faceLandmarks[0];
              if (landmarks && landmarks.length > 454) {
                const nose = landmarks[1];
                const leftEdge = landmarks[234];
                const rightEdge = landmarks[454];
                const topEdge = landmarks[10];
                const bottomEdge = landmarks[152];

                // Basic Yaw calculation (left/right head turn)
                const leftDist = Math.abs(nose.x - leftEdge.x);
                const rightDist = Math.abs(rightEdge.x - nose.x);
                const yawRatio = leftDist / rightDist;

                // Basic Pitch calculation (up/down head turn)
                const topDist = Math.abs(topEdge.y - nose.y);
                const botDist = Math.abs(bottomEdge.y - nose.y);
                const pitchRatio = topDist / botDist;

                const HORIZ_EYE_THRESHOLD = 0.25; // Tightened to 0.25 to catch left-side cheating
                const DOWN_EYE_THRESHOLD = 0.40;
                const UP_EYE_THRESHOLD = 0.15; // Above mathematical noise floor
                let suspicionIncrement = 0;

                // 1. Highly suspicious: Looking UP/DOWN (pitch heavily skewed, or eyes looking up/down)
                // pitchRatio becomes small (< 1.0) when looking UP. pitchRatio becomes large (> 1.0) when looking DOWN.
                if (pitchRatio > 3.0 || pitchRatio < 0.50 || lookDown > DOWN_EYE_THRESHOLD || lookUp > UP_EYE_THRESHOLD) {
                  suspicionIncrement = 1; // Builds normally (~2 seconds to trigger)
                }
                // 2. Mildly suspicious: Looking LEFT/RIGHT
                else if (yawRatio > 4.0 || yawRatio < 0.35 || lookRight > HORIZ_EYE_THRESHOLD || lookLeft > HORIZ_EYE_THRESHOLD) {
                  suspicionIncrement = 1; // Builds normally (~2 seconds to trigger)
                }

                if (suspicionIncrement > 0) {
                  consecutiveLookingAwayFrames.current += suspicionIncrement;
                  if (consecutiveLookingAwayFrames.current >= 60) {
                    playWarningSound(
                      "Warning! You must look directly at the screen.",
                    );
                    toast.error("Warning: Please look at the screen!", {
                      id: "looking-away-warning",
                      duration: 3000,
                    });
                    call?.sendCustomEvent({
                      type: "cheat-alert",
                      reason: "Student is looking away from the screen!"
                    });
                    consecutiveLookingAwayFrames.current = 0;
                  }
                } else {
                  // Cool down suspicion gradually if they look forward
                  // Decay by 2 per frame prevents "flashing" or repeating cheat looks
                  consecutiveLookingAwayFrames.current = Math.max(0, consecutiveLookingAwayFrames.current - 2);
                }
              }
            }
          } catch (e) {
            console.error("Face detection error: ", e);
          }
        }
      }
      animationRef.current = requestAnimationFrame(predict);
    };

    animationRef.current = requestAnimationFrame(predict);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [videoElement, isModelLoaded, faceLandmarker, call]);

  return { isModelLoaded };
};
