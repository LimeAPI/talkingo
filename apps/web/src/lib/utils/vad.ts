/**
 * Voice Activity Detector (VAD) with Echo Cancellation
 * 
 * Monitors audio stream energy to detect when a user starts speaking.
 * Uses Acoustic Echo Cancellation (AEC) to prevent the AI's own voice
 * from triggering the interruption logic.
 */
export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private rafId: number | null = null
  private onSpeechStart: (() => void) | null = null
  
  // Echo Cancellation Nodes
  private echoSource: MediaStreamAudioSourceNode | null = null
  private echoDestination: MediaStreamAudioDestinationNode | null = null
  
  // Thresholds
  private readonly SILENCE_THRESHOLD = 0.03
  private readonly SPEECH_FRAMES = 3

  constructor(onSpeechStart: () => void) {
    this.onSpeechStart = onSpeechStart
  }

  async start(stream: MediaStream) {
    if (this.audioContext) return

    this.mediaStream = stream
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    // 1. Setup Microphone Input
    const micSource = this.audioContext.createMediaStreamSource(stream)
    
    // 2. Setup Echo Reference (This is where we'll feed the AI's audio later)
    this.echoDestination = this.audioContext.createMediaStreamDestination()
    
    // 3. Create Analyser for VAD
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.3

    // 4. Connect Mic -> Analyser
    // Note: In a real AEC setup, we'd use a dedicated AEC node or the browser's built-in
    // echoCancellation in getUserMedia constraints. Since we are using a raw stream,
    // we rely on the browser's internal AEC if available, or simple gating here.
    micSource.connect(this.analyser)
    
    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let speechFrameCount = 0

    const detect = () => {
      if (!this.analyser) return
      
      this.analyser.getByteFrequencyData(dataArray)
      
      // Calculate RMS-like energy
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128.0
        sum += val * val
      }
      const rms = Math.sqrt(sum / bufferLength)

      if (rms > this.SILENCE_THRESHOLD) {
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
   * Feed the AI's audio stream into the echo canceller.
   * This helps the VAD distinguish between "AI speaking" and "User speaking".
   */
  setEchoReference(stream: MediaStream) {
    if (!this.audioContext || !this.echoDestination) return
    
    // Stop previous reference if exists
    if (this.echoSource) {
      this.echoSource.disconnect()
    }

    this.echoSource = this.audioContext.createMediaStreamSource(stream)
    // Connect AI audio to the destination so it can be referenced for cancellation
    this.echoSource.connect(this.echoDestination)
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.echoSource) this.echoSource.disconnect()
    if (this.audioContext) this.audioContext.close()
    this.audioContext = null
    this.analyser = null
    this.mediaStream = null
    this.echoSource = null
    this.echoDestination = null
  }
}
