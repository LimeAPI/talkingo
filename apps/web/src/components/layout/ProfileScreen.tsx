'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  LogOut, Edit2, Check, X as XIcon, Target, Plane, Briefcase,
  Home as Home2, Theater as Theater2, Moon, Sun, Monitor,
  Mic, Volume2, MessageCircle, Phone, Play, Square, ChevronDown, CreditCard, Crown,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AvatarSVG } from '../ui/AvatarSVG'
import { isSubscribed, getSubscriptionInfo } from '@/lib/subscription/use-subscription'
import { getRemainingMessages } from '@/lib/subscription/free-tier'
import { AI_PERSONAS, isPersonaUnlocked } from '@talkingo/shared/gemini/personas'
import type { PersonaId, DomainScores } from '@talkingo/shared/types'
import { LANGUAGES } from '@talkingo/shared/languages'
import { updateUserName } from '@/lib/auth/auth'
import { EDGE_VOICES as EDGE_VOICES_FOR_PICKER, GEMINI_VOICES as GEMINI_VOICES_FOR_PICKER } from '../settings/VoicePicker'
import { cefrToTalkingoLevel, getLevelByNumber, talkingoLevelToCefr } from '@talkingo/shared/levels'

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
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  } | null
  onLearningPrefsChange?: (changes: {
    targetLanguage?: string
    nativeLanguage?: string
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }) => void
  onReassess?: () => void
  /** Persona */
  currentPersona?: PersonaId
  onPersonaChange?: (p: PersonaId) => void
  domainScores?: DomainScores
  /** Voice selection */
  selectedLiveVoice?: string
  selectedChatVoice?: string
  onLiveVoiceChange?: (voice: string) => void
  onChatVoiceChange?: (voice: string) => void
}

