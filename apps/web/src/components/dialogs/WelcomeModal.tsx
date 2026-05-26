'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn, cefrToLanguageLevel } from '@talkingo/shared/utils'
import {
  Sparkles, ChevronRight, Globe, Target, User, Mic, Loader2, ArrowLeft, Send,
  CheckCircle, AlertCircle, TrendingUp, Plane, Briefcase, Home, Theater, Type, UserCircle2, Volume2
} from 'lucide-react'
import type {
  UserPreferences, PersonaId, TargetLanguage, LearningGoal,
  LanguageLevel, CefrLevel, OnboardingTurn, DomainScores
} from '@talkingo/shared/types'
import { DEFAULT_DOMAIN_SCORES } from '@talkingo/shared/types'
import { LANGUAGES, getLanguageMeta, hasScriptOptions, getSupportedScripts, hasGrammaticalGender } from '@talkingo/shared/languages'
import { getStartingSeedForCefr } from '@talkingo/shared/curriculum'
import { cefrToTalkingoLevel, getLevelByNumber } from '@talkingo/shared/levels'
import { geminiClient, type MicErrorKind } from '@/lib/api/gemini-client'
import { TalkingoLogo } from '../ui/TalkingoLogo'

interface WelcomeModalProps {
  onComplete: (preferences: UserPreferences) => void
  initialPreferences?: UserPreferences | null
  forceFullFlow?: boolean
  /** If true, skip directly to level assessment (for re-assessment from settings) */
  reassessmentMode?: boolean
}

const GOAL_DEFAULTS: Record<LearningGoal, { topic: string; persona: PersonaId; correctionStyle: 'direct' | 'silent' }> = {
  travel:       { topic: 'travel', persona: 'sofia',   correctionStyle: 'silent' },
  career:       { topic: 'work',   persona: 'dr-luma', correctionStyle: 'direct' },
  'daily-life': { topic: 'general',persona: 'eli',     correctionStyle: 'silent' },
  academic:     { topic: 'culture',persona: 'dr-luma', correctionStyle: 'direct' },
  cultural:     { topic: 'culture',persona: 'sofia',   correctionStyle: 'silent' },
}

const LEARNING_GOALS = [
  { value: 'travel' as LearningGoal,     label: 'Travel & Explore',   icon: Plane,    description: 'Conversations for adventures' },
  { value: 'career' as LearningGoal,     label: 'Career Growth',       icon: Briefcase, description: 'Professional skills' },
  { value: 'daily-life' as LearningGoal, label: 'Daily Conversations', icon: Home,     description: 'Everyday interactions' },
  { value: 'cultural' as LearningGoal,   label: 'Cultural Connection', icon: Theater,  description: 'Cultural depth' },
]

const MAX_ONBOARDING_TURNS = 5

