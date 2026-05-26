'use client'

import { cn } from '@talkingo/shared/utils'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Heart, Sparkles, Languages, BookOpen, Wand2,
  ChevronDown, ChevronUp, Headphones, Play, Square, Mic,
} from 'lucide-react'
import type { Correction, VocabItem, MessageAudio, TeachingNote } from '@talkingo/shared/types'
import { AvatarSVG } from '../ui/AvatarSVG'
import { VoiceNotePlayer } from './VoiceNotePlayer'

interface TranscriptMessageProps {
  text: string
  translation?: string
  isUser: boolean
  corrections?: Correction[]
  vocab?: VocabItem[]
  emotion?: string
  delay?: number
  personaId?: string
  /** Voice note for this AI message. When present, text is hidden until revealed. */
  audio?: MessageAudio
  /** Auto-play the voice note as soon as it's ready. */
  autoPlayAudio?: boolean
  /** Speaker mute — disables player auto-play. */
  speakerMuted?: boolean
  /** Called when the user taps "Say it like a native" on their own message */
  onAskNativeRewrite?: (phrase: string) => void
  /** Called when caller wants to retry a failed TTS request. */
  onRetryAudio?: () => void
  /**
   * Called when the user taps "Listen" on an AI message that has no audio yet
   * (voice notes globally off). Triggers on-demand TTS for THIS message only.
   */
  onRequestAudio?: () => void
  /** Called when voice-note playback ends (used for hands-free mic resume). */
  onAudioEnded?: () => void
  /** Called when voice-note playback starts. */
  onAudioStarted?: () => void
  /** Teaching card — correction, expression, grammar tip, idiom, culture note. */
  teachingNote?: TeachingNote | null
  /** Hide entry animation (used for older messages on initial render). */
  skipAnimation?: boolean
}

