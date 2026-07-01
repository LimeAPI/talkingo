'use client'

import { useState } from 'react'
import { cn } from '@talkingo/shared/utils'
import { Clock, MessageSquare, CheckCircle2, PhoneOff, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/storage/chat-sessions'

interface EndCallDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (saveTranscript: boolean) => void
  messageCount: number
  callDuration: number
  autoSaveEnabled: boolean
}

export function EndCallDialog({
  isOpen,
  onClose,
  onConfirm,
  messageCount,
  callDuration,
  autoSaveEnabled,
}: EndCallDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  const handleConfirm = () => {
    setIsConfirming(true)
    setTimeout(() => {
      onConfirm(true)
    }, 300)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md p-0 gap-0" showCloseButton={false}>
        <div className="px-6 py-5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">End Conversation?</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
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
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Messages</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{messageCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
            <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              We&apos;ll save a report of this session — corrections and notes — to your History.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border/30 bg-muted/20 flex gap-3 rounded-b-xl">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isConfirming}
            className="flex-1"
          >
            Continue Chat
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className={cn(
              'flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
              isConfirming && 'opacity-70 cursor-not-allowed'
            )}
          >
            {isConfirming ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Ending...
              </>
            ) : (
              <>
                <PhoneOff className="w-4 h-4 mr-2" />
                End & Save
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
