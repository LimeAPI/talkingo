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
  Mic, MicOff, PhoneOff, Loader2, Subtitles, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { PersonaAvatar } from '../ui/PersonaAvatar'
import { AvatarSVG } from '../ui/AvatarSVG'
import {
  createLiveCallService,
  type LiveStatus,
  type LiveTranscriptEvent,
  type LiveCallService,
} from '@/lib/api/live-client'
import { VoiceActivityDetector } from '@/lib/utils/vad'
import type { ConversationState } from '@talkingo/shared/types'
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
  onTranscriptLine?: (role: 'user' | 'model', text: string) => void
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
  onTranscriptLine,
}: LiveCallViewProps) {
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting')
  const [isMuted, setIsMuted] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(true)
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  const isMutedRef = useRef(isMuted)
  const liveStatusRef = useRef(liveStatus)
  const isInterruptingRef = useRef(false)
  const subtitleRef = useRef<HTMLDivElement>(null)
  const vadRef = useRef<VoiceActivityDetector | null>(null)
  const interruptTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const serviceRef = useRef<LiveCallService | null>(null)

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { liveStatusRef.current = liveStatus }, [liveStatus])

  // Auto-scroll subtitles smoothly
  useEffect(() => {
    if (subtitleRef.current) {
      subtitleRef.current.scrollTo({
        top: subtitleRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [subtitles])

  const handleTranscript = useCallback((event: LiveTranscriptEvent) => {
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
        ...prev.slice(-20),
        {
          id: `${Date.now()}-${Math.random()}`,
          role: event.role,
          text: event.text,
          final: event.final,
          timestamp: Date.now(),
        },
      ]
    })

    if (event.final) {
      onTranscriptLine?.(event.role, event.text)
    }
  }, [onTranscriptLine])

  // ── Connect on mount (and on retry) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const service = createLiveCallService()
    serviceRef.current = service
    setError(null)
    setLiveStatus('connecting')

    service.setCallbacks({
      onStatus: (s) => {
        if (cancelled) return
        setLiveStatus(s)
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
      onError: (msg) => {
        if (!cancelled) setError(msg)
      },
      onClose: ({ initiatedByClient, code }) => {
        if (cancelled || initiatedByClient) return
        if (code !== 1000) {
          setError((prev) => prev || 'Call disconnected unexpectedly.')
        }
      },
    })

    service.setOnPlaybackActive((active) => {
      vadRef.current?.setActive(!active)
    })

    service
      .connect(state)
      .then(async () => {
        if (cancelled) return
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone access is blocked. Please use HTTPS.')
        }
        await service.startMic()
        if (cancelled) return

        const micStream = service.micMediaStream
        if (micStream) {
          vadRef.current = new VoiceActivityDetector(() => {
            if (isInterruptingRef.current) return
            if (liveStatusRef.current !== 'speaking') return
            isInterruptingRef.current = true
            service.interrupt()
            if (interruptTimeoutRef.current) clearTimeout(interruptTimeoutRef.current)
            interruptTimeoutRef.current = setTimeout(() => {
              isInterruptingRef.current = false
            }, 600)
          })
          vadRef.current.start(micStream)
        }

        service.sendText(buildOpenerPrompt(state, state.userName))
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
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) {
        service.stopMic()
      } else {
        service.startMic().catch(() => {})
      }
      return next
    })
  }, [])

  const handleRetry = useCallback(() => {
    setIsReconnecting(true)
    setError(null)
    setSubtitles([])
    setRetryNonce((n) => n + 1)
    setTimeout(() => setIsReconnecting(false), 400)
  }, [])

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnecting = !error && liveStatus === 'connecting'
  const isActive = liveStatus === 'listening' || liveStatus === 'speaking'

  const statusLabel = error
    ? 'Connection error'
    : liveStatus === 'connecting' ? 'Connecting'
    : liveStatus === 'ready'     ? 'Ready'
    : liveStatus === 'listening' ? 'Listening'
    : liveStatus === 'speaking'  ? 'Speaking'
    : liveStatus === 'closed'    ? 'Call ended'
    : 'Connecting'

  const avatarState =
    liveStatus === 'speaking' ? 'speaking' :
    error || liveStatus === 'connecting' ? 'thinking' :
    'listening'

  // Track if user has manually scrolled up to avoid auto-scroll snapping back
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const subtitleContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll only if user hasn't manually scrolled up
  useEffect(() => {
    if (!userScrolledUp && subtitleContainerRef.current) {
      subtitleContainerRef.current.scrollTo({
        top: subtitleContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [subtitles, userScrolledUp])

  const handleSubtitleScroll = useCallback(() => {
    const el = subtitleContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (isNearBottom) setUserScrolledUp(false)
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
              ? 'bg-secondary/12 scale-110'
              : liveStatus === 'listening'
                ? 'bg-primary/10 scale-100'
                : 'bg-muted/8 scale-90'
          )}
        />
      </div>

      {/* ── Swipe-down drag handle ── */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-0.5 opacity-40">
        <div className="w-9 h-1 rounded-full bg-foreground/20" />
        <span className="text-[8px] text-foreground/30 font-medium tracking-wider">Pull down to end</span>
      </div>

      {/* ── Top bar — status + timer merged ── */}
      <div className="relative flex items-center justify-center pt-16 pb-4">
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-full glass-card border border-border/40">
          {/* Status indicator */}
          {isConnecting ? (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          ) : (
            <span className={cn(
              'w-2 h-2 rounded-full transition-colors duration-500',
              error ? 'bg-red-400' :
              liveStatus === 'speaking' ? 'bg-secondary animate-pulse' :
              liveStatus === 'listening' ? 'bg-primary animate-pulse' :
              'bg-muted-foreground/40'
            )} />
          )}
          <span className={cn(
            'text-xs font-semibold tracking-wide transition-colors duration-300',
            error ? 'text-red-400' :
            liveStatus === 'speaking' ? 'text-secondary' :
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

      {/* ── Avatar section — fixed height, centered ── */}
      <div className="relative flex items-center justify-center py-6">
        {/* Smooth expanding rings — replaces harsh animate-ping */}
        {!error && isActive && (
          <>
            <div
              className={cn(
                'absolute w-36 h-36 rounded-full border transition-all duration-1000',
                liveStatus === 'speaking'
                  ? 'border-secondary/20 animate-ring-expand'
                  : 'border-primary/15 animate-ring-expand'
              )}
              style={{ animationDuration: '2.5s' }}
            />
            <div
              className={cn(
                'absolute w-28 h-28 rounded-full border transition-all duration-1000',
                liveStatus === 'speaking'
                  ? 'border-secondary/30 animate-ring-expand'
                  : 'border-primary/20 animate-ring-expand'
              )}
              style={{ animationDuration: '2s', animationDelay: '0.4s' }}
            />
          </>
        )}
        {isConnecting && (
          <div
            className="absolute w-32 h-32 rounded-full border border-muted-foreground/15 animate-ring-expand"
            style={{ animationDuration: '2.5s' }}
          />
        )}
        <PersonaAvatar
          personaId={personaId}
          state={avatarState}
          size="xl"
        />
      </div>

      {/* ── Subtitle area — chat-style bubbles, full scrollable ── */}
      <div className="flex-1 min-h-0 flex flex-col justify-end px-4 pb-3">
        {showSubtitles && !error && (
          <div
            ref={(el) => {
              subtitleRef.current = el
              subtitleContainerRef.current = el
            }}
            onScroll={handleSubtitleScroll}
            className="overflow-y-auto flex-1 space-y-2.5 px-1 custom-scrollbar pb-1"
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
                />
              ))
            )}
          </div>
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
      <div className="relative flex items-center justify-center gap-5 pb-12 pt-4 px-6">
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
            'w-[68px] h-[68px] rounded-full flex items-center justify-center',
            'bg-gradient-to-br from-red-500 to-red-600',
            'border-2 border-red-400/50',
            'text-white shadow-xl shadow-red-500/25',
            'hover:scale-105 active:scale-95 transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          )}
          aria-label="End call"
        >
          <PhoneOff className="w-6 h-6" />
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
    </div>
  )
}

// ─── SubtitleBubble — chat-style message bubble ──────────────────────────────

function SubtitleBubble({
  line,
  personaId,
}: {
  line: SubtitleLine
  personaId: string
}) {
  const isUser = line.role === 'user'
  const cleanText = useMemo(() => cleanTranscriptText(line.text), [line.text])

  return (
    <div
      className={cn(
        'flex items-end gap-2 animate-fade-in-up',
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
          line.final ? 'opacity-100' : 'opacity-80'
        )}
      >
        <p className={cn(
          'text-[13px] leading-relaxed',
          isUser ? 'text-foreground' : 'text-foreground/90'
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
