'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCw, Home } from 'lucide-react'
import { TalkingoLogo } from '@/components/ui/TalkingoLogo'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[App Error]', error)
  }, [error])

  return (
    <main className="lp relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background px-6 text-center text-foreground">
      <div className="lp-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="lp-mesh opacity-50" aria-hidden />

      <div className="relative max-w-md">
        <div className="flex justify-center">
          <TalkingoLogo size="lg" />
        </div>
        <p className="lp-eyebrow mt-8 justify-center">Something broke</p>
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-[-.04em] text-[oklch(var(--color-ink))]">
          That wasn&apos;t supposed to happen
        </h1>
        <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-[oklch(var(--color-muted))]">
          An unexpected error interrupted things. Try again, or head back home — your progress is safe.
        </p>
        {error?.digest && (
          <p className="mt-3 font-[var(--font-outlier)] text-[11px] text-[oklch(var(--color-muted))]">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <button onClick={reset} className="lp-btn lp-btn--primary">
            <RotateCw className="h-4 w-4" /> Try again
          </button>
          <Link href="/" className="lp-btn lp-btn--ghost">
            <Home className="h-4 w-4" /> Back home
          </Link>
        </div>
      </div>
    </main>
  )
}
