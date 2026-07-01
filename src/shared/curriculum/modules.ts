// ─── Learning Modules (deprecated) ─────────────────────────────────────────
// Seeds are now organized by level directly.
// MODULES remains empty; LearnScreen no longer iterates over modules.

export interface LearningModule {
  id: string
  title: string
  description: string
  grammar: string
  levelRange: [number, number]
  seedIds: string[]
}

/** @deprecated Seeds are organized by level — use getSeedsByLevel() instead. */
export const MODULES: LearningModule[] = []

/** @deprecated No modules exist — use getSeedsByLevel() instead. */
export function getModuleForSeed(_seedId: string): LearningModule | undefined {
  return undefined
}

/** @deprecated No modules exist — use getSeedsByLevel() instead. */
export function getModuleById(_id: string): LearningModule | undefined {
  return undefined
}
