'use client'

/**
 * LiveCallView — fullscreen voice call using Gemini Live API.
 *
 * Redesigned with:
 * - Chat-bubble subtitles (markdown stripped, proper alignment)
 * - Merged status/timer bar
 * - Smooth ring animations (no harsh ping)
 * - Glass-morphism controls
 * - Tighter layout, less dead space
 * - Per-line fade-in animations
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  Mic, MicOff, PhoneOff, Loader2, Subtitles, AlertTriangle, RefreshCw, ChevronDown,
  ArrowRight, Sparkles,
} from 'lucide-react'
import { CallAvatar } from './CallAvatar'
import { AvatarSVG } from '../ui/AvatarSVG'
import {
  createLiveCallService,
  type LiveStatus,
  type LiveTranscriptEvent,
  type LiveCallService,
} from '@/lib/api/live-client'
import { VoiceActivityDetector } from '@/lib/utils/vad'
import type { ConversationState, Correction } from '@talkingo/shared/types'
import { buildOpenerPrompt } from '@talkingo/shared/gemini'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubtitleLine {
  id: string
  role: 'user' | 'model'
  text: string
  final: boolean
  timestamp: number
}

interface LiveCallViewProps {
  state: ConversationState
  callDuration: number
  onEndCall: () => void
  /** Called when the call should end itself (inactivity) — saves silently and
   *  exits without the manual confirm dialog. Falls back to onEndCall. */
  onAutoEnd?: () => void
  onTranscriptLine?: (role: 'user' | 'model', text: string, lineId: string) => void
  /** Corrections computed for finalized user turns, keyed by the subtitle line
   *  id passed back through onTranscriptLine. Rendered under the matching user
   *  bubble so learners get live feedback without leaving the call. */
  correctionsByLine?: Record<string, Correction[]>
  /** Optional — route the user to unlimited text chat when they hit the daily
   *  live-voice cap. When omitted, the "done for today" screen just exits. */
  onSwitchToText?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

/**
 * Strip markdown artifacts from live transcript text.
 * Gemini Live sometimes emits **bold**, *italic*, bullet markers, etc.
 * We want clean, readable spoken text — no formatting symbols.
 */
