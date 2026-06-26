'use client'

import { useEffect, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Sparkles, Loader2, Volume2, Copy, Check, Coffee, Users, Drama } from 'lucide-react'
import type { TargetLanguage } from '@talkingo/shared/types'
import { geminiClient } from '@/lib/api/gemini-client'
import { getLanguageMeta } from '@talkingo/shared/languages'
import { authFetch } from '@/lib/api/auth-fetch'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<Record<string, string> | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    setAlternatives(null)
    const targetName = getLanguageMeta(targetLanguage).english
    // The user may type their phrase in ANY language (their native tongue, the
    // target, or a mix). We want the answer ONLY in the target language —
    // that's what they're here to learn.
    const promptText = `A language learner wants to know how a native ${targetName} speaker would naturally express this: "${userPhrase}".${conversationContext ? ` Context: ${conversationContext}.` : ''}

The phrase above may be written in any language — understand its meaning, then give three natural ${targetName} versions. ALL output must be in ${targetName} only (never in English or any other language).

Return ONLY JSON with keys "casual", "natural", "expressive". Each value is the ${targetName} phrasing for that register.`
    // Direct fetch to chat API for native alternatives
    authFetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        userText: promptText,
        state: { talkingoLevel: 12, topic: 'general', correctionStyle: 'silent', targetLanguage },
        history: []
      }),
    })
      .then(async (res: Response) => {
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        try {
          const parsed = JSON.parse(data.aiResponse)
          setAlternatives({ casual: parsed.casual || '', natural: parsed.natural || '', expressive: parsed.expressive || '' })
        } catch {
          setAlternatives({ casual: data.aiResponse, natural: '', expressive: '' })
        }
      })
      .catch(() => setError('Could not get alternatives. Try again in a moment.'))
      .finally(() => setLoading(false))
  }, [isOpen, userPhrase, targetLanguage, conversationContext])

  const speak = (text: string) => {
    if (!text) return
    geminiClient.speak(text, { targetLanguage })
  }

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  const rows: Array<{
    key: string
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6" showCloseButton={false}>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="absolute top-4 right-4 rounded-lg z-10">
          <span className="sr-only">Close</span>
        </Button>

        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-secondary" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Say it like a native</span>
        </div>
        <h2 className="text-base font-bold mb-3 leading-snug">How a real person would phrase what you said.</h2>

        <div className="mb-5 p-3 rounded-xl bg-muted/40 border border-border/30">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">You said</p>
          <p className="text-sm italic text-foreground/80 leading-snug">&ldquo;{userPhrase}&rdquo;</p>
        </div>

        {loading && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-secondary animate-spin" />
            <p className="text-xs text-muted-foreground">Asking native speakers&hellip;</p>
          </div>
        )}

        {error && (
          <div className="py-6 text-center">
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button onClick={onClose} className="text-xs text-muted-foreground underline">
              Dismiss
            </button>
          </div>
        )}

        {alternatives && (
          <div className="space-y-3">
            {rows.map((r) => {
              const text = alternatives[r.key]
              if (!text) return null
              return (
                <div key={r.key} className={cn('p-3.5 rounded-xl border', r.tone)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(r.tone.split(' ')[0])}>{r.icon}</span>
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', r.tone.split(' ')[0])}>
                        {r.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">&mdash; {r.blurb}</span>
                    </div>
                  </div>
                  <p className="text-base font-semibold text-foreground leading-snug mb-2">&ldquo;{text}&rdquo;</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => speak(text)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card/60 border border-border/40 text-[11px] hover:border-border/60 transition-colors"
                    >
                      <Volume2 className="w-3 h-3" />
                      Speak
                    </button>
                    <button
                      onClick={() => copy(r.key, text)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card/60 border border-border/40 text-[11px] hover:border-border/60 transition-colors"
                    >
                      {copied === r.key ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
