'use client'

/**
 * HistoryDrawer — conversation history as a bottom sheet / right drawer.
 */

import { useState, useEffect } from 'react'
import { cn } from '@talkingo/shared/utils'
import { X, MessageSquare, Trash2, Clock, ChevronRight } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { getConversations, deleteConversation, formatDuration, formatDate, type SavedConversation } from '@/lib/utils/conversation-history'

interface HistoryDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function HistoryDrawer({ isOpen, onClose }: HistoryDrawerProps) {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<SavedConversation[]>([])
  const [selected, setSelected] = useState<SavedConversation | null>(null)

  useEffect(() => {
    if (isOpen) {
      setConversations(getConversations(user?.id ?? null))
      setSelected(null)
    }
  }, [isOpen, user?.id])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteConversation(id, user?.id ?? null)) {
      setConversations(getConversations(user?.id ?? null))
      if (selected?.id === id) setSelected(null)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="bottom-sheet-overlay animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="settings-drawer animate-slide-right sm:animate-fade-in">
        <div className="sheet-handle sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 flex-shrink-0">
          {selected ? (
            <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back
            </button>
          ) : (
            <h2 className="text-base font-bold text-foreground">History</h2>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-muted/50 flex items-center justify-center transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-foreground/70" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
          {!selected ? (
            conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No conversations yet</p>
                <p className="text-xs text-muted-foreground">Start chatting to build your history</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSelected(conv)}
                    className="group relative p-3.5 rounded-xl bg-card/50 border border-border/30 hover:border-primary/30 hover:bg-card/70 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground capitalize truncate">{conv.topic}</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase flex-shrink-0">
                            {conv.level}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {conv.messages.find(m => !m.isUser)?.text || 'No messages'}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-error/10 flex items-center justify-center transition-all flex-shrink-0 ml-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-error" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDuration(conv.duration)}</span>
                      </div>
                      <span>{formatDate(conv.timestamp)}</span>
                      <span>{conv.messages.length} messages</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30 text-center">
                  <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Duration</p>
                  <p className="text-sm font-bold text-foreground">{formatDuration(selected.duration)}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30 text-center">
                  <MessageSquare className="w-4 h-4 text-secondary mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Messages</p>
                  <p className="text-sm font-bold text-foreground">{selected.messages.length}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground px-1">{formatDate(selected.timestamp)}</p>

              {/* Messages */}
              <div className="space-y-2">
                {selected.messages.slice(0, 10).map((msg) => (
                  <div key={msg.id} className={cn(
                    'px-3 py-2.5 rounded-xl text-xs leading-relaxed',
                    msg.isUser
                      ? 'bg-primary/8 border border-primary/15 ml-6'
                      : 'bg-card/60 border border-border/25 mr-6'
                  )}>
                    <p className="line-clamp-3">{msg.text}</p>
                  </div>
                ))}
                {selected.messages.length > 10 && (
                  <p className="text-center text-[10px] text-muted-foreground italic py-1">
                    +{selected.messages.length - 10} more messages
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
