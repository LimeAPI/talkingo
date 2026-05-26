'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@talkingo/shared/utils'
import { AlertTriangle, RefreshCw, WifiOff, Clock } from 'lucide-react'

export type ServiceErrorType = 'ai_unavailable' | 'rate_limited' | 'not_configured' | 'network'

interface ServiceErrorBannerProps {
  error: ServiceErrorType | null
  onRetry: () => void
  onDismiss: () => void
  /** Auto-retry countdown in seconds. 0 = no auto-retry */
  autoRetrySeconds?: number
}

const ERROR_CONFIG: Record<ServiceErrorType, {
  icon: React.ReactNode
  title: string
  description: string
  canRetry: boolean
  autoRetry: boolean
}> = {
  ai_unavailable: {
    icon: <WifiOff className="w-4 h-4" />,
    title: 'AI service unavailable',
    description: 'Our AI partner is temporarily down. We\'re trying to reconnect.',
    canRetry: true,
    autoRetry: true,
  },
  rate_limited: {
    icon: <Clock className="w-4 h-4" />,
    title: 'Too many requests',
    description: 'You\'ve hit the usage limit. Please wait a moment before continuing.',
    canRetry: true,
    autoRetry: true,
  },
  not_configured: {
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'Service not configured',
    description: 'The AI service is not set up correctly. Please contact support.',
    canRetry: false,
    autoRetry: false,
  },
  network: {
    icon: <WifiOff className="w-4 h-4" />,
    title: 'Connection lost',
    description: 'Check your internet connection and try again.',
    canRetry: true,
    autoRetry: true,
  },
}

export function ServiceErrorBanner({
  error,
  onRetry,
  onDismiss,
  autoRetrySeconds = 15,
}: ServiceErrorBannerProps) {
  const [countdown, setCountdown] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [visible, setVisible] = useState(false)

  const config = error ? ERROR_CONFIG[error] : null

  // Animate in
  useEffect(() => {
    if (error) {
      setVisible(true)
      setIsRetrying(false)
      if (config?.autoRetry && autoRetrySeconds > 0) {
        setCountdown(autoRetrySeconds)
      }
    } else {
      setVisible(false)
      setCountdown(0)
    }
  }, [error, autoRetrySeconds, config?.autoRetry])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleRetry()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  const handleRetry = useCallback(() => {
    setIsRetrying(true)
    setCountdown(0)
    onRetry()
  }, [onRetry])

  const handleManualRetry = useCallback(() => {
    setCountdown(0)
    handleRetry()
  }, [handleRetry])

  if (!error || !config) return null

  return (
    <div
      className={cn(
        'fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4',
        'transition-all duration-400',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      )}
    >
      <div className={cn(
        'flex flex-col gap-3 px-4 py-3.5 rounded-2xl border shadow-xl backdrop-blur-xl',
        'bg-card/95 border-error/30',
      )}>
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5 text-error">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{config.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {config.description}
            </p>
          </div>
          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none mt-0.5"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Action row */}
        {config.canRetry && (
          <div className="flex items-center gap-2 pl-7">
            <button
              onClick={handleManualRetry}
              disabled={isRetrying}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('w-3 h-3', isRetrying && 'animate-spin')} />
              {isRetrying ? 'Retrying…' : 'Retry now'}
            </button>

            {countdown > 0 && (
              <span className="text-xs text-muted-foreground">
                Auto-retry in{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {countdown}s
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
