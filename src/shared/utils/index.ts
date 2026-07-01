import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { LanguageLevel } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Talkingo level (1-12) to coarse LanguageLevel.
 * 1-4 → beginner, 5-8 → intermediate, 9-12 → advanced
 */
export function talkingoLevelToLanguageLevel(level: number): LanguageLevel {
  if (level <= 4) return 'beginner'
  if (level <= 8) return 'intermediate'
  return 'advanced'
}


export function sanitizeRedirectPath(
  redirect: string | null | undefined,
  fallback: string = '/'
): string {
  if (!redirect) return fallback
  const v = redirect.trim()
  if (!v.startsWith('/')) return fallback
  if (v.startsWith('//')) return fallback
  if (v.includes('://')) return fallback
  if (v.includes('\\')) return fallback
  if (v.includes('\n') || v.includes('\r')) return fallback
  return v
}
