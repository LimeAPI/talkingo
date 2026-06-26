/**
 * Curriculum — 300 seeds across 12 levels, spiral curriculum design.
 *
 * The Talkingo Journey:
 * 🌱 First Words (L1) → 🔨 Building Blocks (L2) → 🛡️ Survival Mode (L3)
 * → 🔍 Daily Explorer (L4) → 💬 Conversation Ready (L5) → 🎯 Confident Talker (L6)
 * → 🎤 Confident Speaker (L7) → 🚀 Advanced Talker (L8)
 * → 🌌 Almost Native (L9) → 👑 Expert Speaker (L10)
 * → 🎯 Precision Speaker (L11) → ✨ Mastery (L12)
 *
 * Each seed is language-agnostic — the AI executes it IN the target language.
 */

// ─── New Curriculum System ───────────────────────────────────────────────

export { type ConversationSeed } from './types'

export {
  SEEDS,
  getSeedsByLevel,
  getSeedsByGrammar,
  getSeedById,
  getSpiralGroup,
} from './helpers'

// Modules deprecated — seeds organized by level directly.
// export { type LearningModule, MODULES, getModuleForSeed, getModuleById } from './modules'

import { SEEDS } from './helpers'
import type { ConversationSeed } from './types'

// ─── Starting Seed Logic ─────────────────────────────────────────────────

export function getStartingSeedForLevel(
  level: number | 'beginner' | 'intermediate' | 'advanced'
): ConversationSeed {
  let targetLevel: number
  if (typeof level === 'string') {
    if (level === 'beginner') targetLevel = 1
    else if (level === 'intermediate') targetLevel = 5
    else targetLevel = 7
  } else {
    targetLevel = level
  }
  const match = SEEDS.find((s) => s.level === targetLevel)
  return match ?? SEEDS[0]
}

// ─── Scenario System (conversation-first approach) ────────────────────────

/**
 * User-friendly scenario representation for the UI.
 * All seeds become selectable conversation topics.
 */
export interface Scenario {
  id: string
  title: string
  description: string  // Use seed's blurb
  category: string     // Direct from seed.category
  difficulty: string   // Level number as string
}

/**
 * Free Talk mode - no scenario constraints
 */
export const FREE_TALK_SCENARIO: Scenario = {
  id: 'free-talk',
  title: 'Free Conversation',
  description: 'Chat about whatever comes to mind. No topic restrictions.',
  category: 'Free Talk',
  difficulty: 'All levels',
}

/**
 * Convert all seeds to user-friendly scenarios for display.
 * Each seed becomes a scenario with its level as difficulty.
 */
export function getScenarios(): Scenario[] {
  return [
    FREE_TALK_SCENARIO,
    ...SEEDS.map((seed) => ({
      id: seed.id,
      title: seed.title,
      description: seed.blurb,
      category: seed.category,
      difficulty: `${seed.level}`,
    })),
  ]
}
