import { NextRequest } from 'next/server'

/**
 * Resolve the public-facing base URL of the app (scheme + host, no trailing slash).
 *
 * Why this exists: `req.nextUrl.origin` reflects the *internal* host/port the
 * Node server is bound to. Behind a reverse proxy (Render, Fly, Nginx, etc.)
 * that internal value is something like
 *   http://srv-xxxx-hibernate-yyyy:10000
 * which is useless — and actively breaks — as an OAuth redirect_uri.
 *
 * Resolution order:
 *   1. OAUTH_BASE_URL / NEXT_PUBLIC_APP_URL env var (must be a real public URL).
 *   2. X-Forwarded-Host / X-Forwarded-Proto headers set by the proxy.
 *   3. The Host header (when no proxy forwarding info is present).
 *   4. req.nextUrl.origin as a last resort.
 */
export function getPublicBaseUrl(req: NextRequest): string {
  // The decision "use the live request host vs. the configured public URL" is
  // made purely on whether the request *actually arrived on localhost* — NOT on
  // NODE_ENV. NODE_ENV is unreliable in production (custom `tsx server.ts`
  // server, platform defaults, etc.); when it isn't exactly "production" the old
  // code derived the redirect_uri from an internal proxy host like
  // `srv-xxxx:10000`, which Google/Facebook reject as a redirect_uri_mismatch.
  const requestHost = (
    req.headers.get('x-forwarded-host')?.split(',')[0].trim()
    || req.headers.get('host')
    || ''
  ).toLowerCase()

  const isLocalRequest = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost)

  // 1. Local development: use the real request host so OAuth redirect URIs point
  //    at localhost even when NEXT_PUBLIC_APP_URL / OAUTH_BASE_URL carry prod
  //    values (a single .env.local can hold real prod creds without breaking
  //    local sign-in). Localhost is intentionally left on http.
  if (isLocalRequest) {
    const proto = (
      req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
      || req.nextUrl.protocol.replace(':', '')
      || 'http'
    )
    return `${proto}://${requestHost}`
  }

  // 2. Any real (non-local) request: the configured public URL is authoritative.
  //    This pins redirect_uri to your registered domain regardless of whatever
  //    internal host/proxy header the request arrived on — and regardless of
  //    NODE_ENV. Ignore a localhost value here so a stale config can't poison it.
  const configured = (process.env.OAUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/+$/, '')
  if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(configured)) {
    return enforceHttps(configured)
  }

  // 3. No usable config — fall back to the forwarded host, skipping obviously
  //    internal hosts the proxy didn't rewrite.
  if (requestHost && !/^(srv-|0\.0\.0\.0)/i.test(requestHost) && !/:\d{4,5}$/.test(requestHost)) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https'
    return enforceHttps(`${proto}://${requestHost}`)
  }

  // 4. Last resort.
  return enforceHttps(req.nextUrl.origin)
}

/**
 * Force https for any non-localhost host. OAuth providers (Google, Facebook)
 * reject non-secure redirect URIs, and a proxy may report X-Forwarded-Proto as
 * http even though the public edge is https. Localhost is left untouched for
 * local development.
 */
function enforceHttps(url: string): string {
  const trimmed = url.replace(/\/+$/, '')
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed)
  if (isLocal) return trimmed
  return trimmed.replace(/^http:\/\//i, 'https://')
}

/** Build an absolute callback URL for an OAuth provider. */
export function getCallbackUrl(req: NextRequest, path: string): string {
  const base = getPublicBaseUrl(req)
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
