/**
 * Client-side locale cookie management.
 *
 * The NEXT_LOCALE cookie bridges the gap between client-side user preferences
 * (stored in Appwrite) and server-side locale resolution (needed by next-intl).
 *
 * When the user changes their uiLanguage preference, this cookie is set so that
 * on subsequent page loads the server can immediately resolve the correct locale
 * without waiting for client-side hydration.
 *
 * The cookie is long-lived (1 year) and path-scoped to '/' so it's sent with
 * every request. This ensures localized UI is applied immediately on load
 * (Requirement 8.8) without re-selection.
 */

const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60 // 1 year

/**
 * Set the UI locale cookie. Call this whenever the user's uiLanguage preference
 * changes. The next server render will pick up the new locale automatically.
 *
 * @param locale - ISO 639-1 language code (e.g., 'en', 'ar', 'fr')
 */
export function setLocaleCookie(locale: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}

/**
 * Read the current locale from the cookie.
 * Returns undefined if no cookie is set.
 */
export function getLocaleCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE_NAME}=([^;]*)`)
  )
  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * Remove the locale cookie (revert to default 'en').
 */
export function clearLocaleCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`
}
