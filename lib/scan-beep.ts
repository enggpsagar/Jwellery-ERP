"use client"

// A single shared AudioContext, created lazily on first beep — every
// beep() call always follows a user gesture (clicking "Use this camera" /
// "Scan with phone" before any scan can land), so autoplay restrictions
// never block it.
let audioContext: AudioContext | null = null

/**
 * Short confirmation beep played once a scanned tag is successfully added
 * as a line item — audible feedback that a scan landed, since the counter
 * scanning a tag is rarely looking at the screen.
 */
export function playScanBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audioContext ??= new Ctx()
    if (audioContext.state === "suspended") {
      void audioContext.resume()
    }

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.2, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.15)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.15)
  } catch {
    // Not essential to the scan flow — a browser blocking Web Audio just
    // stays silent, the toast/line item still confirms the add.
  }
}
