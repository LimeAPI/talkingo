'use client'

import { useState, useEffect } from 'react'
import { cn } from '@talkingo/shared/utils'
import { X, Save, Clock, MessageSquare, Trash2, CheckCircle2, Sparkles } from 'lucide-react'
import { formatDuration } from '@/lib/utils/conversation-history'
import type { ConversationMessage, VocabItem } from '@talkingo/shared/types'

interface EndCallDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (saveTranscript: boolean, confirmedVocab?: VocabItem[]) => void
  messageCount: number
  callDuration: number
  autoSaveEnabled: boolean
  extractedVocab?: VocabItem[]
}

export function EndCallDialog({
  isOpen,
  onClose,
  onConfirm,
  messageCount,
  callDuration,
  autoSaveEnabled,
  extractedVocab = [],
}: EndCallDialogProps) {
  const [saveTranscript, setSaveTranscript] = useState(autoSaveEnabled)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmedVocab, setConfirmedVocab] = useState<VocabItem[]>([])

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSaveTranscript(autoSaveEnabled)
      setIsConfirming(false)
      setConfirmedVocab(extractedVocab.map(v => ({ ...v }))) // Deep copy for local editing
    }
  }, [isOpen, autoSaveEnabled, extractedVocab])

  const toggleVocabItem = (index: number) => {
    setConfirmedVocab(prev => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    setIsConfirming(true)
    setTimeout(() => {
      onConfirm(saveTranscript, confirmedVocab)
    }, 300)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md mx-4 bg-card/95 border border-border/50 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">End Conversation?</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-muted/50 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-foreground/70" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Duration</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{formatDuration(callDuration)}</p>
            </div>
            
            <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-secondary" />
                <span className="text-xs font-medium text-muted-foreground">Messages</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{messageCount}</p>
            </div>
          </div>

          {/* Vocab Confirmation (New Feature) */}
          {extractedVocab.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Words to Add to Your Profile</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {extractedVocab.map((vocab, idx) => {
                  const isKept = confirmedVocab.some(v => v.term === vocab.term)
                  return (
                  <div 
                    key={idx}
                    onClick={() => toggleVocabItem(confirmedVocab.findIndex(v => v.term === vocab.term))}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30 cursor-pointer hover:bg-muted/50 transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{vocab.term}</p>
                      <p className="text-xs text-muted-foreground">{vocab.gloss}</p>
                    </div>
                    <CheckCircle2 className={cn(
                      "w-5 h-5 transition-all",
                      isKept ? "text-primary opacity-100" : "text-muted-foreground opacity-30"
                    )} />
                  </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Tap a word to remove it from your learning profile.
              </p>
            </div>
          )}

          {/* Save transcript option */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <button
              onClick={() => setSaveTranscript(!saveTranscript)}
              className={cn(
                'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0',
                saveTranscript
                  ? 'bg-primary border-primary'
                  : 'bg-background border-border/60 hover:border-primary/60'
              )}
            >
              {saveTranscript && <CheckCircle2 className="w-4 h-4 text-white" />}
            </button>
            <div className="flex-1">
              <label 
                onClick={() => setSaveTranscript(!saveTranscript)}
                className="text-sm font-medium text-foreground cursor-pointer block mb-1"
              >
                Save Transcript
              </label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {saveTranscript 
                  ? 'This conversation will be saved to your history for future reference.'
                  : 'This conversation will not be saved and cannot be recovered.'
                }
              </p>
            </div>
          </div>

          {/* Warning if not saving */}
          {!saveTranscript && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Trash2 className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-500/90 leading-relaxed">
                <strong>Warning:</strong> This action cannot be undone. All messages will be permanently deleted.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-border/30 bg-muted/20 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl bg-muted/50 text-foreground font-medium hover:bg-muted/70 transition-colors border border-border/40"
            disabled={isConfirming}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 shadow-lg flex items-center justify-center gap-2',
              isConfirming ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105 active:scale-95',
              saveTranscript
                ? 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
                : 'bg-error text-white hover:bg-error/90 shadow-error/20'
            )}
            disabled={isConfirming}
          >
            {isConfirming ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Ending...
              </>
            ) : (
              <>
                {saveTranscript ? <Save className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                {saveTranscript ? 'Save & End' : 'End Without Saving'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
