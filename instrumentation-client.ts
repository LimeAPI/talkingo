// Browser-side Sentry init (loaded by Next's client instrumentation).
// A no-op unless NEXT_PUBLIC_SENTRY_DSN is set, so local/dev stays clean.
import * as Sentry from '@sentry/nextjs'
import { scrubSentryEvent } from '@/lib/sentry-scrub'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
    // Keep tracing modest by default to control cost; override via env.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Session Replay is opt-in (off by default) — it can capture sensitive UI.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // We do our own PII scrubbing; never let the SDK attach it automatically.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  })
}

// Instruments client-side navigations for performance tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

// Capture a `?ref=` / `?promo=` referral code on first client load so it can be
// auto-applied at checkout later. Runs on a fresh page load (the case for an
// external referral link); the paywall re-captures on mount to cover in-app
// navigations too.
import { captureReferralFromUrl } from '@/lib/subscription/referral'
captureReferralFromUrl()
