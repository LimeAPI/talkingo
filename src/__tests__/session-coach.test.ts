import { describe, it, expect } from 'vitest'
import { textContainsWord } from '@/lib/learning/word-match'
import {
  createSessionCoach,
  observeUserTurn,
  registerCorrections,
  computeNudge,
  summarizeCoach,
  addCoachTargets,
} from '@/lib/learning/session-coach'
import { parseConversationResponse } from '@talkingo/shared/gemini'
import type { Correction } from '@talkingo/shared/types'

function correction(original: string, corrected: string): Correction {
  return { type: 'grammar', original, corrected } as Correction
}

// ─── word-match ────────────────────────────────────────────────────────────

describe('textContainsWord', () => {
  it('matches a direct substring, case-insensitively', () => {
    expect(textContainsWord('I went to the Market today', 'market')).toBe(true)
    expect(textContainsWord('totally unrelated', 'market')).toBe(false)
  })

  it('matches an inflected form via stem', () => {
    // "comer" → stem "com" ; "comimos" starts with "com"
    expect(textContainsWord('ayer comimos pizza', 'comer')).toBe(true)
  })

  it('requires an exact hit for very short words', () => {
    expect(textContainsWord('a big yes', 'yes')).toBe(true)
    expect(textContainsWord('yellow', 'ye')).toBe(true) // <3 → substring still ok
  })

  it('is safe on empty input', () => {
    expect(textContainsWord('', 'word')).toBe(false)
    expect(textContainsWord('word', '')).toBe(false)
  })
})

// ─── coach: vocabulary nudges ────────────────────────────────────────────────

describe('SessionCoach — vocabulary nudges', () => {
  it('stays quiet during warm-up, then nudges an unused target word once', () => {
    const coach = createSessionCoach(['because'])

    observeUserTurn(coach, 'hello there') // turn 1 (warm-up)
    expect(computeNudge(coach)).toBeNull()

    observeUserTurn(coach, 'how are you') // turn 2 (target only 2 turns old)
    expect(computeNudge(coach)).toBeNull()

    observeUserTurn(coach, 'tell me more') // turn 3 → eligible
    const nudge = computeNudge(coach)
    expect(nudge).toBeTruthy()
    expect(nudge!.toLowerCase()).toContain('because')

    // Same word is not nagged again, and the cooldown blocks an immediate repeat.
    observeUserTurn(coach, 'and then what') // turn 4
    expect(computeNudge(coach)).toBeNull()
  })

  it('never nudges a word the learner already produced', () => {
    const coach = createSessionCoach(['because'])
    observeUserTurn(coach, 'I stayed home because of the rain') // produces it, turn 1
    observeUserTurn(coach, 'and it was nice') // turn 2
    observeUserTurn(coach, 'really relaxing') // turn 3
    expect(computeNudge(coach)).toBeNull()
    expect(summarizeCoach(coach).wordsUsed).toBe(1)
  })

  it('respects the cooldown between nudges across multiple words', () => {
    const coach = createSessionCoach(['because', 'although'])
    observeUserTurn(coach, 'a') // 1
    observeUserTurn(coach, 'b') // 2
    observeUserTurn(coach, 'c') // 3 → first nudge
    const first = computeNudge(coach)
    expect(first).toBeTruthy()
    observeUserTurn(coach, 'd') // 4 — within cooldown
    expect(computeNudge(coach)).toBeNull()
    observeUserTurn(coach, 'e') // 5 — within cooldown
    expect(computeNudge(coach)).toBeNull()
    observeUserTurn(coach, 'f') // 6 — cooldown elapsed, second word eligible
    expect(computeNudge(coach)).toBeTruthy()
  })
})

// ─── coach: correction re-elicitation ("second chance") ──────────────────────

describe('SessionCoach — correction re-elicitation', () => {
  it('re-elicits a corrected form after a short wait', () => {
    const coach = createSessionCoach([])
    observeUserTurn(coach, 'I have went there') // turn 1
    registerCorrections(coach, [correction('I have went', 'I have gone')])

    observeUserTurn(coach, 'it was fun') // turn 2 — too soon (wait not elapsed)
    expect(computeNudge(coach)).toBeNull()

    observeUserTurn(coach, 'we ate a lot') // turn 3 — eligible
    const nudge = computeNudge(coach)
    expect(nudge).toBeTruthy()
    expect(nudge!.toLowerCase()).toContain('i have gone')
  })

  it('records a self-fix win when the learner reproduces the corrected form', () => {
    const coach = createSessionCoach([])
    observeUserTurn(coach, 'I have went there') // turn 1
    registerCorrections(coach, [correction('I have went', 'I have gone')])

    // On a later turn the learner uses the correct form themselves.
    observeUserTurn(coach, 'today I have gone to the park') // turn 2
    expect(summarizeCoach(coach).selfFixes).toBe(1)

    // Having been "won", it is no longer pending to re-elicit.
    observeUserTurn(coach, 'and again') // turn 3
    expect(computeNudge(coach)).toBeNull()
  })
})

// ─── coach: live target words (AI keyWords) ──────────────────────────────────

describe('SessionCoach — live target words', () => {
  it('nudges a real word the AI introduced mid-session once it sits unused', () => {
    const coach = createSessionCoach([])
    observeUserTurn(coach, 'hello') // turn 1
    addCoachTargets(coach, ['quiero']) // AI introduced a real word this turn (added at turn 1)
    observeUserTurn(coach, 'ok') // turn 2
    observeUserTurn(coach, 'sure') // turn 3
    observeUserTurn(coach, 'tell me') // turn 4 → unused 3 turns → eligible
    const nudge = computeNudge(coach)
    expect(nudge).toBeTruthy()
    expect(nudge!.toLowerCase()).toContain('quiero')
  })

  it('de-dupes targets and never nudges a word the learner has used', () => {
    const coach = createSessionCoach(['quiero']) // a target from the start
    observeUserTurn(coach, 'quiero un café') // turn 1 → marks 'quiero' produced
    addCoachTargets(coach, ['quiero', 'quiero']) // dupe of an existing target → ignored
    expect(coach.targets.filter((t) => t.word === 'quiero').length).toBe(1)
    observeUserTurn(coach, 'a') // 2
    observeUserTurn(coach, 'b') // 3
    observeUserTurn(coach, 'c') // 4
    expect(computeNudge(coach)).toBeNull() // produced → never nudged
  })
})

// ─── parser: keyWords extraction ─────────────────────────────────────────────

describe('parseConversationResponse — keyWords', () => {
  it('extracts up to 3 trimmed non-empty key words', () => {
    const raw = JSON.stringify({
      response: 'Genial.',
      corrections: [],
      keyWords: ['  quiero ', 'café', '', 'por favor', 'demasiadas'],
    })
    const parsed = parseConversationResponse(raw)
    expect(parsed.keyWords).toEqual(['quiero', 'café', 'por favor'])
  })

  it('is undefined when absent or unusable', () => {
    expect(parseConversationResponse(JSON.stringify({ response: 'hi', corrections: [] })).keyWords)
      .toBeUndefined()
    expect(parseConversationResponse(JSON.stringify({ response: 'hi', corrections: [], keyWords: [] })).keyWords)
      .toBeUndefined()
  })
})
