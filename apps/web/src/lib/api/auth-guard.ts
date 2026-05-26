/**
 * Server-side auth guard for API routes.
 *
 * Verifies the user has a valid Appwrite session by checking the session cookie.
 * Returns the userId if authenticated, null otherwise.
 *
 * Usage in API routes:
 *   const userId = await verifyAuth(req)
 *   if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 */

import { NextRequest } from 'next/server'
import { Client, Account } from 'node-appwrite'

/**
 * Verify the user's Appwrite session from request cookies.
 * Returns the user ID if valid, null if not authenticated.
 */
export async function verifyAuth(req: NextRequest): Promise<string | null> {
  try {
    // Appwrite stores session in cookies (a_session_xxx)
    const cookies = req.headers.get('cookie')
    if (!cookies) return null

    // Find the Appwrite session cookie
    const sessionCookie = cookies
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('a_session_'))

    if (!sessionCookie) return null

    // Create a client with the session
    const client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)

    // Set the session from cookie
    const [name, value] = sessionCookie.split('=')
    client.setSession(value)

    const account = new Account(client)
    const user = await account.get()
    return user.$id
  } catch {
    return null
  }
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

/**
 * Lazy cleanup: prune expired entries when the store grows large.
 * Avoids setInterval in serverless (timers don't persist across invocations).
 * Called automatically inside checkRateLimit when store exceeds threshold.
 */
function pruneExpiredEntries() {
  if (rateLimitStore.size < 100) return
  const now = Date.now()
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  }
}
