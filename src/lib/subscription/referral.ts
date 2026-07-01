/**
 * Referral / promo code capture (client-side).
 *
 * A referral link looks like `https://talkingo.ai/?ref=SARAH10`. We capture that
 * code the moment the visitor lands and persist it, so when they later reach
 * checkout the code is auto-applied — no typing, and it survives navigation
 * between landing and the paywall. `?promo=` is accepted as an alias for
 * manually-shared marketing codes.
 *
 * The code is passed to `/api/billing/checkout`, where the server validates it
 * against the catalog and pre-applies the discount (an invalid code is ignored,
 * never blocking checkout).
 */

const STORAGE_KEY = 'talkingo_promo_code'
const MAX_LEN = 64
/** Attribution window: a captured code older than this is ignored (30 days). */
const TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Capture a `?ref=` / `?promo=` code from the current URL into localStorage,
 * timestamped so it expires after the attribution window. Safe to call on every
 * page load; a no-op when there's no code or no window.
 */
export function captureReferralFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('ref') || params.get('promo')
    const clean = (code ?? '').trim()
    if (clean) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ code: clean.slice(0, MAX_LEN), ts: Date.now() }),
      )
    }
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }
}

/**
 * Read a previously-captured promo/referral code, if any and still within the
 * attribution window. An expired entry is cleared and treated as absent, so a
 * stale code never silently attaches to an unrelated later purchase.
 */
export function getStoredPromoCode(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    // Backwards-compat: an older plain-string value is treated as fresh once.
    let code: string | undefined
    let ts: number | undefined
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { code?: string; ts?: number }
      code = parsed.code
      ts = parsed.ts
    } else {
      code = raw
    }
    const clean = (code ?? '').trim()
    if (!clean) return undefined
    if (typeof ts === 'number' && Date.now() - ts > TTL_MS) {
      clearStoredPromoCode()
      return undefined
    }
    return clean.slice(0, MAX_LEN)
  } catch {
    return undefined
  }
}

/** Clear the stored code (e.g. after a confirmed successful checkout). */
export function clearStoredPromoCode(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
