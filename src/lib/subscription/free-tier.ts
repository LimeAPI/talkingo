/**
 * Free Tier Configuration & Usage Tracking
 *
 * Free users get a taste of the app — enough to feel the magic,
 * not enough to learn seriously. The goal: demonstrate value, then convert.
 *
 * Gated features:
 * - Messages: 50 total (lifetime — does NOT reset)
 * - Personas: Eli + Alex only (4 locked)
 * - Levels: 1-4 only (8 locked)
 * - Modes: Chat only (handsfree + live call locked)
 * - Voice recording: Locked (can listen to AI voice notes, can't record)
 * - Session recap: Basic (encouragement + corrections only, no vocab/native-would-say)
 * - Phrase bank: Locked
 *
 * Free features (to hook them):
 * - Corrections (inline) ✅
 * - Teaching cards (corrections only) ✅
 * - AI voice notes (listen) ✅
 * - Onboarding assessment ✅ (does NOT count toward the limit)
 * - 2 personas ✅
 * - Levels 1-4 ✅
 */

// ─── Limits ──────────────────────────────────────────────────────────────────

export const FREE_TIER = {
  /** Max user messages for the lifetime of a free account (never resets) */
  LIFETIME_MESSAGES: 50,
  /** Allowed personas (IDs) */
  ALLOWED_PERSONAS: ['eli', 'alex'] as string[],
  /** Max level accessible */
  MAX_LEVEL: 4,
  /**
   * Allowed interaction modes. Only 'manual' (text chat) is free; voice
   * modes are gated behind a paid plan. The 'handsfree' / 'live' / 'native'
   * modes are enforced at the call site via `isModeAllowed()`.
   */
  ALLOWED_MODES: ['manual'] as string[],
  /**
   * Free users can listen to AI voice notes but cannot record their own
   * voice (mic capture is gated by the ALLOWED_MODES check above). Keeping
   * the flag as a single source of truth in case we need to flip it later.
   */
  VOICE_RECORDING: false,
  /** Whether phrase bank is accessible */
  PHRASE_BANK: false,
  /** Whether full recap is shown (vocab, native-would-say, planted phrase) */
  FULL_RECAP: false,
} as const

// ─── Usage Tracking (localStorage) — LIFETIME, never resets ──────────────────

const USAGE_KEY = 'talkingo_free_usage'

interface LifetimeUsage {
  /** When the user first sent a message (informational only) */
  since: string // YYYY-MM-DD
  messageCount: number
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function getUsageKey(userId?: string | null): string {
  return userId ? `${USAGE_KEY}_${userId}` : USAGE_KEY
}

export function getDailyUsage(userId?: string | null): LifetimeUsage {
  if (typeof window === 'undefined') return { since: getTodayKey(), messageCount: 0 }
  try {
    const stored = localStorage.getItem(getUsageKey(userId))
    if (!stored) return { since: getTodayKey(), messageCount: 0 }
    const usage = JSON.parse(stored) as Partial<LifetimeUsage> & { date?: string }
    // Backward-compat: old records used { date, messageCount } and reset daily.
    // We carry the count forward as a lifetime total (no reset).
    return {
      since: usage.since ?? usage.date ?? getTodayKey(),
      messageCount: usage.messageCount ?? 0,
    }
  } catch {
    return { since: getTodayKey(), messageCount: 0 }
  }
}

export function incrementMessageCount(userId?: string | null): LifetimeUsage {
  const usage = getDailyUsage(userId)
  const updated: LifetimeUsage = {
    since: usage.since,
    messageCount: usage.messageCount + 1,
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(getUsageKey(userId), JSON.stringify(updated))
  }
  return updated
}

export function getRemainingMessages(userId?: string | null): number {
  const usage = getDailyUsage(userId)
  return Math.max(0, FREE_TIER.LIFETIME_MESSAGES - usage.messageCount)
}

export function hasReachedDailyLimit(userId?: string | null): boolean {
  return getRemainingMessages(userId) <= 0
}

// ─── Feature Checks ─────────────────────────────────────────────────────────

export function isPersonaAllowed(personaId: string): boolean {
  return FREE_TIER.ALLOWED_PERSONAS.includes(personaId)
}

export function isModeAllowed(mode: string): boolean {
  return FREE_TIER.ALLOWED_MODES.includes(mode)
}

export function isLevelAllowed(level: number): boolean {
  return level <= FREE_TIER.MAX_LEVEL
}
