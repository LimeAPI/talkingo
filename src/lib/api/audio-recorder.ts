/**
 * AudioRecorder — smart voice capture with noise calibration.
 *
 * Features:
 * - Noise floor calibration (500ms ambient measurement before listening)
 * - Speech detection (threshold = 2x ambient noise)
 * - Auto-cancel after 10s of no speech
 * - Auto-stop after 2.5s silence following speech
 * - Post-recording speech validation (RMS + peak check)
 * - State callbacks: 'idle' | 'calibrating' | 'listening' | 'recording' | 'processing'
 */

export interface RecordingResult {
  audioBase64: string
  mimeType: string
  durationSeconds: number
  blob: Blob
}

export type RecorderState = 'idle' | 'calibrating' | 'listening' | 'recording' | 'processing' | 'paused'

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startTime = 0
  private state: RecorderState = 'idle'
  private onStateChange?: (state: RecorderState) => void
  private onDurationUpdate?: (seconds: number) => void
  private durationInterval: ReturnType<typeof setInterval> | null = null

  // Noise calibration + speech detection
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private noiseFloor = 15 // Default, updated during calibration
  private speechThreshold = 30 // 2x noise floor
  private hasSpoken = false
  private silentFrames = 0
  private noSpeechTimeout: ReturnType<typeof setTimeout> | null = null
  private onSilenceDetected?: () => void
  private onNoSpeech?: () => void
  private monitorInterval: ReturnType<typeof setTimeout> | null = null
  private _pausedFromState: RecorderState | null = null

  constructor(options?: {
    onStateChange?: (state: RecorderState) => void
    onDurationUpdate?: (seconds: number) => void
    onSilenceDetected?: () => void
    onNoSpeech?: () => void
  }) {
    this.onStateChange = options?.onStateChange
    this.onDurationUpdate = options?.onDurationUpdate
    this.onSilenceDetected = options?.onSilenceDetected
    this.onNoSpeech = options?.onNoSpeech
  }

  get currentState(): RecorderState {
    return this.state
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') return

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err: any) {
      throw new Error(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : 'Could not access microphone'
      )
    }

    // Setup audio analysis
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)

    // ── Phase 1: Calibrate noise floor (500ms) ──
    this._setState('calibrating')
    await this._calibrateNoiseFloor()

    // ── Phase 2: Start recording + listening for speech ──
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4'

    this.chunks = []
    this.hasSpoken = false
    this.silentFrames = 0
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start(250)
    this.startTime = Date.now()
    this._setState('listening') // Waiting for speech

    // Duration ticker
    this.durationInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - this.startTime) / 1000)
      this.onDurationUpdate?.(seconds)
    }, 500)

    // No-speech timeout: cancel after 10s if user never speaks
    this.noSpeechTimeout = setTimeout(() => {
      if (!this.hasSpoken && this.state === 'listening') {
        this.onNoSpeech?.()
        this.cancel()
      }
    }, 10000)

    // Start monitoring audio levels
    this._startMonitoring()
  }

  async stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || (this.state !== 'recording' && this.state !== 'listening' && this.state !== 'paused')) {
        reject(new Error('Not recording'))
        return
      }

      // If paused, resume first so we can properly stop
      if (this.state === 'paused') {
        if (this.stream) {
          this.stream.getAudioTracks().forEach(t => { t.enabled = true })
        }
        if (this.mediaRecorder.state === 'paused') {
          this.mediaRecorder.resume()
        }
      }

      this._setState('processing')
      this._clearTimers()

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType })
        const durationSeconds = Math.round((Date.now() - this.startTime) / 1000)

        // Speech validation: check if audio actually contains speech
        const hasSpeech = await this._detectSpeechInBlob(blob)
        if (!hasSpeech) {
          this._cleanup()
          this._setState('idle')
          reject(new Error('no_speech'))
          return
        }

        // Convert to base64
        const buffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const audioBase64 = btoa(binary)

        this._cleanup()
        this._setState('idle')

        resolve({
          audioBase64,
          mimeType: blob.type,
          durationSeconds: Math.max(1, durationSeconds),
          blob,
        })
      }

      this.mediaRecorder.stop()
    })
  }

  cancel(): void {
    this._clearTimers()
    if (this.mediaRecorder && (this.state === 'recording' || this.state === 'listening' || this.state === 'paused')) {
      if (this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume()
      }
      this.mediaRecorder.stop()
    }
    this._pausedFromState = null
    this._cleanup()
    this._setState('idle')
  }

  /**
   * Pause recording without full teardown — keeps AudioContext and stream alive.
   * Used by the audio pipeline coordinator to suspend mic during voice note playback.
   */
  pause(): void {
    if (this.state !== 'recording' && this.state !== 'listening') return
    this._pausedFromState = this.state
    this._clearTimers()
    // Pause the MediaRecorder if it's active
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
    }
    // Mute the mic tracks (keeps stream alive but stops audio input)
    if (this.stream) {
      this.stream.getAudioTracks().forEach(t => { t.enabled = false })
    }
    this._setState('paused')
  }

  /**
   * Resume recording from paused state — re-enables mic tracks and monitoring.
   */
  resume(): void {
    if (this.state !== 'paused') return
    // Re-enable mic tracks
    if (this.stream) {
      this.stream.getAudioTracks().forEach(t => { t.enabled = true })
    }
    // Resume MediaRecorder if it was paused
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
    }
    // Restore the state we paused from
    const resumeState = this._pausedFromState || 'listening'
    this._pausedFromState = null
    this._setState(resumeState)
    // Restart audio monitoring
    this._startMonitoring()
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _setState(state: RecorderState) {
    this.state = state
    this.onStateChange?.(state)
  }

  private _clearTimers() {
    if (this.durationInterval) { clearInterval(this.durationInterval); this.durationInterval = null }
    if (this.noSpeechTimeout) { clearTimeout(this.noSpeechTimeout); this.noSpeechTimeout = null }
    if (this.monitorInterval) { clearTimeout(this.monitorInterval); this.monitorInterval = null }
  }

  private _cleanup() {
    this._clearTimers()
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
      this.analyser = null
    }
    this.mediaRecorder = null
    this.chunks = []
    this.hasSpoken = false
    this.silentFrames = 0
  }

  /** Measure ambient noise for 500ms to set adaptive thresholds */
  private _calibrateNoiseFloor(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.analyser) { resolve(); return }

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      const samples: number[] = []
      let count = 0
      const maxSamples = 5 // 5 samples × 100ms = 500ms

      const measure = () => {
        if (!this.analyser || count >= maxSamples) {
          // Calculate noise floor from samples
          if (samples.length > 0) {
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length
            this.noiseFloor = Math.max(10, Math.round(avg))
            this.speechThreshold = Math.max(25, this.noiseFloor * 2)
          }
          resolve()
          return
        }

        this.analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length
        samples.push(avg)
        count++
        setTimeout(measure, 100)
      }

      measure()
    })
  }

  /** Monitor audio levels for speech detection and silence-after-speech */
  private _startMonitoring() {
    if (!this.analyser) return

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    const SILENCE_FRAMES_NEEDED = 20 // ~2.5s at 125ms intervals

    const check = () => {
      if (this.state !== 'listening' && this.state !== 'recording') return
      if (!this.analyser) return

      this.analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length

      if (avg > this.speechThreshold) {
        // Speech detected
        if (!this.hasSpoken) {
          this.hasSpoken = true
          this._setState('recording') // Switch from "listening" to "recording"
          // Clear no-speech timeout
          if (this.noSpeechTimeout) { clearTimeout(this.noSpeechTimeout); this.noSpeechTimeout = null }
        }
        this.silentFrames = 0
      } else if (this.hasSpoken) {
        // Silence after speech
        this.silentFrames++
        if (this.silentFrames >= SILENCE_FRAMES_NEEDED && (Date.now() - this.startTime) > 3000) {
          // User spoke then went silent for 2.5s — auto-stop
          this.onSilenceDetected?.()
          return
        }
      }

      this.monitorInterval = setTimeout(check, 125)
    }

    // Start after a brief delay
    setTimeout(check, 200)
  }

  /** Check if recorded blob contains actual speech (post-recording validation) */
  private async _detectSpeechInBlob(blob: Blob): Promise<boolean> {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const data = audioBuffer.getChannelData(0)

      let sumSquares = 0
      let peakAmplitude = 0
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i])
        sumSquares += data[i] * data[i]
        if (abs > peakAmplitude) peakAmplitude = abs
      }
      const rms = Math.sqrt(sumSquares / data.length)
      ctx.close()

      // Speech needs: RMS > 0.01 AND peak > 0.05
      const hasSpeech = rms > 0.01 && peakAmplitude > 0.05
      if (!hasSpeech) {
        console.log('[AudioRecorder] No speech — RMS:', rms.toFixed(4), 'Peak:', peakAmplitude.toFixed(4))
      }
      return hasSpeech
    } catch {
      return true // If decoding fails, assume speech (don't block user)
    }
  }
}
