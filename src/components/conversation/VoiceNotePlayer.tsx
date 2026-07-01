'use client'

/**
 * VoiceNotePlayer — WhatsApp / Instagram-style voice-note player for
 * AI replies in chat mode. Renders inside the AI bubble.
 *
 * Lifecycle hint via `status`:
 *   - 'loading'  → spinner inside the play button, waveform skeleton
 *   - 'ready'    → real waveform, tap to play, drag to seek
 *   - 'error'    → tap-to-retry surface
 *
 * Singleton playback: starting a player pauses any other one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Loader2, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import {
  decodeBase64Pcm,
  getAudioContext,
  sampleWaveform,
} from '@/lib/utils/audio-decode'

// ── Singleton stop registry ──────────────────────────────────────────────
const activeStoppers = new Set<() => void>()
function stopAllExcept(self: () => void) {
  activeStoppers.forEach((s) => { if (s !== self) s() })
}

interface VoiceNotePlayerProps {
  status: 'idle' | 'loading' | 'ready' | 'error'
  audioData?: string
  sampleRate?: number
  /** Audio format: 'mp3' (Edge TTS) or 'pcm' (Gemini). Default: 'pcm'. */
  audioFormat?: 'mp3' | 'pcm'
  /** Optional pre-sampled waveform; computed from buffer if omitted. */
  waveform?: number[]
  /** Auto-play when status flips to 'ready'. Used for hands-free mode. */
  autoPlay?: boolean
  /** Called when caller wants to retry a failed TTS request. */
  onRetry?: () => void
  /** Fired when playback ends (used by hands-free to resume mic). */
  onEnded?: () => void
  /** Fired when playback starts. */
  onStarted?: () => void
  /** Force-mute speaker setting. */
  muted?: boolean
  /** Tone — affects accent color. */
  tone?: 'primary' | 'secondary'
}

const SPEEDS = [1, 1.25, 1.5] as const
const FALLBACK_WAVE = Array.from({ length: 32 }, () => 0.4)

