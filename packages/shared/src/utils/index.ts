import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { CefrLevel, LanguageLevel, DomainScores, SkillDomain } from '../types'
import { DEFAULT_DOMAIN_SCORES } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Consistent CEFR to LanguageLevel mapping used throughout the application.
 * Ensures A1/A2 → beginner, B1/B2 → intermediate, C1/C2 → advanced
 */
export function cefrToLanguageLevel(cefr: CefrLevel): LanguageLevel {
  if (cefr === 'A1' || cefr === 'A2') return 'beginner'
  if (cefr === 'B1' || cefr === 'B2') return 'intermediate'
  return 'advanced' // C1 or C2
}

/**
 * Generate domain scores for a given CEFR level.
 * All domains are set to the same level for consistency.
 */
export function generateDomainScores(cefr: CefrLevel): DomainScores {
  return {
    vocabulary: cefr,
    grammar: cefr,
    fluency: cefr,
    listening: cefr,
  }
}

/**
 * Get overall CEFR from domain scores by finding the median/average level.
 * Returns the most common level, or the middle value if there's variation.
 */
export function getOverallCefrFromDomains(domainScores: DomainScores): CefrLevel {
  const levels: CefrLevel[] = [
    domainScores.vocabulary,
    domainScores.grammar,
    domainScores.fluency,
    domainScores.listening,
  ]
  
  const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  
  // Calculate average index
  const avgIndex = levels.reduce((sum, level) => sum + CEFR_ORDER.indexOf(level), 0) / levels.length
  
  // Round to nearest level
  const roundedIndex = Math.round(avgIndex)
  return CEFR_ORDER[Math.min(Math.max(roundedIndex, 0), CEFR_ORDER.length - 1)]
}

/**
 * Validate that CEFR level and LanguageLevel are consistent.
 * Returns true if they match, false otherwise.
 */
export function validateCefrLevelConsistency(cefr: CefrLevel, level: LanguageLevel): boolean {
  const expectedLevel = cefrToLanguageLevel(cefr)
  return expectedLevel === level
}
