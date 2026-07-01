/**
 * Client-side Gemini service for the Next.js web app.
 *
 * All AI calls go through /api/gemini/* routes — the API key never
 * touches the browser. Speech recognition and TTS playback still run
 * in the browser using Web APIs.
 */

import type {
  ConversationState,
  GeminiConversationResponse,
  GeminiOpenerResponse,
  GeminiAssessmentResponse,
  TargetLanguage,
} from '@talkingo/shared/types'
import { getBcp47, getLanguageMeta } from '@talkingo/shared/languages'
import { authFetch } from '@/lib/api/auth-fetch'

// ─── Chat API ─────────────────────────────────────────────────────────────────

type ChatHistory = Array<{
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}>

export type MicErrorKind =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-microphone'
  | 'network'
  | 'language-unsupported'
  | 'unknown'

export class GeminiServiceError extends Error {
  constructor(
    public readonly type: 'ai_unavailable' | 'rate_limited' | 'not_configured' | 'network' | 'free_limit_reached' | 'upgrade_required',
    message: string
  ) {
    super(message)
    this.name = 'GeminiServiceError'
  }
}

class GeminiClientService {
  private chatHistory: ChatHistory = []

  // Speech recognition
  private recognition: any = null
  private recognitionActive = false
  private transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null
  private errorCallback: ((kind: MicErrorKind, detail?: string) => void) | null = null
  private currentLang: string = 'en-US'
  /** Primary recognition language (chosen by level) and the fallback (the other of target/native). */
  private primaryLang: string = 'en-US'
  private altLang: string | null = null
  private triedAltLang = false
  private permissionGranted = false

  // Audio playback
  private audioContext: AudioContext | null = null
  private currentAudioSource: AudioBufferSourceNode | null = null

  // ─── AI ───────────────────────────────────────────────────────────────────

