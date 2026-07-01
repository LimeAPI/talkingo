import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import withPWAInit from '@ducanh2912/next-pwa'
import { withSentryConfig } from '@sentry/nextjs'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// NOTE: the Content-Security-Policy is intentionally NOT set here. It needs a
// fresh per-request nonce (so we can drop `script-src 'unsafe-inline'`), which a
// static header cannot express — it is emitted by `src/middleware.ts` instead.
// All other security headers remain static below.

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline',
  },
  workboxOptions: {
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    runtimeCaching: [
      {
        urlPattern: new RegExp('^https://fonts\\.(googleapis|gstatic)\\.com/.*', 'i'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: new RegExp('\\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$', 'i'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: new RegExp('^https://.*\\.talkingo\\.ai/.*$', 'i'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /\/(?:api\/|auth\/callback|login|signup)/,
        handler: 'NetworkOnly',
      },
    ],
  },
})

const nextConfig: NextConfig = {
  rewrites: async () => [
    { source: '/terms-of-service', destination: '/terms' },
    { source: '/privacy-policy', destination: '/privacy' },
    { source: '/user-data-deletion', destination: '/data-deletion' },
  ],
  headers: async () => {
    const rootHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ]

    return [
      {
        source: '/(.*)',
        headers: rootHeaders,
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default withSentryConfig(withNextIntl(withPWA(nextConfig)), {
  // Sentry project coordinates (the org/project you created).
  org: process.env.SENTRY_ORG ?? 'irshame',
  project: process.env.SENTRY_PROJECT ?? 'javascript-nextjs',
  // Source maps are uploaded only when SENTRY_AUTH_TOKEN is present (CI/build).
  // Without it the build still succeeds — it just skips the upload step.
  silent: true,
  // Upload a wider set of client bundles so stack traces are fully symbolicated.
  widenClientFileUpload: true,
  // Don't send build-time telemetry to Sentry.
  telemetry: false,
})
