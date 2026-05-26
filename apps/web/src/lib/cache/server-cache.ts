/**
 * Server-side in-process cache (currently unused).
 *
 * Previously used for scenarios, but now scenarios are hardcoded.
 * This module is kept for potential future caching needs.
 */

interface CacheEntry<T> {
  value: T
  fetchedAt: number
  ttlMs: number
}

class ServerCache {
  private store = new Map<string, CacheEntry<any>>()

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt > entry.ttlMs) {
      this.store.delete(key)
      return null
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, fetchedAt: Date.now(), ttlMs })
  }

  invalidate(key: string): void {
    this.store.delete(key)
  }

  invalidateAll(): void {
    this.store.clear()
  }

  /** Returns cache metadata for debugging */
  stats(): Record<string, { age: number; ttl: number; valid: boolean }> {
    const now = Date.now()
    const result: Record<string, { age: number; ttl: number; valid: boolean }> = {}
    for (const [key, entry] of this.store.entries()) {
      const age = now - entry.fetchedAt
      result[key] = { age, ttl: entry.ttlMs, valid: age < entry.ttlMs }
    }
    return result
  }
}

// Singleton — module-level, shared across all requests in the same process
export const serverCache = new ServerCache()

// Cache keys (currently empty — all data is hardcoded)
export const CACHE_KEYS = {} as const

// TTLs (currently unused)
export const CACHE_TTL = {} as const
