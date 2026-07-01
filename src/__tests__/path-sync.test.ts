import { describe, it, expect, beforeEach } from 'vitest'
import type { UserPreferences } from '@talkingo/shared/types'
import { SEEDS } from '@talkingo/shared/curriculum'
import {
  recordLessonAttempt,
  getLessonStatus,
  getCompletedLessons,
} from '@/lib/storage/lesson-progress'
import {
  captureActiveProgress,
  mergePathProgressOnLoad,
  switchLanguageProgress,
} from '@/lib/storage/path-sync'

const ids = SEEDS.map((s) => s.id)

function prefsFor(lang: string, pathProgress?: string): UserPreferences {
  return {
    targetLanguage: lang,
    talkingoLevel: 1,
    pathProgress,
  } as unknown as UserPreferences
}

const DONE = { userTurns: 6, aiSignaledComplete: true, totalCorrections: 1, correctionTypes: {} }
const PRACTICING = { userTurns: 2, aiSignaledComplete: false, totalCorrections: 1, correctionTypes: {} }

describe('path-sync — cross-device restore', () => {
  beforeEach(() => localStorage.clear())

  it('restores done + practicing on a fresh device from the synced code', () => {
    // ── Device A ──
    recordLessonAttempt(ids[0], DONE)
    recordLessonAttempt(ids[1], PRACTICING)
    expect(getLessonStatus(ids[0])).toBe('done')
    expect(getLessonStatus(ids[1])).toBe('practicing')

    const prefs = prefsFor('es')
    prefs.pathProgress = captureActiveProgress(prefs)
    expect(prefs.pathProgress).toContain('v1:')

    // ── Device B (fresh) ──
    localStorage.clear()
    expect(getCompletedLessons()).toEqual([])

    // Restore from the synced code. `changed` is false here (after restore the
    // local state equals remote, so there's nothing new to push back) — the
    // meaningful result is that the statuses are restored.
    mergePathProgressOnLoad(prefs)
    expect(getLessonStatus(ids[0])).toBe('done')
    expect(getLessonStatus(ids[1])).toBe('practicing')
  })

  it('merges by ratcheting up (other device further along wins)', () => {
    // Build a "device A = done" code.
    recordLessonAttempt(ids[2], DONE)
    const remoteCode = captureActiveProgress(prefsFor('es'))

    // This device only has it as practicing.
    localStorage.clear()
    recordLessonAttempt(ids[2], PRACTICING)
    expect(getLessonStatus(ids[2])).toBe('practicing')

    // Merge the remote (done) → local ratchets up to done.
    mergePathProgressOnLoad(prefsFor('es', remoteCode))
    expect(getLessonStatus(ids[2])).toBe('done')
  })

  it('never downgrades local when remote is behind', () => {
    // Remote = practicing code.
    recordLessonAttempt(ids[3], PRACTICING)
    const remoteCode = captureActiveProgress(prefsFor('es'))

    // Local = done (further along).
    localStorage.clear()
    recordLessonAttempt(ids[3], DONE)

    mergePathProgressOnLoad(prefsFor('es', remoteCode))
    expect(getLessonStatus(ids[3])).toBe('done') // stayed done
  })

  it('flags changed=true when local is ahead of remote (push-back)', () => {
    // Remote is empty; local made progress (e.g. before sign-in).
    recordLessonAttempt(ids[4], DONE)
    const { changed, pathProgress } = mergePathProgressOnLoad(prefsFor('es'))
    expect(changed).toBe(true)            // remote needs updating
    expect(pathProgress).toContain('v1:') // and we have a code to push
  })

  it('keeps each language isolated when switching', () => {
    // Spanish: mark a scenario done.
    let prefs = prefsFor('es')
    recordLessonAttempt(ids[0], DONE)
    prefs.pathProgress = captureActiveProgress(prefs)

    // Switch to French — local store should now be empty for French.
    prefs.pathProgress = switchLanguageProgress(prefs, 'fr')
    prefs = { ...prefs, targetLanguage: 'fr' }
    expect(getCompletedLessons()).toEqual([])

    // Do a French scenario.
    recordLessonAttempt(ids[5], DONE)
    prefs.pathProgress = captureActiveProgress(prefs)

    // Switch back to Spanish — Spanish progress restored, French not present.
    prefs.pathProgress = switchLanguageProgress(prefs, 'es')
    prefs = { ...prefs, targetLanguage: 'es' }
    expect(getLessonStatus(ids[0])).toBe('done')  // Spanish kept
    expect(getLessonStatus(ids[5])).toBe('new')   // French not bleeding in
  })
})
