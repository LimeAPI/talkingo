'use client'

import { cn } from '@talkingo/shared/utils'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** When true, this (empty) AI bubble shows the animated "thinking" dots
   *  inside the bubble itself, then fills with text once streaming starts —
   *  so the reply lives in a single card instead of an empty shell + a
   *  separate floating indicator. */
  isThinking?: boolean
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
  isThinking = false,
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
      .replace(/[«»](.+?)[«»]/g, '<span class="inline-block px-1.5 py-0.5 rounded-lg bg-primary/[0.07] border border-primary/15 text-[13px]">«$1»</span>')

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
        'flex transition-all duration-[420ms] ease-[cubic-bezier(.16,1,.3,1)] group',
        isUser ? 'justify-end' : 'justify-start',
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2.5 scale-[0.985]'
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
        {!isUser && isThinking ? (
          /* ── Thinking state — dots live INSIDE the bubble, which then fills
             with streamed text. One continuous card, no empty shell. ── */
          <ThinkingBubble />
        ) : voiceFirst ? (
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
              tone="primary"
            />

            {/* Hide text toggle — advanced learners can hide for listening-only immersion */}
            <button
              onClick={() => setTextRevealed((v) => !v)}
              className={cn('pill self-start', !textRevealed && 'pill--accent')}
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
                className="pill pill--accent self-end"
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
                tone="primary"
              />
            )}

            {/* On-demand "Listen" pill — generates audio just for this message */}
            {!hasVoiceNote && onRequestAudio && (
              <button
                onClick={onRequestAudio}
                className="pill pill--accent self-start"
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
          <CorrectionsBlock corrections={corrections} text={text} />
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
        'px-5 py-3.5 rounded-2xl inline-block relative transition-all duration-200',
        isUser
          ? 'bg-primary/10 border border-primary/25 rounded-br-md'
          : 'bg-card border border-border/60 shadow-[var(--shadow-card)] rounded-bl-md'
      )}
    >
      <p className="text-sm leading-relaxed tracking-normal">{renderText()}</p>
    </div>
  )
}

/**
 * Thinking state for an AI bubble — the same bubble shell as a real reply,
 * but with three bouncing dots. It occupies the exact slot the text will fill,
 * so when the first streamed tokens arrive the bubble morphs in place instead
 * of an empty card sitting next to a separate floating indicator.
 */
function ThinkingBubble() {
  return (
    <div className="px-5 py-4 rounded-2xl rounded-bl-md inline-block bg-card border border-border/60 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-1.5" role="status" aria-label="Assistant is thinking">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

/**
 * Corrections block — ONE compact card that shows the learner's sentence with
 * each mistake struck through and the fix highlighted inline, e.g.
 *   "I  g̶o̶e̶d̶  went  to the store."
 * Far less vertical space than a stack of cards, and the fix is shown in the
 * context of the whole sentence (better for learning than isolated word pairs).
 * Optional "why" notes are tucked behind a toggle.
 */
function CorrectionsBlock({ corrections, text }: { corrections: Correction[]; text: string }) {
  const [showNotes, setShowNotes] = useState(false)

  // Build an inline diff of the sentence. Each correction's `original` is matched
  // (case-insensitive, first free occurrence) and rendered as del → ins. Anything
  // that can't be located in the sentence is shown as a chip below.
  const { nodes, unmatched } = useMemo(() => {
    const lower = text.toLowerCase()
    const used: Array<{ start: number; end: number }> = []
    const matches: Array<{ start: number; end: number; c: Correction }> = []
    const unmatched: Correction[] = []

    // A match only counts when it sits on word boundaries, so "go" doesn't
    // strike through the "go" inside "going".
    const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch)
    const onWordBoundary = (start: number, end: number) =>
      !isWordChar(lower[start - 1]) && !isWordChar(lower[end])

    corrections.forEach((c) => {
      const needle = c.original.toLowerCase().trim()
      if (!needle) { unmatched.push(c); return }
      let from = 0
      let found = -1
      // Find the first boundary-aligned occurrence that doesn't overlap a used range.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const idx = lower.indexOf(needle, from)
        if (idx === -1) break
        const end = idx + needle.length
        const overlaps = used.some((r) => idx < r.end && end > r.start)
        if (!overlaps && onWordBoundary(idx, end)) { found = idx; break }
        from = idx + 1
      }
      if (found === -1) { unmatched.push(c); return }
      used.push({ start: found, end: found + needle.length })
      matches.push({ start: found, end: found + needle.length, c })
    })

    matches.sort((a, b) => a.start - b.start)

    const nodes: React.ReactNode[] = []
    let cursor = 0
    matches.forEach((m, i) => {
      if (m.start > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, m.start)}</span>)
      nodes.push(
        <span key={`c${i}`} className="inline-flex items-center gap-1 align-baseline">
          <span className="line-through text-foreground/45 decoration-foreground/30">
            {text.slice(m.start, m.end)}
          </span>
          <ArrowRight className="w-3 h-3 text-primary/50 flex-shrink-0" />
          <span className="font-semibold text-primary bg-primary/10 rounded px-1">
            {m.c.corrected}
          </span>
          {m.c.type === 'pronunciation' && <PronunciationAudioButton text={m.c.corrected} />}
        </span>
      )
      cursor = m.end
    })
    if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>)

    return { nodes, unmatched }
  }, [corrections, text])

  const notable = corrections.filter((c) => c.note && c.note.trim().length > 0)

  return (
    <div className="self-start w-full max-w-[85%] rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5 transition-all duration-200 animate-message-in">
      {/* Header: fix count + optional notes toggle */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
            {corrections.length} fix{corrections.length === 1 ? '' : 'es'}
          </span>
        </div>
        {notable.length > 0 && (
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={showNotes}
          >
            {showNotes ? 'Hide why' : 'Why?'}
            {showNotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* The corrected sentence, inline */}
      <p className="text-sm leading-relaxed tracking-normal">{nodes}</p>

      {/* Corrections we couldn't locate in the sentence → compact chips */}
      {unmatched.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {unmatched.map((c, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-card border border-border/50 text-[12px]"
            >
              <span className="line-through text-foreground/45">{c.original}</span>
              <ArrowRight className="w-3 h-3 text-primary/50" />
              <span className="font-semibold text-primary">{c.corrected}</span>
              {c.type === 'pronunciation' && <PronunciationAudioButton text={c.corrected} />}
            </span>
          ))}
        </div>
      )}

      {/* Optional "why" notes */}
      {showNotes && notable.length > 0 && (
        <div className="mt-2 pt-2 border-t border-primary/10 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {notable.map((c, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide border border-primary/20 bg-primary/10 text-primary flex-shrink-0">
                {c.type}
              </span>
              <span className="text-muted-foreground">{c.note}</span>
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
          ? 'bg-primary text-primary-foreground scale-110'
          : status === 'loading'
            ? 'bg-primary/20 text-primary animate-pulse'
            : 'bg-primary/10 text-primary hover:bg-primary/20 hover:scale-110'
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
          className={cn('pill', showTranslation && 'pill--on')}
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
          playing ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary hover:bg-primary/25'
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


