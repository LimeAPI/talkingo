'use client'

import Script from 'next/script'

/**
 * Microsoft Clarity — session recordings & heatmaps.
 *
 * Uses Clarity's official manual tag loader (the snippet from the Clarity
 * dashboard → Settings → Setup). This is the install method Clarity's "is it
 * installed?" detector looks for. Rendered via next/script so Next stamps the
 * per-request CSP nonce onto it; `afterInteractive` keeps it off the critical
 * render path. The project id can be overridden via NEXT_PUBLIC_CLARITY_ID.
 */
export function Clarity() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_ID || 'wyc0i5vkg2'

  if (!projectId) return null

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${projectId}");`}
    </Script>
  )
}
