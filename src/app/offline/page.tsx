'use client'

import { WifiOff, RotateCw } from 'lucide-react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

export default function OfflinePage() {
  return (
    <main className="lp lp-dark relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="lp-mesh opacity-70" aria-hidden />
      <div className="lp-dotgrid absolute inset-0 opacity-40" aria-hidden />

      <div className="relative max-w-sm">
        <div className="mx-auto mb-9 flex h-16 w-16 items-center justify-center rounded-2xl
                        border border-[oklch(var(--color-accent)/.3)] bg-[oklch(var(--color-accent)/.1)]">
          <WifiOff className="h-7 w-7 text-[oklch(var(--color-accent))]" />
        </div>

        <p className="lp-eyebrow justify-center">No connection</p>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-[-.03em] text-[oklch(var(--color-ink))]">
          Can&apos;t reach Talkingo
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">
          Check your internet connection and try again. Your conversations are waiting for you.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="lp-btn lp-btn--primary group mx-auto mt-9"
        >
          <RotateCw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
          Try again
        </button>

        <div className="mt-16 flex items-center justify-center gap-2 opacity-70">
          <TalkingoLogo size="sm" />
          <span className="text-[12px] font-medium tracking-wide text-[oklch(var(--color-muted))]">Talkingo</span>
        </div>
      </div>
    </main>
  )
}
