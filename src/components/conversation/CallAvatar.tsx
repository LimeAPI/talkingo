'use client'

import { cn } from '@talkingo/shared/utils'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { AvatarSVG } from '../ui/AvatarSVG'

type CallVisualState =
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'error'

interface CallAvatarProps {
  personaId: string
  state: CallVisualState
  /** Ref holding the real AI playback amplitude (0..1). Read at ~60fps. */
  amplitudeRef: MutableRefObject<number>
  /** Ref holding the real mic input level (0..1). Read at ~60fps. */
  micLevelRef: MutableRefObject<number>
}

/**
 * CallAvatar — the centerpiece of the Live Call screen.
 *
 * Genuinely audio-reactive: when the AI speaks the rings + halo follow the
 * real playback amplitude; when it's the user's turn a cooler ring follows the
 * mic level so you can *see* the call listening to you. To avoid 60fps React
 * re-renders of the (large) call view, the levels are passed as refs and this
 * component drives the DOM directly from a single rAF loop. Discrete states
 * (connecting/thinking/connected) are prop-driven and infrequent.
 */
export function CallAvatar({
  personaId,
  state,
  amplitudeRef,
  micLevelRef,
}: CallAvatarProps) {
  const speaking = state === 'speaking'
  const listening = state === 'listening' || state === 'ready'

  // Keep the latest state available to the rAF loop without restarting it.
  const stateRef = useRef(state)
  stateRef.current = state

  // DOM refs we mutate each frame.
  const ring1Ref = useRef<HTMLDivElement>(null)
  const ring2Ref = useRef<HTMLDivElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)
  const discRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Respect reduced-motion: skip the per-frame reactive writes entirely and
    // leave the rings/disc in their calm static CSS state.
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    let raf = 0
    let smooth = 0
    const loop = () => {
      const s = stateRef.current
      const target =
        s === 'speaking'
          ? amplitudeRef.current
          : s === 'listening' || s === 'ready'
            ? micLevelRef.current
            : 0
      // Light smoothing so it feels organic, not jittery.
      smooth += (target - smooth) * 0.35
      const e = Math.max(0, Math.min(1, smooth))
      const ampStr = e.toFixed(3)
      if (ring1Ref.current) {
        ring1Ref.current.style.setProperty('--amp', ampStr)
        ring1Ref.current.style.opacity = (0.45 + e * 0.55).toFixed(3)
      }
      if (ring2Ref.current) {
        ring2Ref.current.style.setProperty('--amp', ampStr)
        ring2Ref.current.style.opacity = (0.55 + e * 0.45).toFixed(3)
      }
      if (haloRef.current) {
        haloRef.current.style.setProperty('--amp', ampStr)
        haloRef.current.style.opacity = (0.4 + e * 0.6).toFixed(3)
      }
      if (discRef.current) {
        discRef.current.style.transform = `scale(${(1 + e * 0.05).toFixed(3)})`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [amplitudeRef, micLevelRef])

  // One-shot "connected" celebration the first time the call goes live.
  const [showConnected, setShowConnected] = useState(false)
  const wasLiveRef = useRef(false)
  useEffect(() => {
    const live = state === 'listening' || state === 'speaking' || state === 'ready'
    if (live && !wasLiveRef.current) {
      wasLiveRef.current = true
      setShowConnected(true)
      const t = setTimeout(() => setShowConnected(false), 700)
      return () => clearTimeout(t)
    }
    if (state === 'connecting' || state === 'error') wasLiveRef.current = false
  }, [state])

  const ringTone = speaking ? 'var(--primary)' : 'var(--secondary)'

  return (
    <div className="relative flex items-center justify-center w-52 h-52">
      {/* Connecting — calm shimmer ring */}
      {state === 'connecting' && (
        <div
          className="absolute w-40 h-40 rounded-full border border-muted-foreground/25 animate-connect-shimmer"
          aria-hidden
        />
      )}

      {/* Amplitude-reactive rings + halo (speaking / listening) */}
      {(speaking || listening) && (
        <>
          <div
            ref={ring1Ref}
            className="voice-ring w-44 h-44 border"
            style={{ borderColor: `oklch(${ringTone} / 0.18)` }}
            aria-hidden
          />
          <div
            ref={ring2Ref}
            className="voice-ring w-36 h-36 border"
            style={{ borderColor: `oklch(${ringTone} / 0.3)` }}
            aria-hidden
          />
          <div
            ref={haloRef}
            className="voice-ring w-32 h-32 rounded-full"
            style={{ background: `radial-gradient(circle, oklch(${ringTone} / 0.22) 0%, transparent 70%)` }}
            aria-hidden
          />
        </>
      )}

      {/* Thinking — gentle breathing ring */}
      {state === 'thinking' && (
        <div className="absolute w-36 h-36 rounded-full border border-primary/20 animate-pulse-slow" aria-hidden />
      )}

      {/* Avatar disc with the conic "speaking" border (revived from CSS).
          The connected-pop lives on this wrapper — NOT the disc — because the
          rAF loop overwrites the disc's inline transform every frame. */}
      <div
        className={cn(
          'waveform-border-container relative rounded-full',
          speaking && 'active',
          showConnected && 'animate-connected-pop'
        )}
      >
        <div
          ref={discRef}
          className={cn(
            'relative rounded-full overflow-hidden border-2 transition-colors duration-500',
            speaking ? 'border-primary/40' : listening ? 'border-secondary/30' : 'border-border/40'
          )}
        >
          <AvatarSVG personaId={personaId} size={120} className="rounded-full" />
        </div>
      </div>
    </div>
  )
}
