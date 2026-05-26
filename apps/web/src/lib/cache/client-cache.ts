/**
 * Client-side scenario cache — now uses hardcoded seeds only.
 *
 * Since scenarios are hardcoded in the shared package and change rarely
 * (monthly/annually), we simply return them directly with no API calls.
 * This eliminates all database reads for scenarios.
 */

import { getScenarios, type Scenario } from '@talkingo/shared/curriculum'

export interface CachedScenario {
  id: string
  title: string
  description: string
  category: string
  difficulty: number | string
  cefrRange?: string[]
  source?: 'seed'
}

// Convert shared Scenario to CachedScenario format
function convertScenario(scenario: Scenario): CachedScenario {
  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    category: scenario.category,
    difficulty: scenario.difficulty,
    source: 'seed',
  }
}

/**
 * Returns hardcoded scenarios directly — zero API calls, zero DB reads.
 * Scenarios are loaded from the shared package at build time.
 */
export async function fetchScenariosWithCache(): Promise<CachedScenario[]> {
  const scenarios = getScenarios()
  return scenarios.map(convertScenario)
}

/** No-op kept for backwards compatibility */
export function clearScenariosCache(): void {
  // No longer needed — scenarios are hardcoded
}
