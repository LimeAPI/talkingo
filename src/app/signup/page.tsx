'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'

function AuthFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-[oklch(var(--color-accent,52%_.19_265))]" />
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <AuthShell mode="signup" />
    </Suspense>
  )
}
