'use client'

import { useState, useMemo, useEffect } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  GraduationCap, CheckCircle2, ArrowRight, BookOpen, Search,
  Filter, Target, ChevronDown, MessageCircle, Sparkles,
} from 'lucide-react'
import type {
  LanguageProgress, UserPreferences, CefrLevel, SkillDomain,
} from '@talkingo/shared/types'
import { getLessonsForLevel, isLessonApplicable, type LessonTemplate } from '@talkingo/shared/curriculum/lesson-templates'
import { loadActiveLessons, type ActiveLesson } from '@/lib/storage/lesson-state'
import { fetchScenariosWithCache, type CachedScenario } from '@/lib/cache/client-cache'

interface LearnScreenProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userId: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  onOpenPhraseBank?: () => void
  onReassess?: () => void
}

type LearnTab = 'scenarios' | 'grammar'
type CefrFilter = 'all' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

const CEFR_LEVELS: CefrFilter[] = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const CEFR_COLORS: Record<string, string> = {
  'A1': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
  'A2': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:text-emerald-400',
  'B1': 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400',
  'B2': 'bg-blue-500/10 text-blue-500 border-blue-500/20 dark:text-blue-400',
  'C1': 'bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400',
  'C2': 'bg-purple-500/10 text-purple-500 border-purple-500/20 dark:text-purple-400',
}

