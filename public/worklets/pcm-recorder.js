/**
 * PCM Recorder AudioWorklet
 *
 * Replaces the deprecated ScriptProcessorNode for mic capture in live mode.
 * Receives 128-sample audio quanta from the AudioContext, buffers them up
 * into 4096-sample chunks (~256 ms at 16 kHz), converts to Int16 PCM, and
 * posts the raw ArrayBuffer back to the main thread for streaming over the
 * Gemini Live WebSocket.
 *
 * Loaded by live-client.ts via `audioContext.audioWorklet.addModule(...)`.
 */
/* eslint-disable */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // 4096 samples @ 16 kHz ≈ 256 ms per chunk — same cadence as the old
    // ScriptProcessor used, which keeps Gemini's VAD timings unchanged.
    this._chunkSize = 4096
    this._buffer = new Float32Array(this._chunkSize)
    this._writeIndex = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channel = input[0]

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._writeIndex++] = channel[i]
      if (this._writeIndex >= this._chunkSize) {
        // Float32 → Int16 PCM
        const int16 = new Int16Array(this._chunkSize)
        for (let j = 0; j < this._chunkSize; j++) {
          let s = this._buffer[j]
          if (s > 1) s = 1
          else if (s < -1) s = -1
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        // Transfer ownership of the underlying buffer — zero-copy hand-off.
        this.port.postMessage(int16.buffer, [int16.buffer])
        this._writeIndex = 0
      }
    }

    // Return true to keep the processor alive.
    return true
  }
}

registerProcessor('pcm-recorder', PcmRecorderProcessor)
