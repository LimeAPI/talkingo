'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'

/**
 * Unified branded loading screen — favicon logo, one-way fill bar,
 * ambient orbs, and stuck-loading recovery UI.
 */
export function LoadingScreen() {
  const [showHint, setShowHint] = useState(false)
  const [showReload, setShowReload] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Transition bar from 0% → 100% after first paint
    requestAnimationFrame(() => {
      if (barRef.current) barRef.current.style.width = '100%'
    })

    const hintTimer = setTimeout(() => setShowHint(true), 8000)
    const reloadTimer = setTimeout(() => setShowReload(true), 10000)
    return () => {
      clearTimeout(hintTimer)
      clearTimeout(reloadTimer)
    }
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background gap-6 overflow-hidden isolate">
      {/* Ambient orbs */}
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-orb ambient-orb-3" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Orbital logo */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 120 120"
          className="w-16 h-16 drop-shadow-[0_4px_18px_oklch(var(--primary)/0.45)]"
          aria-label="Talkingo"
        >
          <rect x="10" y="10" width="100" height="100" rx="24" fill="#0B1020" />
          <g
            className="animate-orbital-spin"
            style={{ transformOrigin: '60px 60px', animationDuration: '8s' }}
          >
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="#FFD700"
              strokeWidth="4"
              strokeOpacity="0.4"
            />
            <circle cx="102" cy="60" r="10" fill="#FFD700" />
          </g>
          <circle cx="60" cy="60" r="22" fill="#FFD700" />
        </svg>

        {/* One-way fill bar */}
        <div className="w-56 h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            ref={barRef}
            className="h-full bg-gradient-to-r from-primary via-primary-glow to-primary rounded-full transition-[width] ease-out"
            style={{ width: '0%', transitionDuration: '3500ms' }}
          />
        </div>

        {/* Stuck-loading recovery */}
        <div className="h-10 flex flex-col items-center gap-2 transition-opacity duration-500"
          style={{ opacity: showHint ? 1 : 0 }}
        >
          <span className="text-xs text-muted-foreground">
            Taking longer than usual. Slow connection?
          </span>

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline transition-opacity duration-500"
            style={{ opacity: showReload ? 1 : 0, pointerEvents: showReload ? 'auto' : 'none' }}
          >
            <RotateCcw className="w-3 h-3" />
            Reload page
          </button>
        </div>
      </div>
    </div>
  )
}
