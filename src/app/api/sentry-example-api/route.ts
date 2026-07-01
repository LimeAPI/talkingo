import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

class SentryExampleAPIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SentryExampleAPIError'
  }
}

/**
 * Verification endpoint for the Sentry integration. Hitting it always throws,
 * so the error should surface in the Sentry issues stream (a no-op locally
 * unless SENTRY_DSN is configured). Safe to delete once verified.
 */
export function GET() {
  throw new SentryExampleAPIError(
    'This error is raised on the backend called by the example page.',
  )
  // eslint-disable-next-line no-unreachable
  return NextResponse.json({ data: 'Testing Sentry Error...' })
}
