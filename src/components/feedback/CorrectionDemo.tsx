'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { cn } from '@talkingo/shared/utils'

interface CorrectionItem {
  id: string
  original: string
  corrected: string
  type: 'grammar' | 'vocabulary' | 'pronunciation' | 'clarity'
  explanation?: string
  confidence?: number
}

const DEFAULT_CORRECTIONS: CorrectionItem[] = [
  { id: '1', original: 'buyed', corrected: 'bought', type: 'grammar', explanation: "Irregular past tense of 'buy'", confidence: 98 },
  { id: '2', original: 'very good', corrected: 'excellent', type: 'vocabulary', explanation: 'More precise and impactful word choice', confidence: 85 },
  { id: '3', original: 'I am go to store', corrected: "I'm going to the store", type: 'grammar', explanation: 'Present continuous tense for future plans', confidence: 95 },
]

interface CorrectionDemoProps {
  corrections?: CorrectionItem[]
  isVisible?: boolean
}

export function CorrectionDemo({
  corrections = DEFAULT_CORRECTIONS,
  isVisible = true,
}: CorrectionDemoProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [acceptedCorrections, setAcceptedCorrections] = useState<Set<string>>(new Set())

  const getTypeIcon = (type: CorrectionItem['type']) => {
    if (type === 'vocabulary') return <Sparkles className="w-4 h-4" />
    return <AlertCircle className="w-4 h-4" />
  }

  const getTypeColor = (type: CorrectionItem['type']) => {
    switch (type) {
      case 'grammar':     return 'text-orange-500 bg-orange-500/10 border-orange-500/20'
      case 'vocabulary':  return 'text-purple-500 bg-purple-500/10 border-purple-500/20'
      case 'pronunciation': return 'text-blue-500 bg-blue-500/10 border-blue-500/20'
      case 'clarity':     return 'text-teal-500 bg-teal-500/10 border-teal-500/20'
      default:            return 'text-gray-500 bg-gray-500/10 border-gray-500/20'
    }
  }

  const handleAccept = (id: string) => setAcceptedCorrections(prev => new Set([...prev, id]))
  const handleReject = (id: string) => setAcceptedCorrections(prev => { const s = new Set(prev); s.delete(id); return s })

  if (!isVisible) return null

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-correction-bg/50 to-transparent backdrop-blur-md border-l-2 border-correction/30 rounded-r-lg">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-correction" />
          <span className="text-xs font-semibold text-correction uppercase tracking-wider">
            Corrections ({corrections.length})
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">Click to review</span>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {corrections.map((correction, index) => {
          const isExpanded = expandedId === correction.id
          const isAccepted = acceptedCorrections.has(correction.id)

          return (
            <div
              key={correction.id}
              className={cn(
                'group relative overflow-hidden rounded-xl border transition-all duration-300 animate-in fade-in slide-in-from-right-4',
                isAccepted
                  ? 'bg-success/5 border-success/20'
                  : 'bg-card/60 backdrop-blur-sm border-border/50 hover:border-primary/30 hover:shadow-md'
              )}
              style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
            >
              {correction.confidence && !isAccepted && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <div className="h-1 w-12 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                      style={{ width: `${correction.confidence}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">{correction.confidence}%</span>
                </div>
              )}

              <div className="p-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : correction.id)}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border', getTypeColor(correction.type))}>
                    {getTypeIcon(correction.type)}
                    <span className="capitalize">{correction.type}</span>
                  </div>
                  {isAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className={cn('line-through opacity-60', isAccepted ? 'text-muted-foreground' : 'text-correction-soft')}>
                    {correction.original}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-correction flex-shrink-0" />
                  <span className={cn('font-semibold', isAccepted ? 'text-success' : 'text-correction')}>
                    {correction.corrected}
                  </span>
                </div>

                {isExpanded && correction.explanation && (
                  <div className="mt-3 pt-3 border-t border-border/20 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-xs text-muted-foreground leading-relaxed">{correction.explanation}</p>
                    {!isAccepted && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAccept(correction.id) }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 text-success text-xs font-medium transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReject(correction.id) }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isAccepted && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              )}
            </div>
          )
        })}
      </div>

      {corrections.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 rounded-lg">
          <span className="text-xs text-muted-foreground">{acceptedCorrections.size} of {corrections.length} accepted</span>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-[10px] text-success font-medium">
              {Math.round((acceptedCorrections.size / corrections.length) * 100)}% improved
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
