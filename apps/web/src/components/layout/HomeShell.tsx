'use client'

import { useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { BottomNav, type HomeTab } from './BottomNav'
import { TalkScreen } from './TalkScreen'
import { LearnScreen } from './LearnScreen'
import { HistoryScreen } from './HistoryScreen'
import { ProfileScreen } from './ProfileScreen'
import type {
  LanguageProgress, UserPreferences, TargetLanguage,
  PersonaId, DomainScores,
} from '@talkingo/shared/types'

interface HomeShellProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userName?: string
  userId: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  interactionMode: 'manual' | 'handsfree' | 'callonly' | 'live'
  onInteractionModeChange: (mode: 'manual' | 'handsfree' | 'callonly' | 'live') => void
  onOpenPhraseBank: () => void
  onReassess: () => void
  /** Settings props */
  settingsMicSensitivity: number
  settingsNoiseCancellation: boolean
  settingsTheme: 'light' | 'dark' | 'auto'
  settingsAutoSave: boolean
  settingsAiCorrections: boolean
  settingsVoiceSpeed: number
  autoPlayMode: 'always' | 'handsfree-only' | 'never'
  onMicSensitivity: (v: number) => void
  onNoiseCancellation: (v: boolean) => void
  onTheme: (v: 'light' | 'dark' | 'auto') => void
  onAutoSaveTranscripts: (v: boolean) => void
  onAiCorrections: (v: boolean) => void
  onVoiceSpeed: (v: number) => void
  onAutoPlayMode: (v: 'always' | 'handsfree-only' | 'never') => void
  /** Learning prefs */
  learningPrefs: {
    targetLanguage?: string
    nativeLanguage?: string
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }
  onLearningPrefsChange: (changes: {
    targetLanguage?: string
    nativeLanguage?: string
    cefr?: string
    learningGoal?: string
    correctionStyle?: 'direct' | 'silent'
  }) => void
  /** Persona */
  currentPersona?: PersonaId
  onPersonaChange: (p: PersonaId) => void
  domainScores?: DomainScores
}

export function HomeShell({
  preferences,
  progress,
  userName,
  userId,
  onStartSession,
  interactionMode,
  onInteractionModeChange,
  onOpenPhraseBank,
  onReassess,
  settingsMicSensitivity,
  settingsNoiseCancellation,
  settingsTheme,
  settingsAutoSave,
  settingsAiCorrections,
  settingsVoiceSpeed,
  autoPlayMode,
  onMicSensitivity,
  onNoiseCancellation,
  onTheme,
  onAutoSaveTranscripts,
  onAiCorrections,
  onVoiceSpeed,
  onAutoPlayMode,
  learningPrefs,
  onLearningPrefsChange,
  currentPersona,
  onPersonaChange,
  domainScores,
}: HomeShellProps) {
  const [activeTab, setActiveTab] = useState<HomeTab>('talk')

  return (
    <div className="relative h-dvh flex flex-col bg-background overflow-hidden">
      {/* Ambient background — toned down, single orb for depth without noise */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1 opacity-20" />
        <div className="ambient-orb ambient-orb-2 opacity-15" />
      </div>

      {/* Tab content */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col">
        {activeTab === 'talk' && (
          <TalkScreen
            preferences={preferences}
            progress={progress}
            userName={userName}
            userId={userId}
            onStartSession={onStartSession}
            interactionMode={interactionMode}
            onInteractionModeChange={onInteractionModeChange}
            onNavigateToLearn={() => setActiveTab('learn')}
          />
        )}
        {activeTab === 'learn' && (
          <LearnScreen
            preferences={preferences}
            progress={progress}
            userId={userId}
            onStartSession={onStartSession}
            onOpenPhraseBank={onOpenPhraseBank}
            onReassess={onReassess}
          />
        )}
        {activeTab === 'history' && (
          <HistoryScreen />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            micSensitivity={settingsMicSensitivity}
            noiseCancellation={settingsNoiseCancellation}
            theme={settingsTheme}
            autoSaveTranscripts={settingsAutoSave}
            aiCorrections={settingsAiCorrections}
            voiceSpeed={settingsVoiceSpeed}
            autoPlayVoiceNotes={autoPlayMode}
            onMicSensitivity={onMicSensitivity}
            onNoiseCancellation={onNoiseCancellation}
            onTheme={onTheme}
            onAutoSaveTranscripts={onAutoSaveTranscripts}
            onAiCorrections={onAiCorrections}
            onVoiceSpeed={onVoiceSpeed}
            onAutoPlayVoiceNotes={onAutoPlayMode}
            learningPrefs={learningPrefs}
            onLearningPrefsChange={onLearningPrefsChange}
            onReassess={onReassess}
            currentPersona={currentPersona}
            onPersonaChange={onPersonaChange}
            domainScores={domainScores}
          />
        )}
      </div>

      {/* Bottom navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
