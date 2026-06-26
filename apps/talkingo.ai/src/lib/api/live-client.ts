/**
 * Client-side service for the Gemini Live API proxy.
 *
 * Handles:
 *  - WebSocket connection to /api/gemini/live
 *  - Mic capture → PCM 16kHz → streaming to server
 *  - Receiving PCM 24kHz audio chunks → real-time playback via AudioContext
 *  - Transcript events (user + model)
 *  - Interruption handling
 *
 * Use `createLiveCallService()` to get a fresh instance per call. A singleton
 * is also exported for callers that want it but the per-call instance is
 * recommended because React StrictMode mounts effects twice in dev.
 */

import type { ConversationState } from '@talkingo/shared/types'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import { getAuthJWT } from './auth-fetch'

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

export interface LiveCloseInfo {
  code: number
  reason?: string
  /** True when the client itself called disconnect(); false when the server closed unexpectedly. */
  initiatedByClient: boolean
}

export interface LiveCallbacks {
  onStatus?: (status: LiveStatus) => void
  onTranscript?: (event: LiveTranscriptEvent) => void
  onInterrupted?: () => void
  onTurnComplete?: () => void
  onError?: (message: string) => void
  onClose?: (info: LiveCloseInfo) => void
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
  private playbackCtx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private micStream: MediaStream | null = null
  private micProcessor: ScriptProcessorNode | null = null
  private micWorklet: AudioWorkletNode | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private playbackQueue: Float32Array[] = []
  private isPlaying = false
  /**
   * Running playhead for scheduled audio. Persisted across `_drainQueue`
   * calls so consecutive bursts of chunks line up sample-accurately instead
   * of getting reset to `currentTime` (which produced an audible glitch
   * every time the queue briefly emptied between bursts).
   */
  private nextStartTime = 0
  /**
   * True between the first audio chunk of a model turn and the matching
   * `turn_complete`. While set, we don't downgrade status to `listening`
   * just because the playback queue happens to be momentarily empty — that
   * was the cause of the per-chunk subtitle/UI flicker.
   */
  private modelTurnActive = false
  private status: LiveStatus = 'idle'
  private callbacks: LiveCallbacks = {}
  /** Optional callback fired when AI playback starts/stops — used to gate VAD. */
  private onPlaybackActive: ((active: boolean) => void) | null = null
  /** Set when disconnect() was called locally — suppresses error/close UX */
  private disposed = false
  /** Connection promise reject handler — invoked if the WS closes before `ready`. */
  private connectReject: ((e: Error) => void) | null = null
  /** Cached at the class level so concurrent connect()s share the same module load. */
  private static _workletLoaded: WeakMap<AudioContext, boolean> = new WeakMap()

  // ─── Public API ─────────────────────────────────────────────────────────

  setCallbacks(cb: LiveCallbacks) {
    this.callbacks = cb
  }

  /**
   * Register a listener that is notified when the AI is actively producing
   * audio (true) versus idle (false). The VAD uses this to ignore mic input
   * while the speaker is bleeding the AI's own voice back into the mic,
   * which would otherwise cause spurious self-interrupts.
   */
  setOnPlaybackActive(cb: ((active: boolean) => void) | null) {
    this.onPlaybackActive = cb
  }

  /** Expose the live mic stream so callers (e.g. VAD) can reuse it without a second getUserMedia. */
  get micMediaStream(): MediaStream | null {
    return this.micStream
  }

