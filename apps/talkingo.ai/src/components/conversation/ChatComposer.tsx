'use client'

/**
 * ChatComposer — pinned input bar at the bottom of chat mode.
 *
 * Left button  → Voice-note toggle (enable / disable AI audio replies)
 * Right button → Morphs: Send (when text) · Stop (while AI speaks) · Mic (otherwise)
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  Mic, Send, Square, Loader2, Volume2, VolumeX,
  AudioLines, AudioWaveform,
} from 'lucide-react'

interface ChatComposerProps {
  /** Hands-free in chat = mic auto-listens. Manual = tap mic to talk. */
  handsfree: boolean
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  isMuted: boolean
  /** Whether AI voice notes are currently enabled. */
  voiceNotesEnabled: boolean
  /** Live interim transcript shown above the input while listening. */
  interimTranscript?: string
  callDuration?: number

  onSendText: (text: string) => void
  onToggleListen: () => void
  onStopSpeaking: () => void
  onEndCall: () => void
  /** Called when the user toggles voice notes on/off. */
  onToggleVoiceNotes: () => void
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export function ChatComposer({
  handsfree,
  isListening,
  isSpeaking,
  isProcessing,
  isMuted,
  voiceNotesEnabled,
  interimTranscript,
  callDuration = 0,
  onSendText,
  onToggleListen,
  onStopSpeaking,
  onEndCall,
  onToggleVoiceNotes,
}: ChatComposerProps) {
  const [text, setText] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [showVoiceNoteHint, setShowVoiceNoteHint] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-grow textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [text])

  const hasText = text.trim().length > 0

  const submit = () => {
    const t = text.trim()
    if (!t || isProcessing) return
    setText('')
    onSendText(t)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // Show a brief tooltip when toggling voice notes
  const handleToggleVoiceNotes = () => {
    onToggleVoiceNotes()
    setShowVoiceNoteHint(true)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => setShowVoiceNoteHint(false), 2000)
  }
  useEffect(() => () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
  }, [])

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[45] pointer-events-none">
      {/* Gradient fade so messages don't slam into the bar */}
      <div className="h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <div className="px-3 pb-4 pointer-events-auto safe-area-bottom">
        <div className="max-w-3xl mx-auto">

          {/* Interim transcript bubble */}
          {isListening && interimTranscript && (
            <div className="mb-2 flex justify-end">
              <div className="max-w-[80%] px-4 py-2 rounded-2xl bg-primary/10 border border-primary/30 backdrop-blur-md">
                <p className="text-sm italic text-primary/90 leading-snug">
                  {interimTranscript}
                  <span className="inline-block w-1 h-3.5 bg-primary ml-1 animate-pulse rounded-sm align-middle" />
                </p>
              </div>
            </div>
          )}

          {/* Composer pill - always expanded */}
          <div
              className={cn(
                'relative flex items-end gap-2.5 p-2.5 rounded-3xl border backdrop-blur-sm shadow-xl transition-all duration-300 voice-control-bar',
                'bg-card/70 border-border/60',
                'focus-within:border-primary/50 focus-within:shadow-primary/15 focus-within:ring-2 focus-within:ring-primary/20',
                isListening
                  ? 'border-primary/50 shadow-primary/15 ring-2 ring-primary/20'
                  : isSpeaking
                  ? 'border-secondary/50 shadow-secondary/15 ring-2 ring-secondary/20'
                  : 'hover:border-border/80'
              )}
            >
              {/* ── Left: Voice-note toggle ── */}
              {hasText || isListening ? (
                <div className="relative shrink-0">
                  <button
                    onClick={handleToggleVoiceNotes}
                    className={cn(
                      'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95',
                      'border-2 hover:scale-105',
                      voiceNotesEnabled
                        ? 'bg-gradient-to-br from-secondary/25 to-secondary/15 border-secondary/60 text-secondary shadow-lg shadow-secondary/25 animate-pulse-subtle'
                        : 'bg-card/70 border-border/50 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/70 hover:bg-card/90'
                    )}
                    aria-label={voiceNotesEnabled ? 'Disable AI voice notes' : 'Enable AI voice notes'}
                    aria-pressed={voiceNotesEnabled}
                    title={voiceNotesEnabled ? 'Voice notes ON — AI responds with audio' : 'Voice notes OFF — Text-only responses'}
                  >
                    {voiceNotesEnabled
                      ? <AudioWaveform className="w-5 h-5" />
                      : <AudioLines className="w-5 h-5" />
                    }
                  </button>

                  {/* Tooltip */}
                  {showVoiceNoteHint && (
                    <div className={cn(
                      'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl',
                      'text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none z-50',
                      'border backdrop-blur-md animate-fade-in-up',
                      voiceNotesEnabled
                        ? 'bg-secondary/20 border-secondary/40 text-secondary'
                        : 'bg-card/95 border-border/60 text-muted-foreground'
                    )}>
                      {voiceNotesEnabled ? 'Voice notes on' : 'Voice notes off'}
                      {/* Arrow */}
                      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent" 
                            style={{ borderTopColor: voiceNotesEnabled ? 'rgba(168, 85, 247, 0.4)' : 'rgba(100, 116, 139, 0.6)' }} />
                    </div>
                  )}
                </div>
              ) : null}

              {/* Textarea */}
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={
                  isListening  ? 'Listening… or type instead'
                  : isProcessing ? 'AI is replying…'
                  : 'Type your message...'
                }
                rows={1}
                autoFocus={true}
                maxLength={4000}
                disabled={isProcessing}
                className={cn(
                  'flex-1 min-w-0 resize-none bg-transparent border-0 outline-none focus:outline-none focus:ring-0',
                  'px-3 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50',
                  'max-h-[140px] overflow-y-auto scrollbar-hide disabled:opacity-50'
                )}
              />

              {/* ── Right: Send / Stop / Mic ── */}
              {hasText ? (
                <button
                  onClick={submit}
                  disabled={isProcessing}
                  className={cn(
                    'shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 hover:scale-105',
                    'bg-gradient-to-br from-primary to-primary-glow text-white shadow-lg shadow-primary/30',
                    'hover:shadow-xl hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
                  )}
                  aria-label="Send message"
                  title="Send (Enter)"
                >
                  {isProcessing
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <Send className="w-5 h-5" />
                  }
                </button>
              ) : isSpeaking ? (
                <button
                  onClick={onStopSpeaking}
                  className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-secondary/20 to-secondary/10 border-2 border-secondary/50 text-secondary hover:bg-secondary/25 active:scale-95 transition-all duration-200 hover:scale-105 shadow-md shadow-secondary/20"
                  aria-label="Stop AI speaking"
                  title="Stop"
                >
                  <Square className="w-5 h-5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={onToggleListen}
                  disabled={isMuted || isProcessing}
                  className={cn(
                    'shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 hover:scale-105',
                    'border-2 disabled:opacity-50 disabled:cursor-not-allowed',
                    isListening
                      ? 'bg-gradient-to-br from-primary to-primary-glow border-primary text-white shadow-lg shadow-primary/30 animate-pulse'
                      : 'bg-card/70 border-border/50 text-muted-foreground/70 hover:text-primary hover:border-primary/60 hover:bg-card/90'
                  )}
                  aria-label={isListening ? 'Stop recording' : 'Tap to speak'}
                  title={isListening ? 'Stop' : 'Tap to speak (Space)'}
                >
                  {isListening
                    ? <Square className="w-5 h-5 fill-current" />
                    : <Mic className="w-5 h-5" />
                  }
                </button>
              )}
            </div>
        </div>
      </div>
    </div>
  )
}