export function ProfileScreen({
  micSensitivity, noiseCancellation, theme, autoSaveTranscripts,
  aiCorrections, voiceSpeed, autoPlayVoiceNotes,
  onMicSensitivity, onNoiseCancellation, onTheme, onAutoSaveTranscripts,
  onAiCorrections, onVoiceSpeed, onAutoPlayVoiceNotes,
  learningPrefs, onLearningPrefsChange, onReassess,
  currentPersona = 'eli', onPersonaChange, domainScores,
  selectedLiveVoice = 'Aoede', selectedChatVoice = '',
  onLiveVoiceChange = () => {}, onChatVoiceChange = () => {},
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
      const res = await fetch('/api/gemini/tts', {
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24">
      <div className="max-w-md mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground mb-1">
            Profile
          </h1>
          <p className="text-sm text-muted-foreground">
            Settings & preferences
          </p>
        </div>

        {/* ── Account ── */}
        {user && (
          <section className="rounded-2xl bg-card/50 border border-border/30 overflow-hidden">
            <div className="p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0 shadow-md">
                <span className="text-base font-bold text-white">
                  {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              {isEditingName ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false) }}
                    autoFocus
                    maxLength={100}
                    className="flex-1 px-3 py-2 rounded-xl border border-border/60 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button onClick={handleSaveName} disabled={!editName.trim()} className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="w-8 h-8 rounded-xl bg-muted/50 flex items-center justify-center">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{user.name || 'User'}</p>
                    <button onClick={() => { setEditName(user.name || ''); setIsEditingName(true) }}
                      className="w-6 h-6 rounded-lg hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Learning ── */}
        {learningPrefs && (
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">Learning</h2>
            <div className="space-y-2">
              <div className="rounded-2xl bg-card/50 border border-border/30 overflow-hidden divide-y divide-border/20">
                <div className="p-4 space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">I'm learning</span>
                  <select
                    value={learningPrefs.targetLanguage || 'en'}
                    onChange={(e) => onLearningPrefsChange?.({ targetLanguage: e.target.value })}
                    className="glass-select-apple w-full"
                  >
                    {Object.values(LANGUAGES).map((l) => (
                      <option key={l.code} value={l.code}>{l.english} — {l.native}</option>
                    ))}
                  </select>
                </div>
                <div className="p-4 space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">My native language</span>
                  <select
                    value={learningPrefs.nativeLanguage || ''}
                    onChange={(e) => onLearningPrefsChange?.({ nativeLanguage: e.target.value })}
                    className="glass-select-apple w-full"
                  >
                    <option value="">— Not set —</option>
                    {Object.values(LANGUAGES).map((l) => (
                      <option key={l.code} value={l.code}>{l.english} — {l.native}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Level */}
              <div className="rounded-2xl bg-card/50 border border-border/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">My level</span>
                  <span className="text-xs font-bold text-primary">
                    Lv.{cefrToTalkingoLevel(learningPrefs.cefr || 'A1')} · {getLevelByNumber(cefrToTalkingoLevel(learningPrefs.cefr || 'A1')).name}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((lvl) => {
                    const info = getLevelByNumber(lvl)
                    const currentLvl = cefrToTalkingoLevel(learningPrefs.cefr || 'A1')
                    const isSelected = currentLvl === lvl
                    return (
                      <button
                        key={lvl}
                        onClick={() => onLearningPrefsChange?.({ cefr: talkingoLevelToCefr(lvl) })}
                        className={cn(
                          'py-2 px-1 rounded-xl text-center transition-all',
                          isSelected
                            ? 'bg-primary/15 border border-primary/40 text-primary'
                            : 'bg-muted/20 border border-border/30 text-foreground/60 hover:text-foreground hover:border-border/60'
                        )}
                      >
                        <span className="text-[10px] font-bold block">{lvl}</span>
                        <span className="text-[8px] text-muted-foreground/70 block truncate leading-tight mt-0.5">{info.name}</span>
                      </button>
                    )
                  })}
                </div>
                {onReassess && (
                  <button
                    onClick={onReassess}
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary/8 border border-secondary/20 text-xs font-medium text-secondary hover:bg-secondary/14 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Target className="w-3.5 h-3.5" />
                    Take a conversation test
                  </button>
                )}
              </div>

              {/* Goal */}
              <div className="rounded-2xl bg-card/50 border border-border/30 p-4 space-y-3">
                <span className="text-xs font-medium text-muted-foreground">Learning goal</span>
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
                          : 'bg-muted/20 border border-border/30 text-foreground/70 hover:border-border/60'
                      )}
                    >
                      <g.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Correction style */}
              <div className="rounded-2xl bg-card/50 border border-border/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Direct corrections</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
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
              </div>
            </div>
          </section>
        )}

        {/* ── Audio ── */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">Audio</h2>
          <div className="rounded-2xl bg-card/50 border border-border/30 overflow-hidden divide-y divide-border/20">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Mic sensitivity</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-8 text-right">{micSensitivity}%</span>
                <input type="range" min="0" max="100" value={micSensitivity}
                  onChange={(e) => onMicSensitivity(Number(e.target.value))}
                  className="custom-range-apple w-20" />
              </div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Noise cancellation</span>
              <button onClick={() => onNoiseCancellation(!noiseCancellation)}
                className={cn('toggle-switch-apple', noiseCancellation && 'checked')}>
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Voice speed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-8 text-right">{voiceSpeed.toFixed(1)}×</span>
                <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSpeed}
                  onChange={(e) => onVoiceSpeed(Number(e.target.value))}
                  className="custom-range-apple w-20" />
              </div>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Auto-play voice notes</span>
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

        {/* ── Voice ── */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">Voice</h2>
          <div className="rounded-2xl bg-card/50 border border-border/30 p-4 space-y-4">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Each persona has a default voice. Pick a different one or tap ▶ to preview.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Chat voice (Edge TTS — free) */}
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

              {/* Live call voice (Gemini — premium) */}
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
          </div>
        </section>

        {/* ── Appearance ── */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">Appearance</h2>
          <div className="rounded-2xl bg-card/50 border border-border/30 p-4">
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
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── AI Partner ── */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">AI Partner</h2>
          <div className="grid grid-cols-2 gap-2">
            {AI_PERSONAS.map((persona) => {
              const unlocked = isPersonaUnlocked(persona, domainScores)
              const selected = currentPersona === persona.id
              return (
                <button
                  key={persona.id}
                  onClick={() => unlocked && onPersonaChange?.(persona.id)}
                  disabled={!unlocked}
                  className={cn(
                    'relative flex items-start gap-2.5 p-3.5 rounded-2xl border transition-all text-left',
                    selected
                      ? 'bg-primary/8 border-primary/30 shadow-sm'
                      : unlocked
                        ? 'bg-card/40 border-border/25 hover:border-border/50 hover:bg-card/60'
                        : 'bg-card/20 border-border/15 opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden border border-border/30 flex-shrink-0">
                    <AvatarSVG personaId={persona.id} size={36} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={cn('text-xs font-semibold block truncate', selected ? 'text-primary' : 'text-foreground')}>
                      {persona.name}{!unlocked && ' 🔒'}
                    </span>
                    <span className="text-[10px] text-muted-foreground block leading-snug line-clamp-2 mt-0.5">
                      {unlocked ? persona.description : persona.unlockCondition ? `Unlocks at ${persona.unlockCondition.domain} ${persona.unlockCondition.level}` : 'Locked'}
                    </span>
                  </div>
                  {selected && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />}
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Data ── */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">Data</h2>
          <div className="rounded-2xl bg-card/50 border border-border/30 overflow-hidden divide-y divide-border/20">
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Auto-save transcripts</span>
              <button onClick={() => onAutoSaveTranscripts(!autoSaveTranscripts)}
                className={cn('toggle-switch-apple', autoSaveTranscripts && 'checked')}>
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">AI corrections in transcript</span>
              <button onClick={() => onAiCorrections(!aiCorrections)}
                className={cn('toggle-switch-apple', aiCorrections && 'checked')}>
                <div className="toggle-switch-track-apple" />
                <div className="toggle-switch-thumb-apple" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Subscription ── */}
        {user && (
          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3 px-1">Subscription</h2>
            <div className="rounded-2xl bg-card/50 border border-border/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {isSubscribed(user.id) ? 'Talkingo Premium' : 'Free Plan'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isSubscribed(user.id)
                      ? 'Manage your plan, billing, and payment methods'
                      : `${getRemainingMessages(user.id)} messages remaining today`
                    }
                  </p>
                </div>
                <Crown className={`w-5 h-5 ${isSubscribed(user.id) ? 'text-primary' : 'text-muted-foreground/40'}`} />
              </div>
              <button
                onClick={async () => {
                  try {
                    const info = localStorage.getItem(`talkingo_subscription_${user.id}`)
                    const customerId = info ? JSON.parse(info).customerId : null
                    if (!customerId) {
                      // No subscription yet — redirect to checkout (monthly by default)
                      const res = await fetch('/api/stripe/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ plan: 'monthly', email: user.email, userId: user.id }),
                      })
                      const { url } = await res.json()
                      if (url) window.location.href = url
                      return
                    }
                    const res = await fetch('/api/stripe/portal', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customerId }),
                    })
                    const { url } = await res.json()
                    if (url) window.location.href = url
                  } catch { alert('Could not open billing portal') }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-primary/8 border border-primary/20 text-sm font-medium text-primary hover:bg-primary/14 transition-all flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {(() => {
                  try {
                    const info = localStorage.getItem(`talkingo_subscription_${user.id}`)
                    const parsed = info ? JSON.parse(info) : null
                    return parsed?.customerId ? 'Manage Subscription' : 'Subscribe Now'
                  } catch { return 'Subscribe Now' }
                })()}
              </button>
            </div>
          </section>
        )}

        {/* ── Sign out ── */}
        {user && (
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-error/8 border border-error/20 text-error text-sm font-medium hover:bg-error/12 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}

      </div>
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
          'bg-card/80 hover:bg-card/95 cursor-pointer',
          open
            ? `ring-2 ${accentClasses.ring}`
            : 'border-border/40 hover:border-border/60'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', accentClasses.dot)} />}
          <span className="truncate text-foreground">{displayLabel}</span>
          {selected?.badge && <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">{selected.badge}</span>}
        </div>
        <ChevronDown className={cn('w-3 h-3 text-muted-foreground/50 transition-transform flex-shrink-0 ml-1', open && 'rotate-180')} />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 py-1.5 rounded-xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/20 max-h-48 overflow-y-auto custom-scrollbar animate-fade-in">
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
                {opt.badge && <span className="text-[9px] text-muted-foreground/50">{opt.badge}</span>}
              </button>
              {/* Play button */}
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(opt.id) }}
                className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ml-1',
                  previewingId === opt.id
                    ? `${accentClasses.active}`
                    : 'text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted/40'
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