function cleanTranscriptText(raw: string): string {
  return raw
    // Remove bold markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Remove italic markers
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove bullet markers at line start
    .replace(/^[\*\-•]\s+/gm, '')
    // Remove numbered list markers
    .replace(/^\d+\.\s+/gm, '')
    // Remove backticks
    .replace(/`(.+?)`/g, '$1')
    // Remove guillemets (keep the text inside)
    .replace(/[«»]/g, '"')
    // Strip any remaining orphaned markdown symbols (e.g. unclosed ** mid-stream)
    .replace(/\*{1,2}/g, '')
    .replace(/_{1,2}/g, '')
    .replace(/`/g, '')
    // Remove hash headers (# Title)
    .replace(/^#{1,6}\s+/gm, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveCallView({
  state,
  callDuration,
  onEndCall,
  onAutoEnd,
  onTranscriptLine,
  correctionsByLine,
  onSwitchToText,
}: LiveCallViewProps) {
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting')
  const [isMuted, setIsMuted] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(true)
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [autoReconnecting, setAutoReconnecting] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const [idlePrompt, setIdlePrompt] = useState(false)
  /** True while the model is thinking (user's turn ended, no audio yet). Drives
   *  the avatar's "thinking" state so a processing gap doesn't look frozen. */
  const [isThinking, setIsThinking] = useState(false)
  /** Set when the server signals the daily live-voice cap is reached. Shows the
   *  warm "done for today" screen and stops the session. */
  const [capReached, setCapReached] = useState(false)

  const isMutedRef = useRef(isMuted)
  const liveStatusRef = useRef(liveStatus)
  const isInterruptingRef = useRef(false)
  const subtitleContainerRef = useRef<HTMLDivElement>(null)
  const vadRef = useRef<VoiceActivityDetector | null>(null)
  const interruptTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const serviceRef = useRef<LiveCallService | null>(null)
  /** Latest session-resumption handle — used to resume context on reconnect. */
  const resumeHandleRef = useRef<string | null>(null)
  /** Subtitle line ids already committed to chat history (so each completed
   *  turn is saved exactly once). */
  const emittedLineIdsRef = useRef<Set<string>>(new Set())
  /** Live refs to the parent callbacks so timers/effects stay stable. */
  const onTranscriptLineRef = useRef(onTranscriptLine)
  const onEndCallRef = useRef(onEndCall)
  const onAutoEndRef = useRef(onAutoEnd)
  useEffect(() => {
    onTranscriptLineRef.current = onTranscriptLine
    onEndCallRef.current = onEndCall
    onAutoEndRef.current = onAutoEnd
  })
  /** Reconnect attempt counter, reset once we're live again. */
  const reconnectAttemptsRef = useRef(0)
  /** Timestamp of the last sign the user is engaged (spoke / tapped a control). */
  const lastActivityRef = useRef(Date.now())
  const idlePromptRef = useRef(false)
  /** Ensures the inactivity auto-end fires only once. */
  const autoEndedRef = useRef(false)
  /** True while the AI is actually emitting audio. Sourced from the playback
   *  pipeline (reliable) rather than the `speaking` status flag, which can get
   *  stuck if a `turn_complete` is missed — that stale flag previously made the
   *  idle watchdog hold forever, so unattended calls never auto-ended. */
  const isPlaybackActiveRef = useRef(false)
  /** Real, high-frequency audio levels for the reactive avatar. Held in refs
   *  (not state) so 60fps updates never re-render this large view. */
  const amplitudeRef = useRef(0)
  const micLevelRef = useRef(0)

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { liveStatusRef.current = liveStatus }, [liveStatus])

  // ── Engagement / inactivity tracking ────────────────────────────────────
  // Mark the user as "present". Clears any pending "still there?" prompt.
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (idlePromptRef.current) {
      idlePromptRef.current = false
      setIdlePrompt(false)
    }
  }, [])

  // Idle watchdog: if the user goes quiet for IDLE_PROMPT_MS we surface a
  // "still there?" prompt; if they stay silent for IDLE_END_MS more we end the
  // call automatically so an unattended session can't run forever (or burn
  // API quota). While the AI is actively speaking the user is engaged, so the
  // timer is held.
  useEffect(() => {
    if (error || capReached) return
    const IDLE_PROMPT_MS = 30_000
    const IDLE_END_MS = 20_000
    const iv = setInterval(() => {
      // AI actually emitting audio → user is listening → not idle. Uses the
      // playback signal (not the status flag) so a stuck "speaking" status can
      // never wedge the watchdog open.
      if (isPlaybackActiveRef.current || liveStatusRef.current === 'connecting') {
        lastActivityRef.current = Date.now()
        return
      }
      const idleFor = Date.now() - lastActivityRef.current
      if (!idlePromptRef.current && idleFor >= IDLE_PROMPT_MS) {
        idlePromptRef.current = true
        setIdlePrompt(true)
      } else if (idlePromptRef.current && idleFor >= IDLE_PROMPT_MS + IDLE_END_MS) {
        // Unattended → stop streaming immediately (frees mic + API), then save
        // the session silently and exit. No manual confirm dialog — nobody's
        // there to answer it. Guard so it only fires once.
        if (autoEndedRef.current) return
        autoEndedRef.current = true
        serviceRef.current?.disconnect()
        vadRef.current?.stop()
        vadRef.current = null
        const end = onAutoEndRef.current ?? onEndCallRef.current
        end()
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [error, capReached])

  // ── Auto-reconnect ──────────────────────────────────────────────────────
  // Transparent reconnect on an unexpected drop or a server "going away"
  // signal. Uses the stored resume handle so the conversation continues with
  // full context. Subtitles are preserved (unlike a manual retry).
  const triggerReconnect = useCallback(() => {
    const MAX_RECONNECTS = 4
    if (reconnectAttemptsRef.current >= MAX_RECONNECTS) {
      setError('Connection lost. Tap “Try again” to reconnect.')
      setAutoReconnecting(false)
      return
    }
    reconnectAttemptsRef.current += 1
    setAutoReconnecting(true)
    setError(null)
    markActivity()
    setRetryNonce((n) => n + 1)
  }, [markActivity])

  const handleTranscript = useCallback((event: LiveTranscriptEvent) => {
    // Any user speech is a strong engagement signal.
    if (event.role === 'user') markActivity()
    setSubtitles((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === event.role && !last.final) {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...last,
          text:
            event.text.length >= last.text.length && event.text.startsWith(last.text)
              ? event.text
              : event.text.length > last.text.length
                ? event.text
                : last.text + event.text,
          final: event.final,
        }
        return updated
      }
      return [
        ...prev.slice(-50),
        {
          id: `${Date.now()}-${Math.random()}`,
          role: event.role,
          text: event.text,
          final: event.final,
          timestamp: Date.now(),
        },
      ]
    })
    // NOTE: messages are NOT committed here. The live model's per-event
    // `final` flag is unreliable, so we commit complete turns from a separate
    // effect that watches subtitle boundaries (see below). This guarantees the
    // saved chat history matches the on-screen conversation.
  }, [markActivity])

  // ── Commit completed turns to chat history ──────────────────────────────
  // A subtitle line is "complete" when either a newer line exists after it
  // (the turn ended and the other speaker began) or it is flagged final
  // (turn_complete for the model, end-of-utterance for the user). Each line is
  // saved exactly once, using its full accumulated text — so history, the
  // message count, the recap and long-term memory all reflect the real call.
  useEffect(() => {
    if (subtitles.length === 0) return
    subtitles.forEach((line, i) => {
      const isLast = i === subtitles.length - 1
      const complete = !isLast || line.final
      if (!complete || emittedLineIdsRef.current.has(line.id)) return
      const text = cleanTranscriptText(line.text)
      if (!text) return
      emittedLineIdsRef.current.add(line.id)
      onTranscriptLineRef.current?.(line.role, text, line.id)
    })
  }, [subtitles])

  // (Re)arm the voice-activity detector on a given mic stream. Extracted so it
  // can be called both on initial connect AND after a mute→unmute cycle —
  // startMic() creates a brand-new MediaStream, and the VAD must point at it.
  // Previously the VAD kept analysing the old (stopped) stream after unmuting,
  // which silently disabled barge-in interruption.
  const startVad = useCallback((micStream: MediaStream) => {
    vadRef.current?.stop()
    const vad = new VoiceActivityDetector(() => {
      // NOTE: raw mic energy is deliberately NOT treated as user presence.
      // Ambient noise (fans, traffic, a TV) clears the VAD threshold and would
      // otherwise keep an unattended call alive forever. Genuine speech resets
      // the idle timer via the user transcript instead. Here the VAD only drives
      // barge-in interruption of the AI.
      if (isInterruptingRef.current) return
      if (liveStatusRef.current !== 'speaking') return
      const service = serviceRef.current
      if (!service) return
      isInterruptingRef.current = true
      service.interrupt()
      if (interruptTimeoutRef.current) clearTimeout(interruptTimeoutRef.current)
      interruptTimeoutRef.current = setTimeout(() => {
        isInterruptingRef.current = false
      }, 600)
    })
    vadRef.current = vad
    vad.start(micStream)
    // If the AI is mid-utterance when we (re)arm, gate detection briefly so
    // residual speaker bleed doesn't immediately fire a false interrupt.
    if (liveStatusRef.current === 'speaking') vad.setActive(false)
  }, [])

  // ── Connect on mount (and on retry) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const service = createLiveCallService()
    serviceRef.current = service
    // Capture whether this connect is resuming an existing session (vs fresh).
    const resumingSession = !!resumeHandleRef.current
    setError(null)
    setLiveStatus('connecting')

    service.setCallbacks({
      onStatus: (s) => {
        if (cancelled) return
        setLiveStatus(s)
        // We're live again — clear reconnect state and reset the watchdog.
        if (s === 'ready' || s === 'listening' || s === 'speaking') {
          reconnectAttemptsRef.current = 0
          setAutoReconnecting(false)
          lastActivityRef.current = Date.now()
        }
      },
      onTranscript: (event: LiveTranscriptEvent) => {
        if (!cancelled) handleTranscript(event)
      },
      onInterrupted: () => {
        if (!cancelled) {
          setSubtitles((prev) =>
            prev.filter((l) => !(l.role === 'model' && !l.final))
          )
        }
      },
      onTurnComplete: () => {
        if (cancelled) return
        setSubtitles((prev) =>
          prev.map((l, i) =>
            i === prev.length - 1 && l.role === 'model' ? { ...l, final: true } : l
          )
        )
      },
      onThinking: (thinking) => {
        if (!cancelled) setIsThinking(thinking)
      },
      onSessionHandle: (handle) => {
        resumeHandleRef.current = handle
      },
      onGoingAway: () => {
        // Proactive reconnect before the socket drops — seamless hand-off.
        if (!cancelled) triggerReconnect()
      },
      onUsageWarning: () => {
        // Nearing the daily live-voice cap. Intentionally NO system banner —
        // the tutor is already wrapping up in-conversation (server-side nudge).
        // Keeping this subtle is the whole point; the hard cap handles the rest.
      },
      onUsageLimit: () => {
        if (cancelled) return
        // Daily live-voice cap reached. Stop streaming now and show the warm
        // "done for today" screen. We disconnect ourselves so onClose treats it
        // as client-initiated and does NOT try to reconnect.
        setCapReached(true)
        vadRef.current?.stop()
        vadRef.current = null
        serviceRef.current?.disconnect()
      },
      onError: (msg) => {
        if (!cancelled) setError(msg)
      },
      onClose: ({ initiatedByClient, code }) => {
        if (cancelled || initiatedByClient) return
        // Unexpected drop after being connected → try to resume transparently
        // instead of dead-ending on a "Call ended" screen.
        if (code !== 1000 || resumeHandleRef.current) {
          triggerReconnect()
        } else {
          setError((prev) => prev || 'Call disconnected unexpectedly.')
        }
      },
    })

    service.setOnPlaybackActive((active) => {
      isPlaybackActiveRef.current = active
      vadRef.current?.setActive(!active)
    })

    // Real audio levels → reactive avatar (refs, no re-render).
    service.setOnAmplitude((a) => { amplitudeRef.current = a })
    service.setOnMicLevel((l) => { micLevelRef.current = l })

    service
      .connect(state, resumeHandleRef.current ?? undefined)
      .then(async () => {
        if (cancelled) return
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone access is blocked. Please use HTTPS.')
        }
        await service.startMic()
        if (cancelled) return

        const micStream = service.micMediaStream
        if (micStream) {
          startVad(micStream)
        }

        // Only greet on a fresh session. A resumed session already has the
        // conversation in context, so replaying the opener would be jarring.
        if (!resumingSession) {
          service.sendText(buildOpenerPrompt(state, state.userName))
        }
      })
      .catch((err) => {
        console.error('[LiveCall] Connection failed:', err)
        if (!cancelled) {
          setError(err?.message ?? 'Failed to connect')
        }
      })

    return () => {
      cancelled = true
      if (interruptTimeoutRef.current) {
        clearTimeout(interruptTimeoutRef.current)
        interruptTimeoutRef.current = null
      }
      vadRef.current?.stop()
      vadRef.current = null
      service.disconnect()
      if (serviceRef.current === service) {
        serviceRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce])

  const handleMuteToggle = useCallback(() => {
    const service = serviceRef.current
    if (!service) return
    markActivity()
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) {
        service.stopMic()
        // Mic stream is torn down on mute — stop the VAD so it isn't left
        // analysing a dead stream (which silently killed barge-in interruption
        // after a mute/unmute cycle).
        vadRef.current?.stop()
        vadRef.current = null
      } else {
        // startMic() creates a NEW MediaStream, so re-arm the VAD on it.
        service.startMic().then(() => {
          const micStream = service.micMediaStream
          if (micStream) startVad(micStream)
        }).catch(() => {})
      }
      return next
    })
  }, [startVad, markActivity])

  const handleRetry = useCallback(() => {
    // Manual retry → start a clean session (the resume handle may be stale).
    setIsReconnecting(true)
    setError(null)
    setSubtitles([])
    emittedLineIdsRef.current.clear()
    resumeHandleRef.current = null
    reconnectAttemptsRef.current = 0
    setAutoReconnecting(false)
    markActivity()
    setRetryNonce((n) => n + 1)
    setTimeout(() => setIsReconnecting(false), 400)
  }, [markActivity])

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnecting = !error && liveStatus === 'connecting'

  const statusLabel = error
    ? 'Connection error'
    : autoReconnecting ? 'Reconnecting'
    : liveStatus === 'connecting' ? 'Connecting'
    : liveStatus === 'ready'     ? 'Ready'
    : liveStatus === 'listening' ? 'Listening'
    : liveStatus === 'speaking'  ? 'Speaking'
    : liveStatus === 'closed'    ? 'Call ended'
    : 'Connecting'

  const avatarState =
    liveStatus === 'speaking' ? 'speaking' :
    isThinking || error || liveStatus === 'connecting' ? 'thinking' :
    'listening'

  // Track if user has manually scrolled up to avoid auto-scroll snapping back
  const [userScrolledUp, setUserScrolledUp] = useState(false)

  // Auto-scroll only if user hasn't manually scrolled up
  useEffect(() => {
    if (!userScrolledUp && subtitleContainerRef.current) {
      subtitleContainerRef.current.scrollTo({
        top: subtitleContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [subtitles, userScrolledUp])

  const scrollToBottom = useCallback(() => {
    const el = subtitleContainerRef.current
    if (!el) return
    setUserScrolledUp(false)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  const handleSubtitleScroll = useCallback(() => {
    const el = subtitleContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    // Set when the user scrolls away from the bottom so auto-scroll pauses,
    // clear when they return so new lines resume following.
    setUserScrolledUp(!isNearBottom)
  }, [])

  const personaId = state.persona ?? 'eli'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-2xl overflow-hidden animate-fade-in">

      {/* ── Background ambient glow ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={cn(
            'absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] transition-all duration-1000',
            liveStatus === 'speaking'
              ? 'bg-primary/[0.14] scale-110'
              : liveStatus === 'listening'
                ? 'bg-primary/10 scale-100'
                : 'bg-muted/8 scale-90'
          )}
        />
      </div>

      {/* ── Swipe-down drag handle ── */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-0.5 opacity-30">
        <div className="w-9 h-1 rounded-full bg-foreground/20" />
      </div>

      {/* ── Top bar — status + timer merged ── */}
      <div className="relative flex items-center justify-center pt-16 pb-4">
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-full glass-card border border-border/40" role="status" aria-live="polite">
          {/* Status indicator */}
          {isConnecting ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : (
            <span className={cn(
              'w-2 h-2 rounded-full transition-colors duration-500',
              error ? 'bg-red-400' :
              liveStatus === 'speaking' ? 'bg-primary animate-pulse' :
              liveStatus === 'listening' ? 'bg-primary animate-pulse' :
              'bg-muted-foreground/40'
            )} />
          )}
          <span className={cn(
            'text-xs font-semibold tracking-wide transition-colors duration-300',
            error ? 'text-red-400' :
            liveStatus === 'speaking' ? 'text-primary' :
            liveStatus === 'listening' ? 'text-primary' :
            'text-muted-foreground'
          )}>
            {statusLabel}
          </span>
          <span className="w-px h-3.5 bg-border/60" />
          <span className="font-mono text-xs font-semibold text-foreground/60 tabular-nums">
            {formatDuration(callDuration)}
          </span>
        </div>

        {/* Muted indicator — prominent banner + floating badge */}
        {isMuted && !error && (
          <>
            {/* Full-width banner */}
            <div className="absolute left-0 right-0 -bottom-3 flex justify-center">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 text-[11px] font-semibold text-red-400 shadow-lg backdrop-blur-md">
                <MicOff className="w-3.5 h-3.5" />
                Mic is muted — tap mic to unmute
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Avatar section — fixed height, centered, audio-reactive ── */}
      <div className="relative flex items-center justify-center py-6">
        <CallAvatar
          personaId={personaId}
          state={error ? 'error' : (avatarState === 'thinking' && liveStatus === 'connecting') ? 'connecting' : avatarState === 'thinking' ? 'thinking' : (avatarState as 'speaking' | 'listening')}
          amplitudeRef={amplitudeRef}
          micLevelRef={micLevelRef}
        />
      </div>

      {/* ── Subtitle area — chat-style bubbles, full scrollable ── */}
      <div className="relative flex-1 min-h-0 flex flex-col justify-end px-4 pb-3">
        {showSubtitles && !error && (
          <div
            ref={subtitleContainerRef}
            onScroll={handleSubtitleScroll}
            className="overflow-y-auto flex-1 space-y-2.5 px-1 custom-scrollbar pb-1"
            aria-live="polite"
          >
            {subtitles.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground/40 font-medium">
                  {isConnecting ? 'Setting up the call…' : 'Conversation will appear here…'}
                </p>
              </div>
            ) : (
              subtitles.map((line) => (
                <SubtitleBubble
                  key={line.id}
                  line={line}
                  personaId={personaId}
                  corrections={line.role === 'user' ? correctionsByLine?.[line.id] : undefined}
                />
              ))
            )}
          </div>
        )}

        {/* Scroll-to-latest button — only when the user has scrolled up to read */}
        {showSubtitles && !error && userScrolledUp && subtitles.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 border border-primary/40 text-[11px] font-semibold text-primary shadow-lg backdrop-blur-md transition-all animate-fade-in-up"
            aria-label="Scroll to latest"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Latest
          </button>
        )}

        {/* Error card */}
        {error && (
          <div className="mx-1 px-5 py-4 rounded-2xl glass-card border border-red-500/30 bg-red-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-300 mb-1">Couldn&apos;t connect</p>
                <p className="text-xs text-red-300/70 leading-relaxed break-words">{error}</p>
                <button
                  onClick={handleRetry}
                  disabled={isReconnecting}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-xs font-medium text-red-200 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isReconnecting && 'animate-spin')} />
                  {isReconnecting ? 'Retrying…' : 'Try again'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls — glass morphism row ── */}
      <div className="relative flex items-center justify-center gap-5 pt-4 px-6 pad-bottom-controls">
        {/* Subtle divider above controls */}
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Subtitles toggle */}
        <ControlButton
          onClick={() => setShowSubtitles((s) => !s)}
          disabled={!!error}
          active={showSubtitles}
          activeColor="primary"
          aria-label={showSubtitles ? 'Hide subtitles' : 'Show subtitles'}
        >
          <Subtitles className="w-5 h-5" />
        </ControlButton>

        {/* End call — center, largest */}
        <button
          onClick={onEndCall}
          className={cn(
            'group relative w-[68px] h-[68px] rounded-full flex items-center justify-center',
            'bg-error/90 border border-error/40',
            'text-white shadow-[0_10px_30px_-8px_oklch(var(--error)/0.55)]',
            'hover:bg-error hover:scale-105 active:scale-95 transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
          aria-label="End call"
        >
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_30%,oklch(100%_0_0/0.18),transparent_60%)] pointer-events-none" />
          <PhoneOff className="w-6 h-6 relative z-10" />
        </button>

        {/* Mute mic */}
        <ControlButton
          onClick={handleMuteToggle}
          disabled={isConnecting || !!error}
          active={isMuted}
          activeColor="red"
          aria-label={isMuted ? 'Unmute mic' : 'Mute mic'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </ControlButton>
      </div>

      {/* ── Inactivity prompt — centered overlay, separate from transcript ── */}
      {idlePrompt && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-background/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs px-6 py-6 rounded-3xl glass-card border border-amber-500/30 bg-amber-500/[0.06] shadow-2xl text-center animate-fade-in-up">
            <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-base font-semibold text-amber-100 mb-1.5">Still there?</p>
            <p className="text-xs text-amber-200/70 leading-relaxed mb-5">
              The call will end soon to save resources. Just start speaking, or tap below to keep going.
            </p>
            <button
              onClick={markActivity}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-sm font-semibold text-amber-50 transition-all"
            >
              I&apos;m still here
            </button>
          </div>
        </div>
      )}

      {/* ── Daily cap reached — warm "done for today" screen ── */}
      {capReached && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-background/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm px-6 py-7 rounded-3xl glass-card border border-primary/30 bg-primary/[0.06] shadow-2xl text-center animate-fade-in-up">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground mb-2">
              That&apos;s your speaking for today 🎉
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Nice work. You&apos;ve used today&apos;s live conversation time — come back
              tomorrow for more, or keep the momentum going with unlimited text chat.
            </p>
            {onSwitchToText && (
              <button
                onClick={onSwitchToText}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 mb-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Keep practicing by text <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onAutoEnd ?? onEndCall}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-full border border-border/50 text-sm font-medium text-foreground/70 hover:bg-muted/40 transition-all"
            >
              Done for today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SubtitleBubble — chat-style message bubble ──────────────────────────────

function SubtitleBubble({
  line,
  personaId,
  corrections,
}: {
  line: SubtitleLine
  personaId: string
  corrections?: Correction[]
}) {
  const isUser = line.role === 'user'
  const cleanText = useMemo(() => cleanTranscriptText(line.text), [line.text])
  const hasFixes = isUser && !!corrections && corrections.length > 0

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 animate-fade-in-up',
        isUser ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'flex items-end gap-2 w-full',
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        {/* AI avatar — small, beside the bubble */}
        {!isUser && (
          <div className="w-6 h-6 rounded-full overflow-hidden border border-border/30 shrink-0 mb-0.5">
            <AvatarSVG personaId={personaId} size={24} />
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'max-w-[80%] px-4 py-2.5 rounded-2xl transition-all duration-300',
            isUser
              ? 'bg-primary/12 border border-primary/25 rounded-br-md'
              : 'bg-card/80 backdrop-blur-sm border border-border/40 rounded-bl-md',
            line.final ? 'opacity-100' : 'opacity-90'
          )}
        >
          <p className={cn(
            'text-[13px] leading-relaxed',
            isUser ? 'text-foreground' : 'text-foreground'
          )}>
            {cleanText}
            {!line.final && (
              <span className="inline-block w-[3px] h-[14px] bg-current ml-1 animate-pulse rounded-full opacity-50 align-middle" />
            )}
          </p>
        </div>

        {/* User indicator */}
        {isUser && (
          <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mb-0.5">
            <Mic className="w-3 h-3 text-primary/70" />
          </div>
        )}
      </div>

      {/* Live corrections — compact strip under the user's bubble */}
      {hasFixes && <LiveCorrections corrections={corrections!} />}
    </div>
  )
}

// ─── LiveCorrections — compact, expandable fix strip for the call view ───────

function LiveCorrections({ corrections }: { corrections: Correction[] }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="max-w-[80%] mr-8 self-end w-full flex flex-col items-end gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-semibold hover:bg-primary/25 transition-all"
        aria-expanded={open}
      >
        <Sparkles className="w-3 h-3" />
        {corrections.length} fix{corrections.length === 1 ? '' : 'es'}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="w-full rounded-xl border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-3 py-2 space-y-1.5 animate-fade-in">
          {corrections.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-wrap text-[12px] leading-snug">
              <span className="line-through text-foreground/45">{c.original}</span>
              <ArrowRight className="w-3 h-3 text-primary/50 shrink-0" />
              <span className="font-semibold text-primary">{c.corrected}</span>
              {c.note && c.note.trim().length > 0 && (
                <span className="w-full text-[11px] text-muted-foreground">{c.note}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ControlButton — glass morphism action button ────────────────────────────

function ControlButton({
  onClick,
  disabled,
  active,
  activeColor,
  children,
  ...props
}: {
  onClick: () => void
  disabled?: boolean
  active: boolean
  activeColor: 'primary' | 'red'
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-200',
        'backdrop-blur-md border',
        'hover:scale-105 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-35 disabled:hover:scale-100 disabled:cursor-not-allowed',
        active && activeColor === 'primary' && [
          'bg-primary/12 border-primary/40 text-primary',
          'shadow-md shadow-primary/10',
          'focus-visible:ring-primary',
        ],
        active && activeColor === 'red' && [
          'bg-red-500/12 border-red-500/40 text-red-400',
          'shadow-md shadow-red-500/10',
          'focus-visible:ring-red-400',
        ],
        !active && [
          'bg-card/60 border-border/50 text-foreground/50',
          'hover:bg-card/80 hover:border-border/70 hover:text-foreground/70',
          'focus-visible:ring-primary',
        ],
      )}
      {...props}
    >
      {children}
    </button>
  )
}
