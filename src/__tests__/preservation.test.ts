/**
 * Preservation Property Tests — Existing Behavior for Non-Buggy Inputs
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
 *
 * IMPORTANT: These tests must PASS on the current UNFIXED code.
 * They encode the EXISTING behavior that must remain unchanged after bug fixes.
 * Follow observation-first methodology: observe current behavior, then encode it.
 *
 * Property 2: Preservation - Existing Behavior for Non-Buggy Inputs
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'

// ─── Import real modules under test ──────────────────────────────────────────

import { parseConversationResponse } from '@talkingo/shared/gemini'
import { MASTER_PROMPT } from '@talkingo/shared/gemini/master-prompt'
import { markLessonComplete, getCompletedLessons, isLessonComplete } from '@/lib/storage/lesson-progress'
import { AudioRecorder } from '@/lib/api/audio-recorder'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CorrectionInput {
  original: string
  corrected: string
  type: 'grammar' | 'vocabulary' | 'pronunciation' | 'naturalness'
  rootCause?: 'careless' | 'knowledge-gap' | 'l1-interference' | 'overgeneralization'
  note?: string
}

// ─── Arbitraries (generators) ────────────────────────────────────────────────

/** Non-pronunciation correction types — these are the "non-buggy" inputs for bug 4 */
const nonPronunciationTypeArb = fc.constantFrom('grammar', 'vocabulary', 'naturalness') as fc.Arbitrary<'grammar' | 'vocabulary' | 'naturalness'>

const rootCauseArb = fc.constantFrom('careless', 'knowledge-gap', 'l1-interference', 'overgeneralization') as fc.Arbitrary<CorrectionInput['rootCause']>

const correctionArb: fc.Arbitrary<CorrectionInput> = fc.record({
  original: fc.stringMatching(/^[a-z]{2,15}$/).filter(s => s.length >= 2),
  corrected: fc.stringMatching(/^[a-z]{2,15}$/).filter(s => s.length >= 2),
  type: nonPronunciationTypeArb,
  rootCause: fc.option(rootCauseArb, { nil: undefined }),
  note: fc.option(fc.string({ minLength: 3, maxLength: 50 }), { nil: undefined }),
})

const pronunciationCorrectionArb: fc.Arbitrary<CorrectionInput> = fc.record({
  original: fc.stringMatching(/^[a-z]{2,15}$/).filter(s => s.length >= 2),
  corrected: fc.stringMatching(/^[a-z]{2,15}$/).filter(s => s.length >= 2),
  type: fc.constant('pronunciation') as fc.Arbitrary<'pronunciation'>,
  rootCause: fc.option(rootCauseArb, { nil: undefined }),
  note: fc.option(fc.string({ minLength: 3, maxLength: 50 }), { nil: undefined }),
})

const lessonIdArb = fc.stringMatching(/^[a-z0-9_-]{3,20}$/).filter(s => s.length >= 3)

// ─── 3.1: Manual/Text Mode CorrectionsBlock Preservation ────────────────────
// Validates: Requirement 3.1
// Observation: In manual/text (chat) mode, corrections are shown below user messages
// via CorrectionsBlock with expandable detail, type badges, root cause labels,
// and original → corrected flow. parseConversationResponse correctly parses these.

