'use client'

import Script from 'next/script'

/**
 * Microsoft Clarity
 *
 * Loads the Clarity tag for session recordings and heatmaps. The project id
 * can be overridden via NEXT_PUBLIC_CLARITY_ID; it falls back to the current
 * Talkingo project id. Rendered as an afterInteractive script so it never
 * blocks first paint.
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
