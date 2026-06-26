/**
 * Heritage Persona Overlay Unit Tests
 *
 * **Validates: Requirements 7.1, 7.3**
 *
 * Tests that the heritage persona overlay system:
 * - Returns empty string when heritageMode is inactive
 * - Produces prompt augmentation with familial archetypes
 * - Enforces code-switching ratio instructions (≥30% target, ≤70% native)
 * - Uses informal register with colloquial style
 * - Does NOT act as a formal tutor
 */

import { describe, it, expect } from 'vitest'
import {
  AI_PERSONAS,
  getPersonaById,
  getHeritagePersonaOverlay,
  getHeritageOverlayForPersona,
  HERITAGE_PERSONA_OVERLAYS,
} from '@/shared/gemini/personas'
import type { TargetLanguage } from '@/shared/types'

// ─── Heritage overlay is conditional on heritageMode ─────────────────────────

describe('getHeritagePersonaOverlay', () => {
  const eli = AI_PERSONAS.find((p) => p.id === 'eli')!

  it('returns empty string when heritageMode is false', () => {
    const result = getHeritagePersonaOverlay(eli, 'ur', false)
    expect(result).toBe('')
  })

  it('returns non-empty overlay when heritageMode is true', () => {
    const result = getHeritagePersonaOverlay(eli, 'ur', true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes HERITAGE MODE header in output', () => {
    const result = getHeritagePersonaOverlay(eli, 'hi', true)
    expect(result).toContain('HERITAGE MODE')
  })

  it('includes the target language code in code-switching rules', () => {
    const result = getHeritagePersonaOverlay(eli, 'ar', true)
    expect(result).toContain('(ar)')
  })

  it('enforces ≥30% target language in code-switching instructions', () => {
    const result = getHeritagePersonaOverlay(eli, 'ur', true)
    expect(result).toContain('AT LEAST 30%')
  })

  it('enforces ≤70% native language in code-switching instructions', () => {
    const result = getHeritagePersonaOverlay(eli, 'ur', true)
    expect(result).toContain('AT MOST 70%')
  })

  it('uses informal register with colloquial style', () => {
    const result = getHeritagePersonaOverlay(eli, 'ur', true)
    expect(result).toContain('Informal register only')
    expect(result).toContain('colloquial greetings')
    expect(result).toContain('spoken sentence structures')
  })

  it('explicitly states persona is NOT a tutor', () => {
    const result = getHeritagePersonaOverlay(eli, 'pa', true)
    expect(result).toContain('NOT a language tutor')
    expect(result).toContain('NOT a teacher')
  })

  it('includes cultural idioms instruction', () => {
    const result = getHeritagePersonaOverlay(eli, 'fa', true)
    expect(result).toContain('cultural idioms')
  })
})

// ─── Archetype assignment per persona ────────────────────────────────────────

describe('getHeritageOverlayForPersona', () => {
  it('assigns grandmother archetype to Eli (warm/nurturing)', () => {
    const eli = getPersonaById('eli')!
    const overlay = getHeritageOverlayForPersona(eli)
    expect(overlay.archetype).toBe('grandmother')
  })

  it('assigns cousin archetype to Alex (young/casual)', () => {
    const alex = getPersonaById('alex')!
    const overlay = getHeritageOverlayForPersona(alex)
    expect(overlay.archetype).toBe('cousin')
  })

  it('assigns cousin archetype to Riko (young/casual)', () => {
    const riko = getPersonaById('riko')!
    const overlay = getHeritageOverlayForPersona(riko)
    expect(overlay.archetype).toBe('cousin')
  })

  it('assigns uncle archetype to Marco (authoritative/wise)', () => {
    const marco = getPersonaById('marco')!
    const overlay = getHeritageOverlayForPersona(marco)
    expect(overlay.archetype).toBe('uncle')
  })

  it('assigns uncle archetype to Dr. Luma (authoritative)', () => {
    const drLuma = getPersonaById('dr-luma')!
    const overlay = getHeritageOverlayForPersona(drLuma)
    expect(overlay.archetype).toBe('uncle')
  })

  it('assigns family-friend archetype to Sofia', () => {
    const sofia = getPersonaById('sofia')!
    const overlay = getHeritageOverlayForPersona(sofia)
    expect(overlay.archetype).toBe('family-friend')
  })

  it('always returns informal register', () => {
    for (const persona of AI_PERSONAS) {
      const overlay = getHeritageOverlayForPersona(persona)
      expect(overlay.register).toBe('informal')
    }
  })

  it('always enables cultural idioms', () => {
    for (const persona of AI_PERSONAS) {
      const overlay = getHeritageOverlayForPersona(persona)
      expect(overlay.culturalIdioms).toBe(true)
    }
  })

  it('uses explanatory code-switch style for grandmother archetype', () => {
    const eli = getPersonaById('eli')!
    const overlay = getHeritageOverlayForPersona(eli)
    expect(overlay.codeSwitchStyle).toBe('explanatory')
  })

  it('uses natural code-switch style for non-grandmother archetypes', () => {
    const alex = getPersonaById('alex')!
    const overlay = getHeritageOverlayForPersona(alex)
    expect(overlay.codeSwitchStyle).toBe('natural')
  })
})

// ─── Archetype labels appear in prompt output ────────────────────────────────

describe('Heritage overlay prompt includes archetype identity', () => {
  it('includes grandmother-like names for Eli', () => {
    const eli = getPersonaById('eli')!
    const result = getHeritagePersonaOverlay(eli, 'ur', true)
    expect(result).toContain('grandmother')
    expect(result).toContain('Dadi')
  })

  it('includes cousin-like names for Alex', () => {
    const alex = getPersonaById('alex')!
    const result = getHeritagePersonaOverlay(alex, 'hi', true)
    expect(result).toContain('cousin')
    expect(result).toContain('Bhai/Baji')
  })

  it('includes uncle-like names for Marco', () => {
    const marco = getPersonaById('marco')!
    const result = getHeritagePersonaOverlay(marco, 'ar', true)
    expect(result).toContain('uncle')
    expect(result).toContain('Chacha')
  })

  it('includes family-friend names for Sofia', () => {
    const sofia = getPersonaById('sofia')!
    const result = getHeritagePersonaOverlay(sofia, 'tl', true)
    expect(result).toContain('family friend')
    expect(result).toContain('Aunty-ji')
  })
})

// ─── HERITAGE_PERSONA_OVERLAYS constant ──────────────────────────────────────

describe('HERITAGE_PERSONA_OVERLAYS', () => {
  it('contains all four archetype variants', () => {
    const archetypes = HERITAGE_PERSONA_OVERLAYS.map((o) => o.archetype)
    expect(archetypes).toContain('uncle')
    expect(archetypes).toContain('grandmother')
    expect(archetypes).toContain('cousin')
    expect(archetypes).toContain('family-friend')
  })

  it('all overlays use informal register', () => {
    for (const overlay of HERITAGE_PERSONA_OVERLAYS) {
      expect(overlay.register).toBe('informal')
    }
  })

  it('all overlays enable cultural idioms', () => {
    for (const overlay of HERITAGE_PERSONA_OVERLAYS) {
      expect(overlay.culturalIdioms).toBe(true)
    }
  })
})