export function LearnScreen({
  preferences,
  progress,
  userId,
  onStartSession,
  onOpenPhraseBank,
  onReassess,
}: LearnScreenProps) {
  const [activeTab, setActiveTab] = useState<LearnTab>('scenarios')
  const [search, setSearch] = useState('')
  const [cefrFilter, setCefrFilter] = useState<CefrFilter>('all')
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const [scenarios, setScenarios] = useState<CachedScenario[]>([])
  const [scenariosLoading, setScenariosLoading] = useState(true)

  const userCefr: CefrLevel = progress?.cefr ?? preferences.cefr ?? 'A1'
  const domainScores = progress?.domainScores ?? preferences.domainScores
  const weakPatterns = progress?.weakPatterns

  const resolvedUserId = userId || ''
  const activeLessons = resolvedUserId
    ? loadActiveLessons(resolvedUserId, preferences.targetLanguage || 'en')
    : []

  const availableLessons = getLessonsForLevel(userCefr)
    .filter((l) => isLessonApplicable(l, preferences.targetLanguage || 'en'))
  const completedLessonIds = new Set(progress?.completedLessons ?? [])

  // Load scenarios
  useEffect(() => {
    let cancelled = false
    fetchScenariosWithCache().then((data) => {
      if (!cancelled) { setScenarios(data); setScenariosLoading(false) }
    }).catch(() => { if (!cancelled) setScenariosLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Filtered scenarios ──
  const filteredScenarios = useMemo(() => {
    let items = scenarios.filter((s) => s.id !== 'free-talk')

    if (cefrFilter !== 'all') {
      items = items.filter((s) => String(s.difficulty).includes(cefrFilter))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      )
    }
    return items
  }, [scenarios, search, cefrFilter])

  const groupedScenarios = useMemo(() => {
    return filteredScenarios.reduce((acc, s) => {
      const cat = s.category || 'Daily Life'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(s)
      return acc
    }, {} as Record<string, CachedScenario[]>)
  }, [filteredScenarios])

  // ── Filtered grammar/lessons ──
  const filteredLessons = useMemo(() => {
    let items = availableLessons

    if (cefrFilter !== 'all') {
      items = items.filter((l) =>
        l.cefrRange[0] === cefrFilter || l.cefrRange[1] === cefrFilter ||
        CEFR_LEVELS.indexOf(cefrFilter) >= CEFR_LEVELS.indexOf(l.cefrRange[0] as CefrFilter) &&
        CEFR_LEVELS.indexOf(cefrFilter) <= CEFR_LEVELS.indexOf(l.cefrRange[1] as CefrFilter)
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((l) =>
        l.title.toLowerCase().includes(q) ||
        l.blurb.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      )
    }
    return items
  }, [availableLessons, search, cefrFilter])

  const groupedLessons = useMemo(() => {
    return filteredLessons.reduce((acc, l) => {
      const cat = l.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(l)
      return acc
    }, {} as Record<string, LessonTemplate[]>)
  }, [filteredLessons])

  const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const domainColors: Record<SkillDomain, { bar: string; dot: string }> = {
    vocabulary: { bar: 'from-violet-500 to-violet-400', dot: 'bg-violet-400' },
    grammar:    { bar: 'from-blue-500 to-blue-400',     dot: 'bg-blue-400' },
    fluency:    { bar: 'from-emerald-500 to-emerald-400', dot: 'bg-emerald-400' },
    listening:  { bar: 'from-amber-500 to-amber-400',   dot: 'bg-amber-400' },
  }

  const getDifficultyBadge = (d: number | string) => {
    const str = String(d)
    const match = str.match(/(A1|A2|B1|B2|C1|C2)/)
    const colorClass = match ? CEFR_COLORS[match[1]] : 'bg-muted text-muted-foreground border-border/30'
    return { label: str, colorClass }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col pb-20">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-6 pb-3 max-w-lg mx-auto w-full">
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground mb-1">
          Learn
        </h1>
        <p className="text-sm text-muted-foreground">
          {scenarios.length > 0 ? `${scenarios.length - 1} scenarios` : ''} · {availableLessons.length} lessons · Level <span className="font-semibold text-primary">{userCefr}</span>
        </p>
      </div>

      {/* ── Skills overview (collapsible) ── */}
      {domainScores && (
        <div className="flex-shrink-0 px-4 sm:px-6 pb-3 max-w-lg mx-auto w-full">
          <div className="rounded-xl bg-card/70 border border-border/50 shadow-sm px-3.5 py-2.5">
            <button
              onClick={() => setSkillsExpanded((v) => !v)}
              className="w-full flex items-center justify-between"
              aria-expanded={skillsExpanded}
            >
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Your Skills</span>
                <div className="flex items-center gap-0.5 ml-1">
                  {(Object.entries(domainScores) as [SkillDomain, CefrLevel][]).map(([d]) => (
                    <span key={d} className={cn('w-1.5 h-1.5 rounded-full', domainColors[d].dot)} />
                  ))}
                </div>
              </div>
              <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground/50 transition-transform', skillsExpanded && 'rotate-180')} />
            </button>
            {skillsExpanded && (
              <div className="mt-3 space-y-2 pt-2 border-t border-border/15">
                {(Object.entries(domainScores) as [SkillDomain, CefrLevel][]).map(([domain, cefr]) => {
                  const pct = ((CEFR_ORDER.indexOf(cefr) + 1) / 6) * 100
                  return (
                    <div key={domain} className="flex items-center gap-2.5">
                      <span className="text-[10px] text-muted-foreground w-14 capitalize">{domain}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${domainColors[domain].bar} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-foreground/60 w-5 text-right">{cefr}</span>
                    </div>
                  )
                })}
                {onReassess && (
                  <button onClick={onReassess} className="w-full mt-2 px-3 py-2 rounded-lg bg-secondary/8 border border-secondary/20 text-[11px] font-medium text-secondary hover:bg-secondary/14 transition-all flex items-center justify-center gap-1.5">
                    <Target className="w-3 h-3" /> Retake level test
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs: Scenarios / Grammar ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 max-w-lg mx-auto w-full">
        <div className="flex gap-1 p-1.5 rounded-2xl bg-card/80 border border-border/60 shadow-sm">
          <button
            onClick={() => setActiveTab('scenarios')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all',
              activeTab === 'scenarios'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Scenarios
          </button>
          <button
            onClick={() => setActiveTab('grammar')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all',
              activeTab === 'grammar'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Grammar & Lessons
          </button>
        </div>
      </div>

      {/* ── Search + CEFR filter ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3 space-y-2 max-w-lg mx-auto w-full">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === 'scenarios' ? 'Search scenarios...' : 'Search lessons...'}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border/50 bg-card/70 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <Filter className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setCefrFilter(level)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all flex-shrink-0',
                cefrFilter === level
                  ? level === 'all'
                    ? 'bg-foreground text-background border-foreground'
                    : (CEFR_COLORS[level] || 'bg-primary/15 text-primary border-primary/30')
                  : 'bg-card/50 text-muted-foreground border-border/30 hover:border-border/60'
              )}
            >
              {level === 'all' ? 'All levels' : level}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content (scrollable) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6">
        <div className="max-w-lg mx-auto w-full space-y-5 pb-6">

          {/* ── Active lessons (always show at top if any) ── */}
          {activeTab === 'grammar' && activeLessons.length > 0 && (
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2.5 px-0.5">
                In Progress
              </h2>
              <div className="space-y-1.5">
                {activeLessons.map((lesson) => (
                  <button
                    key={lesson.lessonId}
                    onClick={() => onStartSession(`lesson-${lesson.lessonId}`, 'continue')}
                    className="group w-full text-left px-4 py-3 rounded-xl bg-secondary/6 border border-secondary/20 hover:border-secondary/40 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-3.5 h-3.5 text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold truncate">{lesson.title}</span>
                          <span className="text-[9px] text-muted-foreground">{lesson.currentStep}/{lesson.totalSteps}</span>
                        </div>
                        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-secondary to-primary rounded-full" style={{ width: `${(lesson.currentStep / lesson.totalSteps) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Scenarios tab content ── */}
          {activeTab === 'scenarios' && (
            <>
              {scenariosLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">Loading scenarios…</span>
                </div>
              )}

              {!scenariosLoading && filteredScenarios.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No scenarios match your filters</p>
                  <button onClick={() => { setSearch(''); setCefrFilter('all') }} className="text-xs text-primary mt-2 hover:underline">Clear filters</button>
                </div>
              )}

              {!scenariosLoading && Object.entries(groupedScenarios).map(([category, items]) => (
                <section key={category}>
                  <div className="flex items-center justify-between mb-2 px-0.5">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{category}</h2>
                    <span className="text-[9px] text-muted-foreground/40">{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((scenario) => {
                      const badge = getDifficultyBadge(scenario.difficulty)
                      return (
                        <button
                          key={scenario.id}
                          onClick={() => onStartSession(scenario.id, 'new')}
                          className="w-full text-left px-4 py-3 rounded-xl bg-card/70 border border-border/50 shadow-sm hover:border-primary/40 hover:bg-card/85 hover:shadow-md transition-all group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">{scenario.title}</h3>
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{scenario.description}</p>
                            </div>
                            <span className={cn('text-[9px] px-2 py-0.5 rounded-full border flex-shrink-0 font-bold mt-0.5', badge.colorClass)}>
                              {badge.label}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}

              {!scenariosLoading && filteredScenarios.length > 0 && (
                <p className="text-center text-[10px] text-muted-foreground/40 pt-2">
                  {filteredScenarios.length} scenarios
                </p>
              )}
            </>
          )}

          {/* ── Grammar & Lessons tab content ── */}
          {activeTab === 'grammar' && (
            <>
              {filteredLessons.length === 0 && (
                <div className="text-center py-12">
                  <GraduationCap className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No lessons match your filters</p>
                  <button onClick={() => { setSearch(''); setCefrFilter('all') }} className="text-xs text-primary mt-2 hover:underline">Clear filters</button>
                </div>
              )}

              {Object.entries(groupedLessons).map(([category, lessons]) => (
                <section key={category}>
                  <div className="flex items-center justify-between mb-2 px-0.5">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{category}</h2>
                    <span className="text-[9px] text-muted-foreground/40">{lessons.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {lessons.map((lesson) => {
                      const isCompleted = completedLessonIds.has(lesson.id)
                      const isActive = activeLessons.some((a) => a.lessonId === lesson.id)
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => onStartSession(`lesson-${lesson.id}`, isActive ? 'continue' : 'new')}
                          className={cn(
                            'w-full text-left px-4 py-3 rounded-xl border transition-all group',
                            isCompleted
                              ? 'bg-success/5 border-success/20 opacity-70'
                              : isActive
                                ? 'bg-secondary/6 border-secondary/25 hover:border-secondary/45'
                                : 'bg-card/70 border-border/50 shadow-sm hover:border-primary/40 hover:bg-card/85 hover:shadow-md'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{lesson.title}</span>
                                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />}
                                {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary font-semibold">In progress</span>}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{lesson.blurb}</p>
                            </div>
                            <span className={cn(
                              'text-[9px] px-2 py-0.5 rounded-full border flex-shrink-0 font-bold',
                              CEFR_COLORS[lesson.cefrRange[0]] || 'bg-muted text-muted-foreground border-border/30'
                            )}>
                              {lesson.cefrRange[0]}–{lesson.cefrRange[1]}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}

              {filteredLessons.length > 0 && (
                <p className="text-center text-[10px] text-muted-foreground/40 pt-2">
                  {filteredLessons.length} lessons
                </p>
              )}
            </>
          )}

          {/* ── Phrase Bank shortcut ── */}
          {onOpenPhraseBank && (
            <button
              onClick={onOpenPhraseBank}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card/30 border border-border/20 hover:border-primary/20 transition-all group"
            >
              <BookOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Phrase Bank — saved words & expressions</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 ml-auto" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
