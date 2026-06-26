import { getRequestConfig } from 'next-intl/server'
import { IntlErrorCode } from 'next-intl'
import { cookies } from 'next/headers'

/**
 * next-intl request configuration for server-side locale resolution.
 *
 * Locale is resolved from user preferences (stored in Appwrite), NOT from
 * URL path segments. Defaults to 'en' when no preference is set.
 *
 * This config is used by the NextIntlClientProvider and server components
 * to load the appropriate message file for the user's UI language.
 *
 * IMPORTANT: Localization applies ONLY to instructional/explanatory UI elements:
 * - Onboarding screens, correction explanations, grammar notes
 * - Navigation labels, settings labels, system notifications
 * Conversation content (AI responses, user messages) is NEVER affected by i18n.
 */

/**
 * Locales that use right-to-left script direction.
 * Used to determine the HTML `dir` attribute for layout mirroring.
 */
export const RTL_LOCALES = new Set(['ar', 'ur', 'fa', 'he'])

/**
 * Returns the text direction for a given locale.
 */
export function getDirection(locale: string): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
}

// Load English messages at module level for fallback resolution
let englishMessages: Record<string, unknown> | undefined
async function getEnglishMessages(): Promise<Record<string, unknown>> {
  if (!englishMessages) {
    englishMessages = (await import(`./messages/en.json`)).default
  }
  return englishMessages
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Read the persisted uiLanguage from the NEXT_LOCALE cookie.
  // This cookie is set client-side when the user changes their UI language preference,
  // allowing the server to resolve the correct locale without client state access.
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value

  // Priority: cookie (persisted uiLanguage) → requestLocale → 'en'
  const locale = cookieLocale || (await requestLocale) || 'en'

  let messages: Record<string, unknown>
  try {
    messages = (await import(`./messages/${locale}.json`)).default
  } catch {
    // Fallback to English if the locale file doesn't exist
    messages = (await import('./messages/en.json')).default
  }

  // Load English messages for key-level fallback
  const enMessages = await getEnglishMessages()

  return {
    locale,
    messages,
    // When a specific translation key is missing in the current locale,
    // fall back to the English translation for that key (Requirement 8.4).
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        // Silently fall back — getMessageFallback handles the resolution
        return
      }
      // Log other errors for debugging
      console.error('[i18n]', error.message)
    },
    getMessageFallback({ namespace, key }) {
      // Resolve the English fallback for missing keys
      const path = namespace ? `${namespace}.${key}` : key
      const segments = path.split('.')
      let value: unknown = enMessages
      for (const segment of segments) {
        if (value && typeof value === 'object' && segment in value) {
          value = (value as Record<string, unknown>)[segment]
        } else {
          // If English also doesn't have it, return the key path
          return path
        }
      }
      return typeof value === 'string' ? value : path
    },
  }
})
