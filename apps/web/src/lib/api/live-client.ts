/**
 * Client-side service for the Gemini Live API proxy.
 *
 * Handles:
 *  - WebSocket connection to /api/gemini/live
 *  - Mic capture → PCM 16kHz → streaming to server
 *  - Receiving PCM 24kHz audio chunks → real-time playback via AudioContext
 *  - Transcript events (user + model)
 *  - Interruption handling
 */

import type { ConversationState } from '@talkingo/shared/types'
import { getPersonaById } from '@talkingo/shared/gemini/personas'

export type LiveStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'speaking'
  | 'error'
  | 'closed'

export interface LiveTranscriptEvent {
  role: 'user' | 'model'
  text: string
  final: boolean
}

export interface LiveCallbacks {
  onStatus?: (status: LiveStatus) => void
  onTranscript?: (event: LiveTranscriptEvent) => void
  onInterrupted?: () => void
  onTurnComplete?: () => void
  onError?: (message: string) => void
}

// ─── PCM helpers ──────────────────────────────────────────────────────────────

/** Convert Float32 samples to Int16 PCM bytes */
function float32ToInt16(buffer: Float32Array): Int16Array {
  const out = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Convert Int16 PCM bytes to Float32 for AudioContext playback */
function int16ToFloat32(buffer: Int16Array): Float32Array {
  const out = new Float32Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    out[i] = buffer[i] / 32768
  }
  return out
}

/** base64 → Uint8Array */
function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** ArrayBuffer → base64 */
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

// ─── LiveCallService ──────────────────────────────────────────────────────────

export class LiveCallService {
  private ws: WebSocket | null = null
  private audioCtx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private micProcessor: ScriptProcessorNode | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private playbackQueue: Float32Array[] = []
  private isPlaying = false
  private status: LiveStatus = 'idle'
  private callbacks: LiveCallbacks = {}
  private activePlayCtx: AudioContext | null = null // Track active playback for hard stops
  private masterGain: GainNode | null = null // For instant muting during interrupts

  // ─── Public API ─────────────────────────────────────────────────────────

  setCallbacks(cb: LiveCallbacks) {
    this.callbacks = cb
  }

