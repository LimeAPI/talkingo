'use client'

import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import type { MicErrorKind } from '@/lib/api/gemini-client'

interface MicErrorToastProps {
  kind: MicErrorKind | null
  detail?: string
  onDismiss: () => void
}

const COPY: Record<MicErrorKind, { title: string; body: string }> = {
  unsupported: {
    title: 'Mic not supported',
    body: 'Your browser does not support speech recognition. Try Chrome, Edge, or Safari.',
  },
  'insecure-context': {
    title: 'Secure connection required',
    body: 'Microphone needs HTTPS. Use localhost or deploy with HTTPS.',
  },
  'permission-denied': {
    title: 'Microphone blocked',
    body: 'You denied mic access. Click the lock icon in your address bar to allow it, then try again.',
  },
  'no-microphone': {
    title: 'No microphone found',
    body: 'We can\'t find a working microphone. Plug one in and try again.',
  },
  network: {
    title: 'Speech network error',
    body: 'Speech recognition lost connection. Tap the mic to try again.',
  },
  'language-unsupported': {
    title: 'Language not supported by your browser',
    body: 'Speech recognition for the selected language is not available in this browser. Try Chrome on desktop, or pick a different language.',
  },
  unknown: {
    title: 'Microphone error',
    body: 'Something went wrong with the mic. Tap it to try again.',
  },
}

export function MicErrorToast({ kind, detail, onDismiss }: MicErrorToastProps) {
  // auto-dismiss for transient errors
  useEffect(() => {
    if (!kind) return
    if (kind === 'network' || kind === 'unknown') {
      const t = setTimeout(onDismiss, 6000)
      return () => clearTimeout(t)
    }
  }, [kind, onDismiss])

  if (!kind) return null
  const copy = COPY[kind]

  return (
    <div
      className={cn(
        'fixed top-20 left-1/2 -translate-x-1/2 z-[60]',
        'max-w-md w-[calc(100vw-2rem)] rounded-2xl',
        'bg-amber-500/15 border border-amber-500/40 backdrop-blur-md shadow-xl'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-100">{copy.title}</p>
          <p className="text-xs text-amber-100/80 mt-1 leading-relaxed">{copy.body}</p>
          {detail && (
            <p className="text-[10px] text-amber-100/50 mt-1 font-mono">code: {detail}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="w-6 h-6 rounded-md hover:bg-amber-500/20 flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-amber-200" />
        </button>
      </div>
    </div>
  )
}
