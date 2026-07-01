import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'
import { getCallbackUrl } from '@/lib/public-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const redirect = sanitizeRedirectPath(req.nextUrl.searchParams.get('redirect'), '/')
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
      { status: 500 }
    )
  }

  const callbackUrl = getCallbackUrl(req, '/api/auth/google/callback')

  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({ redirect, nonce })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    access_type: 'online',
  })

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
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
