import { NextRequest, NextResponse } from 'next/server'
import { getAdminUsers } from '@/lib/appwrite-server'
import { Query } from 'node-appwrite'
import { sanitizeRedirectPath } from '@talkingo/shared/utils'
import { getPublicBaseUrl, getCallbackUrl } from '@/lib/public-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FB_GRAPH_VERSION = 'v21.0'

export async function GET(req: NextRequest) {
  const baseUrl = getPublicBaseUrl(req)
  const code = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/login?error=facebook_denied', baseUrl))
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

  const clientId = process.env.FACEBOOK_CLIENT_ID
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', baseUrl))
  }

  try {
    const callbackUrl = getCallbackUrl(req, '/api/auth/facebook/callback')

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
    // SECURITY (account-takeover guard): Facebook's Graph API returns whatever
    // email the user put on their profile — Facebook does NOT prove the user
    // controls it, and it can be changed at will. Matching an existing account
    // purely by that email is a takeover vector (an attacker sets their FB email
    // to the victim's and signs in). We therefore link to an existing account
    // ONLY when that account is already bound to THIS Facebook identity
    // (prefs.facebookId). A brand-new Facebook user gets a fresh account; an
    // email that already belongs to a different identity (Google / password /
    // another FB id) is refused here — linking must be done from settings while
    // authenticated.
    let matchedUserId: string | null = null

    if (email) {
      const byEmail = await users.list([Query.equal('email', email)])
      if (byEmail.total > 0) {
        const candidate = byEmail.users[0]
        let prefs: Record<string, any> = (candidate.prefs as Record<string, any>) ?? {}
        try {
          prefs = (await users.getPrefs(candidate.$id)) as Record<string, any>
        } catch {
          // fall back to the prefs embedded in the list result
        }
        if (prefs?.facebookId && prefs.facebookId === facebookId) {
          matchedUserId = candidate.$id
        } else {
          console.warn(
            '[facebook-callback] refused email match to a non-Facebook identity for',
            email,
          )
          const bad = NextResponse.redirect(new URL('/login?error=account_exists', baseUrl))
          bad.cookies.set('talkingo_oauth_nonce', '', { maxAge: 0, path: '/' })
          return bad
        }
      }
    }

    if (matchedUserId) {
      userId = matchedUserId
      // Do NOT overwrite account.name for existing users — they may have set a
      // custom display name in the app. Provider names only seed creation.
    } else {
      // email is optional in the admin create call; pass undefined if absent.
      const newUser = await users.create('unique()', email, undefined, undefined, name)
      userId = newUser.$id
    }

    // ── 4. Tag the account with the Facebook id (idempotent — used by the
    //       provider-id match above on the next login) ──────────────────────
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
    console.error('[facebook-callback] Error:', err.message)
    return NextResponse.redirect(new URL('/login?error=oauth_failed', baseUrl))
  }
}
