import type { MetadataRoute } from 'next'

/**
 * robots.txt — allow crawling of the public surface, disallow API routes and
 * transient/authenticated-only paths. Points crawlers at the sitemap.
 */
const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://talkingo.ai').replace(/\/+$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/offline'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