export function WelcomeModal({ onComplete, initialPreferences, reassessmentMode }: WelcomeModalProps) {
  const [isVisible, setIsVisible] = useState(false)
  // In reassessment mode, start at choice screen; otherwise start at setup
  const [step, setStep] = useState<'setup' | 'choice' | 'conversation' | 'analyzing' | 'results' | 'level-select'>(
    reassessmentMode ? 'choice' : 'setup'
  )

  // Step 1: setup
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>(initialPreferences?.targetLanguage ?? 'en')
  const [nativeLanguage, setNativeLanguage] = useState<string>(initialPreferences?.nativeLanguage ?? '')
  const [preferredScript, setPreferredScript] = useState<'native' | 'latin'>(
    initialPreferences?.preferredScript === 'latin' ? 'latin' : 'native'
  )
  const [learnerGender, setLearnerGender] = useState<'masculine' | 'feminine' | undefined>(
    initialPreferences?.learnerGender
  )
  const [learningGoal, setLearningGoal] = useState<LearningGoal | null>(initialPreferences?.learningGoal ?? null)
  const [userName, setUserName] = useState(initialPreferences?.userName ?? '')

  // Step 2: onboarding conversation
  const [turns, setTurns] = useState<OnboardingTurn[]>([])
  const [userInput, setUserInput] = useState('')
  const [isAiTyping, setIsAiTyping] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [micError, setMicError] = useState<MicErrorKind | null>(null)
  const [turnCount, setTurnCount] = useState(0)
  const [assessmentError, setAssessmentError] = useState<string | null>(null)
  const chatHistoryRef = useRef<Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Step 3: manual level selection
  const [selectedManualLevel, setSelectedManualLevel] = useState<CefrLevel | null>(null)

  // Step 4: assessment results
  const [assessmentResult, setAssessmentResult] = useState<{
    cefr: CefrLevel
    level: LanguageLevel
    domainScores: DomainScores
    weakPatterns: string[]
    encouragement: string
  } | null>(null)

  const meta = getLanguageMeta(targetLanguage)

  useEffect(() => { setTimeout(() => setIsVisible(true), 100) }, [])

  useEffect(() => {
    geminiClient.setErrorCallback((kind) => { setMicError(kind); setIsListening(false) })
    return () => geminiClient.setErrorCallback(null)
  }, [])

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // ── Start the onboarding conversation ──────────────────────────────────────
  const startConversation = useCallback(async () => {
    if (!learningGoal) return
    geminiClient.setLanguage(targetLanguage)
    setStep('conversation')
    setAssessmentError(null)
    setIsAiTyping(true)
    try {
      const aiText = await geminiClient.onboardingTurn([], null, targetLanguage, learningGoal)
      const aiTurn: OnboardingTurn = { role: 'ai', text: aiText }
      setTurns([aiTurn])
      chatHistoryRef.current = [{ role: 'model', parts: [{ text: aiText }] }]
      setTurnCount(1)
      // Speak the opener
      geminiClient.speak(aiText, { targetLanguage })
    } catch (err) {
      console.warn('[Onboarding] AI failed to open:', err)
      setAssessmentError('Failed to start conversation. Please try again.')
      // Don't auto-start - let user retry or choose manual
    } finally {
      setIsAiTyping(false)
    }
  }, [learningGoal, targetLanguage])

  // ── Send a user turn ───────────────────────────────────────────────────────
  const sendTurn = useCallback(async (text: string) => {
    if (!text.trim() || isAiTyping) return
    const trimmed = text.trim()
    setUserInput('')
    setAssessmentError(null)

    const userTurn: OnboardingTurn = { role: 'user', text: trimmed }
    const newTurns = [...turns, userTurn]
    setTurns(newTurns)
    chatHistoryRef.current.push({ role: 'user', parts: [{ text: trimmed }] })

    // Count AI responses to determine progress (not user turns)
    const aiResponsesCount = turns.filter(t => t.role === 'ai').length

    // After 5 complete turns (AI has responded 5 times), go to analysis
    if (aiResponsesCount >= MAX_ONBOARDING_TURNS - 1) {
      // This was the last user turn before final AI response
      setIsAiTyping(true)
      try {
        const aiText = await geminiClient.onboardingTurn(
          chatHistoryRef.current.slice(0, -1),
          trimmed,
          targetLanguage,
          learningGoal ?? undefined
        )
        const aiTurn: OnboardingTurn = { role: 'ai', text: aiText }
        setTurns((prev) => [...prev, aiTurn])
        chatHistoryRef.current.push({ role: 'model', parts: [{ text: aiText }] })
        geminiClient.speak(aiText, { targetLanguage })
        
        // Now analyze after complete 5-turn conversation
        setTimeout(() => {
          setStep('analyzing')
          analyzeAndFinish([...newTurns, aiTurn])
        }, 1000)
      } catch (err) {
        console.warn('[Onboarding] Final AI turn failed:', err)
        setAssessmentError('Having trouble connecting. You can retry or skip to manual selection.')
      } finally {
        setIsAiTyping(false)
      }
      return
    }

    // Continue conversation - get next AI response
    setIsAiTyping(true)
    try {
      const aiText = await geminiClient.onboardingTurn(
        chatHistoryRef.current.slice(0, -1),
        trimmed,
        targetLanguage,
        learningGoal ?? undefined
      )
      const aiTurn: OnboardingTurn = { role: 'ai', text: aiText }
      setTurns((prev) => [...prev, aiTurn])
      chatHistoryRef.current.push({ role: 'model', parts: [{ text: aiText }] })
      setTurnCount(aiResponsesCount + 2) // Update count based on AI responses
      geminiClient.speak(aiText, { targetLanguage })
    } catch (err) {
      console.warn('[Onboarding] AI turn failed:', err)
      setAssessmentError('Connection issue. Try again or skip to manual level selection.')
    } finally {
      setIsAiTyping(false)
    }
  }, [turns, isAiTyping, targetLanguage, learningGoal])

  // ── Analyze transcript and show results ─────────────────────────────────────
  const analyzeAndFinish = useCallback(async (finalTurns: OnboardingTurn[]) => {
    setStep('analyzing')
    geminiClient.stopSpeaking()
    try {
      const assessment = await geminiClient.assessOnboardingTranscript(finalTurns, targetLanguage)
      setAssessmentResult(assessment) // Store for display
      // Don't call finish yet - show results first
      setStep('results')
    } catch (err) {
      console.warn('[Onboarding] Assessment failed:', err)
      setAssessmentError('Assessment failed to complete. Please choose an option below.')
      setStep('results') // Show error in results screen
    }
  }, [targetLanguage])

  // ── Skip to defaults with specific level ────────────────────────────────────
  const skipToLevel = useCallback((cefr: CefrLevel) => {
    if (!learningGoal) return
    const defaults = GOAL_DEFAULTS[learningGoal]
    const level = cefrToLanguageLevel(cefr)
    const startingSeed = getStartingSeedForCefr(cefr)
    const prefs: UserPreferences = {
      level,
      cefr,
      domainScores: {
        vocabulary: cefr,
        grammar: cefr,
        fluency: cefr,
        listening: cefr,
      },
      topic: defaults.topic,
      correctionStyle: defaults.correctionStyle,
      persona: defaults.persona,
      userName: userName || undefined,
      targetLanguage,
      nativeLanguage: nativeLanguage || undefined,
      learningGoal,
      onboardingComplete: true,
      currentUnitId: startingSeed.id,
      preferredScript: hasScriptOptions(targetLanguage) ? preferredScript : undefined,
      learnerGender: hasGrammaticalGender(targetLanguage) ? learnerGender : undefined,
    }
    finish(prefs)
  }, [learningGoal, targetLanguage, nativeLanguage, userName, preferredScript, learnerGender])

  const skipToDefaults = useCallback(() => {
    skipToLevel('A2')
  }, [skipToLevel])

  const finish = (prefs: UserPreferences) => {
    setIsVisible(false)
    setTimeout(() => onComplete(prefs), 250)
  }

  // ── Retry assessment ───────────────────────────────────────────────────────
  const retryAssessment = useCallback(() => {
    setTurns([])
    chatHistoryRef.current = []
    setTurnCount(0)
    setAssessmentError(null)
    startConversation()
  }, [startConversation])

  // ── Voice input ────────────────────────────────────────────────────────────
  const toggleVoice = useCallback(async () => {
    setMicError(null)
    if (isListening) {
      geminiClient.stopListening()
      setIsListening(false)
      return
    }
    setIsListening(true)
    await geminiClient.startListening((text, isFinal) => {
      setUserInput(text)
      if (isFinal) {
        setIsListening(false)
        geminiClient.stopListening()
      }
    })
  }, [isListening])

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderSetup = () => (
    <div className="flex flex-col">
      <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-1">
        <div className="text-center mb-6">
        <div className="flex justify-center mb-4"><TalkingoLogo size="lg" /></div>
        <h2 className="font-display text-2xl font-extrabold text-aurora mb-2">
          Hi! Let's set up your tutor
        </h2>
        <p className="text-sm text-muted-foreground">
          A real-time pal who teaches you a language by talking with you.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Globe className="w-4 h-4 text-primary" /> Which language are you learning?
          </label>
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value as TargetLanguage)}
            className="w-full px-4 py-2.5 pr-10 rounded-lg border border-border/60 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            }}
          >
            {Object.values(LANGUAGES).map((l) => (
              <option key={l.code} value={l.code}>{l.english} — {l.native}</option>
            ))}
          </select>
        </div>

        {/* Script Selection - Only show for languages with multiple script options */}
        {hasScriptOptions(targetLanguage) && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Type className="w-4 h-4 text-primary" /> How would you like to read and write?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPreferredScript('native')}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  preferredScript === 'native'
                    ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                    : 'border-border/60 hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <span className="text-sm font-medium block mb-1">Native Script</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  Learn with {meta.native} characters
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPreferredScript('latin')}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  preferredScript === 'latin'
                    ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                    : 'border-border/60 hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <span className="text-sm font-medium block mb-1">Latin (Romanized)</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  Use familiar A-Z letters
                </span>
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              You can switch anytime in settings
            </p>
          </div>
        )}

        {/* Grammatical Gender Selection - Only show for languages with gender agreement */}
        {hasGrammaticalGender(targetLanguage) && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <UserCircle2 className="w-4 h-4 text-primary" /> How should the AI refer to you?
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              This helps the AI use correct grammar when talking about you
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLearnerGender('masculine')}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  learnerGender === 'masculine'
                    ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                    : 'border-border/60 hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <span className="text-sm font-medium block mb-1">As masculine</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  {targetLanguage === 'fr' && 'il'}
                  {targetLanguage === 'es' && 'él'}
                  {targetLanguage === 'ar' && 'هو'}
                  {targetLanguage === 'de' && 'er'}
                  {targetLanguage === 'it' && 'lui'}
                  {targetLanguage === 'ru' && 'он'}
                  {targetLanguage === 'pl' && 'on'}
                  {targetLanguage === 'ro' && 'el'}
                  {targetLanguage === 'uk' && 'він'}
                  {targetLanguage === 'hi' && 'वह'}
                  {!['fr','es','ar','de','it','ru','pl','ro','uk','hi'].includes(targetLanguage) && 'he/him'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLearnerGender('feminine')}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  learnerGender === 'feminine'
                    ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                    : 'border-border/60 hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <span className="text-sm font-medium block mb-1">As feminine</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  {targetLanguage === 'fr' && 'elle'}
                  {targetLanguage === 'es' && 'ella'}
                  {targetLanguage === 'ar' && 'هي'}
                  {targetLanguage === 'de' && 'sie'}
                  {targetLanguage === 'it' && 'lei'}
                  {targetLanguage === 'ru' && 'она'}
                  {targetLanguage === 'pl' && 'ona'}
                  {targetLanguage === 'ro' && 'ea'}
                  {targetLanguage === 'uk' && 'вона'}
                  {targetLanguage === 'hi' && 'वह'}
                  {!['fr','es','ar','de','it','ru','pl','ro','uk','hi'].includes(targetLanguage) && 'she/her'}
                </span>
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Target className="w-4 h-4 text-primary" /> Why are you learning?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {LEARNING_GOALS.map((g) => (
              <button
                key={g.value}
                onClick={() => setLearningGoal(g.value)}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all',
                  learningGoal === g.value
                    ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                    : 'border-border/60 hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <g.icon className="w-4 h-4 text-primary mb-1.5" />
                <span className="text-sm font-medium block">{g.label}</span>
                <span className="text-xs text-muted-foreground mt-0.5 block leading-tight">{g.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="userName" className="flex items-center gap-2 text-sm font-medium mb-2">
            <User className="w-4 h-4 text-primary" /> What should I call you?{' '}
            <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="userName" type="text" value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Your name" maxLength={100}
            className="w-full px-4 py-2.5 rounded-lg border border-border/60 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Globe className="w-4 h-4 text-primary" /> What's your native language?{' '}
            <span className="text-xs text-muted-foreground font-normal">(helps with explanations)</span>
          </label>
          <select
            value={nativeLanguage}
            onChange={(e) => setNativeLanguage(e.target.value)}
            className="w-full px-4 py-2.5 pr-10 rounded-lg border border-border/60 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            }}
          >
            <option value="">— Select (optional) —</option>
            {Object.values(LANGUAGES).map((l) => (
              <option key={l.code} value={l.code}>{l.english} — {l.native}</option>
            ))}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">
            This helps the AI explain tricky concepts using your language as a reference.
          </p>
        </div>
        </div>
      </div>

      <div className="px-6 sm:px-8 pb-6 sm:pb-8 border-t border-border/20 bg-card/95 pt-4">
        <button
          onClick={() => setStep('choice')}
          disabled={!learningGoal || (hasGrammaticalGender(targetLanguage) && !learnerGender)}
          className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-white font-medium text-sm hover:shadow-lg hover:shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>

        <p className="mt-3 text-[10px] text-center text-muted-foreground/60">
          We'll have a 5-turn conversation in {meta.native} to find your level. No test — just talking.
          {hasScriptOptions(targetLanguage) && preferredScript === 'latin' && (
            <span className="block mt-1">Using Latin (romanized) script for easier reading.</span>
          )}
          {hasGrammaticalGender(targetLanguage) && learnerGender && (
            <span className="block mt-1">
              AI will use {learnerGender === 'masculine' ? 'masculine' : 'feminine'} grammar forms.
            </span>
          )}
        </p>
      </div>
    </div>
  )

  const renderConversation = () => {
    // Calculate completed turns (user+AI pairs)
    const completedTurns = Math.floor(turns.filter(t => t.role === 'ai').length)
    const currentQuestion = Math.min(completedTurns + 1, MAX_ONBOARDING_TURNS)

    // Step 3 is mic-only (no text input), Step 4 is listen-and-respond
    const isMicOnlyStep = currentQuestion === 3
    const isListenStep = currentQuestion === 4

    return (
    <div className="flex flex-col h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
        <button
          onClick={() => {
            geminiClient.stopListening()
            geminiClient.stopSpeaking()
            setIsListening(false)
            if (reassessmentMode) {
              // In reassessment mode, going back from conversation should offer cancel
              setStep('choice')
            } else {
              setStep('choice')
            }
            setTurns([])
            chatHistoryRef.current = []
            setTurnCount(0)
          }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold text-foreground">{meta.native} placement chat</p>
          <p className="text-[10px] text-muted-foreground">Question {currentQuestion} of {MAX_ONBOARDING_TURNS}</p>
        </div>
        <button
          onClick={() => setStep('level-select')}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div
        className="h-0.5 bg-muted/30"
        role="progressbar"
        aria-valuenow={Math.round((completedTurns / MAX_ONBOARDING_TURNS) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Placement chat progress"
      >
        <div
          className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
          style={{ width: `${(completedTurns / MAX_ONBOARDING_TURNS) * 100}%` }}
        />
      </div>

      {/* Step hint banner */}
      {isMicOnlyStep && !isAiTyping && turns.length > 0 && (
        <div className="bg-primary/5 border-b border-primary/20 px-5 py-2 flex items-center gap-2">
          <Mic className="w-3.5 h-3.5 text-primary" />
          <p className="text-[11px] text-primary font-medium">Try speaking your answer — tap the mic below</p>
        </div>
      )}
      {isListenStep && !isAiTyping && turns.length > 0 && (
        <div className="bg-secondary/5 border-b border-secondary/20 px-5 py-2 flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-secondary" />
          <p className="text-[11px] text-secondary font-medium">Listen carefully and respond</p>
        </div>
      )}

      {/* Error message */}
      {assessmentError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-5 py-2">
          <p className="text-[10px] text-red-400">{assessmentError}</p>
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                t.role === 'user'
                  ? 'bg-primary/10 border border-primary/20 text-foreground'
                  : 'bg-card/90 border border-border/40 text-foreground'
              )}
              dir={t.role === 'ai' ? meta.direction : 'auto'}
            >
              {t.text}
            </div>
          </div>
        ))}
        {isAiTyping && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl bg-card/90 border border-border/40">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input — adapts based on step */}
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        {micError && (
          <p className="text-[10px] text-amber-500 mb-1">Mic issue: {micError.replace('-', ' ')}. Type instead.</p>
        )}

        {isMicOnlyStep ? (
          /* Mic-only step: large mic button, small text fallback */
          <div className="flex flex-col items-center gap-3 py-2">
            <button
              onClick={toggleVoice}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all',
                isListening
                  ? 'bg-red-500/15 border-red-500/50 text-red-400 scale-110'
                  : 'bg-gradient-to-br from-primary to-primary-glow border-primary/50 text-white hover:scale-105 shadow-lg shadow-primary/25'
              )}
              aria-label={isListening ? 'Stop recording' : 'Start speaking'}
            >
              {isListening
                ? <div className="w-4 h-4 rounded-sm bg-red-500 animate-pulse" />
                : <Mic className="w-7 h-7" />}
            </button>
            <p className="text-[11px] text-muted-foreground">
              {isListening ? 'Listening... tap to stop' : 'Tap to speak your answer'}
            </p>
            {/* Show interim transcript while listening */}
            {isListening && userInput && (
              <p className="text-xs text-foreground/70 italic text-center px-4">{userInput}</p>
            )}
            {/* Send button appears when there's text from voice */}
            {userInput.trim() && !isListening && (
              <button
                onClick={() => sendTurn(userInput)}
                disabled={isAiTyping}
                className="px-4 py-2 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-40"
              >
                Send "{userInput.length > 20 ? userInput.slice(0, 20) + '…' : userInput}"
              </button>
            )}
            {/* Fallback: type instead */}
            <div className="w-full mt-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTurn(userInput) } }}
                  placeholder={`Or type in ${meta.native}…`}
                  dir={meta.direction}
                  lang={meta.bcp47}
                  disabled={isAiTyping}
                  className="flex-1 px-3 py-2 rounded-xl border border-border/40 bg-background/30 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
                {userInput.trim() && (
                  <button
                    onClick={() => sendTurn(userInput)}
                    disabled={isAiTyping}
                    className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40"
                    aria-label="Send"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Normal input: text + mic button */
          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoice}
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center border transition-all flex-shrink-0',
                isListening
                  ? 'bg-red-500/15 border-red-500/50 text-red-400'
                  : 'bg-card/60 border-border/50 text-muted-foreground hover:text-primary hover:border-primary/50'
              )}
              aria-label={isListening ? 'Stop' : 'Speak'}
            >
              {isListening
                ? <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                : <Mic className="w-4 h-4" />}
            </button>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTurn(userInput) } }}
              placeholder={preferredScript === 'latin' ? `Reply in ${meta.english} (use A-Z letters)…` : `Reply in ${meta.native}…`}
              dir={meta.direction}
              lang={meta.bcp47}
              disabled={isAiTyping}
              className="flex-1 px-3 py-2 rounded-xl border border-border/60 bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            <button
              onClick={() => sendTurn(userInput)}
              disabled={!userInput.trim() || isAiTyping}
              className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors flex-shrink-0"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
          {isMicOnlyStep
            ? 'Speaking helps us assess your pronunciation too'
            : `Answer ${preferredScript === 'latin' ? 'using A-Z letters (romanized)' : `in ${meta.native}`} — even a few words is fine`}
        </p>
      </div>
    </div>
  )
}

  const renderAnalyzing = () => (
    <div className="p-8 flex flex-col items-center justify-center gap-5 min-h-[300px]">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-primary animate-pulse" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">Placing you…</h3>
        <p className="text-sm text-muted-foreground">
          Analysing your {meta.native} across vocabulary, grammar, fluency, and listening.
          {hasScriptOptions(targetLanguage) && preferredScript === 'latin' && (
            <span className="block mt-1 text-xs">(Using romanized script)</span>
          )}
        </p>
      </div>
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>
  )

  // ── Phase 2: Choice Screen ──────────────────────────────────────────────────
  const renderChoice = () => (
    <div className="p-6 sm:p-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-2">How would you like to get started?</h2>
        <p className="text-sm text-muted-foreground">
          We recommend the test for best results, but you can skip it
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <button
          onClick={startConversation}
          className="text-left p-5 rounded-xl border-2 border-primary/50 bg-primary/8 hover:bg-primary/12 hover:border-primary/70 transition-all group shadow-sm shadow-primary/10"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold group-hover:text-primary transition-colors">Take Test</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">Recommended</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                5-min chat to find your level automatically
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setStep('level-select')}
          className="text-left p-5 rounded-xl border-2 border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Choose Level</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Manually select your current level
              </p>
            </div>
          </div>
        </button>
      </div>

      <button
        onClick={() => {
          if (reassessmentMode) {
            // In reassessment mode, "Back" should dismiss the modal entirely and return to app
            setIsVisible(false)
            setTimeout(() => onComplete(initialPreferences!), 250)
          } else {
            setStep('setup')
          }
        }}
        className="w-full py-2 px-4 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> {reassessmentMode ? 'Cancel & Go Back' : 'Back'}
      </button>
    </div>
  )

  // ── Phase 3: Manual Level Selector ──────────────────────────────────────────
  const LEVEL_OPTIONS: Array<{ level: CefrLevel; talkingoLvl: number; label: string; description: string }> = [
    { level: 'A1', talkingoLvl: 1, label: 'First Words', description: 'I\'m just starting — teach me from zero' },
    { level: 'A1', talkingoLvl: 2, label: 'Building Blocks', description: 'I know some words and basic phrases' },
    { level: 'A2', talkingoLvl: 3, label: 'Survival Mode', description: 'I can handle simple real-life situations' },
    { level: 'B1', talkingoLvl: 5, label: 'Conversation Ready', description: 'I can hold a basic conversation' },
    { level: 'B2', talkingoLvl: 7, label: 'Confident Speaker', description: 'I speak fairly fluently with some gaps' },
    { level: 'C1', talkingoLvl: 9, label: 'Almost Native', description: 'I\'m comfortable in most situations' },
    { level: 'C2', talkingoLvl: 12, label: 'Mastery', description: 'I speak nearly like a native' },
  ]

  const renderLevelSelect = () => (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <button
          onClick={() => {
            if (reassessmentMode && step === 'level-select') {
              setStep('choice')
            } else {
              setStep('choice')
            }
          }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <h2 className="text-xl font-bold mb-2">Select Your Current Level</h2>
        <p className="text-sm text-muted-foreground">
          What level are you in {meta.native}?
          {hasScriptOptions(targetLanguage) && preferredScript === 'latin' && (
            <span className="block mt-1 text-xs">(Using romanized script)</span>
          )}
        </p>
      </div>

      <div className="space-y-2 mb-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
        {LEVEL_OPTIONS.map(({ level, talkingoLvl, label, description }) => (
          <button
            key={talkingoLvl}
            onClick={() => setSelectedManualLevel(level)}
            className={cn(
              'w-full text-left p-4 rounded-lg border-2 transition-all',
              selectedManualLevel === level
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/60 hover:border-border/80 hover:bg-muted/30'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selectedManualLevel === level ? 'border-primary' : 'border-border'
              )}>
                {selectedManualLevel === level && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                )}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">Lv.{talkingoLvl}</span>
                  <span className="text-sm text-muted-foreground">— {label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => selectedManualLevel && skipToLevel(selectedManualLevel)}
        disabled={!selectedManualLevel}
        className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-white font-medium text-sm hover:shadow-lg hover:shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )

  // ── Phase 4: Results Display ────────────────────────────────────────────────
  const renderResults = () => {
    const hasError = assessmentError !== null
    const result = assessmentResult

    if (!result && !hasError) {
      return renderAnalyzing()
    }

    return (
      <div className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            {hasError ? (
              <AlertCircle className="w-8 h-8 text-amber-500" />
            ) : (
              <CheckCircle className="w-8 h-8 text-primary" />
            )}
          </div>
          <h2 className="text-xl font-bold mb-1">
            {hasError ? 'Assessment Incomplete' : 'Your Placement Results'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasError ? 'We couldn\'t complete the assessment' : `Level ${cefrToTalkingoLevel(result?.cefr || 'A1')} · ${getLevelByNumber(cefrToTalkingoLevel(result?.cefr || 'A1')).name}`}
          </p>
        </div>

        {!hasError && result && (
          <>
            {/* Domain Breakdown */}
            <div className="bg-card/50 border border-border/40 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold mb-3">Breakdown:</h3>
              <div className="space-y-3">
                {(Object.entries(result.domainScores) as Array<[keyof DomainScores, CefrLevel]>).map(([domain, level]) => {
                  const percentage = (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(level) + 1) / 6 * 100
                  return (
                    <div key={domain}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-muted-foreground">{domain}</span>
                        <span className="font-semibold">{level}</span>
                      </div>
                      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Weak Patterns */}
            {result.weakPatterns.length > 0 && (
              <div className="bg-card/50 border border-border/40 rounded-xl p-4 mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Areas to focus:
                </h3>
                <ul className="space-y-1">
                  {result.weakPatterns.slice(0, 3).map((pattern, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Encouragement */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-center italic">{result.encouragement}</p>
            </div>
          </>
        )}

        {hasError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-400 mb-3">{assessmentError}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={retryAssessment}
                className="w-full py-2 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
              >
                Retry Assessment
              </button>
              <button
                onClick={() => setStep('level-select')}
                className="w-full py-2 px-4 rounded-lg border border-border/60 text-sm hover:bg-muted/30 transition-colors"
              >
                Choose Level Manually
              </button>
              <button
                onClick={skipToDefaults}
                className="w-full py-2 px-4 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Use Default (A2)
              </button>
            </div>
          </div>
        )}

        {!hasError && (
          <div className="flex gap-3">
            <button
              onClick={() => setStep('level-select')}
              className="flex-1 py-3 px-4 rounded-lg border border-border/60 text-sm hover:bg-muted/30 transition-colors"
            >
              Adjust Level
            </button>
            <button
              onClick={() => result && skipToLevel(result.cefr)}
              className="flex-1 py-3 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-white font-medium text-sm hover:shadow-lg hover:shadow-primary/25 transition-all flex items-center justify-center gap-2"
            >
              Start Learning <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className={cn('absolute inset-0 bg-background/90 backdrop-blur-md transition-opacity duration-400', isVisible ? 'opacity-100' : 'opacity-0')} />
      <div
        className={cn(
          'relative w-full max-w-lg bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden transition-all duration-500',
          isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        )}
        style={{ boxShadow: 'var(--shadow-2xl)' }}
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-secondary/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="max-h-[90vh] overflow-y-auto custom-scrollbar">
        {step === 'setup' && renderSetup()}
        {step === 'choice' && renderChoice()}
        {step === 'conversation' && renderConversation()}
        {step === 'analyzing' && renderAnalyzing()}
        {step === 'results' && renderResults()}
        {step === 'level-select' && renderLevelSelect()}
        </div>
      </div>
    </div>
  )
}
