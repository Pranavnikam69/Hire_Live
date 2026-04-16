let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

/**
 * Browsers block audio until the user interacts with the page.
 * Call this function on any user click
 */
export const unlockAudio = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx
        .resume()
        .catch((err) => console.error("Could not resume audio ctx", err));
    }
  } catch (err) {
    console.error("Failed to unlock audio:", err);
  }
};

/**
 * Plays a loud synthetic 'beep' using the native Web Audio API.
 * This is highly reliable cross-browser if unlocked by a user interaction.
 */
export const playWarningSound = (message?: string) => {
  try {
    const ctx = getAudioContext();

    // Attempt to resume just in case
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // Create an oscillator (the sound source)
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Harsh sounding wave for a warning
    oscillator.type = "square";
    oscillator.frequency.value = 440; // Pitch (A4)

    // Very short, loud beep
    gainNode.gain.value = 0.2;

    oscillator.start();

    // Stop after 400ms using a simple timeout to avoid calculating absolute ramp times
    setTimeout(() => {
      try {
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
      } catch (e) {}
    }, 400);
  } catch (err) {
    console.error("Audio Context prevented or failed:", err);
  }
};