  async generateOpener(state: ConversationState, userName?: string): Promise<GeminiOpenerResponse> {
    const res = await authFetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'opener', state, history: [], userName }),
    })
    if (!res.ok) await this._throwServiceError(res)
    return res.json()
  }

  async processUserMessage(
    userText: string,
    state: ConversationState,
    userName?: string
  ): Promise<GeminiConversationResponse> {
    this.chatHistory.push({ role: 'user', parts: [{ text: userText }] })

    // Sliding window: send at most the last 30 messages (15 turns) to the API.
    // Older context is preserved by character memory (cross-session) and the
    // system instruction (scenario/seed). This keeps token costs predictable
    // and avoids quality degradation on very long sessions.
    const MAX_HISTORY = 30
    const historyToSend = this.chatHistory.length > MAX_HISTORY + 1
      ? this.chatHistory.slice(-(MAX_HISTORY + 1), -1)
      : this.chatHistory.slice(0, -1)

    const res = await authFetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        userText,
        state,
        history: historyToSend,
        userName,
      }),
    })

    if (!res.ok) {
      this.chatHistory.pop()
      await this._throwServiceError(res)
    }

    const data: GeminiConversationResponse = await res.json()
    this.chatHistory.push({ role: 'model', parts: [{ text: data.aiResponse }] })
    return data
  }

  /**
   * Stream a user message — returns chunks progressively via callback.
   * Falls back to non-streaming processUserMessage if streaming fails.
   */
  async processUserMessageStreaming(
    userText: string,
    state: ConversationState,
    userName?: string,
    onChunk?: (partialJson: string) => void
  ): Promise<GeminiConversationResponse> {
    this.chatHistory.push({ role: 'user', parts: [{ text: userText }] })

    const MAX_HISTORY = 30
    const historyToSend = this.chatHistory.length > MAX_HISTORY + 1
      ? this.chatHistory.slice(-(MAX_HISTORY + 1), -1)
      : this.chatHistory.slice(0, -1)

    try {
      const res = await authFetch('/api/gemini/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText,
          state,
          history: historyToSend,
          userName,
        }),
      })

      if (!res.ok || !res.body) {
        // 429 = rate limit or free-tier limit. Surface it directly so the UI
        // can show the paywall / slow-down banner — falling back to the
        // non-streaming route would just 429 again and waste a usage increment.
        if (res.status === 429) {
          this.chatHistory.pop()
          await this._throwServiceError(res)
        }
        // Other failures (503, no body, etc.) → fall back to non-streaming.
        this.chatHistory.pop()
        return this.processUserMessage(userText, state, userName)
      }

      // Read SSE stream
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE events — Gemini sends "data: {...}\n\n"
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          if (jsonStr === '[DONE]') continue
          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              fullText += text
              onChunk?.(fullText)
            }
          } catch {
            // Partial JSON chunk — skip
          }
        }
      }

      // Parse the complete accumulated JSON
      const responseMatch = fullText.match(/\{[\s\S]*\}/)
      let parsedResponse: any = {}
      try {
        parsedResponse = responseMatch ? JSON.parse(responseMatch[0]) : {}
      } catch {
        parsedResponse = { response: fullText }
      }

      const result: GeminiConversationResponse = {
        aiResponse: parsedResponse.response || fullText || "Sorry, could you say that again?",
        corrections: Array.isArray(parsedResponse.corrections) ? parsedResponse.corrections : [],
        unitComplete: parsedResponse.unitComplete === true,
        memoryUpdate: typeof parsedResponse.memoryUpdate === 'string' && parsedResponse.memoryUpdate.trim()
          ? parsedResponse.memoryUpdate.trim()
          : undefined,
        responseParts: Array.isArray(parsedResponse.responseParts) && parsedResponse.responseParts.length >= 2
          ? parsedResponse.responseParts.filter((p: unknown) => typeof p === 'string' && (p as string).trim().length > 0).slice(0, 3)
          : undefined,
        keyWords: Array.isArray(parsedResponse.keyWords)
          ? parsedResponse.keyWords
              .filter((w: unknown) => typeof w === 'string')
              .map((w: string) => w.trim())
              .filter((w: string) => w.length > 0 && w.length <= 40)
              .slice(0, 3)
          : undefined,
      }

      this.chatHistory.push({ role: 'model', parts: [{ text: result.aiResponse }] })
      return result
    } catch (err) {
      // Auth / rate-limit / free-limit errors must propagate so the UI can react
      // (paywall, slow-down banner). Only fall back for transient/transport failures.
      if (err instanceof GeminiServiceError) throw err
      console.warn('[stream] Streaming failed, falling back:', err)
      this.chatHistory.pop()
      return this.processUserMessage(userText, state, userName)
    }
  }

  /**
   * Send a voice message (audio) directly to Gemini for multimodal understanding.
   * Gemini hears the actual audio — no browser STT needed.
   * Returns the AI response + what it understood from the audio.
   */
  async processAudioMessage(
    audioBase64: string,
    mimeType: string,
    state: ConversationState,
    userName?: string
  ): Promise<GeminiConversationResponse & { transcription?: string }> {
    const MAX_HISTORY = 30
    const historyToSend = this.chatHistory.length > MAX_HISTORY
      ? this.chatHistory.slice(-MAX_HISTORY)
      : this.chatHistory

    const res = await authFetch('/api/gemini/audio-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType,
        state,
        history: historyToSend,
        userName,
      }),
    })

    if (!res.ok) {
      await this._throwServiceError(res)
    }

    const data = await res.json()

    // Don't store in history if no speech was detected
    if (!data.noSpeech && data.aiResponse) {
      this.chatHistory.push({ role: 'user', parts: [{ text: data.transcription || '[voice message]' }] })
      this.chatHistory.push({ role: 'model', parts: [{ text: data.aiResponse }] })
    }

    return data
  }

  /**
   * Analyze one user turn from a live voice call — returns corrections, an
   * optional memory note, and an optional language/script-normalized transcript.
   * Soft-fails to an empty result so it never disrupts the live conversation.
   */
  async analyzeVoiceTurn(
    userText: string,
    state: ConversationState
  ): Promise<{ normalizedTranscript?: string; corrections: any[]; memoryUpdate?: string }> {
    try {
      const res = await authFetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText, state }),
      })
      if (!res.ok) return { corrections: [] }
      return await res.json()
    } catch {
      return { corrections: [] }
    }
  }

  async assessLevel(
    userText: string,
    targetLanguage: TargetLanguage
  ): Promise<GeminiAssessmentResponse> {    const res = await authFetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'assessment', userText, targetLanguage }),
    })
    if (!res.ok) await this._throwServiceError(res)
    return res.json()
  }

  private async _throwServiceError(res: Response): Promise<never> {
    let errorType: GeminiServiceError['type'] = 'ai_unavailable'
    try {
      const body = await res.json()
      if (body?.error === 'free_limit_reached') errorType = 'free_limit_reached'
      else if (body?.error === 'upgrade_required') errorType = 'upgrade_required'
      else if (body?.error === 'rate_limited' || res.status === 429) errorType = 'rate_limited'
      else if (body?.error === 'not_configured') errorType = 'not_configured'
      else if (res.status === 503) errorType = 'ai_unavailable'
    } catch {
      // body not JSON
      if (res.status === 429) errorType = 'rate_limited'
    }
    throw new GeminiServiceError(errorType, `API error ${res.status}`)
  }

  resetHistory() {
    this.chatHistory = []
  }

  // ─── Speech Recognition ───────────────────────────────────────────────────

  /** No-op kept for API compatibility with Vite version */
  setMode(_mode: 'manual' | 'handsfree' | 'native') {}

  /** Set the BCP-47 locale used by recognition. Call before startListening. */
  setLanguage(targetLanguage: TargetLanguage | undefined, nativeLanguage?: TargetLanguage | string, level?: number) {
    // The browser Web Speech API only accepts ONE language at a time, so we pick
    // the language the user is most likely to speak at this level as the primary,
    // and keep the other (target/native) as a fallback we switch to if the
    // recognizer reports the primary as unsupported.
    //
    // - L1-2: user speaks mostly their native language  → primary = native
    // - L3+ : user speaks the target language           → primary = target
    const effectiveLevel = level ?? 5
    const targetBcp = getBcp47(targetLanguage)
    const nativeBcp = nativeLanguage ? getBcp47(nativeLanguage as TargetLanguage) : null

    if (effectiveLevel <= 2 && nativeBcp) {
      this.primaryLang = nativeBcp
      this.altLang = nativeBcp !== targetBcp ? targetBcp : null
    } else {
      this.primaryLang = targetBcp
      this.altLang = nativeBcp && nativeBcp !== targetBcp ? nativeBcp : null
    }

    this.currentLang = this.primaryLang
    this.triedAltLang = false
    if (this.recognition) {
      this.recognition.lang = this.currentLang
    }
  }

  /**
   * Get the current recognition language config.
   * We use the target language as primary but allow multilingual fallback
   * by not setting continuous=true and restarting on no-speech events.
   */
  private _getRecognitionLangs(): string {
    // Chrome's Web Speech API supports multilingual hints via comma-separated
    // BCP-47 codes in some implementations. We set the target language as primary
    // so it biases toward it, but the recognizer can still pick up other languages.
    return this.currentLang
  }

  setErrorCallback(cb: ((kind: MicErrorKind, detail?: string) => void) | null) {
    this.errorCallback = cb
  }

  /**
   * Lazily creates a SpeechRecognition instance. Called on first user gesture
   * so the browser permission prompt actually surfaces.
   */
  private _ensureRecognition(): boolean {
    if (this.recognition) return true
    if (typeof window === 'undefined') return false

    if (!window.isSecureContext) {
      this.errorCallback?.('insecure-context')
      return false
    }

    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      this.errorCallback?.('unsupported')
      return false
    }

    try {
      this.recognition = new SR()
      this.recognition.continuous = false
      this.recognition.interimResults = true
      this.recognition.lang = this.currentLang

      this.recognition.onresult = (event: any) => {
        if (!this.transcriptCallback) return
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            this.transcriptCallback(t.trim(), true)
          } else {
            interim += t
            this.transcriptCallback(interim, false)
          }
        }
      }

      this.recognition.onerror = (event: any) => {
        const err = event.error as string
        if (err === 'no-speech' || err === 'aborted') return
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.permissionGranted = false
          this.errorCallback?.('permission-denied', err)
          this.recognitionActive = false
          return
        }
        if (err === 'audio-capture') {
          this.errorCallback?.('no-microphone', err)
          this.recognitionActive = false
          return
        }
        if (err === 'language-not-supported') {
          // The browser doesn't support the primary language for STT. Switch to
          // the user's other language (target ↔ native) once and retry before
          // giving up — this keeps recognition working for users whose native
          // or target locale isn't installed.
          if (this.altLang && !this.triedAltLang) {
            this.triedAltLang = true
            this.currentLang = this.altLang
            if (this.recognition) this.recognition.lang = this.altLang
            if (this.recognitionActive) this._startRecognition()
            return
          }
          this.errorCallback?.('language-unsupported', this.currentLang)
          this.recognitionActive = false
          return
        }
        if (err === 'network') {
          this.errorCallback?.('network', err)
          this.recognitionActive = false
          return
        }
        this.errorCallback?.('unknown', err)
        this.recognitionActive = false
      }

      this.recognition.onend = () => {
        if (this.recognitionActive) {
          // restart if user is still meant to be listening (handsfree mode)
          this._startRecognition()
        }
      }

      console.log('[SpeechRec] Initialized for', this.currentLang)
      return true
    } catch (error) {
      console.error('[SpeechRec] Failed to initialize:', error)
      this.errorCallback?.('unknown', String(error))
      return false
    }
  }

  /** Explicitly request mic permission via getUserMedia BEFORE first SR start. */
  private async _ensurePermission(): Promise<boolean> {
    if (this.permissionGranted) return true
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Some browsers (Safari) don't expose mediaDevices in insecure context
      // — let SR.start() throw and surface the error.
      return true
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Immediately release — SpeechRecognition opens its own stream.
      stream.getTracks().forEach((t) => t.stop())
      this.permissionGranted = true
      return true
    } catch (err: any) {
      const name = err?.name as string | undefined
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.errorCallback?.('permission-denied', name)
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.errorCallback?.('no-microphone', name)
      } else {
        this.errorCallback?.('unknown', name ?? String(err))
      }
      return false
    }
  }

  private _startRecognition(attempt = 0) {
    if (!this.recognition) return
    try {
      this.recognition.start()
    } catch (e: any) {
      // InvalidStateError happens when start() is called while it's already started
      const msg = (e?.message ?? '').toLowerCase()
      if (msg.includes('already started')) return
      if (attempt < 4) {
        setTimeout(() => this._startRecognition(attempt + 1), 150)
      } else {
        console.error('[SpeechRec] Could not start after retries:', e)
        this.recognitionActive = false
        this.errorCallback?.('unknown', e?.message ?? 'start-failed')
      }
    }
  }

  async startListening(callback: (text: string, isFinal: boolean) => void): Promise<void> {
    if (!this._ensureRecognition()) return

    const granted = await this._ensurePermission()
    if (!granted) return

    this.transcriptCallback = callback
    if (this.recognitionActive) {
      console.log('[SpeechRec] Already listening')
      return
    }
    // Update lang in case it changed
    this.recognition.lang = this.currentLang
    this.recognitionActive = true
    this._startRecognition()
  }

  stopListening() {
    this.recognitionActive = false
    this.transcriptCallback = null
    if (this.recognition) {
      try { this.recognition.stop() } catch { /* already stopped */ }
    }
  }

  get isListening() { return this.recognitionActive }

  // ─── TTS ──────────────────────────────────────────────────────────────────

  /**
   * Fetch synthesized audio for a piece of text WITHOUT playing it.
   * Used by chat-mode voice notes — the bubble renders immediately,
   * the audio attaches when ready.
   *
   * Returns base64-encoded audio data. Format may be 'mp3' (Edge TTS) or
   * 'pcm' (Gemini fallback). The VoiceNotePlayer handles both.
   */
  async synthesizeAudio(
    text: string,
    options?: { voiceName?: string; targetLanguage?: TargetLanguage; signal?: AbortSignal }
  ): Promise<{ data: string; sampleRate: number; format?: string; voiceName?: string } | null> {
    const languageCode = options?.targetLanguage ? getBcp47(options.targetLanguage) : this.currentLang
    try {
      const res = await authFetch('/api/gemini/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName: options?.voiceName,
          languageCode,
        }),
        signal: options?.signal,
      })
      if (!res.ok) return null
      const { audioData, format } = await res.json()
      if (!audioData) return null
      return { data: audioData, sampleRate: 24000, format: format || 'pcm', voiceName: options?.voiceName }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return null
      console.warn('[tts] synthesizeAudio failed:', err)
      return null
    }
  }

  async speak(
    text: string,
    options?: { onEnd?: () => void; voiceName?: string; targetLanguage?: TargetLanguage }
  ): Promise<void> {
    this.stopSpeaking()

    const languageCode = options?.targetLanguage ? getBcp47(options.targetLanguage) : this.currentLang

    try {
      const res = await authFetch('/api/gemini/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName: options?.voiceName,
          languageCode,
        }),
      })
      if (!res.ok) throw new Error(`TTS API error ${res.status}`)
      const { audioData, format } = await res.json()
      if (!audioData) throw new Error('No audio data')

      if (format === 'mp3') {
        await this._playBase64Audio(audioData, 'audio/mpeg', options?.onEnd)
      } else {
        await this._playPcm(audioData, options?.onEnd)
      }
    } catch (err) {
      console.warn('TTS failed, using browser TTS:', err)
      this._browserSpeak(text, languageCode, options?.onEnd)
    }
  }

  /** Play base64-encoded audio (MP3, WAV, etc.) using AudioContext */
  private async _playBase64Audio(base64: string, mimeType: string, onEnd?: () => void): Promise<void> {
    return new Promise((resolve) => {
      const raw = atob(base64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext()
      }
      if (this.audioContext.state === 'suspended') this.audioContext.resume()

      this.audioContext.decodeAudioData(bytes.buffer as ArrayBuffer).then((buf) => {
        const src = this.audioContext!.createBufferSource()
        src.buffer = buf
        src.connect(this.audioContext!.destination)
        this.currentAudioSource = src
        src.onended = () => {
          this.currentAudioSource = null
          onEnd?.()
          resolve()
        }
        src.start(0)
      }).catch((err) => {
        console.error('Failed to decode audio:', err)
        onEnd?.()
        resolve()
      })
    })
  }

  private async _playPcm(base64: string, onEnd?: () => void): Promise<void> {
    return new Promise((resolve) => {
      const raw = atob(base64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      const wav = this._pcmToWav(bytes, 24000, 1, 16)

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext()
      }
      if (this.audioContext.state === 'suspended') this.audioContext.resume()

      this.audioContext.decodeAudioData(wav).then((buf) => {
        const src = this.audioContext!.createBufferSource()
        src.buffer = buf
        src.connect(this.audioContext!.destination)
        this.currentAudioSource = src
        src.onended = () => {
          this.currentAudioSource = null
          onEnd?.()
          resolve()
        }
        src.start(0)
      }).catch((err) => {
        console.error('Failed to decode audio:', err)
        onEnd?.()
        resolve()
      })
    })
  }

  private _pcmToWav(pcm: Uint8Array, sr: number, ch: number, bits: number): ArrayBuffer {
    const header = new ArrayBuffer(44)
    const v = new DataView(header)
    const s = (o: number, str: string) => {
      for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i))
    }
    s(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true)
    s(8, 'WAVE'); s(12, 'fmt ')
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
    v.setUint32(24, sr, true); v.setUint32(28, (sr * ch * bits) / 8, true)
    v.setUint16(32, (ch * bits) / 8, true); v.setUint16(34, bits, true)
    s(36, 'data'); v.setUint32(40, pcm.byteLength, true)
    const out = new Uint8Array(44 + pcm.byteLength)
    out.set(new Uint8Array(header)); out.set(pcm, 44)
    return out.buffer
  }

  private _browserSpeak(text: string, lang: string, onEnd?: () => void) {
    const synth = window.speechSynthesis
    if (!synth) { onEnd?.(); return }
    synth.cancel()

    const speak = () => {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0
      u.lang = lang
      const voices = synth.getVoices()
      // First try exact lang match, then prefix match (e.g. 'es' for 'es-ES')
      const langPrefix = lang.split('-')[0].toLowerCase()
      const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase())
      const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix))
      const v = exact ?? prefix
      if (v) u.voice = v
      u.onend = () => onEnd?.()
      u.onerror = () => onEnd?.()
      synth.speak(u)
    }

    if (synth.getVoices().length > 0) {
      speak()
    } else {
      synth.addEventListener('voiceschanged', speak, { once: true })
    }
  }

  stopSpeaking() {
    if (this.currentAudioSource) {
      try { this.currentAudioSource.stop() } catch { /* ok */ }
      this.currentAudioSource = null
    }
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
  }
}

// Singleton — safe because this file is only imported in Client Components.
export const geminiClient = new GeminiClientService()

// Re-export language helpers for convenience
export { getBcp47, getLanguageMeta }


