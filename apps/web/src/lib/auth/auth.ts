/**
 * Appwrite auth helpers — wraps account SDK calls with clean typed returns.
 */
import { account } from '../api/appwrite'
import { ID, OAuthProvider } from 'appwrite'

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
  cefr?: string
  learningGoal?: string
  topic?: string
  correctionStyle?: string
  persona?: string
  userName?: string
  currentUnitId?: string
  preferredScript?: 'native' | 'latin' | 'both'
  learnerGender?: 'masculine' | 'feminine'
  // Stripe subscription fields (written by webhook)
  stripeCustomerId?: string
  stripeSubscriptionId?: string
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
  emailVerification: boolean
  /** Appwrite Account Preferences — onboarding state mirror (cross-device, no permissions needed) */
  accountPrefs: AccountPrefsPayload
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function getSession(): Promise<AuthUser | null> {
  try {
    const user = await account.get()
    return {
      id: user.$id,
      email: user.email,
      name: user.name,
      emailVerification: user.emailVerification,
      accountPrefs: (user.prefs ?? {}) as AccountPrefsPayload,
    }
  } catch {
    return null
  }
}

// ─── Email / Password ─────────────────────────────────────────────────────────

export async function signUp(email: string, password: string, name: string): Promise<AuthUser> {
  await account.create(ID.unique(), email, password, name)
  await account.createEmailPasswordSession(email, password)
  const user = await account.get()
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    emailVerification: user.emailVerification,
    accountPrefs: (user.prefs ?? {}) as AccountPrefsPayload,
  }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  await account.createEmailPasswordSession(email, password)
  const user = await account.get()
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    emailVerification: user.emailVerification,
    accountPrefs: (user.prefs ?? {}) as AccountPrefsPayload,
  }
}

export async function signOut(): Promise<void> {
  await account.deleteSession('current')
}

// ─── Update User Name ─────────────────────────────────────────────────────────

export async function updateUserName(name: string): Promise<AuthUser> {
  await account.updateName(name)
  const user = await account.get()
  return {
    id: user.$id,
    email: user.email,
    name: user.name,
    emailVerification: user.emailVerification,
    accountPrefs: (user.prefs ?? {}) as AccountPrefsPayload,
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
  // Pass redirect through as the success URL so deep links are preserved
  const successUrl = redirect && redirect !== '/'
    ? `${origin}${redirect}`
    : `${origin}/`
  account.createOAuth2Session(
    OAuthProvider.Google,
    successUrl,            // success — back to intended page
    `${origin}/login`,     // failure — back to login
  )
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