  async connect(state: ConversationState): Promise<void> {
    if (this.ws) this.disconnect()

    this._setStatus('connecting')

    const persona = getPersonaById(state.persona ?? 'eli')
    const voiceName = persona?.voiceName ?? 'Aoede'

    // Support external WebSocket server (for Vercel deployment where WS isn't available on same origin)
    const externalWsUrl = process.env.NEXT_PUBLIC_LIVE_WS_URL
    const wsUrl = externalWsUrl
      ? externalWsUrl
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/gemini/live`

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      this.ws = ws

      ws.onopen = () => {
        // Send setup message
        ws.send(JSON.stringify({
          type: 'setup',
          state,
          voiceName,
        }))
      }

      ws.onmessage = (event) => {
        let msg: any
        try { msg = JSON.parse(event.data) } catch { return }
        this._handleServerMessage(msg, resolve, reject)
      }

      ws.onerror = (e) => {
        console.error('[live-client] WS error', e)
        this._setStatus('error')
        this.callbacks.onError?.('Connection failed')
        reject(new Error('WebSocket connection failed'))
      }

      ws.onclose = (e) => {
        console.log('[live-client] WS closed', e.code)
        this._setStatus('closed')
        this._stopMic()
      }
    })
  }

  async startMic(): Promise<void> {
    if (this.micStream) return // already running

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Could not access microphone'
      this.callbacks.onError?.(msg)
      throw err
    }

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext({ sampleRate: 16000 })
    }
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()

    this.micSource = this.audioCtx.createMediaStreamSource(this.micStream)

    // ScriptProcessor for raw PCM access (4096 samples @ 16kHz ≈ 256ms chunks)
    this.micProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1)
    this.micProcessor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      const float32 = e.inputBuffer.getChannelData(0)
      const int16 = float32ToInt16(float32)
      const b64 = bufToB64(int16.buffer as ArrayBuffer)
      this.ws.send(JSON.stringify({ type: 'audio', data: b64 }))
    }

    this.micSource.connect(this.micProcessor)
    this.micProcessor.connect(this.audioCtx.destination)
    this._setStatus('listening')
  }

  stopMic() {
    this._stopMic()
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end_turn' }))
    }
  }

  sendText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text', text }))
    }
  }

  interrupt() {
    // 1. Hard stop local playback immediately
    this._stopPlayback(true)
    this._setStatus('listening')
    
    // 2. Send interrupt signal to server to stop Gemini generation
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'interrupt' }))
    }
  }

  disconnect() {
    this._stopMic()
    this._stopPlayback()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close(1000)
      this.ws = null
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close()
      this.audioCtx = null
    }
    this._setStatus('closed')
  }

  get currentStatus(): LiveStatus {
    return this.status
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _handleServerMessage(
    msg: any,
    resolveConnect: (v: void) => void,
    rejectConnect: (e: Error) => void
  ) {
    switch (msg.type) {
      case 'ready':
        this._setStatus('ready')
        resolveConnect()
        break

      case 'audio':
        this._enqueueAudio(msg.data)
        break

      case 'transcript':
        this.callbacks.onTranscript?.({
          role: msg.role,
          text: msg.text,
          final: msg.final,
        })
        break

      case 'interrupted':
        this._stopPlayback()
        this._setStatus('listening')
        this.callbacks.onInterrupted?.()
        break

      case 'turn_complete':
        this._setStatus('listening')
        this.callbacks.onTurnComplete?.()
        break

      case 'error':
        console.error('[live-client] Server error:', msg.message)
        this._setStatus('error')
        this.callbacks.onError?.(msg.message)
        rejectConnect(new Error(msg.message))
        break
    }
  }

  private _stopMic() {
    if (this.micProcessor) {
      this.micProcessor.disconnect()
      this.micProcessor = null
    }
    if (this.micSource) {
      this.micSource.disconnect()
      this.micSource = null
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop())
      this.micStream = null
    }
  }

  private _stopPlayback(hardStop = false) {
    this.playbackQueue = []
    this.isPlaying = false
    
    // If hard stopping (interruption), mute instantly and close context
    if (hardStop) {
      // 1. Mute immediately to prevent any further sound
      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(0, this.masterGain.context.currentTime)
      }
      
      // 2. Close the context to kill any scheduled nodes
      if (this.activePlayCtx) {
        try {
          this.activePlayCtx.close()
        } catch (e) { /* ignore */ }
        this.activePlayCtx = null
      }
      this.masterGain = null
    }
  }

  private _enqueueAudio(b64: string) {
    const bytes = b64ToUint8(b64)
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
    const float32 = int16ToFloat32(int16)
    this.playbackQueue.push(float32)
    this._setStatus('speaking')
    if (!this.isPlaying) this._drainQueue()
  }

  private async _drainQueue() {
    if (this.isPlaying) return
    this.isPlaying = true

    // Playback AudioContext at 24kHz (Gemini Live output rate)
    let playCtx: AudioContext | null = null
    try {
      playCtx = new AudioContext({ sampleRate: 24000 })
      this.activePlayCtx = playCtx
      
      // Setup master gain for instant muting
      this.masterGain = playCtx.createGain()
      this.masterGain.gain.value = 1.0
      this.masterGain.connect(playCtx.destination)
    } catch {
      this.isPlaying = false
      return
    }

    let nextStartTime = playCtx.currentTime

    while (this.playbackQueue.length > 0) {
      const chunk = this.playbackQueue.shift()!
      const buf = playCtx.createBuffer(1, chunk.length, 24000)
      buf.copyToChannel(chunk as Float32Array, 0)
      const src = playCtx.createBufferSource()
      src.buffer = buf
      src.connect(this.masterGain!) // Connect to gain node instead of destination
      src.start(nextStartTime)
      nextStartTime += buf.duration
    }

    // Wait for all scheduled audio to finish
    const waitMs = Math.max(0, (nextStartTime - playCtx.currentTime) * 1000)
    await new Promise((r) => setTimeout(r, waitMs + 100))

    // Check if more chunks arrived while we were playing
    if (this.playbackQueue.length > 0 && this.activePlayCtx === playCtx) {
      this.isPlaying = false
      playCtx.close()
      this.activePlayCtx = null
      this.masterGain = null
      this._drainQueue()
    } else {
      this.isPlaying = false
      if (this.activePlayCtx === playCtx) {
        playCtx.close()
        this.activePlayCtx = null
        this.masterGain = null
      }
      if (this.status === 'speaking') {
        this._setStatus('listening')
      }
    }
  }

  private _setStatus(s: LiveStatus) {
    if (this.status === s) return
    this.status = s
    this.callbacks.onStatus?.(s)
  }
}

// Singleton
export const liveCallService = new LiveCallService()
