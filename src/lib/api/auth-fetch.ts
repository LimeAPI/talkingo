/**
 * Authenticated fetch wrapper for internal API routes.
 *
 * Uses Appwrite JWT (JSON Web Token) for server-side session validation.
 * The JWT is created via account.createJWT() on the client and sent in the
 * X-Appwrite-JWT header. This is the official Appwrite pattern for server
 * auth — works reliably from Next.js API routes.
 *
 * JWTs are cached in memory + sessionStorage with a 14-minute TTL (Appwrite
 * JWTs expire after 15 minutes). If the cached JWT is expired or missing,
 * a new one is created on demand.
 */

import { account } from './appwrite'

const JWT_STORAGE_KEY = 'talkingo_jwt'
const JWT_TTL_MS = 14 * 60 * 1000 // 14 minutes (Appwrite JWT lifetime is 15 min)

interface CachedJWT {
  token: string
  expiresAt: number
}

let inFlightJwtPromise: Promise<string | null> | null = null

function getCachedJWT(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(JWT_STORAGE_KEY)
    if (!raw) return null
    const cached: CachedJWT = JSON.parse(raw)
    if (Date.now() >= cached.expiresAt) return null
    return cached.token
  } catch {
    return null
  }
}

function getCookieJWT(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)appwrite-jwt=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

function clearCookieJWT(): void {
  if (typeof document === 'undefined') return
  document.cookie = 'appwrite-jwt=; path=/; max-age=0; samesite=lax'
}

function setCachedJWT(token: string): void {
  if (typeof window === 'undefined') return
  try {
    const cached: CachedJWT = { token, expiresAt: Date.now() + JWT_TTL_MS }
    window.sessionStorage.setItem(JWT_STORAGE_KEY, JSON.stringify(cached))
  } catch {
    /* ignore quota errors */
  }
}

export function clearCachedJWT(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(JWT_STORAGE_KEY)
    clearCookieJWT()
  } catch {
    /* ignore */
  }
}

/**
 * Get a valid JWT for the current Appwrite session.
 * Returns null if not logged in. Caches the JWT to avoid creating one per request.
 * Coalesces concurrent calls so we only ever have one createJWT in flight.
 */
export async function getAuthJWT(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const cached = getCachedJWT()
  if (cached) return cached

  const cookieJwt = getCookieJWT()
  if (cookieJwt) {
    setCachedJWT(cookieJwt)
    return cookieJwt
  }

  if (inFlightJwtPromise) return inFlightJwtPromise

  inFlightJwtPromise = (async () => {
    try {
      const { jwt } = await account.createJWT()
      setCachedJWT(jwt)
      return jwt
    } catch {
      return null
    } finally {
      inFlightJwtPromise = null
    }
  })()

  return inFlightJwtPromise
}

/**
 * Drop-in replacement for fetch() that automatically includes a fresh
 * Appwrite JWT for authentication with our API routes.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const jwt = await getAuthJWT()
  const headers = new Headers(init?.headers)

  if (jwt) {
    headers.set('X-Appwrite-JWT', jwt)
  }

  const res = await fetch(input, { ...init, headers })

  // If the JWT was rejected (e.g., expired), clear cache and retry once
  if (res.status === 401 && jwt) {
    clearCachedJWT()
    const freshJwt = await getAuthJWT()
    if (freshJwt && freshJwt !== jwt) {
      const retryHeaders = new Headers(init?.headers)
      retryHeaders.set('X-Appwrite-JWT', freshJwt)
      return fetch(input, { ...init, headers: retryHeaders })
    }
  }

  return res
}

/**
 * Patches the global fetch to automatically include a fresh Appwrite JWT
 * for requests to our own API routes (/api/*). Call once on app init.
 *
 * This avoids having to replace every fetch() call in the codebase.
 */
export function installAuthFetchInterceptor(): void {
  if (typeof window === 'undefined') return

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Only intercept requests to our own API routes
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : (input as Request).url
    const isApiRoute = url.startsWith('/api/') || url.includes('/api/')

    if (!isApiRoute) {
      return originalFetch(input, init)
    }

    const jwt = await getAuthJWT()
    const headers = new Headers(init?.headers)
    if (jwt && !headers.has('X-Appwrite-JWT')) {
      headers.set('X-Appwrite-JWT', jwt)
    }

    const res = await originalFetch(input, { ...init, headers })

    // Auto-retry once on 401 with a fresh JWT (handles expired tokens)
    if (res.status === 401 && jwt) {
      clearCachedJWT()
      const freshJwt = await getAuthJWT()
      if (freshJwt && freshJwt !== jwt) {
        const retryHeaders = new Headers(init?.headers)
        retryHeaders.set('X-Appwrite-JWT', freshJwt)
        return originalFetch(input, { ...init, headers: retryHeaders })
      }
    }

    return res
  }
}
