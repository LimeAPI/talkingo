'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  LogOut, Edit2, Check, X as XIcon, Target, Plane, Briefcase,
  Home as Home2, Theater as Theater2, Moon, Sun, Monitor,
  Mic, Volume2, MessageCircle, Phone, Play, Square, ChevronDown, CreditCard, Crown,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Starfield } from '@/components/ui/orbital'
import { AvatarSVG } from '../ui/AvatarSVG'
import { isSubscribed, getSubscriptionInfo, getNextBillingLabel, getTrialCountdownLabel } from '@/lib/subscription/use-subscription'
import { getRemainingMessages } from '@/lib/subscription/free-tier'
import { authFetch } from '@/lib/api/auth-fetch'
import { Paywall } from '../paywall/Paywall'
import { SubscriptionManager } from '../paywall/SubscriptionManager'
import { AI_PERSONAS } from '@talkingo/shared/gemini/personas'
import type { PersonaId } from '@talkingo/shared/types'
import type { ScriptPreference } from '@talkingo/shared/types'
import { LANGUAGES } from '@talkingo/shared/languages'
import { updateUserName } from '@/lib/auth/auth'
import { getLevelByNumber } from '@talkingo/shared/levels'
import { talkingoLevelToLanguageLevel } from '@talkingo/shared/utils'
import { EDGE_VOICES as EDGE_VOICES_FOR_PICKER, GEMINI_VOICES as GEMINI_VOICES_FOR_PICKER } from '../settings/VoicePicker'
import {
  loadLocalLifeline,
  saveLocalLifeline,
  loadLocalUserNote,
  saveLocalUserNote,
} from '@/lib/storage/learner-memory'
import {
  loadStructuredMemory,
  saveStructuredMemory,
  updateUserNote,
  getMemoryStats,
  type StructuredMemory,
  type MemoryStats,
} from '@/lib/storage/structured-memory'
import { Brain, Plus, Trash2 } from 'lucide-react'

interface ProfileScreenProps {
  /** Settings values */
  micSensitivity: number
  noiseCancellation: boolean
  theme: 'light' | 'dark' | 'auto'
  autoSaveTranscripts: boolean
  aiCorrections: boolean
  voiceSpeed: number
  autoPlayVoiceNotes: 'always' | 'handsfree-only' | 'never'
  /** Settings setters */
  onMicSensitivity: (v: number) => void
  onNoiseCancellation: (v: boolean) => void
  onTheme: (v: 'light' | 'dark' | 'auto') => void
  onAutoSaveTranscripts: (v: boolean) => void
  onAiCorrections: (v: boolean) => void
  onVoiceSpeed: (v: number) => void
  onAutoPlayVoiceNotes: (v: 'always' | 'handsfree-only' | 'never') => void
  /** Learning prefs */
  learningPrefs?: {
    targetLanguage?: string
    nativeLanguage?: string
    talkingoLevel?: number
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  } | null
  onLearningPrefsChange?: (changes: {
    targetLanguage?: string
    nativeLanguage?: string
    talkingoLevel?: number
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }) => void
  onReassess?: () => void
  /** Persona */
  currentPersona?: PersonaId
  onPersonaChange?: (p: PersonaId) => void
  /** Voice selection */
  selectedLiveVoice?: string
  selectedChatVoice?: string
  onLiveVoiceChange?: (voice: string) => void
  onChatVoiceChange?: (voice: string) => void
  /** Script preference toggle */
  showScriptToggle?: boolean
  effectiveScript?: ScriptPreference
  onScriptChange?: (script: ScriptPreference) => void
  /** Optional constellation stats */
  streak?: number
  sessionCount?: number
  totalHours?: number
}

