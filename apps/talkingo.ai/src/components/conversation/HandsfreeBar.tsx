'use client'

/**
 * HandsfreeBar — slim voice-first bottom bar for hands-free mode.
 *
 * Layout: [Mute] [Status Orb] [End Call]  +  keyboard icon to expand text input
 *
 * When the keyboard icon is tapped, a text input slides up inline.
 * Pressing send or blurring the input collapses it back to the compact bar.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  Mic, MicOff, PhoneOff, Keyboard, Send, Square, Loader2,
  Volume2, VolumeX, AudioWaveform, AudioLines, X,
} from 'lucide-react'

interface HandsfreeBarProps {
  /** 'handsfree' = standard hands-free, 'native' = full immersion (Gemini Live) */
  mode: 'handsfree' | 'native'
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  isMuted: boolean
  isSpeakerMuted: boolean
  voiceNotesEnabled: boolean
  interimTranscript?: string
  callDuration?: number

  onSendText: (text: string) => void
  onToggleListen: () => void
  onStopSpeaking: () => void
  onToggleMute: () => void
  onToggleSpeaker: () => void
  onEndCall: () => void
  onToggleVoiceNotes: () => void
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export function HandsfreeBar({
  mode,
  isListening,
  isSpeaking,
  isProcessing,
  isMuted,
  isSpeakerMuted,
  voiceNotesEnabled,
  interimTranscript,
  callDuration = 0,
  onSendText,
  onToggleListen,
  onStopSpeaking,
  onToggleMute,
  onToggleSpeaker,
  onEndCall,
  onToggleVoiceNotes,
}: HandsfreeBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keyboard shortcuts: M = mute, K = expand keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in the input
      if (expanded) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        onToggleMute()
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        setExpanded(true)
        if (isListening) onToggleListen()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [expanded, onToggleMute, isListening, onToggleListen])

  // Focus input when expanded
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [expanded])

  // Auto-grow textarea
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [text])

  const hasText = text.trim().length > 0

  const submit = () => {
    const t = text.trim()
    if (!t || isProcessing) return
    setText('')
    setExpanded(false)
    onSendText(t)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      setExpanded(false)
    }
  }

  const handleExpand = () => {
    setExpanded(true)
    // Pause mic when typing
    if (isListening) onToggleListen()
  }

  const handleCollapse = () => {
    setExpanded(false)
    setText('')
  }

  // ── Status helpers ──
  const isNative = mode === 'native'
  const stateLabel = isProcessing
    ? 'Thinking…'
    : isSpeaking
    ? 'Speaking…'
    : isListening
    ? 'Listening…'
    : isNative ? 'Native Mode' : 'Hands-free'

  const stateColor = isProcessing
    ? 'text-amber-400'
    : isSpeaking
    ? (isNative ? 'text-amber-400' : 'text-secondary')
    : isListening
    ? (isNative ? 'text-amber-500' : 'text-primary')
    : 'text-muted-foreground/60'

  const orbBorder = isProcessing
    ? 'border-amber-400/50 shadow-amber-400/20'
    : isSpeaking
    ? (isNative ? 'border-amber-400/50 shadow-amber-400/20' : 'border-secondary/50 shadow-secondary/20')
    : isListening
    ? (isNative ? 'border-amber-500/50 shadow-amber-500/20' : 'border-primary/50 shadow-primary/20')
    : 'border-border/40'

  const barBorder = isSpeaking
    ? (isNative ? 'border-amber-400/40 shadow-amber-400/10' : 'border-secondary/40 shadow-secondary/10')
    : isListening
    ? (isNative ? 'border-amber-500/40 shadow-amber-500/10' : 'border-primary/40 shadow-primary/10')
    : isProcessing
    ? 'border-amber-400/30 shadow-amber-400/10'
    : 'border-border/50'

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[45] pointer-events-none">
      {/* Gradient fade */}
      <div className="h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <div className="px-3 pb-4 pointer-events-auto safe-area-bottom">
        <div className="max-w-md mx-auto">

          {/* Interim transcript bubble */}
          {isListening && interimTranscript && !expanded && (
            <div className="mb-2 flex justify-end">
              <div className="max-w-[80%] px-4 py-2 rounded-2xl bg-primary/10 border border-primary/30 backdrop-blur-md">
                <p className="text-sm italic text-primary/90 leading-snug">
                  {interimTranscript}
                  <span className="inline-block w-1 h-3.5 bg-primary ml-1 animate-pulse rounded-sm align-middle" />
                </p>
              </div>
            </div>
          )}

          {/* ── Expanded: text input mode ── */}
          {expanded ? (
            <div
              className={cn(
                'flex items-end gap-2.5 p-2.5 rounded-3xl border backdrop-blur-xl shadow-xl transition-all duration-300 voice-control-bar',
                'bg-card/80 border-primary/40 ring-2 ring-primary/20'
              )}
            >
              {/* Close / collapse */}
              <button
                onClick={handleCollapse}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-card/70 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:border-border/70 transition-all active:scale-95"
                aria-label="Close keyboard"
              >
                <X className="w-4.5 h-4.5" />
              </button>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder="Type your message..."
                rows={1}
                maxLength={4000}
                disabled={isProcessing}
                className={cn(
                  'flex-1 min-w-0 resize-none bg-transparent border-0 outline-none focus:outline-none focus:ring-0',
                  'px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/50',
                  'max-h-[120px] overflow-y-auto scrollbar-hide disabled:opacity-50'
                )}
              />

              {/* Send */}
              <button
                onClick={submit}
                disabled={!hasText || isProcessing}
                className={cn(
                  'shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 hover:scale-105',
                  hasText
                    ? 'bg-gradient-to-br from-primary to-primary-glow text-white shadow-lg shadow-primary/30'
                    : 'bg-card/70 border border-border/50 text-muted-foreground/40'
                )}
                aria-label="Send message"
              >
                {isProcessing
                  ? <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  : <Send className="w-4.5 h-4.5" />
                }
              </button>
            </div>
          ) : (
            /* ── Compact: voice-first bar ── */
            <div
              className={cn(
                'rounded-3xl bg-card/85 backdrop-blur-xl border shadow-2xl transition-all duration-300 voice-control-bar',
                barBorder
              )}
            >
              {/* Status strip */}
              <div className="flex items-center justify-center gap-2 pt-3 pb-1.5">
                {/* LIVE badge for native mode */}
                {isNative && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[9px] font-bold uppercase tracking-wider shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Live
                  </span>
                )}
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isProcessing ? 'bg-amber-400' : isSpeaking ? (isNative ? 'bg-amber-400' : 'bg-secondary') : isListening ? (isNative ? 'bg-amber-500' : 'bg-primary') : 'bg-transparent',
                  (isListening || isSpeaking || isProcessing) && 'animate-pulse'
                )} />
                <span className={cn('text-[11px] font-semibold tracking-wide', stateColor)}>
                  {stateLabel}
                </span>
                {callDuration > 0 && (
                  <span className="ml-1 text-[10px] font-mono text-muted-foreground/50 tabular-nums">
                    {formatDuration(callDuration)}
                  </span>
                )}
                {/* Connection quality indicator for native mode */}
                {isNative && (
                  <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/5 border border-border/30" title="Connected">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[8px] text-muted-foreground/60 font-medium">OK</span>
                  </span>
                )}
              </div>

              {/* Button row */}
              <div className="flex items-center justify-center gap-3 px-4 pb-4 pt-1.5">

                {/* Mute mic */}
                <button
                  onClick={onToggleMute}
                  aria-label={isMuted ? 'Unmute mic' : 'Mute mic'}
                  className={cn(
                    'w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-200',
                    'hover:scale-105 active:scale-95 shadow-sm',
                    isMuted
                      ? 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'bg-card/80 border-border/50 text-foreground/70 hover:border-primary/50 hover:text-primary'
                  )}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Voice notes toggle */}
                <button
                  onClick={onToggleVoiceNotes}
                  aria-label={voiceNotesEnabled ? 'Disable voice notes' : 'Enable voice notes'}
                  className={cn(
                    'w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-200',
                    'hover:scale-105 active:scale-95 shadow-sm',
                    voiceNotesEnabled
                      ? 'bg-secondary/15 border-secondary/50 text-secondary'
                      : 'bg-card/80 border-border/50 text-muted-foreground/60 hover:border-secondary/40 hover:text-secondary/80'
                  )}
                >
                  {voiceNotesEnabled ? <AudioWaveform className="w-5 h-5" /> : <AudioLines className="w-5 h-5" />}
                </button>

                {/* Status orb — center, largest — interactive */}
                <button
                  onClick={() => {
                    if (isSpeaking) onStopSpeaking()
                    else if (isListening) onToggleMute()
                  }}
                  aria-label={
                    isSpeaking ? 'Stop AI speaking'
                    : isListening ? 'Mute microphone'
                    : 'Status indicator'
                  }
                  title={
                    isSpeaking ? 'Tap to stop AI' 
                    : isListening ? 'Tap to mute' 
                    : ''
                  }
                  className={cn(
                    'w-[56px] h-[56px] rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-300',
                    orbBorder,
                    isListening
                      ? (isNative ? 'bg-amber-500/10' : 'bg-primary/10')
                      : isSpeaking
                      ? (isNative ? 'bg-amber-500/10' : 'bg-secondary/10')
                      : isProcessing ? 'bg-amber-500/10' : 'bg-muted/20',
                    (isListening || isSpeaking) && 'cursor-pointer hover:scale-105 active:scale-95'
                  )}
                >
                  {isListening && (
                    <span className={cn(
                      'absolute w-[56px] h-[56px] rounded-full border-2',
                      isNative ? 'border-amber-500/25' : 'border-primary/25'
                    )} />
                  )}
                  {isProcessing
                    ? <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    : isSpeaking
                    ? <Volume2 className={cn('w-6 h-6 animate-pulse', isNative ? 'text-amber-400' : 'text-secondary')} />
                    : isListening
                    ? <Mic className={cn('w-6 h-6 animate-pulse', isNative ? 'text-amber-500' : 'text-primary')} />
                    : <Mic className="w-6 h-6 text-muted-foreground/40" />
                  }
                </button>

                {/* Keyboard — expand to type */}
                <button
                  onClick={handleExpand}
                  aria-label="Type a message"
                  className="w-11 h-11 rounded-full flex items-center justify-center border-2 bg-card/80 border-border/50 text-foreground/70 hover:border-primary/50 hover:text-primary hover:scale-105 active:scale-95 transition-all duration-200 shadow-sm"
                >
                  <Keyboard className="w-5 h-5" />
                </button>

                {/* End call */}
                <button
                  onClick={onEndCall}
                  aria-label="End call"
                  className="w-11 h-11 rounded-full bg-red-500/15 border-2 border-red-500/50 text-red-400 hover:bg-red-500/25 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-sm"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
              </div>

              {/* Mode hint */}
              <div className="text-center pb-2.5">
                <p className="text-[10px] text-muted-foreground/70 font-medium">
                  {isNative ? 'Native mode · Speak naturally · M to mute' : 'Hands-free · M to mute · K to type'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
