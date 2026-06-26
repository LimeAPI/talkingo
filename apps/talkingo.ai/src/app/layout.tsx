import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getDirection } from '@/i18n/request'
import { AuthProvider } from '@/context/AuthContext'
import { AppwritePing } from '@/components/ui/AppwritePing'
import { StorageCleanup } from '@/components/ui/StorageCleanup'
import { InstallPrompt, ServiceWorkerRegistration } from '@/components/pwa'
import { PostHogProvider, Clarity } from '@/components/analytics'
import './globals.css'
import { cn } from "@/lib/utils";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFD700' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1020' },
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
        
        {/* iOS splash screens */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash-1170x2532.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash-1284x2778.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/icons/splash-1179x2556.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
        />

        {/* Prevent text size adjustment on orientation change */}
        <meta name="format-detection" content="telephone=no" />
        
        {/* Microsoft Tile */}
        <meta name="msapplication-TileColor" content="#0B1020" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className="antialiased overscroll-none" suppressHydrationWarning>
        {/* Microsoft Clarity — session recordings & heatmaps */}
        <Clarity />
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