export function VoiceNotePlayer({
  status,
  audioData,
  sampleRate = 24000,
  audioFormat = 'pcm',
  waveform,
  autoPlay = false,
  onRetry,
  onEnded,
  onStarted,
  muted = false,
  tone = 'primary',
}: VoiceNotePlayerProps) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [computedWave, setComputedWave] = useState<number[] | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [speedIdx, setSpeedIdx] = useState(0)
  const [decodeError, setDecodeError] = useState(false)
  const [autoplayed, setAutoplayed] = useState(false)

  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startedAtRef = useRef(0) // AudioContext.currentTime when playback started
  const offsetRef = useRef(0) // seconds into the buffer
  const rafRef = useRef<number | null>(null)
  const speed = SPEEDS[speedIdx]

  const wave = useMemo(
    () => waveform ?? computedWave ?? FALLBACK_WAVE,
    [waveform, computedWave]
  )
  const accent =
    tone === 'primary'
      ? { fg: 'bg-primary', dim: 'bg-primary/20', text: 'text-primary' }
      : { fg: 'bg-secondary', dim: 'bg-secondary/20', text: 'text-secondary' }

  // ── Decode audio when payload arrives ─────────────────────────────────
  useEffect(() => {
    let cancelled = false
    if (status !== 'ready' || !audioData) {
      setBuffer(null)
      setComputedWave(null)
      return
    }
    decodeBase64Pcm(audioData, sampleRate, audioFormat)
      .then((buf) => {
        if (cancelled) return
        setBuffer(buf)
        setDecodeError(false)
        if (!waveform) setComputedWave(sampleWaveform(buf))
      })
      .catch((err) => {
        console.warn('[VoiceNote] decode failed:', err.message)
        if (!cancelled) setDecodeError(true)
      })
    return () => { cancelled = true }
  }, [status, audioData, sampleRate, audioFormat, waveform])

  // ── Stop & cleanup ────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.onended = null; sourceRef.current.stop() } catch { /* already stopped */ }
      sourceRef.current = null
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsPlaying(false)
  }, [])

  useEffect(() => () => {
    stop()
    activeStoppers.delete(stop)
  }, [stop])

  // ── Progress tracker ──────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (!buffer || !sourceRef.current) return
    const ctx = getAudioContext()
    const elapsed = (ctx.currentTime - startedAtRef.current) * speed + offsetRef.current
    const ratio = Math.min(1, elapsed / buffer.duration)
    setProgress(ratio)
    if (ratio < 1) rafRef.current = requestAnimationFrame(tick)
  }, [buffer, speed])

  // ── Play from offset ──────────────────────────────────────────────────
  const playFrom = useCallback((offsetSec: number) => {
    if (!buffer) return
    stopAllExcept(stop)
    const ctx = getAudioContext()
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = speed
    src.connect(ctx.destination)
    src.onended = () => {
      // onended fires for both natural end AND .stop() — guard with offset
      const ended = offsetRef.current + (ctx.currentTime - startedAtRef.current) * speed
      sourceRef.current = null
      if (ended >= buffer.duration - 0.05) {
        setProgress(1)
        offsetRef.current = 0
        setIsPlaying(false)
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        onEnded?.()
        // reset to start on next tap
        setTimeout(() => setProgress(0), 400)
      }
    }
    src.start(0, offsetSec)
    sourceRef.current = src
    startedAtRef.current = ctx.currentTime
    offsetRef.current = offsetSec
    setIsPlaying(true)
    activeStoppers.add(stop)
    onStarted?.()
    rafRef.current = requestAnimationFrame(tick)
  }, [buffer, speed, stop, tick, onEnded, onStarted])

  // ── Toggle play/pause ─────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    if (!buffer || muted) return
    if (isPlaying) {
      const ctx = getAudioContext()
      const elapsed = (ctx.currentTime - startedAtRef.current) * speed
      offsetRef.current = Math.min(buffer.duration, offsetRef.current + elapsed)
      stop()
    } else {
      const start = progress >= 1 ? 0 : offsetRef.current
      offsetRef.current = start
      playFrom(start)
    }
  }, [buffer, isPlaying, muted, playFrom, progress, speed, stop])

  // ── Auto-play when ready (hands-free) ─────────────────────────────────
  useEffect(() => {
    if (autoPlay && buffer && !autoplayed && !muted) {
      setAutoplayed(true)
      playFrom(0)
    }
  }, [autoPlay, buffer, autoplayed, muted, playFrom])

  // ── Re-apply playback rate live when speed toggles ────────────────────
  useEffect(() => {
    if (sourceRef.current) sourceRef.current.playbackRate.value = speed
  }, [speed])

  // ── Seek by tapping on the waveform ───────────────────────────────────
  const waveRef = useRef<HTMLDivElement>(null)
  const handleSeek = (e: React.MouseEvent | React.TouchEvent) => {
    if (!buffer || !waveRef.current) return
    const rect = waveRef.current.getBoundingClientRect()
    const x = 'touches' in e
      ? e.changedTouches[0].clientX - rect.left
      : (e as React.MouseEvent).clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    const target = ratio * buffer.duration
    if (isPlaying) {
      stop()
      playFrom(target)
    } else {
      offsetRef.current = target
      setProgress(ratio)
    }
  }

  // ── Duration display ──────────────────────────────────────────────────
  const totalSec = buffer?.duration ?? 0
  const currentSec = isPlaying || progress > 0
    ? Math.min(totalSec, totalSec * progress)
    : totalSec
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${m}:${r.toString().padStart(2, '0')}`
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (status === 'error' || decodeError) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-500/10 border border-red-500/30 text-xs text-red-400">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Voice note unavailable</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 ml-1 underline-offset-2 hover:underline"
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
    )
  }

  const isLoading = status === 'loading' || (status === 'ready' && !buffer)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 px-3 py-2 rounded-2xl',
        'bg-card/60 border border-border/40 backdrop-blur-sm shadow-sm',
        'max-w-full'
      )}
      style={{ minWidth: 220 }}
    >
      {/* Play / pause / loading */}
      <button
        onClick={handleToggle}
        disabled={isLoading || muted}
        className={cn(
          'shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
          'shadow-sm transition-all duration-200 active:scale-95',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          tone === 'primary'
            ? 'bg-gradient-to-br from-primary to-primary-glow text-primary-foreground'
            : 'bg-gradient-to-br from-secondary to-secondary-glow text-white'
        )}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform + duration */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          ref={waveRef}
          onClick={handleSeek}
          onTouchEnd={handleSeek}
          className={cn(
            'relative h-6 flex items-center gap-[2px] cursor-pointer select-none',
            isLoading && 'opacity-50'
          )}
          role="slider"
          aria-label="Voice note progress"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {wave.map((amp, i) => {
            const filled = i / wave.length <= progress
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-colors duration-75',
                  filled ? accent.fg : accent.dim
                )}
                style={{ height: `${Math.max(15, amp * 100)}%` }}
              />
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground tabular-nums">
          <span>{fmt(currentSec)} {totalSec > 0 ? `/ ${fmt(totalSec)}` : ''}</span>
          {!isLoading && buffer && (
            <button
              onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
              className={cn(
                'px-1.5 py-px rounded-md border border-border/40 hover:border-border/70 transition-colors',
                speed !== 1 && accent.text
              )}
              aria-label={`Playback speed ${speed}x`}
            >
              {speed}x
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
