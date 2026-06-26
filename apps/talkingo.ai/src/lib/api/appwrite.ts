import { Client, Account, Databases } from 'appwrite'

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'talkingo-1')

const account = new Account(client)
const databases = new Databases(client)

function getJwtFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)appwrite-jwt=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function setAppwriteJWT(): void {
  const jwt = getJwtFromCookie()
  if (jwt) {
    try { client.setJWT(jwt) } catch {}
  }
}

export function clearAppwriteJWT(): void {
  if (typeof document === 'undefined') return
  try { client.setJWT('') } catch {}
  document.cookie = 'appwrite-jwt=; path=/; max-age=0; samesite=lax'
  document.cookie = 'appwrite-jwt=; path=/; max-age=0; secure; samesite=lax'
}

if (typeof window !== 'undefined') {
  setAppwriteJWT()
}

export { client, account, databases }
