'use client'

/**
 * Root error boundary for the App Router. Next renders this (with its own
 * <html>/<body>) only when an error escapes the root layout, so it must be
 * fully self-contained. It forwards the error to Sentry (a no-op when Sentry is
 * not configured) and offers a reload.
 */
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1712',
          color: '#f5f1e8',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#b8b0a0', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            An unexpected error occurred. Our team has been notified. Please try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: 'linear-gradient(to right, #E9B85C, #C99A3F)',
              color: '#1a1712',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
