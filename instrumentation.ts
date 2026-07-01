// Next.js server/edge instrumentation entry. Loads the matching Sentry init for
// the active runtime, and forwards nested React Server Component request errors
// to Sentry via the App Router `onRequestError` hook.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
