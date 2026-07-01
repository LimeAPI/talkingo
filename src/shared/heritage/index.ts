import type { TargetLanguage, HeritageLanguage } from '../types'

export interface HeritageConfig {
  supportedLanguages: HeritageLanguage[]
  codeSwitchRatio: { targetMin: 0.30; nativeMax: 0.70 }
  personaOverlays: HeritagePersonaOverlay[]
}

export interface HeritagePersonaOverlay {
  archetype: 'uncle' | 'grandmother' | 'cousin' | 'family-friend'
  register: 'informal'
  codeSwitchStyle: 'natural' | 'explanatory'
  culturalIdioms: boolean
}

export const HERITAGE_LANGUAGES: HeritageLanguage[] = [
  'ur', 'hi', 'ar', 'pa', 'fa', 'tl', 'el', 'he', 'pt'
]

export function isHeritageSupported(lang: TargetLanguage): boolean {
  return HERITAGE_LANGUAGES.includes(lang as HeritageLanguage)
}
