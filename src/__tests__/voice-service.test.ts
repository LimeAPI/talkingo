/**
 * Voice Service Property Tests — Fallback Behavior
 *
 * **Validates: Requirements 3.7**
 *
 * Property 5: Voice synthesis fallback on failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// Mock the msedge-tts module before importing the service
vi.mock('msedge-tts', () => {
  const MockMsEdgeTTS = vi.fn()
  return {
    MsEdgeTTS: MockMsEdgeTTS,
    OUTPUT_FORMAT: {
      AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3',
    },
  }
})

import { synthesizeWithEdgeTTS, VOICE_MAP } from '@/lib/api/edge-tts-service'
import { MsEdgeTTS } from 'msedge-tts'

// ─── Constants ───────────────────────────────────────────────────────────────

// New language codes that should trigger fallback behavior
const NEW_LANGUAGE_CODES = [
  'ur', 'ur-PK',
  'sw', 'sw-TZ',
  'pa', 'pa-IN',
  'tl', 'fil-PH',
  'fa', 'fa-IR',
  'he', 'he-IL',
  'hu', 'hu-HU',
  'el', 'el-GR',
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a mock audio stream compatible with the source code's event-based
 * stream handling (audioStream.on('data'/'end'/'error', cb)).
 */
function createMockStream(behavior: 'success' | 'empty' | 'error', errorMessage = 'Voice not found') {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  let fired = false

  function maybeEmit() {
    if (fired) return
    if (!listeners['data'] || !listeners['end'] || !listeners['error']) return
    fired = true
    queueMicrotask(() => {
      if (behavior === 'success') {
        listeners['data'].forEach(fn => fn(Buffer.from('fake-audio-data')))
        listeners['end'].forEach(fn => fn())
      } else if (behavior === 'empty') {
        listeners['end'].forEach(fn => fn())
      } else if (behavior === 'error') {
        listeners['error'].forEach(fn => fn(new Error(errorMessage)))
      }
    })
  }

  return {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
      maybeEmit()
      return this
    },
  }
}

// ─── Property 5: Voice synthesis fallback on failure ─────────────────────────
// Feature: language-expansion, Property 5: Voice synthesis fallback on failure

