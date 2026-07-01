import { NextRequest, NextResponse } from 'next/server'
import { getAdminUsers } from '@/lib/appwrite-server'
import { Query } from 'node-appwrite'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'
import { getPublicBaseUrl, getCallbackUrl } from '@/lib/public-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const baseUrl = getPublicBaseUrl(req)
  const code = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/login?error=google_denied', baseUrl))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_no_code', baseUrl))
  }

  const cookieNonce = req.cookies.get('talkingo_oauth_nonce')?.value
  let redirect = '/'

  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      const stateNonce = typeof parsed?.nonce === 'string' ? parsed.nonce : null
      if (!cookieNonce || !stateNonce || cookieNonce !== stateNonce) {
        const bad = NextResponse.redirect(new URL('/login?error=oauth_state', baseUrl))
        bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
        return bad
      }
      redirect = sanitizeRedirectPath(parsed.redirect, '/')
    } catch {
      const bad = NextResponse.redirect(new URL('/login?error=oauth_state', baseUrl))
      bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
      return bad
    }
  } else if (cookieNonce) {
    const bad = NextResponse.redirect(new URL('/login?error=oauth_state', baseUrl))
    bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
    return bad
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', baseUrl))
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getCallbackUrl(req, '/api/auth/google/callback'),
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '')
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errText}`)
    }

    const tokens = await tokenRes.json()

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userRes.ok) {
      throw new Error(`Userinfo failed: ${userRes.status}`)
    }

    const googleUser = await userRes.json()
    const email: string | undefined = googleUser.email
    const googleSub: string | undefined = googleUser.sub
    // Google's v3 userinfo returns `email_verified` (boolean; occasionally the
    // string "true" depending on transport). Treat anything else as unverified.
    const emailVerified =
      googleUser.email_verified === true || googleUser.email_verified === 'true'

    if (!email) {
      throw new Error('Google did not return an email address')
    }

    // SECURITY (account-takeover guard): never look up / log into an existing
    // account by email unless the provider has VERIFIED the user controls that
    // address. Without this check, a returned-but-unverified email could match
    // (and silently hand over a session to) a pre-existing account.
    if (!emailVerified) {
      console.warn('[google-callback] rejected unverified email login for', email)
      const bad = NextResponse.redirect(new URL('/login?error=email_unverified', baseUrl))
      bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
      return bad
    }

    const name = googleUser.name || email.split('@')[0]

    const users = getAdminUsers()
    let userId: string

    const existing = await users.list([Query.equal('email', email)])
    if (existing.total > 0) {
      userId = existing.users[0].$id
      // Do NOT overwrite account.name for existing users — the user may have
      // set a custom display name via the app. OAuth provider names should only
      // seed the initial account creation, not override user choices on every login.
    } else {
      const newUser = await users.create('unique()', email, undefined, undefined, name)
      userId = newUser.$id
    }

    // Tag the account with the Google subject id (used by provider-id matching).
    if (googleSub) {
      try {
        const current = await users.getPrefs(userId)
        await users.updatePrefs(userId, { ...current, googleSub })
      } catch (e) {
        console.warn('[google-callback] could not persist googleSub pref:', (e as Error).message)
      }
    }

    // Mint a server-side token/JWT for the user WITHOUT needing an existing
    // session. `users.createSession(userId)` is not a valid admin-API call and
    // throws — so we use createToken (preferred) and fall back to createJWT.
    let jwt: string
    try {
      const tokenResult = await (users as any).createToken(userId, 256, 3600)
      jwt = tokenResult.secret
    } catch {
      const jwtResult = await (users as any).createJWT(userId, undefined, 3600)
      jwt = jwtResult.jwt || jwtResult.secret
    }

    const response = NextResponse.redirect(new URL(redirect, baseUrl))
    response.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
    response.cookies.set('appwrite-jwt', jwt, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })

    return response
  } catch (err: any) {
    console.error('[google-callback] Error:', err.message)
    return NextResponse.redirect(new URL('/login?error=oauth_failed', baseUrl))
  }
}
