'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BottomNav, type HomeTab } from './BottomNav'
import { DesktopTopNav } from './DesktopSidebar'
import { TalkScreen, type LearningMode, type InputMethod } from './TalkScreen'
import { LearnScreen } from './LearnScreen'
import { HistoryScreen } from './HistoryScreen'
import { ProfileScreen } from './ProfileScreen'
import type {
  LanguageProgress, UserPreferences, TargetLanguage,
  PersonaId, ScriptPreference,
} from '@talkingo/shared/types'

interface HomeShellProps {
  preferences: UserPreferences
  progress: LanguageProgress | null
  userName?: string
  userId: string | null
  onStartSession: (scenarioId: string, mode: 'continue' | 'new') => void
  learningMode: LearningMode
  inputMethod: InputMethod
  onLearningModeChange: (mode: LearningMode) => void
  onInputMethodChange: (method: InputMethod) => void
  onReassess: () => void
  /** Advance the learner's level (manual progression from the Learn page). */
  onLevelUp?: (newLevel: number) => void
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
    talkingoLevel?: number
  }
  onLearningPrefsChange: (changes: {
    targetLanguage?: string
    nativeLanguage?: string
    talkingoLevel?: number
  }) => void
  /** Persona */
  currentPersona?: PersonaId
  onPersonaChange: (p: PersonaId) => void
  /** Script preference */
  showScriptToggle?: boolean
  effectiveScript?: ScriptPreference
  onScriptChange?: (script: ScriptPreference) => void
  /** Optional controlled tab state. When provided, the active tab is owned by
   *  the parent so it survives leaving/returning to the home shell (e.g. after
   *  a conversation). Falls back to internal state when omitted. */
  activeTab?: HomeTab
  onTabChange?: (tab: HomeTab) => void
}

export function HomeShell({
  preferences,
  progress,
  userName,
  userId,
  onStartSession,
  learningMode,
  inputMethod,
  onLearningModeChange,
  onInputMethodChange,
  onReassess,
  onLevelUp,
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
  showScriptToggle,
  effectiveScript,
  onScriptChange,
  activeTab: controlledActiveTab,
  onTabChange,
}: HomeShellProps) {
  const [internalTab, setInternalTab] = useState<HomeTab>('talk')
  // Controlled when the parent supplies the tab; otherwise self-managed.
  const activeTab = controlledActiveTab ?? internalTab
  const setActiveTab = onTabChange ?? setInternalTab

  return (
    <div className="relative h-dvh flex bg-background overflow-hidden">
      <DesktopTopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName={userName}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative flex-1 flex flex-col min-h-0">
          {/* Tab content */}
          <div className="relative z-10 flex-1 min-h-0 flex flex-col md:pt-24">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                className="flex-1 min-h-0 flex flex-col"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
            {activeTab === 'talk' && (
              <TalkScreen
                preferences={preferences}
                progress={progress}
                userName={userName}
                userId={userId}
                onStartSession={onStartSession}
                learningMode={learningMode}
                inputMethod={inputMethod}
                onLearningModeChange={onLearningModeChange}
                onInputMethodChange={onInputMethodChange}
                onNavigateToLearn={() => setActiveTab('learn')}
              />
            )}
            {activeTab === 'learn' && (
              <LearnScreen
                preferences={preferences}
                progress={progress}
                userId={userId}
                onStartSession={onStartSession}
                onReassess={onReassess}
                onLevelUp={onLevelUp}
              />
            )}
            {activeTab === 'history' && (
              <HistoryScreen userId={userId} />
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
                showScriptToggle={showScriptToggle}
                effectiveScript={effectiveScript}
                onScriptChange={onScriptChange}
                streak={progress?.streakDays}
                sessionCount={progress?.totalSessions}
                totalHours={progress?.totalMinutes !== undefined ? Math.round((progress.totalMinutes / 60) * 10) / 10 : undefined}
                onGoToPath={() => setActiveTab('learn')}
              />
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  )
}