  async connect(state: ConversationState): Promise<void> {
    if (this.disposed) throw new Error('Service is disposed')
    if (this.ws) this.disconnect()

    this._setStatus('connecting')

    const persona = getPersonaById(state.persona ?? 'eli')
    const voiceName = persona?.voiceName ?? 'Aoede'

    // Support external WebSocket server (for Vercel deployment where WS isn't available on same origin)
    const externalWsUrl = process.env.NEXT_PUBLIC_LIVE_WS_URL

    // In dev, the WS server runs on port 3001 alongside Turbopack on 3000.
    // In production, server.ts bundles both on the same port.
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const baseWsUrl = externalWsUrl
      ? externalWsUrl
      : isLocalhost
        ? `ws://localhost:3001/api/gemini/live`
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/gemini/live`

    // Get a fresh Appwrite JWT for WebSocket auth. WebSockets can't send custom
    // headers from the browser, so we pass the JWT as a query param. This is
    // the same auth pattern used by the rest of /api/* routes (X-Appwrite-JWT).
    let jwt = ''
    try {
      jwt = await getAuthJWT() ?? ''
    } catch (err) {
      console.error('[live-client] Failed to mint JWT:', err)
      this._setStatus('error')
      this.callbacks.onError?.('Sign in expired. Please refresh and try again.')
      throw new Error('Could not authenticate live session')
    }

    const wsUrl = jwt ? `${baseWsUrl}?jwt=${encodeURIComponent(jwt)}` : baseWsUrl

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      this.ws = ws
      this.connectReject = reject

      // Hard timeout: if we don't get a `ready` message within 15s, fail.
      const connectTimeout = setTimeout(() => {
        if (this.status === 'connecting') {
          this.callbacks.onError?.('Connection timed out. Please try again.')
          this._setStatus('error')
          try { ws.close(4000, 'timeout') } catch {}
          this.connectReject?.(new Error('Connection timed out'))
          this.connectReject = null
        }
      }, 15_000)

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
        this._handleServerMessage(msg, () => {
          clearTimeout(connectTimeout)
          this.connectReject = null
          resolve()
        })
      }

      ws.onerror = (e) => {
        console.error('[live-client] WS error', e)
        clearTimeout(connectTimeout)
        // Don't surface anything if we caused the close ourselves.
        if (!this.disposed) {
          this._setStatus('error')
          this.callbacks.onError?.('Connection failed. Check your network and try again.')
        }
        this.connectReject?.(new Error('WebSocket connection failed'))
        this.connectReject = null
      }

      ws.onclose = (e) => {
        clearTimeout(connectTimeout)
        const initiatedByClient = this.disposed
        console.log('[live-client] WS closed', e.code, e.reason, 'initiatedByClient=', initiatedByClient)

        // Map close codes to friendlier messages. Code 1006 means the browser
        // never received a close frame — usually because the upgrade itself
        // was rejected with an HTTP status (e.g. 401 unauthorised).
        const friendlyReason = (() => {
          if (e.reason) return e.reason
          switch (e.code) {
            case 1006: return 'connection refused (please make sure you are signed in)'
            case 1008: return 'authentication failed'
            case 1011: return 'live server error'
            case 4000: return 'connection timed out'
            default:   return `code ${e.code}`
          }
        })()

        // If the connection closed before we ever reached `ready`, surface a connection error.
        if (this.connectReject) {
          if (!initiatedByClient) {
            this.callbacks.onError?.(`Could not connect: ${friendlyReason}`)
            this._setStatus('error')
          }
          this.connectReject(new Error(`WebSocket closed: ${e.code} ${e.reason || ''}`))
          this.connectReject = null
        } else if (!initiatedByClient) {
          // Closed mid-call — show error not just "closed" so the user knows it wasn't intentional.
          if (e.code !== 1000) {
            this.callbacks.onError?.(`Call disconnected: ${friendlyReason}`)
            this._setStatus('error')
          } else {
            this._setStatus('closed')
          }
        } else {
          this._setStatus('closed')
        }

        this.callbacks.onClose?.({ code: e.code, reason: e.reason, initiatedByClient })
        this._stopMic()
      }
    })
  }

  async startMic(): Promise<void> {
    if (this.disposed) return
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
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone permission denied. Enable it in your browser settings to start the call.'
        : 'Could not access microphone'
      this.callbacks.onError?.(msg)
      throw err
    }

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext({ sampleRate: 16000 })
    }
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()

    this.micSource = this.audioCtx.createMediaStreamSource(this.micStream)

    // Prefer AudioWorklet (modern, low-latency, off-main-thread). Fall back to
    // the deprecated ScriptProcessor only when the browser doesn't support
    // worklets at all (very old Safari / mobile WebViews).
    const useWorklet =
      typeof this.audioCtx.audioWorklet !== 'undefined' &&
      typeof AudioWorkletNode !== 'undefined'

    if (useWorklet) {
      try {
        if (!LiveCallService._workletLoaded.get(this.audioCtx)) {
          await this.audioCtx.audioWorklet.addModule('/worklets/pcm-recorder.js')
          LiveCallService._workletLoaded.set(this.audioCtx, true)
        }
        const node = new AudioWorkletNode(this.audioCtx, 'pcm-recorder', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
        })
        node.port.onmessage = (e) => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
          // Worklet posts an Int16 PCM ArrayBuffer (transferred, zero-copy).
          const buf = e.data as ArrayBuffer
          const b64 = bufToB64(buf)
          this.ws.send(JSON.stringify({ type: 'audio', data: b64 }))
        }
        this.micWorklet = node
        this.micSource.connect(node)
      } catch (err) {
        console.warn('[live-client] Worklet load failed, falling back to ScriptProcessor:', err)
        this._startMicScriptProcessor()
      }
    } else {
      this._startMicScriptProcessor()
    }

    if (this.status !== 'speaking') this._setStatus('listening')
  }

  /**
   * Legacy mic capture path using the deprecated ScriptProcessorNode.
   * Only used when AudioWorklet isn't available.
   */
  private _startMicScriptProcessor() {
    if (!this.audioCtx || !this.micSource) return
    // ScriptProcessor is deprecated but still the most reliable cross-browser
    // fallback for raw PCM access without an AudioWorklet.
    const processor = this.audioCtx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      const float32 = e.inputBuffer.getChannelData(0)
      const int16 = float32ToInt16(float32)
      const b64 = bufToB64(int16.buffer as ArrayBuffer)
      this.ws.send(JSON.stringify({ type: 'audio', data: b64 }))
    }
    this.micProcessor = processor
    this.micSource.connect(processor)
    // ScriptProcessor only fires onaudioprocess while connected to a destination.
    processor.connect(this.audioCtx.destination)
  }

  stopMic() {
    this._stopMic()
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end_turn' }))
    }
  }

  /**
   * Send a text turn that triggers a model response (the AI replies to it).
   * Used for the opener and for typed messages.
   */
  sendText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text', text }))
    }
  }

  interrupt() {
    // 1. Hard stop local playback immediately
    this._stopPlayback(true)
    this.modelTurnActive = false
    this.onPlaybackActive?.(false)
    this._setStatus('listening')

    // 2. Send interrupt signal to server. The server resolves this with the
    //    correct Live API shape (see server.ts).
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'interrupt' }))
    }
  }

  disconnect() {
    if (this.disposed) return
    this.disposed = true
    this._stopMic()
    this._stopPlayback(true)
    if (this.ws) {
      // Detach handlers so the close callback doesn't surface "disconnected" UX.
      this.ws.onerror = null
      try { this.ws.close(1000, 'client disconnect') } catch {}
      this.ws = null
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close() } catch {}
      this.audioCtx = null
    }
    this._setStatus('closed')
  }

  get currentStatus(): LiveStatus {
    return this.status
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _handleServerMessage(msg: any, onReady: () => void) {
    switch (msg.type) {
      case 'ready':
        this._setStatus('ready')
        onReady()
        break

      case 'audio':
        // First audio chunk of a turn marks the start of model speech.
        if (!this.modelTurnActive) {
          this.modelTurnActive = true
          this.onPlaybackActive?.(true)
        }
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
        this._stopPlayback(true)
        this.modelTurnActive = false
        this.onPlaybackActive?.(false)
        this._setStatus('listening')
        this.callbacks.onInterrupted?.()
        break

      case 'turn_complete':
        this.modelTurnActive = false
        const playCtx = this.playbackCtx
        const stillPlayingScheduled = !!playCtx && this.nextStartTime > playCtx.currentTime + 0.02
        if (this.status === 'speaking' && !this.isPlaying && this.playbackQueue.length === 0 && !stillPlayingScheduled) {
          this.onPlaybackActive?.(false)
          this._setStatus('listening')
        }
        this.callbacks.onTurnComplete?.()
        break

      case 'error':
        console.error('[live-client] Server error:', msg.message)
        this._setStatus('error')
        this.callbacks.onError?.(msg.message)
        // If the error came before connection was ready, reject the connect promise.
        if (this.connectReject) {
          this.connectReject(new Error(msg.message))
          this.connectReject = null
        }
        break
    }
  }

  private _stopMic() {
    if (this.micWorklet) {
      try {
        this.micWorklet.port.onmessage = null
        this.micWorklet.disconnect()
      } catch {}
      this.micWorklet = null
    }
    if (this.micProcessor) {
      try { this.micProcessor.disconnect() } catch {}
      this.micProcessor = null
    }
    if (this.micSource) {
      try { this.micSource.disconnect() } catch {}
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
    this.nextStartTime = 0

    if (hardStop) {
      // 1. Mute immediately to prevent any remaining scheduled buffers from playing.
      if (this.masterGain) {
        try {
          this.masterGain.gain.setValueAtTime(0, this.masterGain.context.currentTime)
        } catch {}
      }
      // 2. Close the playback context to kill any scheduled nodes.
      if (this.playbackCtx) {
        try { this.playbackCtx.close() } catch {}
        this.playbackCtx = null
      }
      this.masterGain = null
    }
  }

  private _enqueueAudio(b64: string) {
    if (this.disposed) return
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

    // Reuse the playback context across chunks within a single AI turn.
    let playCtx = this.playbackCtx
    if (!playCtx || playCtx.state === 'closed') {
      try {
        playCtx = new AudioContext({ sampleRate: 24000 })
        this.playbackCtx = playCtx
        this.masterGain = playCtx.createGain()
        this.masterGain.gain.value = 1.0
        this.masterGain.connect(playCtx.destination)
        // Fresh context — restart the playhead.
        this.nextStartTime = 0
      } catch {
        this.isPlaying = false
        return
      }
    }

    // ── Schedule chunks contiguously on the running playhead ──
    // Bug history: this used to do `nextStartTime = playCtx.currentTime` on
    // every drain. Whenever the queue briefly emptied between bursts (which
    // happens roughly per-chunk on a streaming Live socket), the next drain
    // reset the playhead to "now", and by the time `src.start(...)` was
    // called the audio engine had already moved past it — producing an
    // audible glitch every ~1 s. The persistent `this.nextStartTime`,
    // clamped against `currentTime + lookahead`, removes those gaps.
    const LOOKAHEAD = 0.04 // 40 ms safety margin for scheduling jitter
    const now = playCtx.currentTime
    if (this.nextStartTime < now + LOOKAHEAD) {
      this.nextStartTime = now + LOOKAHEAD
    }

    while (this.playbackQueue.length > 0) {
      // Bail out if interrupted mid-drain.
      if (this.disposed || !this.playbackCtx || this.playbackCtx !== playCtx) break
      const chunk = this.playbackQueue.shift()!
      const buf = playCtx.createBuffer(1, chunk.length, 24000)
      buf.copyToChannel(chunk as Float32Array, 0)
      const src = playCtx.createBufferSource()
      src.buffer = buf
      if (this.masterGain) src.connect(this.masterGain)
      else src.connect(playCtx.destination)
      src.start(this.nextStartTime)
      this.nextStartTime += buf.duration
    }

    this.isPlaying = false

    // If more chunks arrived while we were scheduling, drain again immediately.
    // We don't await playback completion — the persistent `nextStartTime`
    // already guarantees gap-free scheduling for late arrivals.
    if (this.playbackQueue.length > 0 && this.playbackCtx === playCtx) {
      this._drainQueue()
      return
    }

    // Wait for all currently scheduled audio to finish before deciding
    // whether to return to listening. Critically, we ONLY downgrade status
    // when the model has actually completed its turn — emptying the queue
    // mid-turn used to cause the UI to flicker speaking → listening →
    // speaking on every chunk gap.
    const waitMs = Math.max(0, (this.nextStartTime - playCtx.currentTime) * 1000)
    await new Promise((r) => setTimeout(r, waitMs + 40))

    if (this.disposed || this.playbackCtx !== playCtx) return

    // More audio may have queued up while we were waiting.
    if (this.playbackQueue.length > 0) {
      this._drainQueue()
      return
    }

    // Only return to listening once the model itself has signalled the turn
    // is over (turn_complete). Otherwise stay in `speaking` and wait for the
    // next chunk — this is what stops the per-chunk flicker.
    if (!this.modelTurnActive && this.status === 'speaking') {
      this.onPlaybackActive?.(false)
      this._setStatus('listening')
    }
  }

  private _setStatus(s: LiveStatus) {
    if (this.status === s) return
    this.status = s
    this.callbacks.onStatus?.(s)
  }
}

/** Create a fresh live call service. Prefer this over the singleton in React components. */
export function createLiveCallService(): LiveCallService {
  return new LiveCallService()
}

/** Singleton retained for backwards compatibility. */
export const liveCallService = new LiveCallService()
