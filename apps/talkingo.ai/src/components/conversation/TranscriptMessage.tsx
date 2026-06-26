'use client'

import { cn } from '@talkingo/shared/utils'
import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import {
  ArrowRight, Sparkles, Languages, Wand2,
  ChevronDown, ChevronUp, Headphones, Play, Square, Mic, Volume2,
} from 'lucide-react'
import type { Correction, MessageAudio } from '@talkingo/shared/types'
import { AvatarSVG } from '../ui/AvatarSVG'
import { VoiceNotePlayer } from './VoiceNotePlayer'
import { authFetch } from '@/lib/api/auth-fetch'

interface TranscriptMessageProps {
  text: string
  isUser: boolean
  isInterruption?: boolean
  corrections?: Correction[]
  delay?: number
  personaId?: string
  audio?: MessageAudio
  autoPlayAudio?: boolean
  speakerMuted?: boolean
  onAskNativeRewrite?: (phrase: string) => void
  onRetryAudio?: () => void
  onRequestAudio?: () => void
  onAudioEnded?: () => void
  onAudioStarted?: () => void
  skipAnimation?: boolean
}

export function TranscriptMessage({
  text,
  isUser,
  isInterruption = false,
  corrections = [],
  delay = 0,
  personaId = 'eli',
  audio,
  autoPlayAudio = false,
  speakerMuted = false,
  onAskNativeRewrite,
  onRetryAudio,
  onRequestAudio,
  onAudioEnded,
  onAudioStarted,
  skipAnimation = false,
}: TranscriptMessageProps) {
  const [isVisible, setIsVisible] = useState(skipAnimation)
  const [showTranslation, setShowTranslation] = useState(false)

  // ── Voice-first text reveal ───────────────────────────────────────────────
  // When a voice note is attached, text is VISIBLE by default for reading-while-listening
  // reinforcement. Advanced learners can hide text via "Hide text" toggle for
  // listening-only immersion.
  const hasVoiceNote = !isUser && !!audio
  const startedWithAudioRef = useRef(hasVoiceNote)
  // voiceFirst flag preserved for backward compatibility (controls layout branch)
  const voiceFirst = hasVoiceNote && startedWithAudioRef.current
  // Text visible by default — even in voice-first mode, learners benefit from reading along
  const [textRevealed, setTextRevealed] = useState(true)

  // If voice notes get removed mid-session (toggle off), reveal text immediately
  useEffect(() => {
    if (!hasVoiceNote) setTextRevealed(true)
  }, [hasVoiceNote])

  // Entry animation
  useEffect(() => {
    if (skipAnimation) { setIsVisible(true); return }
    const t = setTimeout(() => setIsVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay, skipAnimation])

  // Interruption marker: auto-reveal immediately
  useEffect(() => {
    if (isInterruption) setIsVisible(true)
  }, [isInterruption])

  const handleAudioEnded = () => {
    // Text is already visible by default; ensure it stays revealed after playback
    // (covers edge case where user hid text then playback ends)
    setTextRevealed(true)
    onAudioEnded?.()
  }

  const renderText = () => {
    let renderedText = text

    // Apply correction highlights
    if (corrections.length > 0) {
      corrections.forEach((correction) => {
        const escaped = correction.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
        renderedText = renderedText.replace(
          regex,
          `<span class="correction-highlight" title="${correction.corrected}">${correction.original}</span>`
        )
      })
    }

    // ── Markdown rendering with styled output ──

    // Bold: **text** → highlighted vocab pill
    renderedText = renderedText
      .replace(/\*\*(.+?)\*\*/g, '<span class="text-primary font-semibold">$1</span>')
      .replace(/__(.+?)__/g, '<span class="text-primary font-semibold">$1</span>')

    // Italic: *text*
    renderedText = renderedText
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic text-foreground/80">$1</em>')

    // Quoted phrases: « text » or "text" → background chip
    renderedText = renderedText
      .replace(/[«»](.+?)[«»]/g, '<span class="inline-block px-1.5 py-0.5 rounded-lg bg-secondary/8 border border-secondary/15 text-[13px]">«$1»</span>')

    // Bullet lists: lines starting with * or - → left-bordered items
    renderedText = renderedText
      .replace(/^[\*\-]\s+(.+)$/gm, '<div class="flex items-start gap-2 pl-2 py-1 ml-1 border-l-2 border-primary/25"><span class="text-primary/50 text-xs mt-0.5">›</span><span>$1</span></div>')

    // Line breaks
    renderedText = renderedText.replace(/\n/g, '<br/>')

    const sanitized = DOMPurify.sanitize(renderedText, {
      ALLOWED_TAGS: ['span', 'em', 'div', 'br'],
      ALLOWED_ATTR: ['class', 'title'],
    })

    return <span dangerouslySetInnerHTML={{ __html: sanitized }} />
  }

  // Interruption marker — render a small fading pill
  if (isInterruption) {
    return (
      <div
        className={cn(
          'flex justify-start transition-all duration-500 ease-out',
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        )}
      >
        <div className="px-3 py-1.5 rounded-full bg-muted/30 border border-border/40 animate-fade-in-up">
          <span className="text-[11px] text-muted-foreground/60 font-medium italic">
            Interrupted
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex transition-all duration-500 ease-out group',
        isUser ? 'justify-end' : 'justify-start',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      )}
    >
      <div className={cn('max-w-[85%] flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>


        {/* ── Header ── */}
        <div className="flex items-center gap-2 mb-1">
          {!isUser ? (
            <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-border/30 shadow-sm transition-transform group-hover:scale-105">
              <AvatarSVG personaId={personaId} size={28} />
            </div>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-lg text-primary bg-primary/10 border border-primary/20">
              You
            </span>
          )}
        </div>

        {/* ── AI message with voice-first audio (text visible by default, hideable for immersion) ── */}
        {voiceFirst ? (
          <>
            {/* Voice note player — always visible when audio is present */}
            <VoiceNotePlayer
              status={audio!.status}
              audioData={audio!.data}
              sampleRate={audio!.sampleRate}
              audioFormat={audio!.format}
              waveform={audio!.waveform}
              autoPlay={autoPlayAudio}
              muted={speakerMuted}
              onRetry={onRetryAudio}
              onEnded={handleAudioEnded}
              onStarted={onAudioStarted}
              tone="secondary"
            />

            {/* Hide text toggle — advanced learners can hide for listening-only immersion */}
            <button
              onClick={() => setTextRevealed((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all duration-200 self-start',
                textRevealed
                  ? 'bg-card/60 border-border/40 text-muted-foreground hover:text-foreground'
                  : 'bg-secondary/8 border-secondary/25 text-secondary/80 hover:bg-secondary/15 hover:border-secondary/40 hover:text-secondary'
              )}
              aria-expanded={textRevealed}
              aria-label={textRevealed ? 'Hide transcript' : 'Show transcript'}
            >
              {textRevealed
                ? <><ChevronUp className="w-3 h-3" /> Hide text</>
                : <><ChevronDown className="w-3 h-3" /> Show text</>
              }
            </button>

            {/* Text bubble — revealed on demand or after playback */}
            <div
              className={cn(
                'overflow-hidden transition-all duration-300 ease-out w-full',
                textRevealed ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="flex flex-col gap-1.5 pt-0.5">
                <TextBubble
                  isUser={false}
                  corrections={corrections}
                  renderText={renderText}
                />
                <ToolsAndPanels
                  text={text}
                  showTranslation={showTranslation}
                  setShowTranslation={setShowTranslation}
                />
              </div>
            </div>
          </>
        ) : isUser ? (
          /* ── User message ── */
          <>
            {/* Simple audio player for user's voice recording (uses Blob URL — no decoding issues) */}
            {audio && audio.status === 'ready' && audio.data && (
              <SimpleVoicePlayer audioBase64={audio.data} durationMs={audio.durationMs} />
            )}
            {/* Transcription text (appears after Gemini processes) */}
            {text && text.length > 0 && (
              <TextBubble isUser corrections={corrections} renderText={renderText} />
            )}
            {onAskNativeRewrite && text && text.trim().length > 0 && (
              <button
                onClick={() => onAskNativeRewrite(text)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-secondary/30 bg-secondary/5 text-secondary text-[11px] font-medium hover:bg-secondary/10 hover:border-secondary/50 transition-colors self-end"
              >
                <Wand2 className="w-3 h-3" />
                How would a native say this?
              </button>
            )}
          </>
        ) : (
          /* ── AI message, voice notes off (or on-demand audio added later) ── */
          <>
            <TextBubble isUser={false} corrections={corrections} renderText={renderText} />

            {/* On-demand player appears here AFTER user taps "Listen" */}
            {hasVoiceNote && (
              <VoiceNotePlayer
                status={audio!.status}
                audioData={audio!.data}
                sampleRate={audio!.sampleRate}
                audioFormat={audio!.format}
                waveform={audio!.waveform}
                autoPlay={autoPlayAudio}
                muted={speakerMuted}
                onRetry={onRetryAudio}
                onEnded={onAudioEnded}
                onStarted={onAudioStarted}
                tone="secondary"
              />
            )}

            {/* On-demand "Listen" pill — generates audio just for this message */}
            {!hasVoiceNote && onRequestAudio && (
              <button
                onClick={onRequestAudio}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-secondary/30 bg-secondary/5 text-secondary text-[11px] font-medium hover:bg-secondary/10 hover:border-secondary/50 transition-colors self-start"
                aria-label="Listen to this message"
                title="Generate audio for this message"
              >
                <Headphones className="w-3 h-3" />
                Listen
              </button>
            )}

            <ToolsAndPanels
              text={text}
              showTranslation={showTranslation}
              setShowTranslation={setShowTranslation}
            />
          </>
        )}

        {/* Corrections block — shown beneath user messages */}
        {isUser && corrections.length > 0 && (
          <CorrectionsBlock corrections={corrections} />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TextBubble({
  isUser,
  corrections,
  renderText,
}: {
  isUser: boolean
  corrections: Correction[]
  renderText: () => React.ReactNode
}) {
  return (
    <div
      className={cn(
        'px-5 py-3.5 rounded-2xl inline-block relative shadow-md transition-all duration-200 hover:shadow-lg',
        isUser
          ? 'bg-gradient-to-br from-primary/15 to-primary/8 border border-primary/30 backdrop-blur-sm'
          : 'bg-card/95 backdrop-blur-md border border-border/50 shadow-sm'
      )}
    >
      {corrections.length > 0 && (
        <div className="absolute -top-2.5 -right-2.5 flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-correction to-correction-soft text-white text-[11px] font-bold shadow-lg animate-pulse">
          <Sparkles className="w-4 h-4" />
          <span>{corrections.length}</span>
        </div>
      )}
      <p className="text-sm leading-relaxed tracking-normal">{renderText()}</p>
    </div>
  )
}

/** Collapsible corrections block — shows ALL errors in a clean visual beneath the message */
function CorrectionsBlock({ corrections }: { corrections: Correction[] }) {
  const [expanded, setExpanded] = useState(true)

  const getTypeColor = (type: Correction['type']) => {
    switch (type) {
      case 'grammar':       return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
      case 'vocabulary':    return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
      case 'pronunciation': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      case 'naturalness':   return 'text-teal-400 bg-teal-500/10 border-teal-500/20'
      default:              return 'text-gray-400 bg-gray-500/10 border-gray-500/20'
    }
  }

  return (
    <div className="self-start w-full max-w-[85%] rounded-xl border border-correction/20 bg-correction-bg/30 backdrop-blur-sm overflow-hidden transition-all duration-200">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-correction-bg/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-correction">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {corrections.length} correction{corrections.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {corrections.map((correction, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-card/60 border border-border/30"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                  getTypeColor(correction.type)
                )}>
                  {correction.type}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="line-through opacity-60 text-correction-soft">
                  {correction.original}
                </span>
                <ArrowRight className="w-3 h-3 text-correction/60 flex-shrink-0" />
                <span className="font-semibold text-correction">
                  {correction.corrected}
                </span>
                {correction.type === 'pronunciation' && (
                  <PronunciationAudioButton text={correction.corrected} />
                )}
              </div>

              {correction.note && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {correction.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pronunciation Audio Button — on-demand TTS for pronunciation corrections ─

function PronunciationAudioButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle')
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const handleClick = async () => {
    // If already playing, stop
    if (status === 'playing' && audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current = null
      setStatus('idle')
      return
    }

    // Fetch pronunciation audio from TTS endpoint
    setStatus('loading')
    try {
      const res = await authFetch('/api/tts/pronunciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        setStatus('idle')
        return
      }

      const data = await res.json()
      const { audioData, format } = data

      // Convert base64 to blob and play
      const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
      const raw = atob(audioData)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      const blob = new Blob([bytes], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioElRef.current = audio

      audio.onplay = () => setStatus('playing')
      audio.onended = () => {
        setStatus('idle')
        URL.revokeObjectURL(url)
        audioElRef.current = null
      }
      audio.onerror = () => {
        setStatus('idle')
        URL.revokeObjectURL(url)
        audioElRef.current = null
      }

      await audio.play()
    } catch {
      setStatus('idle')
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 rounded-full transition-all flex-shrink-0',
        status === 'playing'
          ? 'bg-blue-500 text-white scale-110'
          : status === 'loading'
            ? 'bg-blue-500/20 text-blue-400 animate-pulse'
            : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:scale-110'
      )}
      aria-label={`Listen to pronunciation of "${text}"`}
      title={`Hear: ${text}`}
    >
      {status === 'playing'
        ? <Square className="w-2 h-2 fill-current" />
        : <Volume2 className="w-2.5 h-2.5" />
      }
    </button>
  )
}

function ToolsAndPanels({
  text,
  showTranslation,
  setShowTranslation,
}: {
  text: string
  showTranslation: boolean
  setShowTranslation: (v: boolean | ((p: boolean) => boolean)) => void
}) {
  const [fetchedTranslation, setFetchedTranslation] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)

  const handleTranslateClick = async () => {
    if (fetchedTranslation) {
      setShowTranslation((s) => !s)
      return
    }
    setShowTranslation(true)
    setTranslating(true)
    try {
      const res = await authFetch('/api/gemini/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const data = await res.json()
        setFetchedTranslation(data.translation || text)
      } else {
        setFetchedTranslation('[Translation unavailable]')
      }
    } catch {
      setFetchedTranslation('[Translation unavailable]')
    } finally {
      setTranslating(false)
    }
  }

  if (!text) return null
  return (
    <div className="flex flex-col gap-1.5 self-start w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleTranslateClick}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors',
            showTranslation
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-card/40 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60'
          )}
        >
          <Languages className="w-3 h-3" />
          {showTranslation ? 'Hide translation' : 'Show translation'}
        </button>
      </div>

      {showTranslation && (
        <div className="max-w-full px-4 py-2 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground/80 leading-relaxed">
          {translating ? (
            <span className="text-muted-foreground italic">Translating…</span>
          ) : (
            fetchedTranslation || text
          )}
        </div>
      )}
    </div>
  )
}

// ─── Simple voice player for user recordings (uses native Audio, no AudioContext) ─────

function SimpleVoicePlayer({ audioBase64, durationMs }: { audioBase64: string; durationMs?: number }) {
  const [playing, setPlaying] = useState(false)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  const duration = Math.round((durationMs || 0) / 1000)
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const toggle = () => {
    if (playing && audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current = null
      setPlaying(false)
      return
    }

    // Convert base64 to blob and play with native Audio element
    const raw = atob(audioBase64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'audio/webm' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioElRef.current = audio
    setPlaying(true)
    audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); audioElRef.current = null }
    audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); audioElRef.current = null }
    audio.play()
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-primary/8 border border-primary/20 self-end">
      <button
        onClick={toggle}
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center transition-all',
          playing ? 'bg-primary text-white' : 'bg-primary/15 text-primary hover:bg-primary/25'
        )}
      >
        {playing
          ? <Square className="w-2.5 h-2.5 fill-current" />
          : <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
        }
      </button>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="w-0.5 rounded-full bg-primary/40" style={{ height: `${4 + Math.sin(i * 0.7) * 5 + 2}px` }} />
        ))}
      </div>
      <span className="text-[10px] font-mono text-primary/60 tabular-nums">{formatTime(duration)}</span>
      <Mic className="w-3 h-3 text-primary/30" />
    </div>
  )
}


