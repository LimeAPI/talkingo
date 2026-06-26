/**
 * Appwrite auth helpers — wraps account SDK calls with clean typed returns.
 */
import { account } from '../api/appwrite'
import { clearCachedJWT } from '../api/auth-fetch'
import { ID } from 'appwrite'

/**
 * Subset of UserPreferences mirrored to Appwrite Account Preferences.
 * Account prefs are returned automatically by account.get() — they're the
 * fastest, most reliable cross-device source of truth for onboarding state.
 * We only mirror the essentials (not full progress/vocab) to stay under the
 * Appwrite account-prefs size limit.
 */
export interface AccountPrefsPayload {
  onboardingComplete?: boolean
  targetLanguage?: string
  nativeLanguage?: string
  level?: string
  talkingoLevel?: number
  learningGoal?: string
  topic?: string
  correctionStyle?: string
  persona?: string
  userName?: string
  currentUnitId?: string
  preferredScript?: 'native' | 'latin' | 'both'
  learnerGender?: 'masculine' | 'feminine'
  dialect?: string
  heritageMode?: boolean
  uiLanguage?: string
  // Stripe subscription fields (written by webhook)
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  // DodoPayments subscription fields (written by webhook)
  dodopaymentsCustomerId?: string
  dodopaymentsSubscriptionId?: string
  // OAuth provider identity ids — used to recognise returning users (esp.
  // Facebook accounts that sign up without an email).
  googleSub?: string
  facebookId?: string
  // Canonical provider-agnostic subscription fields (legacy fields above mirror these)
  subscriptionProvider?: 'stripe' | 'dodopayments'
  providerCustomerId?: string
  providerSubscriptionId?: string
  subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'unpaid'
  subscriptionPlan?: 'monthly' | 'yearly'
  subscriptionTrialEnd?: number
  subscriptionPeriodEnd?: number
  subscriptionUpdatedAt?: number
}

export interface AuthUser {
  id: string
  email: string
  name: string
  /** The user's chosen display name — prefers accountPrefs.userName over account.name (which OAuth can overwrite). */
  displayName: string
  emailVerification: boolean
  /** Appwrite Account Preferences — onboarding state mirror (cross-device, no permissions needed) */
  accountPrefs: AccountPrefsPayload
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function getSession(): Promise<AuthUser | null> {
  try {
    const user = await account.get()
    const prefs = (user.prefs ?? {}) as AccountPrefsPayload
    return {
      id: user.$id,
      email: user.email,
      name: user.name,
      displayName: prefs.userName || user.name,
      emailVerification: user.emailVerification,
      accountPrefs: prefs,
    }
  } catch {
    return null
  }
}

// ─── Email / Password ─────────────────────────────────────────────────────────

export async function signUp(email: string, password: string, name: string): Promise<AuthUser> {
  await account.create(ID.unique(), email, password, name)
  await account.createEmailPasswordSession(email, password)
  clearCachedJWT()
  const user = await account.get()
  const prefs = (user.prefs ?? {}) as AccountPrefsPayload
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    displayName: prefs.userName || user.name,
    emailVerification: user.emailVerification,
    accountPrefs: prefs,
  }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  await account.createEmailPasswordSession(email, password)
  clearCachedJWT()
  const user = await account.get()
  const prefs = (user.prefs ?? {}) as AccountPrefsPayload
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    displayName: prefs.userName || user.name,
    emailVerification: user.emailVerification,
    accountPrefs: prefs,
  }
}

export async function signOut(): Promise<void> {
  clearCachedJWT()
  try {
    await account.deleteSession('current')
  } catch (err: any) {
    if (err?.code === 404) return
    throw err
  }
}

// ─── Update User Name ─────────────────────────────────────────────────────────

export async function updateUserName(name: string): Promise<AuthUser> {
  await account.updateName(name)
  // Also persist to accountPrefs.userName — this is the app's source of truth
  // for display name, immune to OAuth provider overwrites.
  await updateAccountPrefs({ userName: name })
  const user = await account.get()
  const prefs = (user.prefs ?? {}) as AccountPrefsPayload
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    displayName: prefs.userName || user.name,
    emailVerification: user.emailVerification,
    accountPrefs: prefs,
  }
}

// ─── Account Preferences (onboarding mirror) ─────────────────────────────────

/**
 * Merges a payload into Appwrite Account Preferences. We read existing prefs
 * first so partial updates don't wipe other fields. This is the bulletproof
 * primary store for onboarding state — always readable by the owning user,
 * no collection permissions to misconfigure, automatically cross-device.
 */
export async function updateAccountPrefs(payload: AccountPrefsPayload): Promise<void> {
  // account.updatePrefs replaces the entire prefs object, so merge first.
  const current = await account.getPrefs<AccountPrefsPayload>().catch(() => ({} as AccountPrefsPayload))
  const merged: AccountPrefsPayload = { ...current, ...payload }
  await account.updatePrefs(merged)
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export function signInWithGoogle(redirect?: string): void {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const final = redirect && redirect !== '/' ? redirect : '/'
  const authUrl = `${origin}/api/auth/google?redirect=${encodeURIComponent(final)}`
  window.location.href = authUrl
}

// ─── Facebook OAuth ─────────────────────────────────────────────────────────

export function signInWithFacebook(redirect?: string): void {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const final = redirect && redirect !== '/' ? redirect : '/'
  const authUrl = `${origin}/api/auth/facebook?redirect=${encodeURIComponent(final)}`
  window.location.href = authUrl
}

// ─── Profile completion (OAuth users) ───────────────────────────────────────

/**
 * Persist the user's display name and email. Used by the onboarding form to
 * confirm / fill in details the OAuth provider may not have supplied (notably
 * Facebook accounts without an email). Goes through the admin-backed
 * /api/auth/profile route because OAuth accounts have no password and so can't
 * use the client SDK's password-gated email update.
 */
export async function updateProfile(input: { name?: string; email?: string }): Promise<void> {
  const { authFetch } = await import('../api/auth-fetch')
  const res = await authFetch('/api/auth/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || 'Could not save your profile.')
  }
}

// ─── Password Recovery ────────────────────────────────────────────────────────

/**
 * Send a password recovery email. Appwrite sends a link to the user's email
 * that redirects to the recovery URL with userId and secret params.
 */
export async function sendPasswordRecovery(email: string): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  await account.createRecovery(email, `${origin}/reset-password`)
}

/**
 * Complete password recovery using the userId and secret from the recovery link.
 */
export async function completePasswordRecovery(
  userId: string,
  secret: string,
  newPassword: string
): Promise<void> {
  await account.updateRecovery(userId, secret, newPassword)
}
