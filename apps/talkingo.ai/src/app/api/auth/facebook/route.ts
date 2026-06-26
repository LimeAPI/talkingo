import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'
import { getCallbackUrl } from '@/lib/public-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FB_GRAPH_VERSION = 'v21.0'

export async function GET(req: NextRequest) {
  const redirect = sanitizeRedirectPath(req.nextUrl.searchParams.get('redirect'), '/')
  const clientId = process.env.FACEBOOK_CLIENT_ID
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Facebook OAuth is not configured. Set FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET.' },
      { status: 500 }
    )
  }

  const callbackUrl = getCallbackUrl(req, '/api/auth/facebook/callback')
  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({ redirect, nonce })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'email,public_profile',
    state,
  })

  const res = NextResponse.redirect(
    `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth?${params.toString()}`
  )
  res.cookies.set('talkingo_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 5 * 60,
    path: '/',
  })
  return res
}
