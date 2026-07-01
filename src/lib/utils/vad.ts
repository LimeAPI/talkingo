/**
 * Voice Activity Detector (VAD)
 *
 * Monitors mic energy and fires `onSpeechStart` when sustained voice activity
 * is detected. Used by live mode to interrupt the AI when the user starts
 * speaking.
 *
 * Self-interrupt prevention
 * -------------------------
 * On devices without headphones, the AI's voice bleeds from the speaker into
 * the mic. Even with `getUserMedia`'s built-in echo cancellation, the residual
 * signal is often loud enough to clear a low RMS threshold and produce a
 * spurious "user is talking" event — which then interrupts the AI mid-sentence.
 *
 * To prevent this, callers should toggle `setActive(false)` whenever the AI
 * is producing audio (and a short tail afterwards) and `setActive(true)`
 * once the AI is silent again. While inactive, the analyser still runs (so
 * we never miss a real speech onset that arrives the same frame the AI
 * goes silent) but the speech-frame counter is suppressed.
 */
export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private rafId: number | null = null
  private onSpeechStart: (() => void) | null = null

  /** When false, mic energy is observed but the speech callback is suppressed. */
  private active = true
  /** Reset moment — energy before this timestamp is ignored (used after un-gating). */
  private gateUntil = 0

  // Thresholds. Slightly higher than the previous 0.03 to ride out passive
  // speaker bleed during quiet AI passages without missing real speech.
  private readonly SILENCE_THRESHOLD = 0.05
  private readonly SPEECH_FRAMES = 3

  constructor(onSpeechStart: () => void) {
    this.onSpeechStart = onSpeechStart
  }

  async start(stream: MediaStream) {
    if (this.audioContext) return

    this.mediaStream = stream
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

    const micSource = this.audioContext.createMediaStreamSource(stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.3
    micSource.connect(this.analyser)

    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let speechFrameCount = 0

    const detect = () => {
      if (!this.analyser) return

      this.analyser.getByteFrequencyData(dataArray)

      // RMS-like energy across the frequency bins.
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128.0
        sum += val * val
      }
      const rms = Math.sqrt(sum / bufferLength)

      // Suppress while the AI is talking, or during the small post-speech
      // tail. The `gateUntil` window absorbs late audio chunks still being
      // emitted by the speaker after `setActive(true)` was called.
      const now = performance.now()
      const gated = !this.active || now < this.gateUntil

      if (!gated && rms > this.SILENCE_THRESHOLD) {
        speechFrameCount++
        if (speechFrameCount >= this.SPEECH_FRAMES) {
          this.onSpeechStart?.()
          speechFrameCount = 0
        }
      } else {
        speechFrameCount = 0
      }

      this.rafId = requestAnimationFrame(detect)
    }

    detect()
  }

  /**
   * Toggle whether speech detection is currently armed. When transitioning
   * from inactive → active a short cooldown is applied so any audio still
   * decaying out of the speaker doesn't immediately fire a false interrupt.
   */
  setActive(active: boolean) {
    if (this.active === active) return
    this.active = active
    if (active) {
      // 350 ms cooldown after the AI stops — long enough for residual
      // playback to fade, short enough to feel responsive.
      this.gateUntil = performance.now() + 350
    }
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.audioContext) this.audioContext.close()
    this.audioContext = null
    this.analyser = null
    this.mediaStream = null
    this.rafId = null
  }
}
