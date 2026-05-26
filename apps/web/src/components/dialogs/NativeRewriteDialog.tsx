'use client'

/**
 * "Say it like a native" — tapping a user message opens this dialog and
 * shows three native rewrites of the same idea across casual / natural /
 * expressive registers.
 */

import { useEffect, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Sparkles, X, Loader2, Volume2, Copy, Check, Coffee, Users, Drama } from 'lucide-react'
import type { RegisterAlternatives, TargetLanguage } from '@talkingo/shared/types'
import { geminiClient } from '@/lib/api/gemini-client'

interface NativeRewriteDialogProps {
  isOpen: boolean
  userPhrase: string
  conversationContext?: string
  targetLanguage: TargetLanguage
  onClose: () => void
}

export function NativeRewriteDialog({
  isOpen,
  userPhrase,
  conversationContext,
  targetLanguage,
  onClose,
}: NativeRewriteDialogProps) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<RegisterAlternatives | null>(null)
  const [copied, setCopied] = useState<keyof RegisterAlternatives | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setVisible(false)
      return
    }
    setTimeout(() => setVisible(true), 30)
    setLoading(true)
    setError(null)
    setAlternatives(null)
    geminiClient
      .getRegisterAlternatives(userPhrase, targetLanguage, conversationContext)
      .then((res) => setAlternatives(res))
      .catch(() => setError('Could not get alternatives. Try again in a moment.'))
      .finally(() => setLoading(false))
  }, [isOpen, userPhrase, targetLanguage, conversationContext])

  if (!isOpen) return null

  const speak = (text: string) => {
    if (!text) return
    geminiClient.speak(text, { targetLanguage })
  }

  const copy = async (key: keyof RegisterAlternatives, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  const rows: Array<{
    key: keyof RegisterAlternatives
    label: string
    blurb: string
    tone: string
    icon: React.ReactNode
  }> = [
    { key: 'casual',     label: 'Casual',     blurb: 'To a close friend',              tone: 'text-pink-400 border-pink-500/30 bg-pink-500/5',     icon: <Coffee className="w-3.5 h-3.5" /> },
    { key: 'natural',    label: 'Natural',    blurb: "To someone you don't know well", tone: 'text-blue-400 border-blue-500/30 bg-blue-500/5',     icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'expressive', label: 'Expressive', blurb: 'To be funny or dramatic',        tone: 'text-amber-400 border-amber-500/30 bg-amber-500/5', icon: <Drama className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className={cn(
          'relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-card/95 border border-border/50 rounded-3xl shadow-2xl transition-all duration-300',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-muted/50 flex items-center justify-center transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-foreground/70" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Say it like a native</span>
          </div>
          <h2 className="text-base font-bold mb-3 leading-snug">How a real person would phrase what you said.</h2>

          <div className="mb-5 p-3 rounded-xl bg-muted/40 border border-border/30">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">You said</p>
            <p className="text-sm italic text-foreground/80 leading-snug">"{userPhrase}"</p>
          </div>

          {loading && (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-secondary animate-spin" />
              <p className="text-xs text-muted-foreground">Asking native speakers…</p>
            </div>
          )}

          {error && (
            <div className="py-6 text-center">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button
                onClick={onClose}
                className="text-xs text-muted-foreground underline"
              >Dismiss</button>
            </div>
          )}

          {alternatives && (
            <div className="space-y-3">
              {rows.map((r) => {
                const text = alternatives[r.key]
                if (!text) return null
                return (
                  <div
                    key={r.key}
                    className={cn('p-3.5 rounded-xl border', r.tone)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(r.tone.split(' ')[0])}>{r.icon}</span>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', r.tone.split(' ')[0])}>
                          {r.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">— {r.blurb}</span>
                      </div>
                    </div>
                    <p className="text-base font-semibold text-foreground leading-snug mb-2">"{text}"</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => speak(text)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card/60 border border-border/40 text-[11px] hover:border-border/60 transition-colors"
                      >
                        <Volume2 className="w-3 h-3" /> Hear it
                      </button>
                      <button
                        onClick={() => copy(r.key, text)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card/60 border border-border/40 text-[11px] hover:border-border/60 transition-colors"
                      >
                        {copied === r.key
                          ? (<><Check className="w-3 h-3 text-green-400" /> Copied</>)
                          : (<><Copy className="w-3 h-3" /> Copy</>)}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
