'use client'

import { useEffect } from 'react'

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="font-display text-4xl font-extrabold text-foreground/20 mb-2">Oops</h1>
      <h2 className="text-lg font-bold text-foreground mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        An unexpected error occurred. Try refreshing or going back.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
