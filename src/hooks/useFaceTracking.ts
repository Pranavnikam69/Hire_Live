import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import toast from "react-hot-toast";
import { playWarningSound } from "@/lib/audio";
import { useCall } from "@stream-io/video-react-sdk";

export const useFaceTracking = (
  videoElement: HTMLVideoElement | null,
  { enabled = true, isTyping = false, shouldSuppressFaceAntiCheat = false }: { enabled?: boolean; isTyping?: boolean; shouldSuppressFaceAntiCheat?: boolean } = {},
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
  const consecutiveSpeakingFrames = useRef(0);

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
            minFaceDetectionConfidence: 0.3, // Lowered for side profile sensitivity
            minFacePresenceConfidence: 0.3, // Lowered for side profile sensitivity
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
        const startTimeMs = performance.now();
        
        try {
          const results = faceLandmarker.detectForVideo(videoElement, startTimeMs);

          if (results.faceLandmarks.length === 0) {
            if (shouldSuppressFaceAntiCheat) {
              consecutiveNoFaceFrames.current = 0;
            } else {
              consecutiveNoFaceFrames.current++;
              consecutiveMultiFaceFrames.current = 0;
              if (consecutiveNoFaceFrames.current === 90) {
                playWarningSound("Warning! Face not detected.");
                toast.error("Warning: Face not detected!", { id: "no-face", duration: 3000 });
                call?.sendCustomEvent({ 
                  type: "cheat-alert", 
                  reason: "Face is not visible!",
                  timestamp: new Date().toISOString()
                });
                consecutiveNoFaceFrames.current = 0;
              }
            }
          } else if (results.faceLandmarks.length > 1) {
            if (shouldSuppressFaceAntiCheat) {
              consecutiveMultiFaceFrames.current = 0;
            } else {
              consecutiveMultiFaceFrames.current++;
              consecutiveNoFaceFrames.current = 0;
              if (consecutiveMultiFaceFrames.current === 60) {
                playWarningSound("Warning! Multiple faces detected.");
                toast.error("Warning: Multiple faces detected!", { id: "multi-face", duration: 3000 });
                call?.sendCustomEvent({ 
                  type: "cheat-alert", 
                  reason: "Multiple faces detected!",
                  timestamp: new Date().toISOString()
                });
                consecutiveMultiFaceFrames.current = 0;
              }
            }
          } else {
            consecutiveNoFaceFrames.current = 0;
            consecutiveMultiFaceFrames.current = 0;

            let lookRight = 0, lookLeft = 0, lookUp = 0, lookDown = 0;
            let mouthActivity = 0;

            if (results.faceBlendshapes && results.faceBlendshapes[0]) {
              const blendshapes = results.faceBlendshapes[0].categories;
              
              // Eye Tracking
              lookRight = Math.max(
                blendshapes.find(b => b.categoryName === "eyeLookInLeft")?.score || 0,
                blendshapes.find(b => b.categoryName === "eyeLookOutRight")?.score || 0
              );
              lookLeft = Math.max(
                blendshapes.find(b => b.categoryName === "eyeLookOutLeft")?.score || 0,
                blendshapes.find(b => b.categoryName === "eyeLookInRight")?.score || 0
              );
              lookUp = Math.max(
                blendshapes.find(b => b.categoryName === "eyeLookUpLeft")?.score || 0,
                blendshapes.find(b => b.categoryName === "eyeLookUpRight")?.score || 0
              );
              lookDown = Math.max(
                blendshapes.find(b => b.categoryName === "eyeLookDownLeft")?.score || 0,
                blendshapes.find(b => b.categoryName === "eyeLookDownRight")?.score || 0
              );

              // Mouth Activity (Talking Detection)
              const jawOpen = blendshapes.find(b => b.categoryName === "jawOpen")?.score || 0;
              const mouthLowerDownLeft = blendshapes.find(b => b.categoryName === "mouthLowerDownLeft")?.score || 0;
              const mouthLowerDownRight = blendshapes.find(b => b.categoryName === "mouthLowerDownRight")?.score || 0;
              const mouthPucker = blendshapes.find(b => b.categoryName === "mouthPucker")?.score || 0;
              
              mouthActivity = Math.max(jawOpen, mouthLowerDownLeft, mouthLowerDownRight, mouthPucker);
            }

            // Speaking State: Maintain "isSpeaking" for 30 frames (~1s) after last movement
            if (mouthActivity > 0.12) {
              consecutiveSpeakingFrames.current = 30; 
            } else if (consecutiveSpeakingFrames.current > 0) {
              consecutiveSpeakingFrames.current--;
            }
            const isActuallySpeaking = consecutiveSpeakingFrames.current > 0;

            const landmarks = results.faceLandmarks[0];
            if (landmarks && landmarks.length > 454) {
              const nose = landmarks[1];
              const leftEdge = landmarks[234];
              const rightEdge = landmarks[454];
              const topEdge = landmarks[10];
              const bottomEdge = landmarks[152];

              const yawRatio = Math.abs(nose.x - leftEdge.x) / Math.abs(rightEdge.x - nose.x);
              const pitchRatio = Math.abs(topEdge.y - nose.y) / Math.abs(bottomEdge.y - nose.y);

              // Refined Gaze Thresholds (Optimized for Screen-Safe Movement)
              // We loosen these significantly to ensure the entire monitor is a "Safe Zone"
              const YAW_SAFE_MIN = 0.15;
              const YAW_SAFE_MAX = 10.0;
              const PITCH_SAFE_MIN = 0.50;
              const PITCH_SAFE_MAX = 4.5;
              const EYE_SAFE_MAX = 0.70;

              const isGazeOffScreen = 
                pitchRatio > PITCH_SAFE_MAX || pitchRatio < PITCH_SAFE_MIN ||
                yawRatio > YAW_SAFE_MAX || yawRatio < YAW_SAFE_MIN ||
                lookRight > EYE_SAFE_MAX || lookLeft > EYE_SAFE_MAX ||
                lookDown > 0.60; // Gaze down at phone/notes

              // Significant Moves (Extreme deviations, e.g. turning 90 degrees away)
              const isSignificantMove = 
                pitchRatio > 6.0 || pitchRatio < 0.35 || 
                yawRatio > 12.0 || yawRatio < 0.10 || 
                lookRight > 0.90 || lookLeft > 0.90;

              let suspicionIncrement = 0;

              if (shouldSuppressFaceAntiCheat || isActuallySpeaking) {
                // Conversational Mode (Answering or Listening)
                // We ONLY trigger if the gaze is clearly OFF-SCREEN for a sustained duration
                if (isSignificantMove) {
                  suspicionIncrement = 1.5; // Rapid alert for significant/blatant moves
                } else if (isGazeOffScreen) {
                  suspicionIncrement = 0.6; // ~4.5 second trigger for sustained eye movement in a different direction
                } else {
                  suspicionIncrement = 0; // Neutral - looking around the screen or at interviewer is safe
                }
              } else if (isGazeOffScreen) {
                // Strict Monitoring (Silent)
                if (isTyping) {
                  // Coding Grace Mode: ~5 seconds of looking away
                  suspicionIncrement = 0.5; 
                } else {
                  // Strict Normal Mode: ~2.6 seconds
                  const isSevere = pitchRatio > 5.0 || yawRatio > 8.0 || yawRatio < 0.12;
                  suspicionIncrement = isSevere ? 3 : 1; 
                }
              }

              if (suspicionIncrement > 0) {
                consecutiveLookingAwayFrames.current += suspicionIncrement;
                if (consecutiveLookingAwayFrames.current >= 80) {
                  playWarningSound("Warning! Look at the screen.");
                  toast.error("Warning: Please look at the screen!", { id: "looking-away", duration: 3000 });
                  
                  call?.sendCustomEvent({ 
                    type: "cheat-alert", 
                    reason: "Student is looking away!",
                    timestamp: new Date().toISOString()
                  });
                  consecutiveLookingAwayFrames.current = 0;
                }
              } else {
                // Decay suspicion: Slower when silent to catch "pulsing" cheaters
                // When typing, speaking, or listening to interviewer, we also use a slower decay (1) so that the relatively small increments (0.5 and 0.7) can accumulate correctly over time.
                const decayRate = isTyping ? 1 : (isActuallySpeaking || shouldSuppressFaceAntiCheat) ? 1 : 2;
                consecutiveLookingAwayFrames.current = Math.max(0, consecutiveLookingAwayFrames.current - decayRate);
              }
            }
          }
        } catch (e) {
          console.error("Face tracking error:", e);
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
  }, [videoElement, isModelLoaded, faceLandmarker, call, isTyping, shouldSuppressFaceAntiCheat]);

  return { isModelLoaded };
};