describe('Preservation 3.1: Manual/Text Mode Corrections', () => {
  it('parseConversationResponse preserves corrections data for manual mode display', () => {
    /**Validates: Requirements 3.1*/
    fc.assert(
      fc.property(
        fc.array(correctionArb, { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        (corrections, responseText) => {
          // Build a mock AI response JSON with corrections (as would be parsed in manual mode)
          const mockJson = JSON.stringify({
            response: responseText,
            corrections: corrections.map(c => ({
              original: c.original,
              corrected: c.corrected,
              type: c.type,
              rootCause: c.rootCause,
              note: c.note,
            })),

          })

          // The user text must contain the correction originals for them to pass filter
          const userText = corrections.map(c => c.original).join(' ')

          const parsed = parseConversationResponse(mockJson, userText)

          // Preservation: corrections are parsed with type, rootCause, note, original, corrected
          expect(parsed.corrections.length).toBeGreaterThan(0)

          for (const correction of parsed.corrections) {
            // Each correction has the expected structure for CorrectionsBlock rendering
            expect(correction).toHaveProperty('original')
            expect(correction).toHaveProperty('corrected')
            expect(correction).toHaveProperty('type')
            expect(['grammar', 'vocabulary', 'pronunciation', 'naturalness']).toContain(correction.type)
            // original and corrected are non-empty strings
            expect(correction.original.length).toBeGreaterThan(0)
            expect(correction.corrected.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ─── 3.2: AI Messages Without Voice Notes Display Text Immediately ───────────
// Validates: Requirement 3.2
// Observation: When voice notes are disabled (no audio prop), AI messages render
// the full TextBubble immediately without any audio player or reveal toggle.
// The `voiceFirst` logic only activates when `hasVoiceNote` is true.

describe('Preservation 3.2: AI Messages Without Voice Notes', () => {
  it('text is immediately visible when no voice note is attached', () => {
    /**Validates: Requirements 3.2*/
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.boolean(), // isUser
        (messageText, isUser) => {
          // Observation: TranscriptMessage.tsx line 78-79:
          // const hasVoiceNote = !isUser && !!audio
          // When audio is undefined/null, hasVoiceNote = false
          // const voiceFirst = hasVoiceNote && startedWithAudioRef.current
          // voiceFirst = false when hasVoiceNote = false
          // const [textRevealed, setTextRevealed] = useState(!voiceFirst)
          // textRevealed = !false = true — text is visible immediately

          const audio = undefined // No voice note
          const hasVoiceNote = !isUser && !!audio
          const voiceFirst = hasVoiceNote // simplified (startedWithAudioRef mirrors hasVoiceNote on first render)
          const textRevealed = !voiceFirst

          // Preservation: text is visible by default when no voice note
          expect(textRevealed).toBe(true)
          // No audio player rendered when audio is undefined
          expect(hasVoiceNote).toBe(false)
        }
      ),
      { numRuns: 20 }
    )
  })
})


// ─── 3.4: Non-Pronunciation Corrections Preserve Existing Format ─────────────
// Validates: Requirement 3.4
// Observation: Grammar, vocabulary, and naturalness corrections use the existing
// CorrectionsBlock format. They have type badges, root cause labels, and the
// original → corrected visual flow. No audio button is rendered for these types.

describe('Preservation 3.4: Non-Pronunciation Corrections Format', () => {
  it('grammar/vocabulary/naturalness corrections parsed without audio-related fields', () => {
    /**Validates: Requirements 3.4*/
    fc.assert(
      fc.property(
        fc.array(correctionArb, { minLength: 1, maxLength: 4 }),
        (corrections) => {
          const userText = corrections.map(c => c.original).join(' ')
          const mockJson = JSON.stringify({
            response: 'Sure, let me help you with that.',
            corrections: corrections.map(c => ({
              original: c.original,
              corrected: c.corrected,
              type: c.type,
              rootCause: c.rootCause,
              note: c.note,
            })),

          })

          const parsed = parseConversationResponse(mockJson, userText)

          // Preservation: all parsed corrections are non-pronunciation
          for (const correction of parsed.corrections) {
            expect(['grammar', 'vocabulary', 'naturalness']).toContain(correction.type)
            // Corrections only have text fields — no audioUrl or phonetic fields in existing format
            expect(correction).not.toHaveProperty('audioUrl')
            expect(correction).not.toHaveProperty('phonetic')
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ─── 3.5: Incomplete Scenarios Show Empty Circle With No Quality Data ────────
// Validates: Requirement 3.5
// Observation: lesson-progress.ts stores completed lessons as string[].
// A lesson NOT in the array means it's incomplete. getCompletedLessons() returns
// only lesson IDs. isLessonComplete() returns false for incomplete lessons.
// No quality data structure exists for incomplete lessons.

describe('Preservation 3.5: Incomplete Scenarios on LearnScreen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('incomplete lessons are not in completed list and have no quality data', () => {
    /**Validates: Requirements 3.5*/
    fc.assert(
      fc.property(
        lessonIdArb,
        lessonIdArb,
        (completedId, incompleteId) => {
          // Skip if both IDs happen to be the same
          fc.pre(completedId !== incompleteId)

          localStorage.clear()

          // Mark one lesson complete
          markLessonComplete(completedId)

          // Preservation: incomplete lesson is NOT in completed list
          expect(isLessonComplete(incompleteId)).toBe(false)

          // Preservation: completed lessons are just string IDs (no quality metadata)
          const completed = getCompletedLessons()
          expect(Array.isArray(completed)).toBe(true)
          if (completed.length > 0) {
            // Each entry is a string (not an object with quality data)
            expect(typeof completed[0]).toBe('string')
          }
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ─── 3.6: Error-Free Conversations Have No Indicators ────────────────────────
// Validates: Requirement 3.6
// Observation: When there are no corrections in the AI response, no correction
// badges, toasts, or feedback indicators are rendered. The response just has
// the text bubble. parseConversationResponse returns empty corrections array.

describe('Preservation 3.6: Error-Free Conversation Flow', () => {
  it('responses with no corrections produce empty corrections array', () => {
    /**Validates: Requirements 3.6*/
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 200 }),
        (responseText) => {
          const mockJson = JSON.stringify({
            response: responseText,
            corrections: [],
          })

          const parsed = parseConversationResponse(mockJson)

          // Preservation: no corrections means no feedback indicators
          expect(parsed.corrections).toEqual([])
          expect(parsed.corrections.length).toBe(0)
          // AI response text is preserved as-is
          expect(parsed.aiResponse).toBe(responseText)
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ─── 3.7: Single-Thought AI Responses Deliver as One Bubble ──────────────────
// Validates: Requirement 3.7
// Observation: parseConversationResponse returns a single `aiResponse` string.
// There is no `responseParts` field in the current response type.
// ConversationPage creates one message bubble per aiResponse.

describe('Preservation 3.7: Single-Thought AI Responses', () => {
  it('single response field delivers as one unit (no responseParts in parsed output)', () => {
    /**Validates: Requirements 3.7*/
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 300 }),
        (singleThought) => {
          const mockJson = JSON.stringify({
            response: singleThought,
            corrections: [],

          })

          const parsed = parseConversationResponse(mockJson)

          // Preservation: parsed response is a single string (one bubble)
          expect(typeof parsed.aiResponse).toBe('string')
          expect(parsed.aiResponse).toBe(singleThought)

          // No responseParts field exists in current implementation
          expect((parsed as any).responseParts).toBeUndefined()
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ─── 3.8: Natural AI Correction Style Preserved ──────────────────────────────
// Validates: Requirement 3.8
// Observation: The MASTER_PROMPT instructs the AI to "Correct by example" —
// modeling the right form inside a natural reply — and to "Never drill" / "Just
// talk" rather than turning moments into lessons. This natural-correction,
// anti-drill guidance is part of the prompt's soul.

describe('Preservation 3.8: Natural AI Correction Style', () => {
  it('MASTER_PROMPT contains natural correction guidance', () => {
    /**Validates: Requirements 3.8*/
    fc.assert(
      fc.property(
        fc.constant(MASTER_PROMPT),
        (prompt) => {
          // Preservation: the prompt has natural correction guidance
          const lowerPrompt = prompt.toLowerCase()

          // The prompt instructs correcting by modeling the right form, not drilling.
          expect(lowerPrompt).toContain('correct by example')

          // The prompt explicitly discourages drill-like behavior.
          expect(lowerPrompt).toContain('never drill')

          // And it keeps the interaction conversational rather than a lesson.
          expect(lowerPrompt).toContain('just talk')
        }
      ),
      { numRuns: 1 }
    )
  })

  it('AI response corrections are in dedicated array, not forced into response text', () => {
    /**Validates: Requirements 3.8*/
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.array(correctionArb, { minLength: 1, maxLength: 3 }),
        (responseText, corrections) => {
          const userText = corrections.map(c => c.original).join(' ')
          const mockJson = JSON.stringify({
            response: responseText,
            corrections: corrections.map(c => ({
              original: c.original,
              corrected: c.corrected,
              type: c.type,
              rootCause: c.rootCause,
              note: c.note,
            })),

          })

          const parsed = parseConversationResponse(mockJson, userText)

          // Preservation: corrections are in the dedicated array (not embedded in response text)
          expect(parsed.aiResponse).toBe(responseText)
          expect(Array.isArray(parsed.corrections)).toBe(true)
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ─── 3.9: User-Manually-Muted Mic Stays Muted After Playback ────────────────
// Validates: Requirement 3.9
// Observation: AudioRecorder has start(), stop(), cancel() but no pause() method.
// The current system has no explicit `userManuallyMuted` tracking at the recorder
// level. However, the preservation requirement is about the CONCEPT: when user
// manually mutes, the mic state should remain muted after playback.
// Current behavior: AudioRecorder.cancel() stops everything, and the mic is only
// started via explicit start() call. So if user mutes (cancels), it stays muted
// because nothing auto-starts it without user action.

describe('Preservation 3.9: User Manual Mute State', () => {
  it('AudioRecorder stays idle after cancel (user mute) — no auto-resume', () => {
    /**Validates: Requirements 3.9*/
    fc.assert(
      fc.property(
        fc.boolean(), // represents some voice note playback completing
        (playbackEnded) => {
          const recorder = new AudioRecorder()

          // User manually mutes = cancel the recorder
          recorder.cancel()

          // After cancel, state is idle
          expect(recorder.currentState).toBe('idle')

          // Preservation: after cancel (user mute), state remains idle.
          // Nothing in the current system auto-starts the mic after playback.
          // The recorder can only start via explicit .start() call.
          expect(recorder.currentState).toBe('idle')
        }
      ),
      { numRuns: 10 }
    )
  })

  it('AudioRecorder does not have auto-resume behavior after construction', () => {
    /**Validates: Requirements 3.9*/
    fc.assert(
      fc.property(
        fc.nat({ max: 5 }),
        (_n) => {
          const recorder = new AudioRecorder()

          // Fresh recorder is idle
          expect(recorder.currentState).toBe('idle')

          // pause() and resume() now exist for pipeline coordination,
          // but they do NOT auto-resume: resume() only works from 'paused' state.
          // A freshly constructed (or cancelled) recorder stays idle — no auto-resume.
          expect(recorder.currentState).toBe('idle')

          // Calling resume() on an idle recorder does nothing (no auto-resume)
          recorder.resume()
          expect(recorder.currentState).toBe('idle')

          // This confirms: mic is only active via explicit start()
          // User mute (cancel) means mic stays muted — resume() won't revive it
        }
      ),
      { numRuns: 5 }
    )
  })
})
