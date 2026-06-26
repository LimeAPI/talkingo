'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@talkingo/shared/utils'
import {
  BookOpen, Search,
  Filter, Sparkles,
  Flame, Clock, Zap, TrendingUp,
  ChevronDown, Circle,
  GraduationCap, Hash,
} from 'lucide-react'
import { Starfield } from '@/components/ui/orbital'
import { AvatarSVG } from '@/components/ui/AvatarSVG'
import { getPersonaById } from '@talkingo/shared/gemini/personas'
import { GRAMMAR_TAGS, getGrammarTagGroups } from '@talkingo/shared/curriculum/grammar-tags'
import type { GrammarTag } from '@talkingo/shared/curriculum/grammar-tags'
import { getCompletedLessons, getCompletedLessonsWithQuality } from '@/lib/storage/lesson-progress'
import type { LessonQuality, CompletedLessonsRecord } from '@/lib/storage/lesson-progress'
import type {
  LanguageProgress, UserPreferences,
} from '@talkingo/shared/types'
import { fetchScenariosWithCache, type CachedScenario } from '@/lib/cache/client-cache'

interface LearnScreenProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userId: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  onOpenPhraseBank?: () => void
  onReassess?: () => void
}

type LevelFilter = 'all' | number

const LEVEL_RANGES: LevelFilter[] = ['all', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  2: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:text-emerald-400',
  3: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  4: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:text-emerald-400',
  5: 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400',
  6: 'bg-blue-500/10 text-blue-500 border-blue-500/20 dark:text-blue-400',
  7: 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400',
  8: 'bg-blue-500/10 text-blue-500 border-blue-500/20 dark:text-blue-400',
  9: 'bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400',
  10: 'bg-purple-500/10 text-purple-500 border-purple-500/20 dark:text-purple-400',
  11: 'bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400',
  12: 'bg-purple-500/10 text-purple-500 border-purple-500/20 dark:text-purple-400',
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'First Words',
  2: 'Building Blocks',
  3: 'Survival Mode',
  4: 'Daily Explorer',
  5: 'Conversation Ready',
  6: 'Confident Talker',
  7: 'Confident Speaker',
  8: 'Advanced Talker',
  9: 'Almost Native',
  10: 'Expert Speaker',
  11: 'Precision Speaker',
  12: 'Mastery',
}

