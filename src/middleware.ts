import { NextRequest, NextResponse } from 'next/server'

/**
 * Nonce-based Content-Security-Policy (production only).
 *
 * Replaces the old static `script-src 'self' 'unsafe-inline'` (which let any
 * injected inline `<script>` execute — i.e. XSS could run, and since the
 * session JWT is readable by JS, steal the session). We now emit a fresh
 * per-request nonce and use `'strict-dynamic'`:
 *
 *   - Next.js automatically stamps the nonce onto its own inline bootstrap
 *     scripts and onto `next/script` tags (it reads the CSP we set on the
 *     REQUEST headers below), so the framework keeps working.
 *   - `'strict-dynamic'` lets those trusted, nonce'd scripts load further
 *     scripts (Next chunks, and third-party loaders like Clarity/PostHog) by
 *     propagation — so we don't have to allowlist every host — while an
 *     attacker-injected inline script with NO nonce is refused.
 *   - `'self' https:` are kept only as a fallback for legacy browsers that
 *     don't understand `'strict-dynamic'` (modern browsers ignore them once a
 *     nonce + strict-dynamic are present).
 *
 * Dev is intentionally left with NO CSP: Next's dev/HMR runtime uses inline +
 * eval'd scripts that a strict policy would block. The previous config already
 * disabled CSP in development, so this preserves that behavior exactly.
 *
 * All the non-CSP security headers (X-Frame-Options, HSTS, nosniff, …) continue
 * to be set statically in `next.config.ts`. Only the CSP moved here because a
 * per-request nonce cannot be expressed in a static header.
 */

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // Nonce + strict-dynamic is the real change. 'self'/https: are legacy-browser fallbacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://oauth2.googleapis.com https://www.googleapis.com https://generativelanguage.googleapis.com https://*.googleapis.com https://*.cloud.appwrite.io wss://generativelanguage.googleapis.com https://us.i.posthog.com https://us-assets.i.posthog.com https://*.posthog.com https://*.clarity.ms https://c.bing.com https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self' https://accounts.google.com",
  ].join('; ')
}

export function middleware(request: NextRequest): NextResponse {
  // Preserve the previous behavior: no CSP outside production (HMR needs inline/eval).
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next()
  }

  // Per-request nonce. `crypto` is available in the middleware (edge) runtime.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  // Next reads the nonce from the CSP on the REQUEST headers and applies it to
  // its scripts; `x-nonce` is exposed for any code that needs to read it.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  // Run on document requests only. Exclude API routes (JSON, no inline scripts),
  // Next internals, the service worker / workbox, worklets, and static assets —
  // none of which need a document CSP and some of which (sw.js) must not get one.
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-|fallback-|worklets/|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|js|css|woff|woff2|ttf|map)$).*)',
    },
  ],
}