describe('Property 5: Voice synthesis fallback on failure', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  const MockedMsEdgeTTS = vi.mocked(MsEdgeTTS)

  beforeEach(() => {
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('falls back to en-US primary voice when synthesis throws a voice-not-found error', async () => {
    /**Validates: Requirements 3.7*/
    const enUsPrimaryVoice = VOICE_MAP['en-US'].primary

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NEW_LANGUAGE_CODES),
        async (langCode) => {
          vi.clearAllMocks()
          warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
          let instanceCount = 0
          const setMetadataCalls: string[][] = []

          // Use regular function (not arrow) so it can be called with `new`
          MockedMsEdgeTTS.mockImplementation(function (this: any) {
            instanceCount++
            const currentInstance = instanceCount
            const calls: string[] = []
            setMetadataCalls.push(calls)

            this.setMetadata = vi.fn().mockImplementation(async (voice: string) => {
              calls.push(voice)
              if (currentInstance === 1) {
                throw new Error('Voice not found')
              }
            })
            this.toStream = vi.fn().mockReturnValue({
              audioStream: createMockStream('success'),
            })
          } as any)

          const result = await synthesizeWithEdgeTTS('Hello', { languageCode: langCode })

          // Should succeed via fallback to en-US
          expect(result).not.toBeNull()
          expect(result?.format).toBe('mp3')

          // Warning should have been logged containing the language code
          const warnCalls = warnSpy.mock.calls.flat().join(' ')
          expect(warnCalls).toContain(langCode)
          expect(warnCalls.toLowerCase()).toMatch(/fail|voice not found|falling back/i)

          // Verify the fallback created a second instance that used en-US voice
          expect(instanceCount).toBe(2)
          expect(setMetadataCalls[1]?.[0]).toBe(enUsPrimaryVoice)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('falls back to en-US primary voice when synthesis returns empty audio response', async () => {
    /**Validates: Requirements 3.7*/
    const enUsPrimaryVoice = VOICE_MAP['en-US'].primary

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NEW_LANGUAGE_CODES),
        async (langCode) => {
          vi.clearAllMocks()
          warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
          let instanceCount = 0
          const setMetadataCalls: string[][] = []

          MockedMsEdgeTTS.mockImplementation(function (this: any) {
            instanceCount++
            const currentInstance = instanceCount
            const calls: string[] = []
            setMetadataCalls.push(calls)

            this.setMetadata = vi.fn().mockImplementation(async (voice: string) => {
              calls.push(voice)
            })
            this.toStream = vi.fn().mockReturnValue({
              audioStream: currentInstance === 1
                ? createMockStream('empty')
                : createMockStream('success'),
            })
          } as any)

          const result = await synthesizeWithEdgeTTS('Hello', { languageCode: langCode })

          // Should succeed via fallback
          expect(result).not.toBeNull()
          expect(result?.format).toBe('mp3')

          // Warning should have been logged containing the language code
          const warnCalls = warnSpy.mock.calls.flat().join(' ')
          expect(warnCalls).toContain(langCode)
          expect(warnCalls.toLowerCase()).toMatch(/empty|falling back/i)

          // Verify the fallback created a second instance that used en-US voice
          expect(instanceCount).toBe(2)
          expect(setMetadataCalls[1]?.[0]).toBe(enUsPrimaryVoice)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('falls back to en-US primary voice when synthesis stream errors (timeout/network)', async () => {
    /**Validates: Requirements 3.7*/
    const enUsPrimaryVoice = VOICE_MAP['en-US'].primary

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NEW_LANGUAGE_CODES),
        async (langCode) => {
          vi.clearAllMocks()
          warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
          let instanceCount = 0
          const setMetadataCalls: string[][] = []

          MockedMsEdgeTTS.mockImplementation(function (this: any) {
            instanceCount++
            const currentInstance = instanceCount
            const calls: string[] = []
            setMetadataCalls.push(calls)

            this.setMetadata = vi.fn().mockImplementation(async (voice: string) => {
              calls.push(voice)
            })
            this.toStream = vi.fn().mockReturnValue({
              audioStream: currentInstance === 1
                ? createMockStream('error', 'Edge TTS timeout')
                : createMockStream('success'),
            })
          } as any)

          const result = await synthesizeWithEdgeTTS('Hello', { languageCode: langCode })

          // Should succeed via fallback
          expect(result).not.toBeNull()
          expect(result?.format).toBe('mp3')

          // Warning should contain the language code and mention the failure
          const warnCalls = warnSpy.mock.calls.flat().join(' ')
          expect(warnCalls).toContain(langCode)
          expect(warnCalls.toLowerCase()).toMatch(/timeout|fail|falling back/i)

          // Verify the fallback created a second instance that used en-US voice
          expect(instanceCount).toBe(2)
          expect(setMetadataCalls[1]?.[0]).toBe(enUsPrimaryVoice)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('logs a warning containing both the requested language code and failure reason', async () => {
    /**Validates: Requirements 3.7*/

    const failureReasons = ['Voice not found', 'Edge TTS timeout', 'Network error'] as const

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NEW_LANGUAGE_CODES),
        fc.constantFrom(...failureReasons),
        async (langCode, reason) => {
          vi.clearAllMocks()
          warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
          let instanceCount = 0

          MockedMsEdgeTTS.mockImplementation(function (this: any) {
            instanceCount++
            const currentInstance = instanceCount

            this.setMetadata = vi.fn().mockImplementation(async () => {
              if (currentInstance === 1) {
                throw new Error(reason)
              }
            })
            this.toStream = vi.fn().mockReturnValue({
              audioStream: createMockStream('success'),
            })
          } as any)

          await synthesizeWithEdgeTTS('Hello', { languageCode: langCode })

          // Verify that the warning contains both the language code and failure info
          const warnCalls = warnSpy.mock.calls.flat().join(' ')
          expect(warnCalls).toContain(langCode)
          expect(warnCalls.toLowerCase()).toMatch(/fail|falling back/i)
        }
      ),
      { numRuns: 100 }
    )
  })
})
