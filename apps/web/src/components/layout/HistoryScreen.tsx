'use client'

import { useState, useEffect } from 'react'
import { cn } from '@talkingo/shared/utils'
import { MessageSquare, Trash2, Clock, ChevronLeft, AlertCircle, Crown } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { getConversations, deleteConversation, formatDuration, formatDate, type SavedConversation } from '@/lib/utils/conversation-history'
import { isSubscribed } from '@/lib/subscription/use-subscription'
import { FREE_TIER } from '@/lib/subscription/free-tier'

export function HistoryScreen() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<SavedConversation[]>([])
  const [selected, setSelected] = useState<SavedConversation | null>(null)
  const isPremium = isSubscribed(user?.id)

  useEffect(() => {
    setConversations(getConversations(user?.id ?? null))
  }, [user?.id])

  // Free users only see the most recent N sessions
  const visibleConversations = isPremium
    ? conversations
    : conversations.slice(0, FREE_TIER.MAX_HISTORY_SESSIONS)
  const hiddenCount = isPremium ? 0 : Math.max(0, conversations.length - FREE_TIER.MAX_HISTORY_SESSIONS)

  useEffect(() => {
    setConversations(getConversations(user?.id ?? null))
  }, [user?.id])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteConversation(id, user?.id ?? null)) {
      setConversations(getConversations(user?.id ?? null))
      if (selected?.id === id) setSelected(null)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24">
      <div className="max-w-md mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        {selected ? (
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to history
          </button>
        ) : (
          <div className="mb-5">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground mb-1">
              History
            </h1>
            <p className="text-sm text-muted-foreground">
              Your past conversations
            </p>
          </div>
        )}

        {/* List view */}
        {!selected ? (
          conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No conversations yet</p>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                Start chatting to build your history
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelected(conv)}
                  className="group relative p-4 rounded-2xl bg-card/40 border border-border/25 hover:border-primary/25 hover:bg-card/60 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground capitalize truncate">
                          {conv.topic}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/8 text-primary text-[9px] font-bold uppercase flex-shrink-0">
                          {conv.level}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {conv.messages.find(m => !m.isUser)?.text || 'No messages'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-xl hover:bg-error/10 flex items-center justify-center transition-all flex-shrink-0 ml-2"
                      aria-label="Delete conversation"
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
                    {(() => {
                      const corrCount = conv.messages.reduce((sum, m) => sum + (m.corrections?.length || 0), 0)
                      return corrCount > 0 ? (
                        <span className="text-error/70">{corrCount} correction{corrCount === 1 ? '' : 's'}</span>
                      ) : null
                    })()}
                  </div>
                </div>
              ))}

              {/* Upgrade card for free users with more history */}
              {hiddenCount > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20 text-center space-y-2">
                  <Crown className="w-5 h-5 text-primary mx-auto" />
                  <p className="text-sm font-semibold text-foreground">
                    {hiddenCount} more session{hiddenCount === 1 ? '' : 's'} hidden
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upgrade to Premium to see your full conversation history
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/stripe/checkout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ plan: 'monthly', email: user?.email, userId: user?.id }),
                        })
                        const { url } = await res.json()
                        if (url) window.location.href = url
                      } catch {}
                    }}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Unlock Full History
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          /* Detail view */
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-4 rounded-2xl bg-card/40 border border-border/25 text-center">
                <Clock className="w-4 h-4 text-primary mx-auto mb-1.5" />
                <p className="text-[10px] text-muted-foreground">Duration</p>
                <p className="text-sm font-bold text-foreground">{formatDuration(selected.duration)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-card/40 border border-border/25 text-center">
                <MessageSquare className="w-4 h-4 text-secondary mx-auto mb-1.5" />
                <p className="text-[10px] text-muted-foreground">Messages</p>
                <p className="text-sm font-bold text-foreground">{selected.messages.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-card/40 border border-border/25 text-center">
                <AlertCircle className="w-4 h-4 text-error/70 mx-auto mb-1.5" />
                <p className="text-[10px] text-muted-foreground">Corrections</p>
                <p className="text-sm font-bold text-foreground">
                  {selected.messages.reduce((sum, m) => sum + (m.corrections?.length || 0), 0)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground px-1">{formatDate(selected.timestamp)}</p>

            {/* Messages */}
            <div className="space-y-2">
              {selected.messages.slice(0, 20).map((msg) => (
                <div key={msg.id} className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed',
                  msg.isUser
                    ? 'bg-primary/6 border border-primary/12 ml-8'
                    : 'bg-card/50 border border-border/20 mr-8'
                )}>
                  <p className="line-clamp-4">{msg.text}</p>
                  {/* Corrections inline — shown under user messages */}
                  {msg.isUser && msg.corrections && msg.corrections.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-primary/10 space-y-1.5 overflow-hidden">
                      {msg.corrections.map((c, i) => (
                        <div key={i} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px]">
                          <span className="text-error/80 line-through">{c.original}</span>
                          <span className="text-primary font-medium">→ {c.corrected}</span>
                          {c.note && (
                            <span className="text-muted-foreground/50 italic text-[10px] w-full truncate">{c.note}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {selected.messages.length > 20 && (
                <p className="text-center text-[11px] text-muted-foreground italic py-2">
                  +{selected.messages.length - 20} more messages
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