export function TranscriptMessage({
  text,
  translation,
  isUser,
  corrections = [],
  vocab = [],
  emotion,
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
  teachingNote,
  skipAnimation = false,
}: TranscriptMessageProps) {
  const [isVisible, setIsVisible] = useState(skipAnimation)
  const [showTranslation, setShowTranslation] = useState(false)
  const [showVocab, setShowVocab] = useState(false)

  // ── Voice-first text reveal ───────────────────────────────────────────────
  // When a voice note is attached AT MESSAGE CREATION, text starts hidden.
  // For on-demand audio (user tapped "Listen" later), text stays visible.
  const hasVoiceNote = !isUser && !!audio
  const startedWithAudioRef = useRef(hasVoiceNote)
  // Only treat as voice-first when the audio was present from the very first render
  const voiceFirst = hasVoiceNote && startedWithAudioRef.current
  const [textRevealed, setTextRevealed] = useState(!voiceFirst)

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

  const handleAudioEnded = () => {
    // Auto-reveal text when playback finishes
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
      .replace(/\*\*(.+?)\*\*/g, '<span class="inline-block px-1 py-0.5 rounded-md bg-primary/10 text-primary font-semibold text-[13px]">$1</span>')
      .replace(/__(.+?)__/g, '<span class="inline-block px-1 py-0.5 rounded-md bg-primary/10 text-primary font-semibold text-[13px]">$1</span>')

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

    return <span dangerouslySetInnerHTML={{ __html: renderedText }} />
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

        {/* ── AI message with voice-first audio (text hidden until played/revealed) ── */}
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

            {/* Text reveal toggle */}
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
                  translation={translation}
                  text={text}
                  vocab={vocab}
                  corrections={corrections}
                  showTranslation={showTranslation}
                  setShowTranslation={setShowTranslation}
                  showVocab={showVocab}
                  setShowVocab={setShowVocab}
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
              translation={translation}
              text={text}
              vocab={vocab}
              corrections={corrections}
              showTranslation={showTranslation}
              setShowTranslation={setShowTranslation}
              showVocab={showVocab}
              setShowVocab={setShowVocab}
            />
          </>
        )}

        {/* Corrections block — shown beneath user messages (corrections describe errors in what the user said) */}
        {isUser && corrections.length > 0 && (
          <CorrectionsBlock corrections={corrections} />
        )}

        {/* Teaching card — shown below AI messages when there's something to teach */}
        {!isUser && teachingNote && (
          <TeachingCard note={teachingNote} />
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

  const getRootCauseLabel = (rootCause?: string) => {
    switch (rootCause) {
      case 'l1-interference':    return 'L1 transfer'
      case 'knowledge-gap':      return 'New rule'
      case 'overgeneralization':  return 'Overgeneralized'
      case 'careless':           return 'Slip'
      default:                   return null
    }
  }

  return (
    <div className="self-start w-full max-w-[85%] rounded-xl border border-correction/20 bg-correction-bg/30 backdrop-blur-sm overflow-hidden transition-all duration-200">
      {/* Header — always visible */}
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

      {/* Corrections list */}
      {expanded && (
        <div className="px-3.5 pb-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {corrections.map((correction, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-card/60 border border-border/30"
            >
              {/* Type badge + root cause */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                  getTypeColor(correction.type)
                )}>
                  {correction.type}
                </span>
                {correction.rootCause && getRootCauseLabel(correction.rootCause) && (
                  <span className="text-[10px] text-muted-foreground/70 italic">
                    {getRootCauseLabel(correction.rootCause)}
                  </span>
                )}
              </div>

              {/* Original → Corrected */}
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="line-through opacity-60 text-correction-soft">
                  {correction.original}
                </span>
                <ArrowRight className="w-3 h-3 text-correction/60 flex-shrink-0" />
                <span className="font-semibold text-correction">
                  {correction.corrected}
                </span>
              </div>

              {/* Note/explanation */}
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

function ToolsAndPanels({
  translation,
  text,
  vocab,
  corrections,
  showTranslation,
  setShowTranslation,
  showVocab,
  setShowVocab,
}: {
  translation?: string
  text: string
  vocab: VocabItem[]
  corrections: Correction[]
  showTranslation: boolean
  setShowTranslation: (v: boolean | ((p: boolean) => boolean)) => void
  showVocab: boolean
  setShowVocab: (v: boolean | ((p: boolean) => boolean)) => void
}) {
  const [fetchedTranslation, setFetchedTranslation] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)

  const displayTranslation = translation || fetchedTranslation

  const handleTranslateClick = async () => {
    if (displayTranslation) {
      // Already have translation — just toggle visibility
      setShowTranslation((s) => !s)
      return
    }
    // Fetch on-demand
    setShowTranslation(true)
    setTranslating(true)
    try {
      const res = await fetch('/api/gemini/translate', {
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

  if (vocab.length === 0 && !text) return null
  return (
    <div className="flex flex-col gap-1.5 self-start w-full">
      {/* Tool pills */}
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
          {showTranslation ? 'Hide translation' : 'Show in English'}
        </button>
        {vocab.length > 0 && (
          <button
            onClick={() => setShowVocab((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors',
              showVocab
                ? 'bg-secondary/15 border-secondary/40 text-secondary'
                : 'bg-card/40 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60'
            )}
          >
            <BookOpen className="w-3 h-3" />
            {vocab.length} new word{vocab.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {/* Translation panel */}
      {showTranslation && (
        <div className="max-w-full px-4 py-2 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground/80 leading-relaxed">
          {translating ? (
            <span className="text-muted-foreground italic">Translating…</span>
          ) : (
            displayTranslation || text
          )}
        </div>
      )}

      {/* Vocab panel */}
      {showVocab && vocab.length > 0 && (
        <div className="max-w-full space-y-1.5">
          {vocab.map((v, i) => (
            <div key={i} className="px-3 py-2 rounded-xl bg-secondary/5 border border-secondary/20">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold">{v.term}</span>
                {v.romanization && (
                  <span className="text-[11px] text-muted-foreground italic">[{v.romanization}]</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{v.gloss}</p>
              {v.example && (
                <p className="text-[11px] text-foreground/60 mt-1 italic">{v.example}</p>
              )}
            </div>
          ))}
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

// ─── Teaching Card — contextual learning note below AI messages ───────────────

const TEACHING_CARD_STYLES: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  correction: { icon: '✏️', bg: 'bg-rose-500/8', border: 'border-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
  expression: { icon: '💬', bg: 'bg-violet-500/8', border: 'border-violet-500/20', text: 'text-violet-600 dark:text-violet-400' },
  grammar: { icon: '📐', bg: 'bg-blue-500/8', border: 'border-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  idiom: { icon: '🎯', bg: 'bg-amber-500/8', border: 'border-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  culture: { icon: '🌍', bg: 'bg-emerald-500/8', border: 'border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
}

function TeachingCard({ note }: { note: TeachingNote }) {
  const style = TEACHING_CARD_STYLES[note.type] || TEACHING_CARD_STYLES.grammar

  return (
    <div className={cn(
      'max-w-[90%] px-3.5 py-3 rounded-2xl border self-start transition-all',
      style.bg, style.border
    )}>
      <div className="flex items-start gap-2.5">
        <span className="text-base flex-shrink-0 mt-0.5">{style.icon}</span>
        <div className="flex-1 min-w-0">
          {note.title && (
            <p className={cn('text-[11px] font-bold uppercase tracking-wide mb-1', style.text)}>
              {note.title}
            </p>
          )}
          <p className="text-xs text-foreground/80 leading-relaxed">
            {note.content}
          </p>
        </div>
      </div>
    </div>
  )
}
