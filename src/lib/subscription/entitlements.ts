/**
 * Entitlements — single source of truth for what a user is allowed to access.
 *
 * The free-tier limits (levels, personas, modes) live in `free-tier.ts`. This
 * module layers the *subscription* on top so callers don't have to repeat the
 * `isSubscribed(...) && isXAllowed(...)` dance at every call site. Subscribed
 * users are unrestricted; free users are held to the FREE_TIER caps.
 *
 * Design notes:
 * - These are pure, side-effect-free reads. They NEVER mutate stored prefs.
 * - Level/persona are enforced at the session boundary (see ConversationPage),
 *   so no matter how a value was seeded (onboarding, sync, a lapsed plan), the
 *   engine can never run above the free cap or with a premium tutor.
 */

import type { PersonaId } from '@talkingo/shared/types'
import { isSubscribed } from './use-subscription'
import { FREE_TIER, isPersonaAllowed, isModeAllowed, isLevelAllowed } from './free-tier'

/** Highest level the user may access. Subscribed → all 12; free → the cap. */
export function getMaxLevel(userId?: string | null): number {
  return isSubscribed(userId) ? 12 : FREE_TIER.MAX_LEVEL
}

/** Clamp an arbitrary level into the range this user may actually access. */
export function capLevelForUser(userId: string | null | undefined, level: number | undefined): number {
  const n = Math.round(level ?? 1)
  return Math.max(1, Math.min(getMaxLevel(userId), Number.isFinite(n) ? n : 1))
}

/** True when the user may access the given level. */
export function isLevelAllowedForUser(userId: string | null | undefined, level: number): boolean {
  return isSubscribed(userId) || isLevelAllowed(level)
}

/** True when the user may talk to the given persona. */
export function isPersonaAllowedForUser(userId: string | null | undefined, persona: string): boolean {
  return isSubscribed(userId) || isPersonaAllowed(persona)
}

/** True when the user may use the given conversation mode. */
export function isModeAllowedForUser(userId: string | null | undefined, mode: string): boolean {
  return isSubscribed(userId) || isModeAllowed(mode)
}

// Free-tier fallback tutor — Eli (warm, patient), the app's default persona.
const FREE_PERSONA_GENTLE: PersonaId = 'eli'

/**
 * Resolve a persona the user is actually allowed to use.
 *
 * Subscribed users (or a free user whose desired persona is already allowed)
 * keep their choice. Otherwise we map to the default free-tier tutor so the
 * experience still works instead of hard-blocking them. This is a read-only
 * resolution — it does not persist anything.
 */
export function resolveAllowedPersona(
  userId: string | null | undefined,
  desired: PersonaId | undefined,
): PersonaId {
  if (isSubscribed(userId)) return desired ?? FREE_PERSONA_GENTLE
  if (desired && isPersonaAllowed(desired)) return desired
  return FREE_PERSONA_GENTLE
}
