'use client'

import { cn } from '@talkingo/shared/utils'
import { getPersonaById } from '@talkingo/shared/gemini/personas'

interface AvatarSVGProps {
  personaId: string
  className?: string
  size?: number
}

export function AvatarSVG({ personaId, className, size = 120 }: AvatarSVGProps) {
  const persona = getPersonaById(personaId)
  
  if (!persona) {
    // Fallback to Eli if persona not found
    return (
      <img
        src="https://api.dicebear.com/9.x/notionists/svg?seed=eli-warm-teacher"
        alt="AI Avatar"
        className={className}
        width={size}
        height={size}
      />
    )
  }

  const dicebearUrl = `https://api.dicebear.com/9.x/${persona.dicebearStyle}/svg?seed=${persona.dicebearSeed}`

  return (
    <img
      src={dicebearUrl}
      alt={`${persona.name} avatar`}
      className={className}
      width={size}
      height={size}
    />
  )
}
