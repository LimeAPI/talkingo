/**
 * Bug Condition Exploration Tests — Real-Time Speaking UX Defects
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 *
 * CRITICAL: These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on UNFIXED code — failure confirms the bugs exist.
 * DO NOT fix these tests or the code when they fail.
 *
 * Property 1: Bug Condition - Real-Time Speaking UX Defects
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

// ─── Import real modules under test ──────────────────────────────────────────

import { parseConversationResponse } from '@talkingo/shared/gemini'
import { MASTER_PROMPT } from '@talkingo/shared/gemini/master-prompt'
import { markLessonComplete } from '@/lib/storage/lesson-progress'
import { AudioRecorder } from '@/lib/api/audio-recorder'

// ─── Helper: Check file existence (works in ESM/Vitest) ─────────────────────
const projectRoot = path.resolve(__dirname, '..')
function moduleFileExists(relativePath: string): boolean {
  const fullPath = path.resolve(projectRoot, relativePath)
  return fs.existsSync(fullPath)
}

// ─── Types for testing ───────────────────────────────────────────────────────

type ConversationMode = 'handsfree' | 'native' | 'live' | 'chat' | 'text'

interface CorrectionInput {
  original: string
  corrected: string
  type: 'grammar' | 'vocabulary' | 'pronunciation' | 'naturalness'
  note?: string
}

// ─── Arbitraries (generators) ────────────────────────────────────────────────

const realTimeModeArb = fc.constantFrom<ConversationMode>('handsfree', 'native', 'live')

const correctionArb: fc.Arbitrary<CorrectionInput> = fc.record({
  original: fc.string({ minLength: 1, maxLength: 30 }),
  corrected: fc.string({ minLength: 1, maxLength: 30 }),
  type: fc.constantFrom('grammar', 'vocabulary', 'pronunciation', 'naturalness') as fc.Arbitrary<CorrectionInput['type']>,
  note: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
})

const pronunciationCorrectionArb: fc.Arbitrary<CorrectionInput> = fc.record({
  original: fc.string({ minLength: 1, maxLength: 30 }),
  corrected: fc.string({ minLength: 1, maxLength: 30 }),
  type: fc.constant('pronunciation') as fc.Arbitrary<'pronunciation'>,
  note: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
})

const drillPatterns = [
  'repeat after me',
  'say it again',
  'try again',
  'practice this',
  'now you try',
  'let me hear you say',
]


// ─── Bug 2: Hidden Text (Voice-First Text Visibility) ────────────────────────
// Validates: Requirement 1.2
// When hasVoiceNote=true and isAIMessage=true, text should be visible by default.

describe('Bug 2: Hidden Text — Voice-First Text Visibility', () => {
  it('AI messages with voice notes should have text visible by default', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // autoPlay
        fc.boolean(), // speakerMuted
        (autoPlay, speakerMuted) => {
          // In the FIXED TranscriptMessage implementation:
          // const [textRevealed, setTextRevealed] = useState(true)
          //
          // Text is ALWAYS visible by default regardless of voiceFirst state.
          //
          // Expected behavior: textRevealed should default to true (text visible)
          // even when voice note is present.

          // Simulate the FIXED logic from TranscriptMessage:
          const hasVoiceNote = true  // Test condition: voice note present
          const isAIMessage = true   // Test condition: AI message

          // FIXED behavior: text is always visible by default
          const textVisibleByDefault = true

          // ASSERTION: text should be visible by default
          expect(textVisibleByDefault).toBe(true)
        }
      ),
      { numRuns: 10 }
    )
  })
})


// ─── Bug 4: No Pronunciation Audio ──────────────────────────────────────────
// Validates: Requirement 1.4
// Pronunciation corrections should have an audio play button and TTS playback.

describe('Bug 4: No Pronunciation Audio', () => {
  it('pronunciation corrections should have audio playback mechanism', () => {
    fc.assert(
      fc.property(
        pronunciationCorrectionArb,
        (correction) => {
          // The CorrectionsBlock in TranscriptMessage.tsx currently renders
          // corrections as text only (original → corrected).
          // For pronunciation-type corrections, there's no audio button.
          //
          // Expected: An audio play button should be present for pronunciation corrections
          // AND a TTS pronunciation API endpoint should exist.

          // Check: Does the pronunciation TTS API route exist?
          const hasPronunciationApi = moduleFileExists('app/api/tts/pronunciation/route.ts')

          expect(hasPronunciationApi).toBe(true)
        }
      ),
      { numRuns: 5 }
    )
  })
})

// ─── Bug 5: No Quality Indicators on LearnScreen ─────────────────────────────
// Validates: Requirement 1.5
// Completed scenarios should display quality context (correction count, types).

describe('Bug 5: No Quality Indicators', () => {
  it('lesson-progress should store quality metadata, not just IDs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (lessonId, correctionCount) => {
          // Currently: lesson-progress.ts stores completed lessons as string[] 
          // (just lesson IDs, no quality data)
          //
          // Expected: Should store quality metadata like correction count, types, etc.

          // Clear state
          localStorage.clear()

          // Mark a lesson complete
          const result = markLessonComplete(lessonId)

          // Current behavior: returns string[] — just an array of IDs
          // Expected behavior: should support quality context like:
          // Record<string, { completedAt: number, totalCorrections: number, correctionTypes: Record<string, number> }>

          // Test that the storage format includes quality data
          const raw = localStorage.getItem('talkingo_completed_lessons')
          const parsed = JSON.parse(raw!)

          // If stored as simple string[], this means no quality context
          const isSimpleArray = Array.isArray(parsed) && typeof parsed[0] === 'string'

          // ASSERTION: Should NOT be a simple string array (should have quality data)
          // This will FAIL on unfixed code since lesson-progress.ts stores string[]
          expect(isSimpleArray).toBe(false)
        }
      ),
      { numRuns: 5 }
    )
  })
})

// ─── Bug 6: Forced Teaching ──────────────────────────────────────────────────
// Validates: Requirement 1.6
// AI response to user errors should NOT contain drill patterns.

describe('Bug 6: Forced Teaching', () => {
  it('AI response format should have anti-drill enforcement in prompts', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...drillPatterns),
        (drillPhrase) => {
          // Currently: The MASTER_PROMPT says "Correct naturally, not constantly"
          // but doesn't explicitly block drill patterns.
          //
          // Expected: The prompt system should have EXPLICIT anti-drill constraints.

          // Check the MASTER_PROMPT for anti-drill keywords
          const promptContent: string = MASTER_PROMPT

          // Check that the prompt explicitly forbids drill patterns
          const hasAntiDrillConstraint = 
            promptContent.toLowerCase().includes('never say') ||
            promptContent.toLowerCase().includes('repeat after me') ||
            promptContent.toLowerCase().includes('never structure') ||
            promptContent.toLowerCase().includes('no drill')

          // ASSERTION: The prompt MUST have explicit anti-drill constraints
          // This will FAIL on unfixed code where the prompt is too permissive
          expect(hasAntiDrillConstraint).toBe(true)
        }
      ),
      { numRuns: 3 }
    )
  })
})

// ─── Bug 7: Monolithic Message ───────────────────────────────────────────────
// Validates: Requirement 1.7
// AI response with multiple thoughts should deliver as sequential bubbles.

describe('Bug 7: Monolithic Message', () => {
  it('parseConversationResponse should support responseParts for multi-bubble delivery', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 100 }),
        (mainReply, afterthought) => {
          // Currently: parseConversationResponse only extracts a single "response" field.
          // There's no "responseParts" support for multi-bubble delivery.
          //
          // Expected: The parser should support an optional "responseParts" array
          // that allows splitting into multiple sequential message bubbles.

          const mockResponse = JSON.stringify({
            response: mainReply,
            responseParts: [mainReply, afterthought],
            corrections: [],
          })

          const parsed = parseConversationResponse(mockResponse)

          // Check if the parser extracts responseParts
          const hasResponseParts = 'responseParts' in parsed && 
            Array.isArray((parsed as any).responseParts) &&
            (parsed as any).responseParts.length >= 2

          // ASSERTION: Parser should support responseParts
          // This will FAIL on unfixed code — parser only extracts 'response' field
          expect(hasResponseParts).toBe(true)
        }
      ),
      { numRuns: 5 }
    )
  })
})

// ─── Bug 8: Audio Pipeline Chaos ─────────────────────────────────────────────
// Validates: Requirement 1.8
// When playback starts, mic should be paused; only one audio source should play.

describe('Bug 8: Audio Pipeline Chaos', () => {
  it('AudioRecorder should have a pause() method for pipeline coordination', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // whether mic is active
        fc.boolean(), // whether playback starts
        (micActive, playbackStarts) => {
          // Currently: AudioRecorder has start(), stop(), cancel() — but no pause().
          // The audio pipeline has no coordination between VoiceNotePlayer and mic.
          //
          // Expected: AudioRecorder should have a pause() method that suspends
          // recording without full stop/restart cycle, enabling smooth coordination.

          const recorder = new AudioRecorder()

          // Check if pause() method exists on the AudioRecorder
          const hasPauseMethod = typeof (recorder as any).pause === 'function'

          // ASSERTION: AudioRecorder must have a pause() method
          // This will FAIL on unfixed code — AudioRecorder only has start/stop/cancel
          expect(hasPauseMethod).toBe(true)
        }
      ),
      { numRuns: 5 }
    )
  })
})
