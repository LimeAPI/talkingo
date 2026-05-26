'use client'

/**
 * LiveCallView — fullscreen voice call using Gemini Live API.
 *
 * Features:
 * - Real-time bidirectional audio (no STT/TTS round-trips)
 * - Live subtitles for both user and AI speech
 * - Interrupt AI by speaking (VAD-driven)
 * - Mute mic, end call
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  Mic, MicOff, PhoneOff, Loader2, Subtitles,
} from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { liveCallService, type LiveStatus, type LiveTranscriptEvent } from '@/lib/api/live-client'
import { VoiceActivityDetector } from '@/lib/utils/vad'
import type { ConversationState } from '@talkingo/shared/types'

interface SubtitleLine {
  id: string
  role: 'user' | 'model'
  text: string
  final: boolean
}

interface LiveCallViewProps {
  state: ConversationState
  callDuration: number
  onEndCall: () => void
  onTranscriptLine?: (role: 'user' | 'model', text: string) => void
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

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
  const [isInterrupting, setIsInterrupting] = useState(false)

  const isMutedRef = useRef(isMuted)
  const subtitleRef = useRef<HTMLDivElement>(null)
  const vadRef = useRef<VoiceActivityDetector | null>(null)
  const interruptTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])

  // Auto-scroll subtitles
  useEffect(() => {
    if (subtitleRef.current) {
      subtitleRef.current.scrollTop = subtitleRef.current.scrollHeight
    }
  }, [subtitles])

  // ── Connect on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    liveCallService.setCallbacks({
      onStatus: (s) => {
        if (!cancelled) setLiveStatus(s)
      },
      onTranscript: (event: LiveTranscriptEvent) => {
        if (cancelled) return
        handleTranscript(event)
      },
      onInterrupted: () => {
        if (!cancelled) {
          // Remove any non-final model subtitle
          setSubtitles((prev) =>
            prev.filter((l) => !(l.role === 'model' && !l.final))
          )
        }
      },
      onTurnComplete: () => {
        // Mark last model line as final
        setSubtitles((prev) =>
          prev.map((l, i) =>
            i === prev.length - 1 && l.role === 'model' ? { ...l, final: true } : l
          )
        )
      },
      onError: (msg) => {
        if (!cancelled) setError(msg)
      },
    })

    liveCallService
      .connect(state)
      .then(async () => {
        if (!cancelled) {
          // Mobile Safety Check
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access is blocked. Please ensure you are using HTTPS.')
          }

          await liveCallService.startMic()
          
          // Initialize VAD with AEC-enabled stream
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
              echoCancellation: true, 
              noiseSuppression: true,
              autoGainControl: true,
            } 
          })
          
          vadRef.current = new VoiceActivityDetector(() => {
            // Debounce interruptions to prevent jitter
            if (isInterrupting || liveStatus !== 'speaking') return
            
            setIsInterrupting(true)
            liveCallService.interrupt()
            
            // Reset interrupt flag after 500ms
            if (interruptTimeoutRef.current) clearTimeout(interruptTimeoutRef.current)
            interruptTimeoutRef.current = setTimeout(() => setIsInterrupting(false), 500)
          })
          vadRef.current.start(stream)

          // Trigger AI Opener immediately after connection
          liveCallService.sendText("Let's start our conversation.")
        }
      })
      .catch((err) => {
        console.error('[LiveCall] Connection failed:', err)
        if (!cancelled) setError(err.message ?? 'Failed to connect')
      })

    return () => {
      cancelled = true
      vadRef.current?.stop()
      liveCallService.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTranscript = useCallback((event: LiveTranscriptEvent) => {
    setSubtitles((prev) => {
      const last = prev[prev.length - 1]
      // Update in-progress line for same role — accumulate delta tokens
      if (last && last.role === event.role && !last.final) {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...last,
          // Gemini Live sends incremental deltas, so append rather than replace.
          // If the server already sends cumulative text (longer than current),
          // use the longer one to avoid duplicates.
          text: event.text.length > last.text.length ? event.text : last.text + event.text,
          final: event.final,
        }
        return updated
      }
      // New line
      return [
        ...prev.slice(-20), // keep last 20 lines
        {
          id: `${Date.now()}-${Math.random()}`,
          role: event.role,
          text: event.text,
          final: event.final,
        },
      ]
    })

    if (event.final) {
      onTranscriptLine?.(event.role, event.text)
    }
  }, [onTranscriptLine])

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) {
        liveCallService.stopMic()
      } else {
        liveCallService.startMic().catch(() => {})
      }
      return next
    })
  }, [])

  // ── Status display ────────────────────────────────────────────────────────
  const statusLabel =
    liveStatus === 'connecting' ? 'Connecting…'
    : liveStatus === 'ready'    ? 'Ready'
    : liveStatus === 'listening'? 'Listening…'
    : liveStatus === 'speaking' ? 'Speaking…'
    : liveStatus === 'error'    ? 'Connection error'
    : liveStatus === 'closed'   ? 'Call ended'
    : 'Connecting…'

  // Map liveStatus to Avatar state
  const avatarState = 
    liveStatus === 'speaking' ? 'speaking' :
    liveStatus === 'connecting' || isInterrupting ? 'thinking' :
    'listening'

  const statusColor =
    liveStatus === 'listening' ? 'text-primary'
    : liveStatus === 'speaking' ? 'text-secondary'
    : liveStatus === 'error'    ? 'text-red-400'
    : 'text-muted-foreground'

  const dotColor =
    liveStatus === 'listening' ? 'bg-primary'
    : liveStatus === 'speaking' ? 'bg-secondary'
    : liveStatus === 'error'    ? 'bg-red-400'
    : 'bg-muted-foreground/40'

  const isConnecting = liveStatus === 'connecting'

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background/98 backdrop-blur-2xl">

      {/* ── Top bar — duration only ── */}
      <div className="flex items-center justify-center pt-20 pb-2">
        <div className="px-5 py-2 rounded-full bg-gradient-to-r from-muted/50 to-muted/30 border-2 border-border/40 font-mono text-sm font-semibold text-foreground/70 tabular-nums shadow-md">
          {formatDuration(callDuration)}
        </div>
      </div>

      {/* ── Muted badge — below timer, only when active ── */}
      {isMuted && (
        <div className="flex justify-center pt-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500/15 to-red-500/10 border-2 border-red-500/40 text-xs font-medium text-red-400 shadow-md">
            <MicOff className="w-3.5 h-3.5" /> Mic off
          </span>
        </div>
      )}

      {/* ── Avatar ── */}
      <div className="flex-1 flex items-start justify-center pt-8 pb-4 px-8 relative min-h-0">
        {/* Outer ambient ring */}
        {liveStatus === 'speaking' && (
          <>
            <div className="absolute w-52 h-52 rounded-full border-2 border-secondary/25 animate-ping" style={{ animationDuration: '1.4s' }} />
            <div className="absolute w-40 h-40 rounded-full border-2 border-secondary/35 animate-ping" style={{ animationDuration: '1s' }} />
          </>
        )}
        {liveStatus === 'listening' && (
          <>
            <div className="absolute w-48 h-48 rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: '1.6s' }} />
            <div className="absolute w-36 h-36 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '1.1s' }} />
          </>
        )}
        {isConnecting && (
          <div className="absolute w-40 h-40 rounded-full border-2 border-muted-foreground/25 animate-ping" style={{ animationDuration: '1.8s' }} />
        )}
        <Avatar
          personaId={state.persona ?? 'eli'}
          state={avatarState}
          size="lg"
        />
      </div>

      {/* ── Subtitle card — appears only when enabled ── */}
      {showSubtitles && (
        <div className="mx-4 mb-2 flex flex-col" style={{ height: '256px' }}>
          <div
            ref={subtitleRef}
            className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-black/60 backdrop-blur-xl border-2 border-white/10 px-5 py-4 space-y-2 custom-scrollbar shadow-xl"
          >
            {subtitles.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-white/30 font-medium">Subtitles will appear here…</p>
              </div>
            ) : (
              subtitles.slice(-10).map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    'text-base leading-relaxed transition-opacity duration-300',
                    line.final ? 'opacity-100' : 'opacity-70',
                    line.role === 'user' ? 'text-right' : 'text-left'
                  )}
                >
                  <span className={cn(
                    'text-[11px] font-bold uppercase tracking-wider mr-2',
                    line.role === 'user' ? 'text-primary/60' : 'text-white/40'
                  )}>
                    {line.role === 'user' ? 'You' : 'AI'}
                  </span>
                  <span className={line.role === 'user' ? 'text-primary/90' : 'text-white/90'}>
                    {line.text}
                  </span>
                  {!line.final && (
                    <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-pulse rounded-sm opacity-70" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-4 mb-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-500/15 to-red-500/10 border-2 border-red-500/40 text-sm text-red-400 text-center shadow-md">
          {error}
        </div>
      )}

      {/* ── Status label — sits just above controls ── */}
      <div className="flex items-center justify-center gap-2.5 mb-5">
        {isConnecting ? (
          <Loader2 className="w-4 h-4 text-muted-foreground/70 animate-spin" />
        ) : (
          <span className={cn('w-2 h-2 rounded-full', dotColor,
            (liveStatus === 'listening' || liveStatus === 'speaking') && 'animate-pulse'
          )} />
        )}
        <span className={cn('text-sm font-semibold tracking-wide', statusColor)}>
          {statusLabel}
        </span>
      </div>

      {/* ── Controls — single horizontal row ── */}
      <div className="flex items-center justify-center gap-6 pb-14 px-6">

        {/* Subtitles toggle */}
        <button
          onClick={() => setShowSubtitles((s) => !s)}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-200',
            'hover:scale-110 active:scale-95 focus:outline-none shadow-lg',
            showSubtitles
              ? 'bg-gradient-to-br from-primary/20 to-primary/10 border-primary/50 text-primary shadow-primary/20'
              : 'bg-card/90 border-border/60 text-foreground/50 hover:border-primary/50 hover:text-primary/80 hover:bg-card/95'
          )}
          aria-label={showSubtitles ? 'Hide subtitles' : 'Show subtitles'}
        >
          <Subtitles className="w-6 h-6" />
        </button>

        {/* End call — center, largest */}
        <button
          onClick={onEndCall}
          className="w-18 h-18 w-[72px] h-[72px] rounded-full bg-gradient-to-br from-red-500 to-red-600 border-4 border-red-400/60 text-white shadow-2xl shadow-red-500/30 hover:scale-115 active:scale-95 transition-all flex items-center justify-center focus:outline-none"
          aria-label="End call"
        >
          <PhoneOff className="w-7 h-7" />
        </button>

        {/* Mute mic */}
        <button
          onClick={handleMuteToggle}
          disabled={isConnecting}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-200',
            'hover:scale-110 active:scale-95 focus:outline-none shadow-lg disabled:opacity-40',
            isMuted
              ? 'bg-gradient-to-br from-red-500/25 to-red-500/15 border-red-500/70 text-red-400 shadow-red-500/20'
              : 'bg-card/90 border-border/60 text-foreground/50 hover:border-primary/50 hover:text-primary/80 hover:bg-card/95'
          )}
          aria-label={isMuted ? 'Unmute mic' : 'Mute mic'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

      </div>
    </div>
  )
}
