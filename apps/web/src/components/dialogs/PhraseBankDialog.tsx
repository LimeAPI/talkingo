'use client'

/**
 * Phrase bank scrapbook — "Steal This Phrase".
 *
 * Browse phrases the user has collected from each character, replay audio,
 * favorite them. Filters: All / Favorites / per-character.
 */

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { X, Volume2, Heart, BookOpen, Quote, Filter } from 'lucide-react'
import type { TrackedPhrase, TargetLanguage } from '@talkingo/shared/types'
import { AI_PERSONAS, getPersonaById } from '@talkingo/shared/gemini/personas'
import { AvatarSVG } from '../ui/AvatarSVG'
import { geminiClient } from '@/lib/api/gemini-client'
import { loadPhrases, toggleFavorite, recordReplay } from '@/lib/storage/phrase-bank'
import { useAuth } from '@/context/AuthContext'

interface PhraseBankDialogProps {
  isOpen: boolean
  targetLanguage: TargetLanguage
  onClose: () => void
}

type Filter = 'all' | 'favorites' | string // string = personaId

export function PhraseBankDialog({ isOpen, targetLanguage, onClose }: PhraseBankDialogProps) {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [phrases, setPhrases] = useState<TrackedPhrase[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setVisible(false)
      return
    }
    setTimeout(() => setVisible(true), 30)
    setLoading(true)
    loadPhrases(user?.id ?? null, !!user, targetLanguage)
      .then((res) => setPhrases(res))
      .catch(() => setPhrases([]))
      .finally(() => setLoading(false))
  }, [isOpen, targetLanguage, user])

  const filtered = useMemo(() => {
    let list = [...phrases].reverse() // newest first
    if (filter === 'favorites') list = list.filter((p) => p.isFavorite)
    else if (filter !== 'all') list = list.filter((p) => p.characterId === filter)
    return list
  }, [phrases, filter])

  const speak = (p: TrackedPhrase) => {
    const persona = getPersonaById(p.characterId)
    geminiClient.speak(p.fullSentence, {
      voiceName: persona?.voiceName,
      targetLanguage,
    })
    recordReplay(targetLanguage, p.id)
  }

  const fav = (p: TrackedPhrase) => {
    const updated = toggleFavorite(targetLanguage, p.id)
    setPhrases(updated)
  }

  // Counts by character for filter chips
  const countsByPersona = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of phrases) m[p.characterId] = (m[p.characterId] ?? 0) + 1
    return m
  }, [phrases])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className={cn(
          'relative w-full max-w-xl max-h-[90vh] flex flex-col bg-card/95 border border-border/50 rounded-3xl shadow-2xl transition-all duration-300',
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

        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Phrase bank</span>
          </div>
          <h2 className="text-xl font-bold leading-snug">Phrases you've stolen.</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Every word the AI introduces, with the full sentence and who said it.
          </p>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 mt-4 flex-wrap">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={phrases.length} />
            <FilterChip
              active={filter === 'favorites'}
              onClick={() => setFilter('favorites')}
              label={<><Heart className="w-3 h-3 inline mr-1 fill-current" />Favorites</>}
              count={phrases.filter((p) => p.isFavorite).length}
            />
            {AI_PERSONAS.filter((p) => (countsByPersona[p.id] ?? 0) > 0).map((p) => (
              <FilterChip
                key={p.id}
                active={filter === p.id}
                onClick={() => setFilter(p.id)}
                label={p.name}
                count={countsByPersona[p.id] ?? 0}
              />
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center">
              <Quote className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                {filter === 'all' ? 'No phrases yet' : 'Nothing here'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {filter === 'all'
                  ? 'Start a conversation — every new word the AI uses gets saved here automatically.'
                  : 'Try a different filter to find your phrases.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => {
                const persona = getPersonaById(p.characterId)
                return (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl bg-card/60 border border-border/30 hover:border-border/50 transition-colors"
                  >
                    {/* Character header */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-border/40 flex-shrink-0">
                        <AvatarSVG personaId={p.characterId} size={24} />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground">{persona?.name ?? p.characterId}</span>
                      <span className="text-[10px] text-muted-foreground">said</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(p.addedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Sentence with highlighted term */}
                    <p className="text-sm leading-relaxed text-foreground mb-1">
                      {renderHighlight(p.fullSentence, p.highlightTerm)}
                    </p>

                    {/* Term + gloss */}
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-xs font-bold text-primary">{p.highlightTerm}</span>
                      <span className="text-xs text-muted-foreground">— {p.gloss}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => speak(p)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card/60 border border-border/40 text-[11px] hover:border-border/60 transition-colors"
                      >
                        <Volume2 className="w-3 h-3" /> Hear it
                      </button>
                      <button
                        onClick={() => fav(p)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors',
                          p.isFavorite
                            ? 'bg-pink-500/10 border-pink-500/40 text-pink-400'
                            : 'bg-card/60 border-border/40 hover:border-border/60'
                        )}
                      >
                        <Heart className={cn('w-3 h-3', p.isFavorite && 'fill-current')} />
                        {p.isFavorite ? 'Favorited' : 'Favorite'}
                      </button>
                      {p.replayCount > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 ml-1">
                          played {p.replayCount}×
                        </span>
                      )}
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

function FilterChip({
  active, label, onClick, count,
}: {
  active: boolean
  label: React.ReactNode
  onClick: () => void
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors',
        active
          ? 'bg-primary text-white border-primary shadow-sm'
          : 'bg-card/60 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60'
      )}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className={cn(
          'text-[10px] tabular-nums',
          active ? 'text-white/80' : 'text-muted-foreground'
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

function renderHighlight(sentence: string, term: string): React.ReactNode {
  if (!term) return sentence
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'i')
  const parts = sentence.split(re)
  return parts.map((part, i) =>
    re.test(part)
      ? <span key={i} className="font-semibold text-primary bg-primary/10 px-0.5 rounded">{part}</span>
      : <span key={i}>{part}</span>
  )
}
