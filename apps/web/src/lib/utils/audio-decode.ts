/**
 * Shared audio helpers for chat voice notes.
 *
 * Gemini TTS returns raw 16-bit signed PCM @ 24kHz in base64. The browser
 * can't decode raw PCM directly through `AudioContext.decodeAudioData`,
 * so we wrap it in a minimal WAV header first.
 */

let ctx: AudioContext | null = null

/** Single shared AudioContext, created on first user gesture. */
export function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext requires a browser')
  }
  if (!ctx || ctx.state === 'closed') {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (ctx.state === 'suspended') {
    // Best-effort resume — must be called from a gesture handler upstream.
    ctx.resume().catch(() => {})
  }
  return ctx
}

/** Wrap raw PCM in a 44-byte WAV header so the browser can decode it. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bits = 16): ArrayBuffer {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  v.setUint32(4, 36 + pcm.byteLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, channels, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, (sampleRate * channels * bits) / 8, true)
  v.setUint16(32, (channels * bits) / 8, true)
  v.setUint16(34, bits, true)
  writeStr(36, 'data')
  v.setUint32(40, pcm.byteLength, true)
  const out = new Uint8Array(44 + pcm.byteLength)
  out.set(new Uint8Array(header))
  out.set(pcm, 44)
  return out.buffer
}

/** Decode a base64-encoded audio payload into an AudioBuffer.
 *  Supports both raw PCM (wrapped in WAV header) and compressed formats (MP3, WebM, etc.)
 *  that AudioContext can decode natively.
 */
export async function decodeBase64Pcm(
  base64: string,
  sampleRate = 24000,
  format?: string
): Promise<AudioBuffer> {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

  if (format === 'mp3' || format === 'audio/mpeg' || format === 'audio/webm') {
    // Compressed audio (MP3, WebM/Opus) — AudioContext decodes natively
    // Must copy to a new ArrayBuffer (decodeAudioData detaches the buffer)
    const copy = new ArrayBuffer(bytes.length)
    new Uint8Array(copy).set(bytes)
    return getAudioContext().decodeAudioData(copy)
  }

  // Default: raw PCM → wrap in WAV header
  const wav = pcmToWav(bytes, sampleRate, 1, 16)
  return getAudioContext().decodeAudioData(wav)
}

/**
 * Sample an AudioBuffer down to N peak-amplitude buckets so we can render
 * a static waveform like Instagram / WhatsApp voice notes.
 */
export function sampleWaveform(buffer: AudioBuffer, buckets = 48): number[] {
  const data = buffer.getChannelData(0)
  const bucketSize = Math.max(1, Math.floor(data.length / buckets))
  const peaks: number[] = []
  let max = 0
  for (let i = 0; i < buckets; i++) {
    const start = i * bucketSize
    const end = Math.min(data.length, start + bucketSize)
    let peak = 0
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j])
      if (v > peak) peak = v
    }
    peaks.push(peak)
    if (peak > max) max = peak
  }
  // Normalize to 0..1 with a slight floor so silent buckets still show
  return peaks.map((p) => (max > 0 ? Math.max(0.08, p / max) : 0.08))
}