function formatMinutes(m: number) {
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function getPersonaName(id?: string) {
  return getPersonaById(id ?? '')?.name ?? 'Your tutor'
}

function getDifficultyBadge(level: number) {
  const colorClass = LEVEL_COLORS[level] || 'bg-muted text-muted-foreground border-border/30'
  return { label: `Level ${level}`, colorClass }
}

type FilteredLevel = {
  level: number
  filtered: CachedScenario[]
  completed: number
  total: number
  searchMatch: boolean
  levelMatch: boolean
}

function getPhaseForLevel(level: number) {
  if (level >= 1 && level <= 3) return 'Foundation'
  if (level >= 4 && level <= 6) return 'Building'
  if (level >= 7 && level <= 9) return 'Fluency'
  return 'Mastery'
}

function PhaseBasedJourney({
  filteredLevels,
  expandedLevels,
  toggleLevel,
  completedLessons,
  completedLessonsQuality,
  onStartSession,
  getDifficultyBadge,
  totalCompleted,
  totalSeeds,
  allMatchCount,
}: {
  filteredLevels: FilteredLevel[]
  expandedLevels: Set<number>
  toggleLevel: (lvl: number) => void
  completedLessons: string[]
  completedLessonsQuality: CompletedLessonsRecord
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  getDifficultyBadge: (level: number) => { label: string; colorClass: string }
  totalCompleted: number
  totalSeeds: number
  allMatchCount: number
}) {
  const phases = useMemo(() => {
    const order = ['Foundation', 'Building', 'Fluency', 'Mastery'] as const
    const map = new Map<string, FilteredLevel[]>()
    for (const g of filteredLevels) {
      const phase = getPhaseForLevel(g.level)
      if (!map.has(phase)) map.set(phase, [])
      map.get(phase)!.push(g)
    }
    return order
      .map((p) => ({ phase: p, levels: (map.get(p) ?? []).sort((a, b) => a.level - b.level) }))
      .filter((x) => x.levels.length > 0)
  }, [filteredLevels])

  const getPhaseMeta = (phase: string) => {
    switch (phase) {
      case 'Foundation':
        return { tint: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', icon: GraduationCap }
      case 'Building':
        return { tint: 'bg-accent/10 border-accent/20 text-accent', icon: Zap }
      case 'Fluency':
        return { tint: 'bg-blue-500/10 border-blue-500/20 text-blue-400', icon: Sparkles }
      case 'Mastery':
        return { tint: 'bg-purple-500/10 border-purple-500/20 text-purple-400', icon: TrendingUp }
      default:
        return { tint: 'bg-card border-border/40 text-foreground/50', icon: BookOpen }
    }
  }

  const getNextIndex = (filtered: CachedScenario[]) => {
    const doneSet = new Set(completedLessons)
    const idx = filtered.findIndex((s) => !doneSet.has(s.id))
    return idx
  }


  return (
    <div className="space-y-4">
      {phases.map(({ phase, levels }) => {
        const meta = getPhaseMeta(phase)
        const phaseTotals = levels.reduce(
          (acc, l) => {
            acc.completed += l.completed
            acc.total += l.total
            return acc
          },
          { completed: 0, total: 0 }
        )
        const phasePercent = phaseTotals.total > 0 ? Math.round((phaseTotals.completed / phaseTotals.total) * 100) : 0

        return (
          <motion.section
            key={phase}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="surface-card"
          >
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <span className={cn('w-9 h-9 rounded-xl border flex items-center justify-center', meta.tint)}>
                  {meta.icon && <meta.icon className="w-4 h-4" />}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-foreground">{phase}</h3>
                    <span className="text-[10px] text-foreground/60 font-semibold">
                      {phaseTotals.completed}/{phaseTotals.total} complete
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/40 text-foreground/50 bg-card">
                      {phasePercent}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 h-1 rounded-full bg-border/20 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    phasePercent === 100 ? 'bg-emerald-400' : 'bg-primary/50'
                  )}
                  style={{ width: `${phasePercent}%` }}
                />
              </div>
            </div>

            <div className="px-2 pb-2 space-y-2">
              {levels.map(({ level, filtered, completed, total }) => {
                const isExpanded = expandedLevels.has(level)
                const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0
                const levelLabel = LEVEL_LABELS[level] ?? `Level ${level}`
                const badge = getDifficultyBadge(level)

                return (
                  <motion.div
                    key={level}
                    className="rounded-lg border border-border/20 bg-card/60"
                    initial={false}
                    animate={false}
                  >
                    <button
                      onClick={() => toggleLevel(level)}
                      className="w-full text-left px-4 py-3.5 hover:bg-card-elevated/40 transition-colors rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 mt-0.5 text-secondary">
                          <GraduationCap className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-foreground">Level {level} &mdash; {levelLabel}</h3>
                            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-semibold', badge.colorClass)}>
                              Lvl {level}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="relative w-9 h-9">
                            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-border/40" />
                              <circle
                                cx="18"
                                cy="18"
                                r="15"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeDasharray={`${(percentComplete / 100) * 94.2} 94.2`}
                                className={cn(
                                  'transition-all duration-700',
                                  percentComplete === 100 ? 'text-emerald-400' : 'text-primary'
                                )}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-foreground">
                              {completed}/{total}
                            </span>
                          </div>
                          <ChevronDown className={cn('w-4 h-4 text-foreground/40 transition-transform duration-200', isExpanded && 'rotate-180')} />
                        </div>
                      </div>

                      <div className="mt-2.5 h-1 rounded-full bg-border/20 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-700',
                            percentComplete === 100 ? 'bg-emerald-400' : 'bg-primary/50'
                          )}
                          style={{ width: `${percentComplete}%` }}
                        />
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-2 border-t border-border/20 rounded-b-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[10px] text-foreground/50 font-semibold">Scenario path</div>
                              <div className="text-[10px] text-foreground/40">
                                {completed}/{total} done
                              </div>
                            </div>

                            <div className="space-y-1.5 mt-1">
                              {(() => {
                                const nextIdx = getNextIndex(filtered)
                                return filtered.map((scenario: CachedScenario, idx: number) => {
                                  const isDone = completedLessons.includes(scenario.id)
                                  const scenarioLevel = parseInt(String(scenario.difficulty), 10) || 1
                                  const sBadge = getDifficultyBadge(scenarioLevel)
                                  const isNext = !isDone && idx === nextIdx

                                  return (
                                    <button
                                      key={scenario.id}
                                      onClick={() => onStartSession(scenario.id, 'new')}
                                      className={cn(
                                        'w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all hover:shadow-[0_0_15px_-6px_hsl(var(--primary)/0.06)]',
                                        isDone
                                          ? 'bg-emerald-500/5 border-emerald-500/15 hover:border-emerald-500/30'
                                          : isNext
                                            ? 'bg-primary/5 border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.20),0_0_18px_-10px_hsl(var(--primary)/0.40)] hover:border-primary/70'
                                            : 'bg-card/80 border-border/40 hover:border-primary/30 hover:bg-card-elevated'
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          'w-7 h-7 rounded-md border flex items-center justify-center flex-shrink-0',
                                          isDone
                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                            : 'border-border/40 bg-card text-foreground/40'
                                        )}
                                      >
                                        <span className="text-[10px] font-bold">{idx + 1}</span>
                                      </div>

                                      {isDone ? (
                                        (() => {
                                          const quality = completedLessonsQuality[scenario.id]
                                          const corrections = quality?.totalCorrections ?? 0
                                          // Green: 0-2, Yellow: 3-5, Orange: 6+
                                          const dotColor = corrections <= 2
                                            ? 'bg-emerald-400'
                                            : corrections <= 5
                                              ? 'bg-yellow-400'
                                              : 'bg-orange-400'
                                          return (
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              <span className={cn('w-3 h-3 rounded-full flex-shrink-0', dotColor)} />
                                              {corrections > 0 && (
                                                <span className="text-[9px] font-semibold text-foreground/50">
                                                  {corrections}
                                                </span>
                                              )}
                                            </div>
                                          )
                                        })()
                                      ) : (
                                        <Circle className="w-4 h-4 text-foreground/30 flex-shrink-0" />
                                      )}

                                      <span
                                        className={cn(
                                          'flex-1 text-xs font-semibold min-w-0',
                                          isDone ? 'text-foreground/60' : 'text-foreground'
                                        )}
                                      >
                                        {scenario.title}
                                      </span>

                                      <span
                                        className={cn(
                                          'text-[8px] px-1.5 py-0.5 rounded-full border font-bold flex-shrink-0',
                                          isDone ? 'opacity-50' : '',
                                          sBadge.colorClass
                                        )}
                                      >
                                        {sBadge.label}
                                      </span>
                                    </button>
                                  )
                                })
                              })()}
                            </div>

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </motion.section>
        )
      })}

      <p className="text-center text-[10px] text-foreground/30 pt-2 font-medium">
        {totalCompleted}/{totalSeeds} completed &middot; {allMatchCount} topics shown
      </p>
    </div>
  )
}

export function LearnScreen({ preferences, progress, userId, onStartSession, onOpenPhraseBank, onReassess }: LearnScreenProps) {
  const userLevel: number = progress?.talkingoLevel ?? preferences.talkingoLevel ?? 1
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [grammarFilter, setGrammarFilter] = useState<GrammarTag | null>(null)
  const [showGrammarFilter, setShowGrammarFilter] = useState(false)
  const [grammarGroupFilter, setGrammarGroupFilter] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<CachedScenario[]>([])
  const [scenariosLoading, setScenariosLoading] = useState(true)
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set())
  const [completedLessons, setCompletedLessons] = useState<string[]>([])
  const [completedLessonsQuality, setCompletedLessonsQuality] = useState<CompletedLessonsRecord>({})

  const grammarGroups = useMemo(() => getGrammarTagGroups(), [])

  // Get grammar tags for the selected group
  const grammarTagsInGroup = useMemo(() => {
    if (!grammarGroupFilter) return []
    return (Object.entries(GRAMMAR_TAGS) as [GrammarTag, { label: string; group: string; levelRange: [number, number] }][])
      .filter(([, info]) => info.group === grammarGroupFilter)
      .map(([tag, info]) => ({ tag, label: info.label }))
  }, [grammarGroupFilter])

  // Load completed lessons from localStorage
  useEffect(() => {
    setCompletedLessons(getCompletedLessons())
    setCompletedLessonsQuality(getCompletedLessonsWithQuality())
  }, [])

  // Refresh completed lessons after returning from a session
  useEffect(() => {
    const handleFocus = () => {
      setCompletedLessons(getCompletedLessons())
      setCompletedLessonsQuality(getCompletedLessonsWithQuality())
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchScenariosWithCache().then((data) => {
      if (!cancelled) { setScenarios(data); setScenariosLoading(false) }
    }).catch(() => { if (!cancelled) setScenariosLoading(false) })
    return () => { cancelled = true }
  }, [])

  const totalCompleted = completedLessons.length

  // Compute total seeds across all levels
  const TOTAL_SEEDS = scenarios.filter((s) => s.id !== 'free-talk').length

  const stats = {
    streak: progress?.streakDays ?? 0,
    sessions: progress?.totalSessions ?? 0,
    minutes: progress?.totalMinutes ?? 0,
    level: userLevel,
  }

  const personaName = getPersonaName(preferences.persona)

  // Group scenarios by level and apply filters
  const filteredLevels = useMemo(() => {
    // Group scenarios by difficulty (parsed as level number)
    const groups = new Map<number, CachedScenario[]>()
    for (const s of scenarios) {
      if (s.id === 'free-talk') continue
      const level = parseInt(String(s.difficulty), 10) || 1
      if (!groups.has(level)) groups.set(level, [])
      groups.get(level)!.push(s)
    }

    // Build result: level number + filtered scenarios
    return Array.from(groups.entries())
      .map(([level, seedScenarios]) => {
        let filtered = seedScenarios

        // Grammar filter — match scenario title/description against grammar tag label
        if (grammarFilter) {
          const tagLabel = GRAMMAR_TAGS[grammarFilter]?.label ?? grammarFilter
          filtered = filtered.filter((s) =>
            s.title.toLowerCase().includes(tagLabel.toLowerCase()) ||
            s.description.toLowerCase().includes(tagLabel.toLowerCase())
          )
        }

        // Search filter
        const searchMatch = !search.trim() ||
          seedScenarios.some((s) => s.title.toLowerCase().includes(search.toLowerCase())) ||
          filtered.some((s) => s.title.toLowerCase().includes(search.toLowerCase()))

        // Level filter
        const levelMatch = levelFilter === 'all' || levelFilter === level

        // Completed count
        const completed = seedScenarios.filter((s) => completedLessons.includes(s.id)).length
        const total = seedScenarios.length

        return { level, filtered, completed, total, searchMatch, levelMatch }
      })
      .filter((g) => g.searchMatch && g.levelMatch)
      .sort((a, b) => a.level - b.level)
  }, [scenarios, search, levelFilter, grammarFilter, completedLessons])

  // Auto-expand the first uncompleted level
  useEffect(() => {
    if (!scenariosLoading && filteredLevels.length > 0 && expandedLevels.size === 0) {
      const firstIncomplete = filteredLevels.find((g) => g.completed < g.total)
      if (firstIncomplete) {
        setExpandedLevels(new Set([firstIncomplete.level]))
      }
    }
  }, [scenariosLoading, filteredLevels, expandedLevels.size])

  const toggleLevel = (lvl: number) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev)
      if (next.has(lvl)) next.delete(lvl)
      else next.add(lvl)
      return next
    })
  }

  const allMatchCount = filteredLevels.reduce((sum: number, g) => sum + g.filtered.length, 0)

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Live starfield */}
      <Starfield className="z-0" density={100} />

      {/* ── Compact Header: stats + progress in one block ── */}
      <div className="relative z-10 flex-shrink-0 px-4 sm:px-6 pt-3 pb-2 max-w-lg mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Stats one-liner */}
          <div className="flex items-center gap-2 flex-wrap">
            {stats.streak > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <Flame className="w-3 h-3" />
                <span className="text-[10px] font-bold">{stats.streak}d</span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-card border border-border/40 text-foreground/60">
              <Zap className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold text-foreground">{stats.sessions} sessions</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-card border border-border/40 text-foreground/60">
              <Clock className="w-3 h-3 text-secondary" />
              <span className="text-[10px] font-bold text-foreground">{formatMinutes(stats.minutes)}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <TrendingUp className="w-3 h-3" />
              <span className="text-[10px] font-bold">Lv{stats.level}</span>
            </div>
            {/* Progress inline */}
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-16 h-1.5 rounded-full bg-card border border-border/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, (totalCompleted / TOTAL_SEEDS) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">
                <GraduationCap className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5" />
                {totalCompleted}/{TOTAL_SEEDS}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden px-4 sm:px-6">
        <div className="max-w-lg mx-auto w-full space-y-4 pb-24">

          {/* Search + Filters */}
          <div className="mb-2 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search topics and modules..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-border/40 bg-card text-sm focus:outline-none focus:border-primary/40 focus:shadow-[0_0_20px_-6px_hsl(var(--primary)/0.12),0_0_8px_-2px_hsl(var(--primary)/0.08)] placeholder:text-foreground/40 shadow-sm transition-all duration-200"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <Filter className="w-3.5 h-3.5 text-foreground/40 flex-shrink-0" />
              {LEVEL_RANGES.map((level) => (
                <motion.button
                  key={level}
                  onClick={() => setLevelFilter(level)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all flex-shrink-0',
                    levelFilter === level
                      ? level === 'all'
                        ? 'bg-foreground text-background border-foreground shadow-sm'
                        : (LEVEL_COLORS[level as number] || 'bg-primary/15 text-primary border-primary/30')
                      : 'bg-card/80 text-foreground/60 border-border/40 hover:border-border/60'
                  )}
                >
                  {level === 'all' ? 'All levels' : `Lvl ${level}`}
                </motion.button>
              ))}
              {/* Grammar filter toggle */}
              <button
                onClick={() => {
                  setShowGrammarFilter(!showGrammarFilter)
                  if (showGrammarFilter) {
                    setGrammarFilter(null)
                    setGrammarGroupFilter(null)
                  }
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all flex-shrink-0',
                  showGrammarFilter
                    ? 'bg-secondary/20 text-secondary border-secondary/40'
                    : 'bg-card/80 text-foreground/60 border-border/40 hover:border-border/60'
                )}
              >
                Grammar
              </button>
            </div>

            {/* Grammar filter row */}
            {showGrammarFilter && (
              <div className="space-y-2">
                {/* Grammar group chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  <Hash className="w-3 h-3 text-foreground/40 flex-shrink-0" />
                  <button
                    onClick={() => { setGrammarGroupFilter(null); setGrammarFilter(null) }}
                    className={cn(
                      'px-2 py-1 rounded-full text-[9px] font-bold border transition-all flex-shrink-0 whitespace-nowrap',
                      !grammarGroupFilter
                        ? 'bg-foreground text-background border-foreground shadow-sm'
                        : 'bg-card/80 text-foreground/60 border-border/40 hover:border-border/60'
                    )}
                  >
                    All grammar
                  </button>
                  {grammarGroups.map((group) => (
                    <button
                      key={group}
                      onClick={() => {
                        setGrammarGroupFilter(group === grammarGroupFilter ? null : group)
                        setGrammarFilter(null)
                      }}
                      className={cn(
                        'px-2 py-1 rounded-full text-[9px] font-bold border transition-all flex-shrink-0 whitespace-nowrap',
                        grammarGroupFilter === group
                          ? 'bg-secondary/20 text-secondary border-secondary/40'
                          : 'bg-card/80 text-foreground/60 border-border/40 hover:border-border/60'
                      )}
                    >
                      {group}
                    </button>
                  ))}
                </div>
                {/* Individual grammar tag chips for selected group */}
                {grammarGroupFilter && grammarTagsInGroup.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide pl-5">
                    {grammarTagsInGroup.map(({ tag, label }) => (
                      <button
                        key={tag}
                        onClick={() => setGrammarFilter(grammarFilter === tag ? null : tag)}
                        className={cn(
                          'px-2 py-1 rounded-full text-[9px] font-medium border transition-all flex-shrink-0 whitespace-nowrap',
                          grammarFilter === tag
                            ? 'bg-primary/15 text-primary border-primary/30'
                            : 'bg-card/60 text-foreground/60 border-border/30 hover:border-border/50'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Active grammar filter indicator */}
                {grammarFilter && (
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[9px] text-primary font-semibold">
                      Filtering by: {GRAMMAR_TAGS[grammarFilter]?.label ?? grammarFilter}
                    </span>
                    <button
                      onClick={() => { setGrammarFilter(null); setGrammarGroupFilter(null) }}
                      className="text-[9px] text-foreground/50 hover:text-foreground underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {scenariosLoading && (
            <div className="flex items-center justify-center py-16 text-foreground/60 gap-2.5">
              <Sparkles className="w-5 h-5 animate-pulse text-primary/60" />
              <span className="text-sm font-medium">Loading modules&hellip;</span>
            </div>
          )}

          {!scenariosLoading && filteredLevels.length === 0 && (
            <div className="text-center py-16">
              <BookOpen className="w-10 h-10 text-foreground/15 mx-auto mb-3" />
              <p className="text-sm text-foreground/60 font-medium">No levels match your filters</p>
              <button onClick={() => { setSearch(''); setLevelFilter('all'); setGrammarFilter(null); setGrammarGroupFilter(null) }} className="text-xs text-primary mt-2 hover:underline font-semibold">
                Clear filters
              </button>
            </div>
          )}

          {/* Phase-based journey (Foundation -> Building -> Fluency -> Mastery) */}
          {!scenariosLoading && filteredLevels.length > 0 && (
            <PhaseBasedJourney
              filteredLevels={filteredLevels}
              expandedLevels={expandedLevels}
              toggleLevel={toggleLevel}
              completedLessons={completedLessons}
              completedLessonsQuality={completedLessonsQuality}
              onStartSession={onStartSession}
              getDifficultyBadge={getDifficultyBadge}
              totalCompleted={totalCompleted}
              totalSeeds={TOTAL_SEEDS}
              allMatchCount={allMatchCount}
            />
          )}


        </div>
      </div>
    </div>
  )
}
