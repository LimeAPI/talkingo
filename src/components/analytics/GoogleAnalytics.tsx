'use client'

import Script from 'next/script'

/**
 * Google Analytics 4 (gtag.js).
 *
 * Loads the Google tag and initializes the configured measurement id. The id
 * can be overridden via NEXT_PUBLIC_GA_ID; it falls back to the current
 * Talkingo property. Both scripts run via next/script so Next stamps the
 * per-request CSP nonce onto them, and `afterInteractive` keeps them off the
 * critical render path. If no id is configured, GA is skipped entirely.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID || 'G-S74M79CDNS'

  if (!measurementId) return null

  return (
    <>
      <Script
        id="ga-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${measurementId}');`}
      </Script>
    </>
  )
}
