import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { playWarningSound } from "@/lib/audio";
import { useCall } from "@stream-io/video-react-sdk";

export const useAntiCheat = ({ enabled = true, onKick }: { enabled?: boolean, onKick?: () => void } = {}) => {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const call = useCall();
  const [warnings, setWarnings] = useState(0);
  const onKickRef = useRef(onKick);

  useEffect(() => {
    onKickRef.current = onKick;
  }, [onKick]);

  useEffect(() => {
    if (!enabled) {
      console.log("[AntiCheat] Disabled for this role, skipping.");
      return;
    }

    let warningCount = 0; // Local variable to maintain count accurately across event listeners

    const triggerWarning = (reason: string, toastMessage: string) => {
      warningCount += 1;
      setWarnings(warningCount);
      
      if (warningCount >= 3) {
        toast.error("Maximum warnings reached. You have been removed from the interview.");
        playWarningSound("Maximum warnings reached. You are being removed.");
        if (onKickRef.current) {
           onKickRef.current();
        }
        return;
      }

      playWarningSound(`Warning ${warningCount} of 3! ${reason}`);
      toast.error(`${toastMessage} (Warning ${warningCount}/3)`, {
        duration: 4000,
        position: "top-center",
      });

      call?.sendCustomEvent({
        type: "cheat-alert",
        reason: toastMessage
      });
    };

    console.log("[AntiCheat] Hook mounted, attaching listeners");
    // Initial verification
    const isCurrentlyFullscreen = Boolean(
      document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement,
    );
    console.log("[AntiCheat] Initial fullscreen state:", isCurrentlyFullscreen);
    setIsFullscreen(isCurrentlyFullscreen);

    // 1. Tab Switching Detection (Visibility API)
    const handleVisibilityChange = () => {
      console.log(
        "[AntiCheat] visibilitychange fired! document.hidden =",
        document.hidden,
      );
      if (document.hidden) {
        setIsFullscreen(false);
        triggerWarning("Tab switching is strictly prohibited.", "Warning: Tab switching is not allowed during the interview!");
        if (document.fullscreenElement) {
          document.exitFullscreen().catch((err) => console.error(err));
        }
      }
    };

    // 2. Window Blur Detection (Application loses focus)
    const handleWindowBlur = () => {
      console.log("[AntiCheat] window blur fired!");
      setIsFullscreen(false);
      triggerWarning("You must keep the interview application focused.", "Warning: Please keep the interview window focused!");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch((err) => console.error(err));
      }
    };

    // 3. Cursor Tracking Detection (Cursor leaves the document)
    const handleMouseLeave = (e: MouseEvent) => {
      // If the mouse leaves from the top, bottom, left or right edge of the viewport
      if (
        e.clientY <= 0 ||
        e.clientX <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        triggerWarning("Your cursor has left the interview screen.", "Warning: Cursor left the interview window!");
      }
    };

    // 4. Fullscreen Detection
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement,
      );
      setIsFullscreen(isCurrentlyFullscreen);

      if (!isCurrentlyFullscreen) {
        triggerWarning("You have exited fullscreen mode.", "Warning: Please return to fullscreen mode!");
      }
    };

    // 5. Prevent Tab Closing / Refreshing
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Most modern browsers require this to trigger the warning dialog
      e.returnValue =
        "Are you sure you want to leave the interview? Your progress may be lost.";
      return e.returnValue;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Add Fullscreen Listeners
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      console.log("[AntiCheat] Hook unmounted, removing listeners");
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.documentElement.removeEventListener(
        "mouseleave",
        handleMouseLeave,
      );
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange,
      );
    };
  }, [enabled, call]);

  return { isFullscreen, setIsFullscreen, warnings };
};
