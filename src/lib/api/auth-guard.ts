import 'server-only'

/**
 * Server-side auth guard for API routes.
 *
 * Verifies the user's Appwrite session using a JWT (JSON Web Token).
 * The client creates a JWT via account.createJWT() and sends it in the
 * X-Appwrite-JWT header. This is the official Appwrite pattern for
 * server-side auth and works reliably across all environments.
 *
 * Usage in API routes:
 *   const auth = await verifyAuth(req)
 *   if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 *   // auth.userId  → the verified user id
 *   // auth.jwt     → the JWT (for downstream user-context Appwrite calls)
 *
 *   // Backwards-compatible: if you only need the userId
 *   const userId = await verifyAuthUserId(req)
 */

import { NextRequest } from 'next/server'
import { Client, Account } from 'node-appwrite'

export interface AuthContext {
  userId: string
  jwt: string
  /** The verified account email (from the Appwrite session), or null if unset. */
  email: string | null
}

/**
 * Verify the user's Appwrite session via JWT.
 * Returns { userId, jwt } if valid, null otherwise.
 */
export async function verifyAuth(req: NextRequest): Promise<AuthContext | null> {
  try {
    const jwt =
      req.headers.get('x-appwrite-jwt') ||
      // Backwards-compat: some older clients may still send X-Appwrite-Session
      req.headers.get('x-appwrite-session')

    if (!jwt) return null

    const client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
      .setJWT(jwt)

    const account = new Account(client)
    const user = await account.get()
    return { userId: user.$id, jwt, email: user.email || null }
  } catch {
    return null
  }
}

/**
 * Convenience: verify auth and return only the userId.
 * Used by callers that don't need to make further Appwrite calls.
 */
export async function verifyAuthUserId(req: NextRequest): Promise<string | null> {
  const auth = await verifyAuth(req)
  return auth?.userId ?? null
}

/**
 * Simple rate limiter using in-memory store.
 * Resets every window (default 60s). Not distributed — works per-instance only.
 *
 * NOTE: In serverless environments (Vercel), this provides best-effort
 * per-instance limiting. For true distributed rate limiting, use Redis.
 * Still useful as a safety net against burst abuse within a single instance.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  key: string,
  maxRequests: number = 30,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  pruneExpiredEntries()
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count }
}

function pruneExpiredEntries() {
  if (rateLimitStore.size < 100) return
  const now = Date.now()
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  }
}

// ─── Origin validation (lightweight CSRF protection) ────────────────────────

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'https://localhost:3000',
].filter(Boolean) as string[])

/**
 * Validate that the request's Origin or Referer header matches the app's
 * public URL. Rejects cross-origin JSON API requests that bypass CORS
 * preflight (e.g., same-site form POSTs with forged content-type).
 *
 * Returns true if the origin is valid or if the app is in dev mode.
 */
export function validateOrigin(req: NextRequest): boolean {
  const origin =
    req.headers.get('origin') ||
    req.headers.get('referer') ||
    ''

  if (!origin) return false

  try {
    const originUrl = new URL(origin)
    const hostname = originUrl.hostname

    // Always allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true
    }

    for (const allowed of ALLOWED_ORIGINS) {
      if (!allowed) continue
      const allowedUrl = new URL(allowed)
      if (
        originUrl.protocol === allowedUrl.protocol &&
        originUrl.hostname === allowedUrl.hostname &&
        originUrl.port === allowedUrl.port
      ) {
        return true
      }
    }
  } catch {
    // Malformed origin URL
  }

  return false
}
