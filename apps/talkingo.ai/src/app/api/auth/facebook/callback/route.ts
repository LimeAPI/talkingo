import { NextRequest, NextResponse } from 'next/server'
import { getAdminUsers } from '@/lib/appwrite-server'
import { Query } from 'node-appwrite'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FB_GRAPH_VERSION = 'v21.0'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/login?error=facebook_denied', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth_no_code', req.url))
  }

  const cookieNonce = req.cookies.get('talkingo_oauth_nonce')?.value
  let redirect = '/'

  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      const stateNonce = typeof parsed?.nonce === 'string' ? parsed.nonce : null
      if (!cookieNonce || !stateNonce || cookieNonce !== stateNonce) {
        const bad = NextResponse.redirect(new URL('/login?error=oauth_state', req.url))
        bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
        return bad
      }
      redirect = sanitizeRedirectPath(parsed.redirect, '/')
    } catch {
      const bad = NextResponse.redirect(new URL('/login?error=oauth_state', req.url))
      bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
      return bad
    }
  } else if (cookieNonce) {
    const bad = NextResponse.redirect(new URL('/login?error=oauth_state', req.url))
    bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
    return bad
  }

  const clientId = process.env.FACEBOOK_CLIENT_ID
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', req.url))
  }

  try {
    const callbackUrl = `${req.nextUrl.origin}/api/auth/facebook/callback`

    // ── 1. Exchange the authorization code for an access token ──────────────
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      code,
    })
    const tokenRes = await fetch(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/oauth/access_token?${tokenParams.toString()}`
    )

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '')
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errText}`)
    }

    const tokens = await tokenRes.json()

    // ── 2. Fetch the user's profile (id always present; email may be absent) ─
    const profileParams = new URLSearchParams({
      fields: 'id,name,email',
      access_token: tokens.access_token,
    })
    const userRes = await fetch(
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/me?${profileParams.toString()}`
    )

    if (!userRes.ok) {
      throw new Error(`Profile fetch failed: ${userRes.status}`)
    }

    const fbUser = await userRes.json()
    const facebookId: string | undefined = fbUser.id
    const email: string | undefined = fbUser.email || undefined
    const name: string = fbUser.name || (email ? email.split('@')[0] : 'New User')

    if (!facebookId) {
      throw new Error('Facebook did not return a user id')
    }

    const users = getAdminUsers()
    let userId: string

    // ── 3. Resolve or create the Appwrite user ──────────────────────────────
    // Facebook always confirms the user, but may not return an email (phone-only
    // signups, or the user denied the email permission). We match returning
    // users by email when present. The provider id is stored on the account so
    // a future provider-id matching pass can recognise no-email users on return.
    let existingUserId: string | null = null

    if (email) {
      const byEmail = await users.list([Query.equal('email', email)])
      if (byEmail.total > 0) existingUserId = byEmail.users[0].$id
    }

    if (existingUserId) {
      userId = existingUserId
      // Do NOT overwrite account.name for existing users — they may have set a
      // custom display name in the app. Provider names only seed creation.
    } else {
      // email is optional in the admin create call; pass undefined if absent.
      const newUser = await users.create('unique()', email, undefined, undefined, name)
      userId = newUser.$id
    }

    // ── 4. Tag the account with the Facebook id (used by provider-id matching) ─
    try {
      const current = await users.getPrefs(userId)
      await users.updatePrefs(userId, { ...current, facebookId })
    } catch (e) {
      console.warn('[facebook-callback] could not persist facebookId pref:', (e as Error).message)
    }

    // ── 5. Mint a server-side token/JWT for the user ────────────────────────
    let jwt: string
    try {
      const tokenResult = await (users as any).createToken(userId, 256, 3600)
      jwt = tokenResult.secret
    } catch {
      const jwtResult = await (users as any).createJWT(userId, undefined, 3600)
      jwt = jwtResult.jwt || jwtResult.secret
    }

    const response = NextResponse.redirect(new URL(redirect, req.url))
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
    console.error('[facebook-callback] Error:', err.message)
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url))
  }
}
