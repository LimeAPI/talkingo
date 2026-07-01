'use client'

import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'

/**
 * PostHog Analytics Provider
 *
 * Initializes PostHog on the client and wraps the app so events can be
 * captured anywhere via `usePostHog()`. Pageviews are captured manually
 * because the App Router does client-side navigation without full reloads.
 *
 * Requires NEXT_PUBLIC_POSTHOG_KEY (and optionally NEXT_PUBLIC_POSTHOG_HOST).
 * If the key is absent, PostHog is skipped entirely so local/dev runs without
 * analytics configured are unaffected.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      // We capture pageviews/leaves manually (see PostHogPageView) to play
      // nicely with the Next.js App Router client-side navigation.
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: 'identified_only',
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}

/** Captures a $pageview on every client-side route change. */
function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (!pathname || !ph) return

    let url = window.origin + pathname
    const search = searchParams.toString()
    if (search) url += `?${search}`

    ph.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, ph])

  return null
}
