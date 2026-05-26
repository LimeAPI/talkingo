'use client'

/**
 * SettingsDrawer — right-side drawer on desktop, bottom sheet on mobile.
 * iOS-style grouped sections. Extracted from TopControlBar for clean separation.
 */

import { useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import {
  X, LogOut, Edit2, Check, X as XIcon, Target, Plane, Briefcase,
  Home as Home2, Theater as Theater2, Moon, Sun, Monitor,
  Mic, Volume2, MessageSquare, Trash2, Clock, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AvatarSVG } from '../ui/AvatarSVG'
import { AI_PERSONAS, isPersonaUnlocked, getPersonaById } from '@talkingo/shared/gemini/personas'
import type { PersonaId, DomainScores } from '@talkingo/shared/types'
import { LANGUAGES } from '@talkingo/shared/languages'
import { getConversations, deleteConversation, formatDuration, formatDate, type SavedConversation } from '@/lib/utils/conversation-history'
import { updateUserName } from '@/lib/auth/auth'
import { VoicePicker } from '../settings/VoicePicker'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
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

export function SettingsDrawer({
  isOpen,
  onClose,
  micSensitivity, noiseCancellation, theme, autoSaveTranscripts,
  aiCorrections, voiceSpeed, autoPlayVoiceNotes,
  onMicSensitivity, onNoiseCancellation, onTheme, onAutoSaveTranscripts,
  onAiCorrections, onVoiceSpeed, onAutoPlayVoiceNotes,
  learningPrefs, onLearningPrefsChange, onReassess,
  currentPersona = 'eli', onPersonaChange, domainScores,
  selectedLiveVoice = 'Aoede', selectedChatVoice = '',
  onLiveVoiceChange = () => {}, onChatVoiceChange = () => {},
}: SettingsDrawerProps) {
  const { user, signOut, refresh } = useAuth()
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')

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

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="bottom-sheet-overlay animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="settings-drawer animate-slide-right sm:animate-fade-in">
        {/* Handle (mobile only) */}
        <div className="sheet-handle sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 flex-shrink-0">
          <h2 className="text-base font-bold text-foreground">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-muted/50 flex items-center justify-center transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4 text-foreground/70" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">

          {/* ── Account ── */}
          {user && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">Account</h3>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0 shadow-md">
                    <span className="text-sm font-bold text-white">
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
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-border/60 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button onClick={handleSaveName} disabled={!editName.trim()} className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-40">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setIsEditingName(false)} className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center">
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{user.name || 'User'}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  )}
                  {!isEditingName && (
                    <button onClick={() => { setEditName(user.name || ''); setIsEditingName(true) }}
                      className="w-7 h-7 rounded-lg hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="settings-row">
                  <LogOut className="w-4 h-4 text-error flex-shrink-0" />
                  <button onClick={() => signOut()} className="flex-1 text-sm text-error font-medium text-left">
                    Sign Out
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── Learning ── */}
          {learningPrefs && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">Learning</h3>
              <div className="space-y-2">
                <div className="settings-group">
                  <div className="settings-row flex-col items-start gap-1.5">
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
                  <div className="settings-row flex-col items-start gap-1.5">
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
                <div className="settings-group">
                  <div className="settings-row flex-col items-start gap-2">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-medium text-muted-foreground">My level</span>
                      <span className="text-xs font-bold text-primary">{learningPrefs.cefr || 'A1'}</span>
                    </div>
                    <div className="grid grid-cols-6 gap-1 w-full">
                      {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() => onLearningPrefsChange?.({ cefr: level })}
                          className={cn(
                            'py-1.5 rounded-lg text-[10px] font-bold transition-all text-center',
                            learningPrefs.cefr === level
                              ? 'bg-gradient-to-br from-primary/20 to-secondary/15 border border-primary/40 text-primary'
                              : 'bg-muted/30 border border-border/30 text-foreground/60 hover:text-foreground hover:border-border/60'
                          )}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    {onReassess && (
                      <button
                        onClick={() => { onReassess(); onClose() }}
                        className="w-full px-3 py-2 rounded-lg bg-secondary/10 border border-secondary/25 text-xs font-medium text-secondary hover:bg-secondary/18 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Target className="w-3.5 h-3.5" />
                        Take a conversation test
                      </button>
                    )}
                  </div>
                </div>

                {/* Goal */}
                <div className="settings-group">
                  <div className="settings-row flex-col items-start gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Learning goal</span>
                    <div className="grid grid-cols-2 gap-1.5 w-full">
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
                            'px-2.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                            learningPrefs.learningGoal === g.id
                              ? 'bg-primary/12 border border-primary/35 text-primary'
                              : 'bg-muted/30 border border-border/30 text-foreground/70 hover:border-border/60'
                          )}
                        >
                          <g.Icon className="w-3 h-3 flex-shrink-0" />
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Correction style */}
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Direct corrections</p>
                      <p className="text-xs text-muted-foreground">
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
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">Audio</h3>
            <div className="settings-group">
              <div className="settings-row">
                <Mic className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Mic sensitivity</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-8 text-right">{micSensitivity}%</span>
                  <input type="range" min="0" max="100" value={micSensitivity}
                    onChange={(e) => onMicSensitivity(Number(e.target.value))}
                    className="custom-range-apple w-20" />
                </div>
              </div>
              <div className="settings-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Noise cancellation</p>
                </div>
                <button onClick={() => onNoiseCancellation(!noiseCancellation)}
                  className={cn('toggle-switch-apple', noiseCancellation && 'checked')}>
                  <div className="toggle-switch-track-apple" />
                  <div className="toggle-switch-thumb-apple" />
                </button>
              </div>
              <div className="settings-row">
                <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Voice speed</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-8 text-right">{voiceSpeed.toFixed(1)}×</span>
                  <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSpeed}
                    onChange={(e) => onVoiceSpeed(Number(e.target.value))}
                    className="custom-range-apple w-20" />
                </div>
              </div>
              <div className="settings-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Auto-play voice notes</p>
                  <p className="text-xs text-muted-foreground">
                    {autoPlayVoiceNotes === 'always' ? 'Always plays' : autoPlayVoiceNotes === 'never' ? 'Never plays' : 'Hands-free only'}
                  </p>
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

          {/* ── Appearance ── */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">Voice</h3>
            <div className="settings-group">
              <div className="px-3 py-3">
                <VoicePicker
                  targetLanguage={learningPrefs?.targetLanguage || 'en'}
                  selectedLiveVoice={selectedLiveVoice}
                  selectedChatVoice={selectedChatVoice}
                  onLiveVoiceChange={onLiveVoiceChange}
                  onChatVoiceChange={onChatVoiceChange}
                />
              </div>
            </div>
          </section>

          {/* ── Appearance ── */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">Appearance</h3>
            <div className="settings-group">
              <div className="settings-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Theme</p>
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-muted/40 border border-border/30">
                  {([
                    { value: 'light', Icon: Sun },
                    { value: 'auto',  Icon: Monitor },
                    { value: 'dark',  Icon: Moon },
                  ] as const).map(({ value, Icon }) => (
                    <button
                      key={value}
                      onClick={() => onTheme(value)}
                      className={cn(
                        'w-8 h-7 rounded-lg flex items-center justify-center transition-all',
                        theme === value
                          ? 'bg-card shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── AI Partner ── */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">AI Partner</h3>
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
                      'relative flex items-start gap-2 p-3 rounded-xl border transition-all text-left',
                      selected
                        ? 'bg-gradient-to-br from-primary/12 to-secondary/8 border-primary/35 shadow-sm'
                        : unlocked
                          ? 'bg-card/50 border-border/35 hover:border-border/60 hover:bg-card/70'
                          : 'bg-card/30 border-border/25 opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-border/40 flex-shrink-0">
                      <AvatarSVG personaId={persona.id} size={32} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className={cn('text-xs font-semibold block truncate', selected ? 'text-primary' : 'text-foreground')}>
                        {persona.name}{!unlocked && ' 🔒'}
                      </span>
                      <span className="text-[10px] text-muted-foreground block leading-snug line-clamp-2">
                        {unlocked ? persona.description : persona.unlockCondition ? `Unlocks at ${persona.unlockCondition.domain} ${persona.unlockCondition.level}` : 'Locked'}
                      </span>
                    </div>
                    {selected && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Data ── */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2 px-1">Data</h3>
            <div className="settings-group">
              <div className="settings-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Auto-save transcripts</p>
                </div>
                <button onClick={() => onAutoSaveTranscripts(!autoSaveTranscripts)}
                  className={cn('toggle-switch-apple', autoSaveTranscripts && 'checked')}>
                  <div className="toggle-switch-track-apple" />
                  <div className="toggle-switch-thumb-apple" />
                </button>
              </div>
              <div className="settings-row">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">AI corrections in transcript</p>
                </div>
                <button onClick={() => onAiCorrections(!aiCorrections)}
                  className={cn('toggle-switch-apple', aiCorrections && 'checked')}>
                  <div className="toggle-switch-track-apple" />
                  <div className="toggle-switch-thumb-apple" />
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