export function ProfileScreen({
  micSensitivity, noiseCancellation, theme, autoSaveTranscripts,
  aiCorrections, voiceSpeed, autoPlayVoiceNotes,
  onMicSensitivity, onNoiseCancellation, onTheme, onAutoSaveTranscripts,
  onAiCorrections, onVoiceSpeed, onAutoPlayVoiceNotes,
  learningPrefs, onLearningPrefsChange, onReassess,
  currentPersona = 'eli', onPersonaChange, selectedLiveVoice = 'Aoede', selectedChatVoice = '',
  onLiveVoiceChange = () => {}, onChatVoiceChange = () => {},
  showScriptToggle, effectiveScript, onScriptChange,
  streak, sessionCount, totalHours,
}: ProfileScreenProps) {
  const { user, signOut, refresh } = useAuth()
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')

  // ── Voice selection (persisted locally) ──
  const [chatVoice, setChatVoice] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(`talkingo_chat_voice_${currentPersona}`) || ''
  })
  const [liveVoice, setLiveVoice] = useState<string>(() => {
    if (typeof window === 'undefined') return selectedLiveVoice
    return localStorage.getItem(`talkingo_live_voice_${currentPersona}`) || selectedLiveVoice
  })
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const previewAudioRef = useRef<AudioBufferSourceNode | null>(null)
  const previewElRef = useRef<HTMLAudioElement | null>(null)

  // ── Memory notes (loaded from localStorage) ──
  const [profileMemoryLifeline, setProfileMemoryLifeline] = useState('')
  const [profileUserNote, setProfileUserNote] = useState('')
  const [editingAiMemory, setEditingAiMemory] = useState(false)
  const [editAiMemoryText, setEditAiMemoryText] = useState('')
  const [showAiEditCaution, setShowAiEditCaution] = useState(false)

  // ── Structured memory stats ──
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null)
  const [structuredMem, setStructuredMem] = useState<StructuredMemory | null>(null)

  // Paywall trigger from "Subscribe to Premium" button
  const [showPaywall, setShowPaywall] = useState(false)

  const handleChatVoiceChange = (voice: string) => {
    setChatVoice(voice)
    localStorage.setItem(`talkingo_chat_voice_${currentPersona}`, voice)
    onChatVoiceChange(voice)
  }

  const handleLiveVoiceChange = (voice: string) => {
    setLiveVoice(voice)
    localStorage.setItem(`talkingo_live_voice_${currentPersona}`, voice)
    onLiveVoiceChange(voice)
  }

  const stopPreview = () => {
    if (previewElRef.current) { previewElRef.current.pause(); previewElRef.current = null }
    if (previewAudioRef.current) { try { previewAudioRef.current.stop() } catch {} previewAudioRef.current = null }
    setPreviewingId(null)
  }

  const handleVoicePreview = async (voiceId: string, type: 'chat' | 'live') => {
    stopPreview()
    if (previewingId === voiceId) return

    setPreviewingId(voiceId)
    const lang = learningPrefs?.targetLanguage || 'en'
    const PHRASES: Record<string, string> = {
      en: "Hi there! How's your day going?", fr: "Bonjour ! Comment ça va aujourd'hui ?",
      es: "¡Hola! ¿Cómo estás hoy?", de: "Hallo! Wie geht es dir heute?",
      it: "Ciao! Come stai oggi?", pt: "Olá! Como você está hoje?",
      ja: "こんにちは！今日の調子はどう？", ko: "안녕하세요! 오늘 기분이 어때요?",
      zh: "你好！今天感觉怎么样？", ar: "مرحباً! كيف حالك اليوم؟",
      tr: "Merhaba! Bugün nasılsın?", ru: "Привет! Как дела сегодня?",
      hi: "नमस्ते! आज कैसा दिन है?", nl: "Hallo! Hoe gaat het vandaag?",
    }

    try {
      const res = await authFetch('/api/gemini/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: PHRASES[lang] || PHRASES['en'],
          voiceName: voiceId || undefined,
          languageCode: lang,
          provider: type === 'live' ? 'gemini' : 'edge',
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const { audioData, format } = await res.json()
      if (!audioData) throw new Error('No audio')

      if (format === 'mp3') {
        const blob = new Blob([Uint8Array.from(atob(audioData), c => c.charCodeAt(0))], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        previewElRef.current = audio
        audio.onended = () => { setPreviewingId(null); URL.revokeObjectURL(url) }
        audio.play()
      } else {
        const { decodeBase64Pcm, getAudioContext } = await import('@/lib/utils/audio-decode')
        const buffer = await decodeBase64Pcm(audioData, 24000, 'pcm')
        const ctx = getAudioContext()
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.connect(ctx.destination)
        previewAudioRef.current = src
        src.onended = () => { previewAudioRef.current = null; setPreviewingId(null) }
        src.start(0)
      }
    } catch {
      setPreviewingId(null)
    }
  }

  const handleSaveName = async () => {
    if (!editName.trim() || !user) return
    try {
      await updateUserName(editName.trim())
      await refresh()
      setIsEditingName(false)
    } catch {
      alert('Failed to update name. Please try again.')
    }
  }

  // ── Load memory on mount ────────────────────────────────────────────
  useEffect(() => {
    const uid = user?.id ?? null
    setProfileMemoryLifeline(loadLocalLifeline(uid))
    setProfileUserNote(loadLocalUserNote(uid))

    // Load structured memory stats
    const mem = loadStructuredMemory(uid)
    setStructuredMem(mem)
    setMemoryStats(getMemoryStats(mem))
  }, [user?.id])

  const hasStats = streak !== undefined || sessionCount !== undefined || totalHours !== undefined

  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24">
      <Starfield className="z-0" density={100} />
      <div className="relative z-10 max-w-md mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* ═══════════════════════════════════════════════════════════
            CENTRAL PLANET — User identity with orbital rings
            ═══════════════════════════════════════════════════════════ */}
        {user && (
          <section className="relative flex flex-col items-center text-center pt-8 pb-4">
            {/* Orbital rings with profile badge at center */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-36 h-36 rounded-full border border-secondary/10" />
              <div className="absolute w-48 h-48 rounded-full border border-secondary/5" />

              {/* Clean profile badge */}
              <div className="w-24 h-24 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center relative z-10">
                <span className="text-4xl font-bold text-primary">
                  {user.displayName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Name — sits in natural space between rings and first card */}
        {user && (
          <div className="flex flex-col items-center text-center px-4 py-3">
            <div className="flex items-center justify-center gap-2">
              {isEditingName ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false) }}
                  autoFocus
                  maxLength={100}
                  className="w-48 text-center bg-transparent font-display text-3xl italic tracking-wide text-primary placeholder:text-primary/40 focus:outline-none"
                  placeholder="Name"
                />
              ) : (
                <h1 className="font-display text-3xl italic tracking-wide">{user.displayName || 'User'}</h1>
              )}
              <button
                onClick={() => {
                  if (isEditingName) {
                    handleSaveName()
                  } else {
                    setEditName(user.displayName || '')
                    setIsEditingName(true)
                  }
                }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-primary/40 hover:text-primary hover:bg-primary/10 transition-all"
              >
                {isEditingName
                  ? <Check className="w-3.5 h-3.5" />
                  : <Edit2 className="w-3.5 h-3.5" />
                }
              </button>
            </div>
            <p className="text-sm text-foreground/60 mt-1">{user.email}</p>

            {streak !== undefined && streak > 0 && (
              <div className="flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-primary font-medium">{streak} day orbit complete</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            CONSTELLATION STATS — Streak · Chats · Time
            ═══════════════════════════════════════════════════════════ */}
        {hasStats && (
          <section className="relative px-2">
            <div className="flex justify-between items-center">
              {/* Streak */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-card/80 border border-primary/20 flex items-center justify-center glow-gold mb-2">
                  <span className="font-display text-xl text-primary">{streak ?? 0}</span>
                </div>
                <span className="text-[10px] text-foreground/50 uppercase tracking-widest">Streak</span>
              </div>

              {/* Connector 1 */}
              <div className="flex-1 flex items-center justify-center px-3">
                <div className="h-px w-full bg-gradient-to-r from-primary/20 via-secondary/20 to-transparent relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary/40 absolute left-1/2 -top-[2.5px] -translate-x-1/2" />
                </div>
              </div>

              {/* Sessions */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-card/80 border border-secondary/20 flex items-center justify-center glow-blue mb-2">
                  <span className="font-display text-xl text-secondary">{sessionCount ?? 0}</span>
                </div>
                <span className="text-[10px] text-foreground/50 uppercase tracking-widest">Chats</span>
              </div>

              {/* Connector 2 */}
              <div className="flex-1 flex items-center justify-center px-3">
                <div className="h-px w-full bg-gradient-to-r from-secondary/20 via-accent/20 to-transparent relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent/40 absolute left-1/2 -top-[2.5px] -translate-x-1/2" />
                </div>
              </div>

              {/* Time */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-card/80 border border-accent/20 flex items-center justify-center glow-lavender mb-2">
                  <span className="font-display text-lg text-accent">{totalHours ?? 0}h</span>
                </div>
                <span className="text-[10px] text-foreground/50 uppercase tracking-widest">Time</span>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            LANGUAGE GALAXY — Target language & proficiency
            ═══════════════════════════════════════════════════════════ */}
        {learningPrefs && (
          <section className="surface-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-display text-2xl italic">Language</h2>
            </div>

            {/* Language selector row */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-3xl">
                {learningPrefs.targetLanguage === 'es' ? '🇪🇸' :
                 learningPrefs.targetLanguage === 'fr' ? '🇫🇷' :
                 learningPrefs.targetLanguage === 'de' ? '🇩🇪' :
                 learningPrefs.targetLanguage === 'it' ? '🇮🇹' :
                 learningPrefs.targetLanguage === 'pt' ? '🇵🇹' :
                 learningPrefs.targetLanguage === 'ja' ? '🇯🇵' :
                 learningPrefs.targetLanguage === 'ko' ? '🇰🇷' :
                 learningPrefs.targetLanguage === 'zh' ? '🇨🇳' :
                 learningPrefs.targetLanguage === 'ar' ? '🇸🇦' :
                 learningPrefs.targetLanguage === 'ru' ? '🇷🇺' :
                 learningPrefs.targetLanguage === 'hi' ? '🇮🇳' :
                 learningPrefs.targetLanguage === 'tr' ? '🇹🇷' :
                 learningPrefs.targetLanguage === 'nl' ? '🇳🇱' : '🌐'}
              </span>
              <div className="flex-1">
                <select
                  value={learningPrefs.targetLanguage || 'en'}
                  onChange={(e) => onLearningPrefsChange?.({ targetLanguage: e.target.value })}
                  className="glass-select-apple w-full"
                >
                  {Object.values(LANGUAGES).map((l) => (
                    <option key={l.code} value={l.code}>{l.english}</option>
                  ))}
                </select>
                <p className="text-xs text-foreground/60 mt-1">
                  {Object.values(LANGUAGES).find(l => l.code === learningPrefs.nativeLanguage)?.english || 'Native'} speaker
                </p>
              </div>
            </div>

            {/* Proficiency */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-sm text-foreground/60">Proficiency</span>
                <span className="text-primary font-semibold">
                  Lv.{learningPrefs.talkingoLevel || 1} {getLevelByNumber(learningPrefs.talkingoLevel || 1).name}
                </span>
              </div>
              <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent rounded-full"
                  style={{ width: `${((learningPrefs.talkingoLevel || 1) / 12) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-foreground/40">
                {[1, 4, 7, 10, 12].map((mark) => (
                  <span key={mark} className={cn(
                    (learningPrefs.talkingoLevel || 1) >= mark ? 'text-primary font-semibold' : ''
                  )}>{mark}</span>
                ))}
              </div>
            </div>

            {/* Native language */}
            <div className="mt-5 pt-4 border-t border-border/20">
              <span className="text-xs text-foreground/60 block mb-2">Native language</span>
              <select
                value={learningPrefs.nativeLanguage || ''}
                onChange={(e) => onLearningPrefsChange?.({ nativeLanguage: e.target.value })}
                className="glass-select-apple w-full"
              >
                <option value="">— Not set —</option>
                {Object.values(LANGUAGES).map((l) => (
                  <option key={l.code} value={l.code}>{l.english}</option>
                ))}
              </select>
            </div>

            {/* Goal */}
            <div className="mt-4 pt-4 border-t border-border/20">
              <span className="text-xs text-foreground/60 block mb-2">Learning goal</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'travel',     label: 'Travel',     Icon: Plane },
                  { id: 'career',     label: 'Career',     Icon: Briefcase },
                  { id: 'daily-life', label: 'Daily Life', Icon: Home2 },
                  { id: 'cultural',   label: 'Culture',    Icon: Theater2 },
                ] as const).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => onLearningPrefsChange?.({ learningGoal: g.id })}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2',
                      learningPrefs.learningGoal === g.id
                        ? 'bg-primary/10 border border-primary/35 text-primary'
                        : 'bg-card/80 border border-border/40 text-foreground/60 hover:border-border/60 hover:bg-card'
                    )}
                  >
                    <g.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Correction style */}
            <div className="mt-4 pt-4 border-t border-border/20 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Direct corrections</p>
                <p className="text-[11px] text-foreground/60 mt-0.5">
                  {learningPrefs.correctionStyle === 'direct' ? 'AI corrects you explicitly' : 'AI uses natural recasts'}
                </p>
              </div>
              <button
                onClick={() => onLearningPrefsChange?.({ correctionStyle: learningPrefs.correctionStyle === 'direct' ? 'silent' : 'direct' })}
                className={cn('toggle-switch-apple ml-3', learningPrefs.correctionStyle === 'direct' && 'checked')}
              >
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>

            {/* Script preference toggle — only shown for multi-script languages */}
            {showScriptToggle && onScriptChange && effectiveScript && (
              <div className="mt-4 pt-4 border-t border-border/20">
                <span className="text-xs text-foreground/60 block mb-2">Script preference</span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'native' as const, label: 'Native' },
                    { value: 'both' as const, label: 'Both' },
                    { value: 'latin' as const, label: 'Latin' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onScriptChange(opt.value)}
                      className={cn(
                        'px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-center',
                        effectiveScript === opt.value
                          ? 'bg-primary/10 border border-primary/35 text-primary'
                          : 'bg-card/80 border border-border/40 text-foreground/60 hover:border-border/60 hover:bg-card'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-foreground/40 mt-1.5">
                  {effectiveScript === 'native' ? 'Messages shown in native script' :
                   effectiveScript === 'latin' ? 'Messages shown in romanized text' :
                   'Native script with romanization alongside'}
                </p>
              </div>
            )}

            {onReassess && (
              <button
                onClick={onReassess}
                className="w-full mt-4 px-3 py-2.5 rounded-xl bg-card/80 border border-border/40 text-xs font-medium text-secondary hover:bg-secondary/8 hover:border-secondary/30 transition-all flex items-center justify-center gap-1.5"
              >
                <Target className="w-3.5 h-3.5" />
                Take a conversation test
              </button>
            )}
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            AUDIO ORBIT — Voice speed, auto-play, mic settings
            ═══════════════════════════════════════════════════════════ */}
        <section className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-secondary" />
            </div>
            <h2 className="font-display text-2xl italic">Audio</h2>
          </div>

          <div className="space-y-5">
            {/* Voice speed */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-foreground/60">Voice Speed</span>
                <span className="text-sm text-primary font-semibold">{voiceSpeed.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={voiceSpeed}
                onChange={(e) => onVoiceSpeed(Number(e.target.value))}
                className="orbital-range w-full"
              />
            </div>

            {/* Mic sensitivity */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-foreground/60">Mic Sensitivity</span>
                <span className="text-sm text-primary font-semibold">{micSensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={micSensitivity}
                onChange={(e) => onMicSensitivity(Number(e.target.value))}
                className="orbital-range w-full"
              />
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between pt-4 border-t border-border/20">
              <div>
                <p className="text-sm font-medium text-foreground">Noise cancellation</p>
                <p className="text-xs text-foreground/60">Filter background noise</p>
              </div>
              <button onClick={() => onNoiseCancellation(!noiseCancellation)}
                className={cn('toggle-switch-apple', noiseCancellation && 'checked')}>
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/20">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-play</p>
                <p className="text-xs text-foreground/60">Synthesize speech automatically</p>
              </div>
              <select
                value={autoPlayVoiceNotes}
                onChange={(e) => onAutoPlayVoiceNotes(e.target.value as any)}
                className="glass-select-apple w-32 text-xs"
              >
                <option value="always">Always</option>
                <option value="handsfree-only">Hands-free</option>
                <option value="never">Never</option>
              </select>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            VOICE SATELLITES — Chat & Live voice pickers
            ═══════════════════════════════════════════════════════════ */}
        <section className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-2xl italic">Voice</h2>
          </div>

          <p className="text-[10px] text-foreground/60 leading-relaxed mb-4">
            Each persona has a default voice. Pick a different one or tap ▶ to preview.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-md bg-secondary/15 flex items-center justify-center">
                  <MessageCircle className="w-2.5 h-2.5 text-secondary" />
                </div>
                <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-wide">Chat</span>
              </div>
              <VoiceDropdown
                options={(EDGE_VOICES_FOR_PICKER[learningPrefs?.targetLanguage || 'en'] || EDGE_VOICES_FOR_PICKER['en']).map(v => ({
                  id: v.id, label: v.name, badge: v.gender === 'female' ? '♀' : '♂'
                }))}
                value={chatVoice}
                placeholder="Default"
                accent="secondary"
                onChange={handleChatVoiceChange}
                onPreview={(id) => handleVoicePreview(id, 'chat')}
                previewingId={previewingId}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-md bg-primary/15 flex items-center justify-center">
                  <Phone className="w-2.5 h-2.5 text-primary" />
                </div>
                <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-wide">Live Call</span>
              </div>
              <VoiceDropdown
                options={GEMINI_VOICES_FOR_PICKER.map(v => ({
                  id: v.name, label: v.name, badge: v.style
                }))}
                value={liveVoice}
                accent="primary"
                onChange={handleLiveVoiceChange}
                onPreview={(id) => handleVoicePreview(id, 'live')}
                previewingId={previewingId}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            AI PARTNER SATELLITES — Persona grid
            ═══════════════════════════════════════════════════════════ */}
        <section className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-2xl italic">Partners</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {AI_PERSONAS.map((persona) => {
              const unlocked = true
              const selected = currentPersona === persona.id
              return (
                <button
                  key={persona.id}
                  onClick={() => unlocked && onPersonaChange?.(persona.id)}
                  disabled={!unlocked}
                  className={cn(
                    'relative flex flex-col items-center p-4 rounded-2xl border transition-all text-left',
                    selected
                      ? 'bg-card-elevated border-primary/30 glow-gold'
                      : unlocked
                        ? 'bg-card/80 border-border/40 hover:border-border/60 hover:bg-card'
                        : 'bg-muted/30 border-border/15 opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className={cn(
                    'w-14 h-14 rounded-full overflow-hidden mb-2',
                    selected ? 'border-2 border-primary/30' : 'border border-border/30'
                  )}>
                    <AvatarSVG personaId={persona.id} size={56} />
                  </div>
                  <p className={cn('font-semibold text-sm', selected ? 'text-primary' : 'text-foreground')}>
                    {persona.name}{!unlocked && ' 🔒'}
                  </p>
                  <p className="text-[10px] text-foreground/60 leading-snug line-clamp-2 mt-0.5 text-center">
                    {persona.description}
                  </p>
                  {selected && (
                    <div className="mt-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            APPEARANCE — Theme picker
            ═══════════════════════════════════════════════════════════ */}
        <section className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Monitor className="w-4 h-4 text-accent" />
            </div>
            <h2 className="font-display text-2xl italic">Appearance</h2>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Theme</span>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border/30">
              {([
                { value: 'light', Icon: Sun },
                { value: 'auto',  Icon: Monitor },
                { value: 'dark',  Icon: Moon },
              ] as const).map(({ value, Icon }) => (
                <button
                  key={value}
                  onClick={() => onTheme(value)}
                  className={cn(
                    'w-9 h-8 rounded-lg flex items-center justify-center transition-all',
                    theme === value
                      ? 'bg-card shadow-sm text-foreground'
                      : 'text-foreground/50 hover:text-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            DATA — Privacy toggles
            ═══════════════════════════════════════════════════════════ */}
        <section className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center">
              <Check className="w-4 h-4 text-secondary" />
            </div>
            <h2 className="font-display text-2xl italic">Data</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-save transcripts</p>
                <p className="text-xs text-foreground/60">Store conversation history</p>
              </div>
              <button onClick={() => onAutoSaveTranscripts(!autoSaveTranscripts)}
                className={cn('toggle-switch-apple', autoSaveTranscripts && 'checked')}>
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-border/20">
              <div>
                <p className="text-sm font-medium text-foreground">AI corrections</p>
                <p className="text-xs text-foreground/60">Show fixes in transcript</p>
              </div>
              <button onClick={() => onAiCorrections(!aiCorrections)}
                className={cn('toggle-switch-apple', aiCorrections && 'checked')}>
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            MEMORY — AI memory + user note
            ═══════════════════════════════════════════════════════════ */}
        <section className="surface-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-2xl italic">Memory</h2>
          </div>

          {/* ── Structured Memory Stats (new) ── */}
          {memoryStats && (memoryStats.totalVocab > 0 || memoryStats.totalErrors > 0 || memoryStats.sessionsTracked > 0) && (
            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-center">
                <p className="text-lg font-bold text-emerald-600">{memoryStats.totalVocab}</p>
                <p className="text-[10px] text-foreground/50 uppercase tracking-wide">Words tracked</p>
                {memoryStats.activeVocab > 0 && (
                  <p className="text-[9px] text-emerald-500/70 mt-0.5">{memoryStats.activeVocab} active</p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-center">
                <p className="text-lg font-bold text-amber-600">{memoryStats.totalErrors}</p>
                <p className="text-[10px] text-foreground/50 uppercase tracking-wide">Patterns</p>
                {memoryStats.dormantVocab > 0 && (
                  <p className="text-[9px] text-amber-500/70 mt-0.5">{memoryStats.dormantVocab} to review</p>
                )}
              </div>
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-center">
                <p className="text-lg font-bold text-blue-600">{memoryStats.sessionsTracked}</p>
                <p className="text-[10px] text-foreground/50 uppercase tracking-wide">Sessions</p>
                {memoryStats.streakIndicator && (
                  <p className="text-[9px] mt-0.5">{memoryStats.streakIndicator}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Top Error Patterns ── */}
          {memoryStats && memoryStats.topErrors.length > 0 && (
            <div className="mb-5 p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <span className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">Recurring patterns</span>
              <div className="mt-2 space-y-1.5">
                {memoryStats.topErrors.slice(0, 4).map((err, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-foreground/70 truncate max-w-[200px]">
                      {err.pattern}
                    </span>
                    <span className="text-[10px] text-amber-600/60 font-medium ml-2 shrink-0">
                      {err.frequency}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI's Memory (auto-generated, editable with caution) ── */}
          <div className="mb-5 p-4 rounded-xl bg-primary/5 border border-primary/15">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">AI&apos;s Memory</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary/50 font-medium">auto</span>
              </div>
              {!editingAiMemory && (
                <button
                  onClick={() => setShowAiEditCaution(true)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-muted/30 transition-all"
                  aria-label="Edit AI memory"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Caution dialog */}
            {showAiEditCaution && (
              <div className="mb-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <p className="text-[11px] text-warning leading-relaxed mb-2">
                  This note is maintained by the AI. Editing it may cause inconsistencies
                  when the AI regenerates its memory on the next session.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowAiEditCaution(false)}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-foreground/60 hover:bg-muted/30 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowAiEditCaution(false)
                      setEditAiMemoryText(profileMemoryLifeline)
                      setEditingAiMemory(true)
                    }}
                    className="px-2.5 py-1 rounded-lg bg-warning/20 border border-warning/30 text-[11px] font-medium text-warning hover:bg-warning/30 transition-all"
                  >
                    Edit anyway
                  </button>
                </div>
              </div>
            )}

            {editingAiMemory ? (
              <div className="space-y-2">
                <textarea
                  value={editAiMemoryText}
                  onChange={(e) => setEditAiMemoryText(e.target.value)}
                  rows={4}
                  className="w-full bg-muted/20 border border-border/40 rounded-xl p-2.5 text-xs focus:outline-none focus:border-primary/40 resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setEditingAiMemory(false)
                      setEditAiMemoryText('')
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-foreground/60 hover:bg-muted/30 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const uid = user?.id ?? null
                      saveLocalLifeline(uid, editAiMemoryText)
                      setProfileMemoryLifeline(editAiMemoryText)
                      setEditingAiMemory(false)
                      setEditAiMemoryText('')
                    }}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary hover:bg-primary/15 transition-all"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              profileMemoryLifeline ? (
                <p className="text-xs text-foreground/60 leading-relaxed">{profileMemoryLifeline}</p>
              ) : (
                <p className="text-[11px] text-foreground/40 italic">
                  No memory yet. Start a conversation to generate the AI&apos;s first memory.
                </p>
              )
            )}
          </div>

          {/* ── User Note (single text, editable) ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Your Note</span>
              <span className="text-[10px] text-foreground/40">{profileUserNote.length}/500</span>
            </div>
            <textarea
              value={profileUserNote}
              onChange={(e) => setProfileUserNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Tell the AI something to remember about you…"
              className="w-full bg-card border border-border/40 rounded-xl p-3 text-xs placeholder:text-foreground/40 focus:outline-none focus:border-primary/40 resize-none"
            />
            {profileUserNote !== loadLocalUserNote(user?.id ?? null) && (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setProfileUserNote(loadLocalUserNote(user?.id ?? null))}
                  className="px-2.5 py-1 rounded-lg text-[11px] text-foreground/60 hover:bg-muted/30 transition-all"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    const uid = user?.id ?? null
                    saveLocalUserNote(uid, profileUserNote)
                    // Also update structured memory's userNote
                    if (structuredMem) {
                      const updated = updateUserNote(structuredMem, profileUserNote)
                      saveStructuredMemory(uid, updated)
                      setStructuredMem(updated)
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary hover:bg-primary/15 transition-all"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            PREMIUM STAR — Subscription card
            ═══════════════════════════════════════════════════════════ */}
        {user && (
          <section className="surface-card--elevated">
            {/* Subtle aurora background wash */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/6 via-transparent to-secondary/4 pointer-events-none" />
            {/* Top sheen line */}
            <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />

            <div className="relative p-5">
              {/* Header row */}
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/25 to-accent/20 rounded-xl blur-sm" />
                  <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {isSubscribed(user.id) ? (
                    <>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-xl italic text-aurora">Premium</h3>
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-wider">
                          Active
                        </span>
                      </div>
                      <p className="text-foreground/60 text-sm mt-0.5">Unlimited neural pathways</p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-display text-xl italic text-foreground">Free Plan</h3>
                      <p className="text-foreground/60 text-sm mt-0.5">
                        {getRemainingMessages(user.id)} messages remaining today
                      </p>
                    </>
                  )}
                </div>

                {!isSubscribed(user.id) && (
                  <button
                    onClick={() => setShowPaywall(true)}
                    className="relative flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-bold tracking-tight overflow-hidden group"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-primary to-accent opacity-90 group-hover:opacity-100 transition-opacity" />
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <span className="relative text-primary-foreground flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5" />
                      Upgrade
                    </span>
                  </button>
                )}
              </div>

              {/* SubscriptionManager renders below for premium users */}
              {isSubscribed(user.id) && (
                <div className="mt-5 pt-4 border-t border-border/20">
                  <SubscriptionManager userId={user.id} />
                </div>
              )}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            SIGN OUT
            ═══════════════════════════════════════════════════════════ */}
        {user && (
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-3xl bg-error/8 border border-error/20 text-error text-sm font-medium hover:bg-error/12 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}

      </div>

      {/* Subscribe-from-profile paywall */}
      {showPaywall && user && (
        <Paywall
          userEmail={user.email}
          userId={user.id}
          onClose={() => setShowPaywall(false)}
        />
      )}
    </div>
  )
}

// ─── Custom themed dropdown with play buttons ─────────────────────────────────

interface VoiceOption {
  id: string
  label: string
  badge?: string
}

function VoiceDropdown({
  options, value, placeholder, accent, onChange, onPreview, previewingId,
}: {
  options: VoiceOption[]
  value: string
  placeholder?: string
  accent: 'primary' | 'secondary'
  onChange: (id: string) => void
  onPreview: (id: string) => void
  previewingId: string | null
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value)
  const displayLabel = selected ? selected.label : (placeholder || 'Select')

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const accentClasses = accent === 'primary'
    ? { ring: 'ring-primary/30 border-primary/50', hover: 'hover:bg-primary/8', active: 'bg-primary/10 text-primary', dot: 'bg-primary' }
    : { ring: 'ring-secondary/30 border-secondary/50', hover: 'hover:bg-secondary/8', active: 'bg-secondary/10 text-secondary', dot: 'bg-secondary' }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-[11px] font-medium transition-all',
          'bg-card hover:bg-card-elevated cursor-pointer',
          open
            ? `ring-2 ${accentClasses.ring}`
            : 'border-border/40 hover:border-border/60'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', accentClasses.dot)} />}
          <span className="truncate text-foreground">{displayLabel}</span>
          {selected?.badge && <span className="text-[9px] text-foreground/50 flex-shrink-0">{selected.badge}</span>}
        </div>
        <ChevronDown className={cn('w-3 h-3 text-foreground/50 transition-transform flex-shrink-0 ml-1', open && 'rotate-180')} />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 py-1.5 rounded-xl bg-card border border-border/50 shadow-2xl shadow-black/20 max-h-32 sm:max-h-48 overflow-y-auto custom-scrollbar animate-fade-in">
          {/* Default option */}
          {placeholder && (
            <button
              onClick={() => { onChange(''); setOpen(false) }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-[11px] transition-colors',
                !value ? accentClasses.active : `text-foreground/70 ${accentClasses.hover}`
              )}
            >
              <span className="font-medium">{placeholder}</span>
              {!value && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
            </button>
          )}

          {options.map((opt) => (
            <div
              key={opt.id}
              className={cn(
                'group flex items-center px-3 py-2 transition-colors',
                value === opt.id ? accentClasses.active : `text-foreground/80 ${accentClasses.hover}`
              )}
            >
              <button
                onClick={() => { onChange(opt.id); setOpen(false) }}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
              >
                <span className="text-[11px] font-medium truncate">{opt.label}</span>
                {opt.badge && <span className="text-[9px] text-foreground/50">{opt.badge}</span>}
              </button>
              {/* Play button */}
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(opt.id) }}
                className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ml-1',
                  previewingId === opt.id
                    ? `${accentClasses.active}`
                    : 'text-foreground/40 hover:text-foreground/70 hover:bg-muted/40'
                )}
                aria-label={`Preview ${opt.label}`}
              >
                {previewingId === opt.id
                  ? <Square className="w-2.5 h-2.5 fill-current" />
                  : <Play className="w-2.5 h-2.5 fill-current" />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
