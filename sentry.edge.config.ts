// Edge-runtime Sentry init (middleware / edge routes), loaded via instrumentation.ts.
// A no-op unless SENTRY_DSN is set.
import * as Sentry from '@sentry/nextjs'
import { scrubSentryEvent } from '@/lib/sentry-scrub'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  })
}
