import type { MetadataRoute } from 'next'

/**
 * Dynamic sitemap for the public marketing + legal surface.
 *
 * Only publicly indexable routes are listed. Authenticated surfaces (the
 * conversation app at `/`, profile, billing) are client-rendered tabs/modals,
 * and transient routes (`/auth/callback`, `/offline`) are intentionally
 * excluded. The base URL is pinned to the configured public domain so the
 * sitemap is correct regardless of the internal host the server binds to.
 */
const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://talkingo.ai').replace(/\/+$/, '')

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/login', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/signup', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/refund', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/cookies', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/data-deletion', priority: 0.3, changeFrequency: 'yearly' },
  ]

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
