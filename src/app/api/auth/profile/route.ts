import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/api/auth-guard'
import { getAdminUsers } from '@/lib/appwrite-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Complete / update an OAuth user's profile (display name + email).
 *
 * OAuth-created accounts have no password, so the client SDK's
 * `account.updateEmail` (which requires the current password) cannot be used.
 * We update through the admin Users API instead, scoped to the verified
 * caller's own userId — a user can only ever edit their own profile.
 *
 * Identity in this app is the Appwrite `$id`, not the email, so the email here
 * is contact/display info. We still keep it on the account so it's not blank
 * for Facebook users who signed up without an email.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { userId } = auth

  let body: { name?: unknown; email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''

  // Lightweight email shape check (full verification is unnecessary — identity
  // is the Appwrite $id, this is just contact info).
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const users = getAdminUsers()

  try {
    if (name) {
      await users.updateName(userId, name.slice(0, 128))
      // Mirror to prefs.userName — the app's source of truth for display name.
      const current = await users.getPrefs(userId)
      await users.updatePrefs(userId, { ...current, userName: name.slice(0, 128) })
    }

    if (email) {
      await users.updateEmail(userId, email)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // 409 = the email is already attached to another account.
    if (err?.code === 409 || err?.response?.code === 409) {
      return NextResponse.json(
        { error: 'That email is already in use by another account.' },
        { status: 409 }
      )
    }
    console.error('[auth/profile] update failed:', err?.message)
    return NextResponse.json({ error: 'Could not save your profile.' }, { status: 500 })
  }
}
