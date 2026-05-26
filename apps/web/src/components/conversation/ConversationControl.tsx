'use client'

import { cn } from '@talkingo/shared/utils'
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, Loader2, Square } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Avatar } from '../ui/Avatar'

interface ConversationControlProps {
  mode: 'manual' | 'handsfree' | 'callonly'
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  isMuted: boolean
  isSpeakerMuted: boolean
  personaId?: string
  callDuration?: number
  onToggleListen: () => void
  onToggleMute: () => void
  onToggleSpeaker: () => void
  onEndCall: () => void
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── Call-only fullscreen view ────────────────────────────────────────────────
function CallOnlyView({
  isListening, isSpeaking, isProcessing, isMuted, isSpeakerMuted,
  personaId, callDuration = 0,
  onToggleMute, onToggleSpeaker, onEndCall,
}: Omit<ConversationControlProps, 'mode' | 'onToggleListen'> & { callDuration?: number }) {
  const [showHint, setShowHint] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 5000)
    return () => clearTimeout(t)
  }, [])

  const stateLabel = isProcessing ? 'Thinking…' : isSpeaking ? 'Speaking…' : isListening ? 'Listening…' : 'Ready'
  const stateColor = isProcessing ? 'text-amber-400' : isSpeaking ? 'text-secondary' : isListening ? 'text-primary' : 'text-muted-foreground'
  const dotColor   = isProcessing ? 'bg-amber-400' : isSpeaking ? 'bg-secondary' : isListening ? 'bg-primary' : 'bg-muted-foreground/40'

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background/98 backdrop-blur-2xl">
      {/* ── Top status bar ── */}
      <div className="flex flex-col items-center pt-14 pb-4 px-6 gap-3">
        <div className="px-4 py-1.5 rounded-full bg-muted/40 border border-border/30 font-mono text-sm font-semibold text-foreground/70 tabular-nums">
          {formatDuration(callDuration)}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full animate-pulse', dotColor)} />
          <span className={cn('text-sm font-semibold tracking-wide', stateColor)}>{stateLabel}</span>
        </div>
        {(isMuted || isSpeakerMuted) && (
          <div className="flex items-center gap-2">
            {isMuted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-400">
                <MicOff className="w-3 h-3" /> Mic off
              </span>
            )}
            {isSpeakerMuted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-400">
                <VolumeX className="w-3 h-3" /> Speaker off
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Avatar ── */}
      <div className="flex-1 flex items-center justify-center px-8">
        <Avatar
          personaId={personaId ?? 'eli'}
          state={isProcessing ? 'idle' : isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle'}
          size="xl"
        />
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col items-center pb-16 px-6 gap-6">
        {/* Secondary row: mute + speaker */}
        <div className="flex items-center gap-4">
          <CircleButton
            onClick={onToggleMute}
            active={isMuted}
            activeClass="bg-red-500/20 border-red-500/60 text-red-400"
            label={isMuted ? 'Unmute mic' : 'Mute mic'}
            size="md"
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </CircleButton>

          <CircleButton
            onClick={onToggleSpeaker}
            active={isSpeakerMuted}
            activeClass="bg-red-500/20 border-red-500/60 text-red-400"
            label={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
            size="md"
          >
            {isSpeakerMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
          </CircleButton>
        </div>

        {/* End call — prominent */}
        <button
          onClick={onEndCall}
          className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-600 border-2 border-red-400/50 text-white shadow-xl shadow-red-500/30 hover:scale-110 active:scale-95 transition-all flex items-center justify-center focus:outline-none"
          aria-label="End call"
        >
          <PhoneOff className="w-7 h-7" />
        </button>

        <p className={cn('text-xs text-muted-foreground/50 font-medium transition-all duration-500', showHint ? 'opacity-100' : 'opacity-0')}>
          Swipe down to end
        </p>
      </div>
    </div>
  )
}

// ─── Shared bottom bar (manual + handsfree) ───────────────────────────────────
export function ConversationControl({
  mode,
  isListening, isSpeaking, isProcessing,
  isMuted, isSpeakerMuted,
  personaId = 'eli',
  callDuration = 0,
  onToggleListen, onToggleMute, onToggleSpeaker, onEndCall,
}: ConversationControlProps) {

  if (mode === 'callonly') {
    return (
      <CallOnlyView
        isListening={isListening} isSpeaking={isSpeaking} isProcessing={isProcessing}
        isMuted={isMuted} isSpeakerMuted={isSpeakerMuted}
        personaId={personaId} callDuration={callDuration}
        onToggleMute={onToggleMute} onToggleSpeaker={onToggleSpeaker} onEndCall={onEndCall}
      />
    )
  }

  // ── Status label ──
  const stateLabel = isProcessing ? 'Thinking…' : isSpeaking ? 'AI speaking…' : isListening ? 'Listening…' : mode === 'handsfree' ? 'Hands-free' : 'Tap to speak'
  const stateColor = isProcessing ? 'text-amber-400' : isSpeaking ? 'text-secondary' : isListening ? 'text-primary' : 'text-muted-foreground/60'
  const dotColor   = isProcessing ? 'bg-amber-400' : isSpeaking ? 'bg-secondary' : isListening ? 'bg-primary' : 'bg-transparent'

  // ── Bar border glow ──
  const barBorder = isSpeaking
    ? 'border-secondary/40 shadow-secondary/15'
    : isListening
    ? 'border-primary/40 shadow-primary/15'
    : isProcessing
    ? 'border-amber-400/30 shadow-amber-400/10'
    : 'border-border/50'

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className={cn(
        'rounded-3xl bg-card/90 backdrop-blur-xl border shadow-2xl transition-all duration-300',
        barBorder
      )}>

        {/* ── Status strip ── */}
        <div className="flex items-center justify-center gap-2 pt-3 pb-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', dotColor, (isListening || isSpeaking || isProcessing) && 'animate-pulse')} />
          <span className={cn('text-[11px] font-semibold tracking-wide', stateColor)}>{stateLabel}</span>
          {/* Duration badge */}
          {callDuration > 0 && (
            <span className="ml-1 text-[10px] font-mono text-muted-foreground/50 tabular-nums">
              {formatDuration(callDuration)}
            </span>
          )}
        </div>

        {/* ── Button row ── */}
        <div className="flex items-center justify-center gap-3 px-5 pb-5 pt-2">

          {/* Mute mic — both modes */}
          <CircleButton
            onClick={onToggleMute}
            active={isMuted}
            activeClass="bg-red-500/20 border-red-500/50 text-red-400"
            label={isMuted ? 'Unmute mic' : 'Mute mic'}
            size="sm"
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </CircleButton>

          {/* Primary action — mic toggle (manual) or status orb (handsfree) */}
          {mode === 'manual' ? (
            <button
              onClick={onToggleListen}
              aria-label={isListening ? 'Stop' : 'Speak'}
              className={cn(
                'relative w-[68px] h-[68px] rounded-full flex items-center justify-center',
                'transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/50',
                'hover:scale-105 active:scale-95 shadow-xl',
                isListening
                  ? 'bg-gradient-to-br from-primary to-primary-glow border-2 border-primary/60 text-white shadow-primary/40'
                  : isSpeaking
                  ? 'bg-gradient-to-br from-secondary to-secondary-glow border-2 border-secondary/60 text-white shadow-secondary/40'
                  : isProcessing
                  ? 'bg-gradient-to-br from-amber-500 to-amber-600 border-2 border-amber-400/60 text-white shadow-amber-500/40'
                  : 'bg-gradient-to-br from-primary to-primary-glow border-2 border-primary/50 text-white shadow-primary/20'
              )}
            >
              {isListening && (
                <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
              )}
              <span className="relative z-10">
                {isProcessing ? <Loader2 className="w-7 h-7 animate-spin" />
                  : isSpeaking  ? <Volume2 className="w-7 h-7" />
                  : isListening ? <Square className="w-7 h-7 fill-current" />
                  : <Mic className="w-7 h-7" />}
              </span>
            </button>
          ) : (
            /* Handsfree — animated status orb, not tappable for mic */
            <div
              className={cn(
                'w-[68px] h-[68px] rounded-full flex items-center justify-center border-2 shadow-xl',
                isListening  ? 'bg-primary/10 border-primary/50 shadow-primary/20'
                : isSpeaking  ? 'bg-secondary/10 border-secondary/50 shadow-secondary/20'
                : isProcessing? 'bg-amber-500/10 border-amber-400/50 shadow-amber-400/20'
                : 'bg-muted/30 border-border/40'
              )}
            >
              {isProcessing ? <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
                : isSpeaking  ? <Volume2 className="w-7 h-7 text-secondary animate-pulse" />
                : isListening ? <Mic className="w-7 h-7 text-primary animate-pulse" />
                : <Mic className="w-7 h-7 text-muted-foreground/40" />}
            </div>
          )}

          {/* Speaker mute — both modes */}
          <CircleButton
            onClick={onToggleSpeaker}
            active={isSpeakerMuted}
            activeClass="bg-red-500/20 border-red-500/50 text-red-400"
            label={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
            size="sm"
          >
            {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </CircleButton>

          {/* Divider */}
          <div className="w-px h-8 bg-border/40 mx-1" />

          {/* End call — always present */}
          <button
            onClick={onEndCall}
            aria-label="End call"
            className="w-12 h-12 rounded-full bg-red-500/15 border-2 border-red-500/50 text-red-400 hover:bg-red-500/25 hover:scale-110 active:scale-95 transition-all flex items-center justify-center focus:outline-none shadow-md"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        {/* ── Mode label ── */}
        <div className="text-center pb-2">
          <p className="text-[10px] text-muted-foreground/40 font-medium">
            {mode === 'manual' ? 'Tap mic to speak  ·  Space bar shortcut' : 'Hands-free  ·  M to mute  ·  S for speaker'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable circle button ───────────────────────────────────────────────────
function CircleButton({
  onClick, active, activeClass, label, size, children,
}: {
  onClick: () => void
  active: boolean
  activeClass: string
  label: string
  size: 'sm' | 'md'
  children: React.ReactNode
}) {
  const dim = size === 'md' ? 'w-14 h-14' : 'w-11 h-11'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        dim, 'rounded-full flex items-center justify-center border transition-all duration-200',
        'hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm',
        active
          ? activeClass
          : 'bg-card/80 border-border/50 text-foreground/70 hover:border-primary/50 hover:text-primary'
      )}
    >
      {children}
    </button>
  )
}
