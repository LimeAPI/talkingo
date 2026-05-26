'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Search, Filter, MessageCircle, GraduationCap,
  BookOpen, CheckCircle2, ArrowRight, Sparkles,
} from 'lucide-react'
import { cn } from '@talkingo/shared/utils'
import type { CefrLevel, SkillDomain, LanguageProgress, UserPreferences } from '@talkingo/shared/types'
import { SEEDS } from '@talkingo/shared/curriculum'
import { getLessonsForLevel, isLessonApplicable, type LessonTemplate } from '@talkingo/shared/curriculum/lesson-templates'
import { loadActiveLessons, type ActiveLesson } from '@/lib/storage/lesson-state'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewTab = 'scenarios' | 'grammar'
type CefrFilter = 'all' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

interface LearnPageProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userId?: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  onBack: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CEFR_LEVELS: CefrFilter[] = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const CEFR_COLORS: Record<string, { pill: string; badge: string }> = {
  'A1': { pill: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  'A2': { pill: 'bg-teal-500/15 text-teal-600 border-teal-500/30', badge: 'bg-teal-500/10 text-teal-500 border-teal-500/20' },
  'B1': { pill: 'bg-blue-500/15 text-blue-600 border-blue-500/30', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  'B2': { pill: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30', badge: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
  'C1': { pill: 'bg-purple-500/15 text-purple-600 border-purple-500/30', badge: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  'C2': { pill: 'bg-pink-500/15 text-pink-600 border-pink-500/30', badge: 'bg-pink-500/10 text-pink-500 border-pink-500/20' },
}

const SCENARIO_CATEGORIES: Record<string, { icon: string; color: string }> = {
  'Food & Dining': { icon: '🍽️', color: 'from-orange-500/10 to-amber-500/5' },
  'Travel': { icon: '✈️', color: 'from-sky-500/10 to-blue-500/5' },
  'Work & Career': { icon: '💼', color: 'from-slate-500/10 to-gray-500/5' },
  'Social & Relationships': { icon: '👥', color: 'from-pink-500/10 to-rose-500/5' },
  'Culture & Society': { icon: '🌍', color: 'from-violet-500/10 to-purple-500/5' },
  'Shopping & Services': { icon: '🛍️', color: 'from-emerald-500/10 to-green-500/5' },
  'Health & Wellness': { icon: '💚', color: 'from-green-500/10 to-emerald-500/5' },
  'Education & Learning': { icon: '📚', color: 'from-blue-500/10 to-indigo-500/5' },
  'Entertainment & Hobbies': { icon: '🎵', color: 'from-fuchsia-500/10 to-pink-500/5' },
  'Daily Life': { icon: '🏠', color: 'from-amber-500/10 to-yellow-500/5' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LearnPage({ preferences, progress, userId, onStartSession, onBack }: LearnPageProps) {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<ViewTab>('scenarios')
  const [search, setSearch] = useState('')
  const [cefrFilter, setCefrFilter] = useState<CefrFilter>('all')

  useEffect(() => setMounted(true), [])

  const userCefr: CefrLevel = progress?.cefr ?? preferences.cefr ?? 'A1'
  const resolvedUserId = userId || ''

  const activeLessons = resolvedUserId
    ? loadActiveLessons(resolvedUserId, preferences.targetLanguage || 'en')
    : []

  const allLessons = getLessonsForLevel(userCefr)
    .filter((l) => isLessonApplicable(l, preferences.targetLanguage || 'en'))
  const completedLessonIds = new Set(progress?.completedLessons ?? [])

  // ── Scenarios (from seeds) ──────────────────────────────────────────────────
  const scenarios = useMemo(() => {
    return SEEDS.map(seed => ({
      id: seed.id,
      title: seed.title,
      description: seed.blurb,
      category: inferCategory(seed.id, seed.title),
      cefrRange: seed.cefrRange,
      domains: seed.domains,
    }))
  }, [])

  const filteredScenarios = useMemo(() => {
    let items = scenarios

    if (cefrFilter !== 'all') {
      items = items.filter(s => s.cefrRange[0] === cefrFilter || s.cefrRange[1] === cefrFilter ||
        (CEFR_LEVELS.indexOf(cefrFilter) >= CEFR_LEVELS.indexOf(s.cefrRange[0] as CefrFilter) &&
         CEFR_LEVELS.indexOf(cefrFilter) <= CEFR_LEVELS.indexOf(s.cefrRange[1] as CefrFilter)))
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      )
    }

    return items
  }, [scenarios, cefrFilter, search])

  // ── Grammar/Lessons ─────────────────────────────────────────────────────────
  const filteredLessons = useMemo(() => {
    let items = allLessons

    if (cefrFilter !== 'all') {
      items = items.filter(l => l.cefrRange[0] === cefrFilter || l.cefrRange[1] === cefrFilter ||
        (CEFR_LEVELS.indexOf(cefrFilter) >= CEFR_LEVELS.indexOf(l.cefrRange[0] as CefrFilter) &&
         CEFR_LEVELS.indexOf(cefrFilter) <= CEFR_LEVELS.indexOf(l.cefrRange[1] as CefrFilter)))
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.blurb.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      )
    }

    return items
  }, [allLessons, cefrFilter, search])

  // Group scenarios by category
  const groupedScenarios = useMemo(() => {
    return filteredScenarios.reduce((acc, s) => {
      if (!acc[s.category]) acc[s.category] = []
      acc[s.category].push(s)
      return acc
    }, {} as Record<string, typeof filteredScenarios>)
  }, [filteredScenarios])

  // Group lessons by category
  const groupedLessons = useMemo(() => {
    return filteredLessons.reduce((acc, l) => {
      const cat = l.category.charAt(0).toUpperCase() + l.category.slice(1)
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(l)
      return acc
    }, {} as Record<string, LessonTemplate[]>)
  }, [filteredLessons])

  const getDifficultyColor = (cefrRange: [string, string]) => {
    const first = cefrRange[0]
    return CEFR_COLORS[first]?.badge || 'bg-muted text-muted-foreground border-border/30'
  }

  return (
    <div className={cn(
      'fixed inset-0 z-30 bg-background flex flex-col transition-all duration-300',
      mounted ? 'opacity-100' : 'opacity-0'
    )}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-border/30 bg-card/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto w-full px-4 sm:px-6">
          {/* Top row: back + title */}
          <div className="flex items-center gap-3 pt-4 pb-3">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted/50 transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5 text-foreground/70" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">Learn</h1>
              <p className="text-[11px] text-muted-foreground">
                {activeTab === 'scenarios'
                  ? `${filteredScenarios.length} scenarios`
                  : `${filteredLessons.length} lessons`}
                {cefrFilter !== 'all' && ` · ${cefrFilter}`}
              </p>
            </div>
            <span className="cefr-badge text-xs">{userCefr}</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 pb-3">
            <button
              onClick={() => setActiveTab('scenarios')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                activeTab === 'scenarios'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Scenarios
            </button>
            <button
              onClick={() => setActiveTab('grammar')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                activeTab === 'grammar'
                  ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Grammar & Lessons
            </button>
          </div>
        </div>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-b border-border/15">
        <div className="max-w-lg mx-auto w-full px-4 sm:px-6 py-3 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'scenarios' ? 'Search scenarios...' : 'Search grammar & lessons...'}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/40 bg-card/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 placeholder:text-muted-foreground/40 transition-all"
            />
          </div>

          {/* CEFR pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setCefrFilter(level)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all flex-shrink-0',
                  cefrFilter === level
                    ? level === 'all'
                      ? 'bg-foreground text-background border-foreground shadow-sm'
                      : `${CEFR_COLORS[level]?.pill || ''} shadow-sm`
                    : 'bg-card/50 text-muted-foreground border-border/30 hover:border-border/60 hover:bg-muted/30'
                )}
              >
                {level === 'all' ? 'All Levels' : level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-lg mx-auto w-full px-4 sm:px-6 py-4">

          {/* Active lessons banner (grammar tab only) */}
          {activeTab === 'grammar' && activeLessons.length > 0 && (
            <div className="mb-4 space-y-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 px-0.5">
                In Progress
              </h3>
              {activeLessons.map((lesson) => (
                <button
                  key={lesson.lessonId}
                  onClick={() => onStartSession(`lesson-${lesson.lessonId}`, 'continue')}
                  className="group w-full text-left px-4 py-3 rounded-xl bg-secondary/8 border border-secondary/20 hover:border-secondary/40 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-4 h-4 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-semibold truncate">{lesson.title}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          Step {lesson.currentStep}/{lesson.totalSteps}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-secondary to-primary rounded-full transition-all"
                          style={{ width: `${(lesson.currentStep / lesson.totalSteps) * 100}%` }}
                        />
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-secondary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Scenarios tab */}
          {activeTab === 'scenarios' && (
            <div className="space-y-5">
              {Object.keys(groupedScenarios).length === 0 && (
                <EmptyState
                  message="No scenarios match your filters"
                  onClear={() => { setSearch(''); setCefrFilter('all') }}
                />
              )}

              {Object.entries(groupedScenarios).map(([category, items]) => {
                const catMeta = SCENARIO_CATEGORIES[category] || { icon: '📝', color: 'from-muted/10 to-muted/5' }
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2 px-0.5">
                      <span className="text-sm">{catMeta.icon}</span>
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground/60">
                        {category}
                      </h3>
                      <span className="text-[10px] text-muted-foreground/40 ml-auto">{items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {items.map((scenario) => (
                        <button
                          key={scenario.id}
                          onClick={() => onStartSession(scenario.id, 'new')}
                          className="group w-full text-left px-4 py-3 rounded-xl border border-border/20 bg-card/30 hover:bg-card/60 hover:border-primary/30 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors mb-0.5">
                                {scenario.title}
                              </h4>
                              <p className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
                                {scenario.description}
                              </p>
                            </div>
                            <span className={cn(
                              'text-[9px] px-2 py-0.5 rounded-full border font-bold flex-shrink-0 mt-0.5',
                              getDifficultyColor(scenario.cefrRange)
                            )}>
                              {scenario.cefrRange[0]}–{scenario.cefrRange[1]}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Grammar & Lessons tab */}
          {activeTab === 'grammar' && (
            <div className="space-y-5">
              {Object.keys(groupedLessons).length === 0 && (
                <EmptyState
                  message="No lessons match your filters"
                  onClear={() => { setSearch(''); setCefrFilter('all') }}
                />
              )}

              {Object.entries(groupedLessons).map(([category, lessons]) => (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2 px-0.5">
                    <GraduationCap className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground/60">
                      {category}
                    </h3>
                    <span className="text-[10px] text-muted-foreground/40 ml-auto">{lessons.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {lessons.map((lesson) => {
                      const isCompleted = completedLessonIds.has(lesson.id)
                      const isActive = activeLessons.some(a => a.lessonId === lesson.id)
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => onStartSession(`lesson-${lesson.id}`, isActive ? 'continue' : 'new')}
                          className={cn(
                            'group w-full text-left px-4 py-3 rounded-xl border transition-all',
                            isCompleted
                              ? 'bg-success/5 border-success/20 opacity-60'
                              : isActive
                                ? 'bg-secondary/5 border-secondary/25 hover:border-secondary/50'
                                : 'border-border/20 bg-card/30 hover:bg-card/60 hover:border-primary/30 hover:shadow-sm'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <h4 className="text-[13px] font-semibold text-foreground group-hover:text-primary transition-colors">
                                  {lesson.title}
                                </h4>
                                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />}
                                {isActive && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-secondary/20 text-secondary font-semibold">
                                    In progress
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
                                {lesson.blurb}
                              </p>
                              {/* Meta row */}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[9px] text-muted-foreground/50">
                                  ~{lesson.estimatedMinutes}min
                                </span>
                                <span className="text-[9px] text-muted-foreground/30">·</span>
                                <span className="text-[9px] text-muted-foreground/50">
                                  {lesson.steps.length} steps
                                </span>
                              </div>
                            </div>
                            <span className={cn(
                              'text-[9px] px-2 py-0.5 rounded-full border font-bold flex-shrink-0 mt-0.5',
                              getDifficultyColor(lesson.cefrRange)
                            )}>
                              {lesson.cefrRange[0]}–{lesson.cefrRange[1]}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom padding */}
          <div className="h-8" />
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message, onClear }: { message: string; onClear: () => void }) {
  return (
    <div className="text-center py-12">
      <BookOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-2">{message}</p>
      <button onClick={onClear} className="text-xs text-primary hover:underline">
        Clear filters
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferCategory(id: string, title: string): string {
  const s = (id + ' ' + title).toLowerCase()
  if (s.includes('cafe') || s.includes('restaurant') || s.includes('food') || s.includes('cooking') || s.includes('meal')) return 'Food & Dining'
  if (s.includes('travel') || s.includes('direction') || s.includes('hotel') || s.includes('airport') || s.includes('booking')) return 'Travel'
  if (s.includes('work') || s.includes('job') || s.includes('interview') || s.includes('business') || s.includes('career') || s.includes('professional') || s.includes('negotiat')) return 'Work & Career'
  if (s.includes('family') || s.includes('friend') || s.includes('relationship') || s.includes('party') || s.includes('social') || s.includes('emotion') || s.includes('feeling')) return 'Social & Relationships'
  if (s.includes('culture') || s.includes('debate') || s.includes('society') || s.includes('tradition') || s.includes('philosophy') || s.includes('ethic') || s.includes('abstract')) return 'Culture & Society'
  if (s.includes('shopping') || s.includes('store') || s.includes('market') || s.includes('clothes') || s.includes('apartment')) return 'Shopping & Services'
  if (s.includes('health') || s.includes('doctor') || s.includes('exercise') || s.includes('gym') || s.includes('mental') || s.includes('body')) return 'Health & Wellness'
  if (s.includes('school') || s.includes('study') || s.includes('education') || s.includes('classroom')) return 'Education & Learning'
  if (s.includes('music') || s.includes('movie') || s.includes('sport') || s.includes('hobby') || s.includes('art') || s.includes('entertain') || s.includes('story')) return 'Entertainment & Hobbies'
  return 'Daily Life'
}
