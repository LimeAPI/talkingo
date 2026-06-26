'use client'

import { useEffect, useState } from 'react'

export default function OfflinePage() {
  const [pulse, setPulse] = useState(false)

  // Gentle pulse animation on the icon
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true)
      setTimeout(() => setPulse(false), 1000)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1020] p-6 overflow-hidden relative">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[200px] h-[200px] rounded-full bg-violet-500/5 blur-[80px] pointer-events-none" />

      <div className="relative z-10 text-center max-w-sm">
        {/* Disconnected icon — speech bubble with break */}
        <div className={`mx-auto w-24 h-24 mb-10 relative transition-transform duration-1000 ${pulse ? 'scale-105' : 'scale-100'}`}>
          <svg viewBox="0 0 96 96" fill="none" className="w-full h-full">
            {/* Speech bubble outline */}
            <path
              d="M12 40C12 26.745 22.745 16 36 16H60C73.255 16 84 26.745 84 40V48C84 61.255 73.255 72 60 72H52L40 84V72H36C22.745 72 12 61.255 12 48V40Z"
              stroke="rgba(165, 180, 252, 0.3)"
              strokeWidth="2"
              fill="rgba(99, 102, 241, 0.05)"
            />
            {/* Broken connection dots */}
            <circle cx="36" cy="44" r="4" fill="rgba(165, 180, 252, 0.6)" />
            <circle cx="48" cy="44" r="4" fill="rgba(165, 180, 252, 0.4)" />
            <circle cx="60" cy="44" r="4" fill="rgba(165, 180, 252, 0.2)" />
            {/* Break line */}
            <line x1="42" y1="56" x2="54" y2="56" stroke="rgba(248, 113, 113, 0.5)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-[22px] font-semibold text-white/90 mb-3 tracking-tight">
          Can&apos;t reach Talkingo
        </h1>

        {/* Message */}
        <p className="text-[15px] text-white/40 leading-relaxed mb-10 max-w-xs mx-auto">
          Check your internet connection and try again. Your conversations are waiting for you.
        </p>

        {/* Try again button */}
        <button
          onClick={() => window.location.reload()}
          className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-200 font-medium text-[15px] hover:bg-indigo-500/20 hover:border-indigo-400/30 active:scale-[0.97] transition-all duration-200"
        >
          <svg
            className="w-[18px] h-[18px] group-hover:rotate-180 transition-transform duration-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try again
        </button>

        {/* Subtle branding at bottom */}
        <div className="mt-16 flex items-center justify-center gap-2 opacity-20">
          <svg viewBox="0 0 120 120" className="w-5 h-5">
            <path d="M35 32H85M60 32V96" stroke="white" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-xs text-white font-medium tracking-wide">talkingo</span>
        </div>
      </div>
    </div>
  )
}
