import type { Metadata } from 'next'
import { AuthProvider } from '@/context/AuthContext'
import { AppwritePing } from '@/components/ui/AppwritePing'
import { StorageCleanup } from '@/components/ui/StorageCleanup'
import './globals.css'

export const metadata: Metadata = {
  title: 'Talkingo — AI Language Conversation Partner',
  description:
    'Become fluent by having real conversations with an AI partner. No lessons. No exercises. Just talking.',
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          {/* Pings Appwrite on load to verify the connection */}
          <AppwritePing />
          {/* Runs localStorage cleanup on mount to prevent quota issues */}
          <StorageCleanup />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
