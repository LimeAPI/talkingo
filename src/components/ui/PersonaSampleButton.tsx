'use client'

/**
 * PersonaSampleButton
 *
 * A small "Hear them speak" play button for the landing page persona
 * gallery. Fetches synthesized audio from /api/personas/sample on click
 * and plays it inline. Caches the audio element in memory so subsequent
 * plays are instant.
 *
 * Designed to feel like a single-tap audition of the tutor's voice —
 * the whole point is "feel the difference" between Eli, Alex, Dr. Luma.
 */

import { useRef, useState } from 'react'
import { Play, Pause, Loader2, Volume2 } from 'lucide-react'
import { cn } from '@talkingo/shared/utils'

interface PersonaSampleButtonProps {
  personaId: string
  /** Optional language code; defaults to 'en'. */
  language?: string
  className?: string
}

export function PersonaSampleButton({
  personaId,
  language = 'en',
  className,
}: PersonaSampleButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')

  async function handleClick() {
    // Pause if currently playing
    if (state === 'playing' && audioRef.current) {
      audioRef.current.pause()
      setState('idle')
      return
    }

    // Lazy-fetch the audio URL the first time the user clicks
    if (!urlRef.current) {
      setState('loading')
      try {
        const res = await fetch(
          `/api/personas/sample?id=${encodeURIComponent(personaId)}&language=${encodeURIComponent(language)}`,
        )
        if (!res.ok) {
          setState('idle')
          return
        }
        const blob = await res.blob()
        urlRef.current = URL.createObjectURL(blob)
      } catch {
        setState('idle')
        return
      }
    }

    // Play
    if (!audioRef.current) {
      audioRef.current = new Audio(urlRef.current)
      audioRef.current.addEventListener('ended', () => setState('idle'))
      audioRef.current.addEventListener('error', () => setState('idle'))
    } else {
      audioRef.current.src = urlRef.current
    }
    try {
      await audioRef.current.play()
      setState('playing')
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full',
        'border border-current/20 bg-current/5 hover:bg-current/10',
        'text-[11px] font-semibold transition-all',
        'focus:outline-none focus:ring-2 focus:ring-current/30',
        className,
      )}
      aria-label={state === 'playing' ? 'Stop sample' : 'Hear them speak'}
    >
      {state === 'loading' ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state === 'playing' ? (
        <Pause size={12} />
      ) : (
        <Play size={12} />
      )}
      {state === 'playing' ? 'Stop' : state === 'loading' ? 'Loading…' : (
        <>
          <Volume2 size={11} />
          Hear them speak
        </>
      )}
    </button>
  )
}
