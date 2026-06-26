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
  // 1. Explicit configuration wins. Ignore localhost values in production so a
  //    stale .env doesn't poison real redirect URIs.
  const configured = process.env.OAUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured) {
    const trimmed = configured.trim().replace(/\/+$/, '')
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(trimmed)
    if (trimmed && !(process.env.NODE_ENV === 'production' && isLocal)) {
      return trimmed
    }
  }

  // 2. Proxy-forwarded headers.
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    const proto = (forwardedProto || 'https').split(',')[0].trim()
    const host = forwardedHost.split(',')[0].trim()
    return `${proto}://${host}`.replace(/\/+$/, '')
  }

  // 3. Plain Host header.
  const host = req.headers.get('host')
  if (host && !/^(srv-|localhost:1000|0\.0\.0\.0)/i.test(host)) {
    const proto = req.nextUrl.protocol.replace(':', '') || 'https'
    return `${proto}://${host}`.replace(/\/+$/, '')
  }

  // 4. Last resort.
  return req.nextUrl.origin.replace(/\/+$/, '')
}

/** Build an absolute callback URL for an OAuth provider. */
export function getCallbackUrl(req: NextRequest, path: string): string {
  const base = getPublicBaseUrl(req)
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
