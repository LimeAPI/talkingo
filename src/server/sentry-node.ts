/**
 * Sentry init for the STANDALONE WebSocket dev server (`ws-server.ts`).
 *
 * Next.js' `instrumentation.ts` only runs inside the Next process — in
 * production the WS proxy lives in `server.ts` (same process, so it's already
 * covered by the Next server init). But in development the WS server runs as its
 * own `tsx` process with no Next runtime, so it needs its own init or unhandled
 * socket/proxy crashes would never reach Sentry.
 *
 * Importing this module performs the init as a side effect. It's a no-op unless
 * SENTRY_DSN is set. `@sentry/node`'s default integrations register global
 * uncaught-exception / unhandled-rejection handlers, so process-level crashes in
 * the live-voice proxy are captured automatically.
 */
import * as Sentry from '@sentry/node'
import { scrubSentryEvent } from '../lib/sentry-scrub'

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
