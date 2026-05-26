/**
 * Lesson Manager — client-side logic for lesson path lifecycle.
 *
 * Handles:
 * 1. Detecting teaching intent from user messages
 * 2. Activating a lesson path (populating ConversationState.lessonPath)
 * 3. Advancing steps based on AI responses
 * 4. Completing/abandoning lessons
 *
 * This runs on the client. The server (API route) just receives the
 * lessonPath in ConversationState and injects it into the prompt.
 */

import type { ConversationState, TargetLanguage, CefrLevel } from '@talkingo/shared/types'
import {
  findLessonByRequest,
  getLessonById,
  isLessonApplicable,
  type LessonTemplate,
  type LessonStep,
} from '@talkingo/shared/curriculum/lesson-templates'
import {
  startLesson,
  advanceLessonStep,
  removeActiveLesson,
  getActiveLesson,
  type ActiveLesson,
} from '../storage/lesson-state'

// ─── Intent Detection ─────────────────────────────────────────────────────────

/**
 * Teaching intent patterns — detects when user wants structured learning.
 * Returns the matched keyword/phrase or null if no teaching intent detected.
 */
const TEACHING_INTENT_PATTERNS = [
  // Explicit requests
  /\b(?:teach|explain|help)\s+(?:me\s+)?(?:about\s+)?(.+)/i,
  /\b(?:i\s+want\s+to\s+learn|i\s+need\s+to\s+learn|can\s+you\s+teach)\s+(.+)/i,
  /\b(?:how\s+do\s+(?:i|you)\s+(?:say|use|form|make))\s+(.+)/i,
  /\b(?:what\s+(?:is|are)\s+(?:the\s+)?(?:rules?\s+(?:for|of|about)))\s+(.+)/i,
  /\b(?:let'?s\s+(?:learn|study|practice|work\s+on))\s+(.+)/i,
  /\b(?:i\s+(?:don'?t|dont)\s+understand)\s+(.+)/i,
  /\b(?:show\s+me\s+how\s+to)\s+(.+)/i,
  // Spanish/French equivalents (common for language learners)
  /\b(?:enséñame|explícame|ayúdame\s+con)\s+(.+)/i,
  /\b(?:apprends-moi|explique-moi|aide-moi\s+avec)\s+(.+)/i,
]

/**
 * Detect if a user message contains teaching intent.
 * Returns the topic they want to learn, or null if no intent detected.
 */
export function detectTeachingIntent(userText: string): string | null {
  for (const pattern of TEACHING_INTENT_PATTERNS) {
    const match = userText.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  return null
}

/**
 * Find a matching lesson template for a teaching request.
 * Returns the template if found, or null if the AI should handle it ad-hoc.
 */
export function matchLessonTemplate(
  requestTopic: string,
  targetLanguage: TargetLanguage | string
): LessonTemplate | null {
  const template = findLessonByRequest(requestTopic)
  if (!template) return null
  if (!isLessonApplicable(template, targetLanguage)) return null
  return template
}

// ─── Lesson Path Activation ───────────────────────────────────────────────────

/**
 * Build the lessonPath object for ConversationState from a template + step.
 */
export function buildLessonPath(
  template: LessonTemplate,
  step: number,
  summary: string,
  cefr?: CefrLevel
): NonNullable<ConversationState['lessonPath']> {
  const currentStep = template.steps[step - 1] // steps are 1-indexed
  if (!currentStep) {
    // Fallback to last step if out of bounds
    const lastStep = template.steps[template.steps.length - 1]
    return {
      lessonId: template.id,
      title: template.title,
      currentStep: template.steps.length,
      totalSteps: template.steps.length,
      summary,
      currentStepGoal: lastStep.goal,
      currentStepApproach: getAdaptedApproach(lastStep, cefr),
      currentStepCheck: `${lastStep.checkType}: ${lastStep.checkPrompt}`,
    }
  }

  return {
    lessonId: template.id,
    title: template.title,
    currentStep: step,
    totalSteps: template.steps.length,
    summary,
    currentStepGoal: currentStep.goal,
    currentStepApproach: getAdaptedApproach(currentStep, cefr),
    currentStepCheck: `Check type: ${currentStep.checkType}. Prompt: "${currentStep.checkPrompt}". Success: ${currentStep.successCriteria}. On failure: ${currentStep.failureAction}`,
  }
}

/**
 * Get the approach text with CEFR-specific adaptations applied.
 */
function getAdaptedApproach(step: LessonStep, cefr?: CefrLevel): string {
  let approach = step.approach
  if (cefr && step.adaptations?.[cefr]) {
    approach += `\nAdaptation for ${cefr}: ${step.adaptations[cefr]}`
  }
  return approach
}

/**
 * Activate a lesson — creates the lesson path and saves to localStorage.
 * Returns the updated lessonPath to inject into ConversationState.
 */
export function activateLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  template: LessonTemplate,
  cefr?: CefrLevel
): NonNullable<ConversationState['lessonPath']> {
  // Save to localStorage
  startLesson(userId, targetLanguage, template.id, template.title, template.steps.length)

  // Build the path for the first step
  return buildLessonPath(template, 1, '', cefr)
}

/**
 * Resume a lesson from localStorage state.
 * Returns the lessonPath to inject into ConversationState, or null if not found.
 */
export function resumeLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string,
  cefr?: CefrLevel
): NonNullable<ConversationState['lessonPath']> | null {
  const active = getActiveLesson(userId, targetLanguage, lessonId)
  if (!active) return null

  const template = getLessonById(lessonId)
  if (!template) return null

  return buildLessonPath(template, active.currentStep, active.summary, cefr)
}

// ─── Step Advancement ─────────────────────────────────────────────────────────

/**
 * Advance to the next step in the lesson.
 * Returns the new lessonPath, or null if the lesson is complete.
 */
export function advanceToNextStep(
  userId: string,
  targetLanguage: TargetLanguage | string,
  currentLessonPath: NonNullable<ConversationState['lessonPath']>,
  stepSummary: string,
  cefr?: CefrLevel
): NonNullable<ConversationState['lessonPath']> | null {
  const nextStep = currentLessonPath.currentStep + 1

  // Lesson complete!
  if (nextStep > currentLessonPath.totalSteps) {
    return null
  }

  const template = getLessonById(currentLessonPath.lessonId)
  if (!template) return null

  // Update summary with what was just completed
  const newSummary = stepSummary
    ? `${currentLessonPath.summary} ${stepSummary}`.trim()
    : currentLessonPath.summary

  // Save progress to localStorage
  advanceLessonStep(userId, targetLanguage, currentLessonPath.lessonId, nextStep, newSummary)

  // Build new path for next step
  return buildLessonPath(template, nextStep, newSummary, cefr)
}

/**
 * Complete a lesson — remove from active, add to completed list.
 * Returns the lessonId for the caller to add to language_progress.completedLessons.
 */
export function completeLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string
): string {
  removeActiveLesson(userId, targetLanguage, lessonId)
  return lessonId
}

/**
 * Abandon a lesson — remove from active without marking complete.
 */
export function abandonLesson(
  userId: string,
  targetLanguage: TargetLanguage | string,
  lessonId: string
): void {
  removeActiveLesson(userId, targetLanguage, lessonId)
}

// ─── AI Response Analysis ─────────────────────────────────────────────────────

/**
 * Signals that can be detected from AI responses to determine lesson progress.
 * The AI doesn't explicitly signal step completion — we infer it from context.
 *
 * Strategy: The AI is instructed to check understanding before advancing.
 * We track turns-per-step. After the AI has taught + checked (typically 2-4 turns),
 * the client can prompt the AI to confirm step completion.
 *
 * For MVP: step advancement is triggered by the AI's response containing
 * signals like moving to new content, or by explicit user commands.
 */

/** Keywords that suggest the AI is moving to the next concept */
const STEP_ADVANCE_SIGNALS = [
  /(?:great|perfect|excellent|bien|très bien|genial).*(?:let'?s\s+move|now\s+let'?s|next)/i,
  /(?:step|paso|étape)\s*\d/i,
  /(?:now\s+(?:let'?s|we'?ll)|moving\s+on|next\s+(?:up|we'?ll))/i,
  /(?:you'?ve\s+got\s+(?:it|this)|you\s+understand|bien\s+compris)/i,
]

/** Keywords that suggest the user wants to skip or advance */
const USER_SKIP_SIGNALS = [
  /\b(?:skip|next|move\s+on|i\s+know\s+this|already\s+know|speed\s+up)\b/i,
  /\b(?:siguiente|passer|weiter)\b/i,
]

/** Keywords that suggest the user wants to stop the lesson */
const USER_STOP_SIGNALS = [
  /\b(?:stop\s+(?:the\s+)?lesson|enough|let'?s\s+just\s+(?:chat|talk)|no\s+more\s+lesson)\b/i,
  /\b(?:para|arrête|aufhören)\b/i,
]

/**
 * Check if the AI response suggests it's ready to advance to the next step.
 */
export function detectStepAdvanceFromAI(aiResponse: string): boolean {
  return STEP_ADVANCE_SIGNALS.some((pattern) => pattern.test(aiResponse))
}

/**
 * Check if the user wants to skip the current step.
 */
export function detectUserSkip(userText: string): boolean {
  return USER_SKIP_SIGNALS.some((pattern) => pattern.test(userText))
}

/**
 * Check if the user wants to stop the lesson entirely.
 */
export function detectUserStopLesson(userText: string): boolean {
  return USER_STOP_SIGNALS.some((pattern) => pattern.test(userText))
}
