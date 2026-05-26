'use client'

/**
 * UserVoiceBubble — displays the user's voice message in the chat.
 * Shows a waveform-style bar, duration, and play button to replay.
 */

import { useState, useRef } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Play, Square, Mic } from 'lucide-react'

interface UserVoiceBubbleProps {
  audioBlob?: Blob
  durationSeconds: number
  isRecording?: boolean
  recordingDuration?: number
}

export function UserVoiceBubble({
  audioBlob,
  durationSeconds,
  isRecording = false,
  recordingDuration = 0,
}: UserVoiceBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePlay = () => {
    if (!audioBlob) return

    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setIsPlaying(false)
      return
    }

    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    audioRef.current = audio
    setIsPlaying(true)
    audio.onended = () => {
      setIsPlaying(false)
      URL.revokeObjectURL(url)
      audioRef.current = null
    }
    audio.play()
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Recording state — pulsing indicator
  if (isRecording) {
    return (
      <div className="flex justify-end">
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-primary/10 border border-primary/25">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-0.5 rounded-full bg-primary/60 animate-pulse"
                style={{
                  height: `${8 + Math.random() * 12}px`,
                  animationDelay: `${i * 80}ms`,
                  animationDuration: '0.8s',
                }}
              />
            ))}
          </div>
          <span className="text-xs font-mono text-primary/70 tabular-nums ml-1">
            {formatTime(recordingDuration)}
          </span>
        </div>
      </div>
    )
  }

  // Completed voice message
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-primary/8 border border-primary/20 max-w-[75%]">
        {/* Play/Stop button */}
        <button
          onClick={handlePlay}
          disabled={!audioBlob}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
            isPlaying
              ? 'bg-primary text-white'
              : 'bg-primary/15 text-primary hover:bg-primary/25'
          )}
        >
          {isPlaying
            ? <Square className="w-3 h-3 fill-current" />
            : <Play className="w-3 h-3 fill-current ml-0.5" />
          }
        </button>

        {/* Waveform bars (static visual) */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-0.5 rounded-full transition-all',
                isPlaying ? 'bg-primary' : 'bg-primary/40'
              )}
              style={{ height: `${4 + Math.sin(i * 0.8) * 6 + Math.random() * 4}px` }}
            />
          ))}
        </div>

        {/* Duration */}
        <span className="text-[10px] font-mono text-primary/60 tabular-nums flex-shrink-0">
          {formatTime(durationSeconds)}
        </span>

        {/* Mic icon */}
        <Mic className="w-3 h-3 text-primary/40 flex-shrink-0" />
      </div>
    </div>
  )
}
