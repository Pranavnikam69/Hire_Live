import {
  CallingState,
  CallParticipantsList,
  PaginatedGridLayout,
  SpeakerLayout,
  useCallStateHooks,
  RecordCallButton,
  ReactionsButton,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
  CancelCallButton,
} from "@stream-io/video-react-sdk";
import { LayoutListIcon, LoaderIcon, UsersIcon, CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import EndCallButton from "./EndCallButton";
import CodeEditor from "./CodeEditor";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { useUserRole } from "@/hooks/useUserRole";
import { useUser } from "@clerk/nextjs";
import { useCall } from "@stream-io/video-react-sdk";
import { useEffect, useRef } from "react";
import { unlockAudio } from "@/lib/audio";

function MeetingRoom() {
  const router = useRouter();
  const [layout, setLayout] = useState<"grid" | "speaker">("speaker");
  const [showParticipants, setShowParticipants] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const { useCallCallingState, useLocalParticipant, useParticipants } = useCallStateHooks();

  const callingState = useCallCallingState();
  const localParticipant = useLocalParticipant();
  const { user } = useUser();
  const participants = useParticipants();
  const call = useCall();
  const { isInterviewer: isInterviewerRole, isLoading: roleLoading } = useUserRole();

  // The creator of the meeting is the Interviewer, OR if they have the explicit role
  const isInterviewer = call?.state?.createdBy?.id === user?.id || isInterviewerRole;
  const isCandidate = !isInterviewer;

  // Detect if the host/interviewer is speaking
  const isInterviewerSpeaking = participants.some(
    (p) => p.userId === call?.state?.createdBy?.id && p.isSpeaking && p.userId !== user?.id
  );

  const handleKick = async () => {
    if (call) {
      await call.leave();
    }
    router.push("/");
  };

  // Basic Anti-Cheat Tracker (Tabs + Cursor + Fullscreen)
  const { isFullscreen, setIsFullscreen, warnings } = useAntiCheat({
    enabled: isCandidate,
    onKick: handleKick,
  });

  // Face Tracking initialization via hidden video element
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isModelLoaded } = useFaceTracking(videoRef.current, {
    enabled: isCandidate,
    isTyping,
    isInterviewerSpeaking,
  });

  useEffect(() => {
    // We capture the webcam stream from the existing Stream Video SDK track
    // to prevent hardware conflicts (requesting the camera twice)
    const videoStream = localParticipant?.videoStream;

    if (videoRef.current && videoStream) {
      if (videoRef.current.srcObject !== videoStream) {
        videoRef.current.srcObject = videoStream;
      }
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [localParticipant?.videoStream]);

  useEffect(() => {
    if (!call) return;
    const unsubscribe = call.on("custom", (event) => {
      // Robust check for interviewer to show toast
      const isActuallyInterviewer = call.state.createdBy?.id === user?.id || isInterviewerRole;
      
      if (event.custom?.type === "cheat-alert" && isActuallyInterviewer) {
        toast.error(`Anti-Cheat Alert: ${event.custom.reason}`, {
          duration: 6000,
          position: "top-center",
          id: `alert-${event.custom.timestamp || Date.now()}` // Unique ID to prevent missing alerts
        });
      }
    });

    return () => unsubscribe();
  }, [call, user?.id, isInterviewerRole]);

  useEffect(() => {
    if (isCandidate && isModelLoaded) {
      const interval = setInterval(() => {
        console.log("[AntiCheat] Heartbeat: Monitor Active");
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isCandidate, isModelLoaded]);

  if (callingState !== CallingState.JOINED) {
    return (
      <div className="h-96 flex items-center justify-center">
        <LoaderIcon className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem-1px)] relative">
      {/* FULLSCREEN ENFORCEMENT OVERLAY */}
      {!isFullscreen && isCandidate && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
          <div className="max-w-md text-center space-y-4 p-8 border rounded-xl shadow-xl bg-card">
            <h2 className="text-2xl font-bold text-destructive">
              Interview Paused
            </h2>
            <p className="text-destructive font-medium">
              Warning {warnings} of 3
            </p>
            <p className="text-muted-foreground">
              Tab switching or exiting the window is strictly prohibited during
              the interview. Please return to fullscreen to continue.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={async () => {
                // Ensure audio is unlocked if they somehow bypassed the setup interaction
                unlockAudio();

                try {
                  const isCurrentlyFullscreen = Boolean(
                    document.fullscreenElement ||
                      (document as any).webkitFullscreenElement ||
                      (document as any).mozFullScreenElement ||
                      (document as any).msFullscreenElement,
                  );

                  if (!isCurrentlyFullscreen) {
                    await document.documentElement.requestFullscreen();
                  }

                  // Force the internal state back to true to lift the lock
                  setIsFullscreen(true);
                } catch (err: any) {
                  console.error("Error attempting to enable fullscreen:", err);
                }
              }}
            >
              Return to Fullscreen
            </Button>
          </div>
        </div>
      )}

      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel
          defaultSize={35}
          minSize={25}
          maxSize={100}
          className="relative"
        >
          {/* Hidden video element for Face Tracking Data */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute opacity-0 w-1 h-1 pointer-events-none"
          />

          {/* VIDEO LAYOUT */}
          <div className="absolute inset-0">
            {layout === "grid" ? <PaginatedGridLayout /> : <SpeakerLayout />}

            {/* PARTICIPANTS LIST OVERLAY */}
            {showParticipants && (
              <div className="absolute right-0 top-0 h-full w-[300px] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <CallParticipantsList
                  onClose={() => setShowParticipants(false)}
                />
              </div>
            )}
          </div>

          {/* VIDEO CONTROLS */}

          <div className="absolute bottom-4 left-0 right-0">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 flex-wrap justify-center px-4">
                <div className="str-video__call-controls">
                  <RecordCallButton />
                  <ReactionsButton />
                  <ToggleAudioPublishingButton />
                  <ToggleVideoPublishingButton />
                  <CancelCallButton onLeave={() => router.push("/")} />
                </div>

                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="size-10">
                        <LayoutListIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setLayout("grid")}>
                        Grid View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLayout("speaker")}>
                        Speaker View
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    onClick={() => setShowParticipants(!showParticipants)}
                  >
                    <UsersIcon className="size-4" />
                  </Button>

                  <Button
                    variant="outline"
                    title="Copy Meeting Link"
                    size="icon"
                    className="size-10"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success("Meeting link copied to clipboard");
                    }}
                  >
                    <CopyIcon className="size-4" />
                  </Button>

                  <EndCallButton />
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={65} minSize={25}>
          <CodeEditor isCandidate={isCandidate} onTypingStatusChange={setIsTyping} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
export default MeetingRoom;
