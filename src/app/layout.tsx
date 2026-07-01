import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getDirection } from '@/i18n/request'
import { AuthProvider } from '@/context/AuthContext'
import { AppwritePing } from '@/components/ui/AppwritePing'
import { StorageCleanup } from '@/components/ui/StorageCleanup'
import { InstallPrompt, ServiceWorkerRegistration } from '@/components/pwa'
import { PostHogProvider, Clarity, GoogleAnalytics } from '@/components/analytics'
import './globals.css'
import { cn } from "@/lib/utils";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#141416' },
  ],
}

export const metadata: Metadata = {
  title: 'Talkingo — AI Language Conversation Partner',
  description:
    'Become fluent by having real conversations with an AI partner. No lessons. No exercises. Just talking.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Talkingo',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const direction = getDirection(locale)

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning className="font-sans">
      <head>
        {/* PWA splash screens for iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Talkingo" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* Prevent text size adjustment on orientation change */}
        <meta name="format-detection" content="telephone=no" />
        
        {/* Microsoft Tile */}
        <meta name="msapplication-TileColor" content="#1a1816" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className="antialiased overscroll-none" suppressHydrationWarning>
        {/* Microsoft Clarity — session recordings & heatmaps */}
        <Clarity />
        {/* Google Analytics 4 — gtag.js */}
        <GoogleAnalytics />
        <PostHogProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthProvider>
              {/* Pings Appwrite on load to verify the connection */}
              <AppwritePing />
              {/* Runs localStorage cleanup on mount to prevent quota issues */}
              <StorageCleanup />
              {/* PWA service worker update handler */}
              <ServiceWorkerRegistration />
              {children}
              {/* PWA install prompt (shows when browser triggers beforeinstallprompt) */}
              <InstallPrompt />
            </AuthProvider>
          </NextIntlClientProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
