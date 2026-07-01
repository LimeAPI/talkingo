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
  /** Live dictation text shown above the input while listening (device STT). */
  interimTranscript?: string
  callDuration?: number

  onSendText: (text: string) => void
  onToggleListen: () => void
  onStopSpeaking: () => void
  onEndCall: () => void
  /** Called when the user toggles voice notes on/off. */
  onToggleVoiceNotes: () => void
  /** Reports the bar's rendered height (px) so the transcript can pad itself
   *  exactly — no magic numbers, no messages hidden behind the bar. */
  onHeightChange?: (height: number) => void
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
  onHeightChange,
}: ChatComposerProps) {
  const [text, setText] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [showVoiceNoteHint, setShowVoiceNoteHint] = useState(false)
  /** A message the user submitted while the AI was still replying — auto-sent when it finishes. */
  const [queued, setQueued] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Report the bar's height to the parent so the transcript pads itself exactly.
  // Re-measures on textarea growth, dictation bubble, tooltip, safe-area changes.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !onHeightChange) return
    const ro = new ResizeObserver(() => onHeightChange(el.offsetHeight))
    ro.observe(el)
    onHeightChange(el.offsetHeight)
    return () => ro.disconnect()
  }, [onHeightChange])

  // Auto-grow textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [text])

  const hasText = text.trim().length > 0

  const focusInput = () => requestAnimationFrame(() => taRef.current?.focus())

  const submit = () => {
    const t = text.trim()
    if (!t) return
    // If the AI is still replying, queue the message and send it the moment
    // processing finishes — the input never locks, so typing flow is unbroken.
    if (isProcessing) {
      setQueued(true)
      return
    }
    setText('')
    setQueued(false)
    onSendText(t)
    focusInput()
  }

  // Flush a queued message once the AI finishes replying.
  useEffect(() => {
    if (isProcessing || !queued) return
    const t = text.trim()
    setQueued(false)
    if (t) {
      setText('')
      onSendText(t)
      focusInput()
    }
  }, [isProcessing, queued, text, onSendText])

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
    <div ref={rootRef} className="fixed bottom-0 left-0 right-0 z-[45] pointer-events-none">
      {/* Gradient fade so messages don't slam into the bar */}
      <div className="h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <div className="px-3 pointer-events-auto pad-bottom-bar">
        <div className="max-w-3xl mx-auto">

          {/* Live dictation bubble — shows recognized words while listening */}
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
                'focus-within:border-primary/50 focus-within:shadow-primary/10 focus-within:ring-2 focus-within:ring-primary/15',
                isListening
                  ? 'border-primary/50 shadow-primary/10 ring-2 ring-primary/15'
                  : isSpeaking
                  ? 'border-primary/40 shadow-primary/10 ring-2 ring-primary/10'
                  : 'hover:border-border/80'
              )}
            >
              {/* ── Left: Voice-note toggle (always visible — persistent setting) ── */}
              <div className="relative shrink-0">
                  <button
                    onClick={handleToggleVoiceNotes}
                    className={cn(
                      'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95',
                      'border-2 hover:scale-105',
                      voiceNotesEnabled
                        ? 'bg-primary/12 border-primary/50 text-primary shadow-md shadow-primary/15'
                        : 'bg-card/70 border-border/50 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/70 hover:bg-card/90'
                    )}
                    aria-label={voiceNotesEnabled ? 'Disable AI voice notes' : 'Enable AI voice notes'}
                    aria-pressed={voiceNotesEnabled}
                    title={voiceNotesEnabled ? 'Voice notes ON — AI responds with audio' : 'Voice notes OFF — Text-only responses'}
                  >
                    {voiceNotesEnabled
                      ? <Volume2 className="w-5 h-5" />
                      : <VolumeX className="w-5 h-5" />
                    }
                  </button>

                  {/* Tooltip */}
                  {showVoiceNoteHint && (
                    <div className={cn(
                      'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl',
                      'text-xs font-medium whitespace-nowrap shadow-xl pointer-events-none z-50',
                      'border backdrop-blur-md animate-fade-in-up',
                      voiceNotesEnabled
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'bg-card/95 border-border/60 text-muted-foreground'
                    )}>
                      {voiceNotesEnabled ? 'Voice notes on' : 'Voice notes off'}
                      {/* Arrow */}
                      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent" 
                            style={{ borderTopColor: voiceNotesEnabled ? 'oklch(var(--primary) / 0.45)' : 'oklch(var(--border))' }} />
                    </div>
                  )}
                </div>

              {/* Textarea */}
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={
                  isListening   ? 'Listening… or type instead'
                  : queued      ? 'Queued — sending after this reply…'
                  : isProcessing ? 'AI is replying… keep typing'
                  : 'Type your message...'
                }
                rows={1}
                autoFocus={true}
                maxLength={4000}
                className={cn(
                  'flex-1 min-w-0 resize-none bg-transparent border-0 outline-none focus:outline-none focus:ring-0',
                  'px-3 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50',
                  'max-h-[140px] overflow-y-auto scrollbar-hide'
                )}
              />

              {/* ── Right: Send / Stop / Mic ── */}
              {hasText ? (
                <button
                  onClick={submit}
                  className={cn(
                    'shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 hover:scale-105',
                    'bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg shadow-primary/30',
                    'hover:shadow-xl hover:shadow-primary/40'
                  )}
                  aria-label={isProcessing ? 'Queue message' : 'Send message'}
                  title={isProcessing ? 'Will send after the reply' : 'Send (Enter)'}
                >
                  {isProcessing || queued
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <Send className="w-5 h-5" />
                  }
                </button>
              ) : isSpeaking ? (
                <button
                  onClick={onStopSpeaking}
                  className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-foreground/[0.06] border-2 border-foreground/20 text-foreground/70 hover:bg-foreground/10 hover:text-foreground active:scale-95 transition-all duration-200 hover:scale-105"
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
                      ? 'bg-gradient-to-br from-primary to-primary-glow border-primary text-primary-foreground shadow-lg shadow-primary/30 animate-pulse'
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
