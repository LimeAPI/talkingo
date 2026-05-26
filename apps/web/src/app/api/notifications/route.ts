import { NextRequest, NextResponse } from 'next/server'
import { Client, Databases, Query } from 'node-appwrite'

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? 'talkingo-1')
  .setKey(process.env.APPWRITE_API_KEY!)

const databases = new Databases(client)

const DB_ID = 'talkingo_db'
const NOTIFICATIONS_COLLECTION = 'notifications'

// GET /api/notifications?userId=xxx — fetch notifications for a user
export async function GET(req: NextRequest) {
  try {
    // ── Auth: verify user has a valid session ────────────────────────────
    const { verifyAuth } = await import('@/lib/api/auth-guard')
    const authenticatedUserId = await verifyAuth(req)
    if (!authenticatedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use authenticated userId, ignore query param (prevents fetching other users' notifications)
    const userId = authenticatedUserId

    const res = await databases.listDocuments(DB_ID, NOTIFICATIONS_COLLECTION, [
      Query.or([
        Query.equal('userId', userId),
        Query.equal('targetAll', true),
      ]),
      Query.orderDesc('createdAt'),
      Query.limit(50),
    ])

    return NextResponse.json({ notifications: res.documents })
  } catch (error: any) {
    // If collection doesn't exist yet, return empty
    if (error?.code === 404) {
      return NextResponse.json({ notifications: [] })
    }
    console.error('[Web API] notifications error:', error)
    return NextResponse.json({ notifications: [] })
  }
}

// PATCH /api/notifications — mark notification as read
export async function PATCH(req: NextRequest) {
  try {
    // ── Auth: verify user has a valid session ────────────────────────────
    const { verifyAuth } = await import('@/lib/api/auth-guard')
    const userId = await verifyAuth(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { notificationId } = body

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 })
    }

    await databases.updateDocument(DB_ID, NOTIFICATIONS_COLLECTION, notificationId, {
      read: true,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Web API] mark notification read error:', error)
    return NextResponse.json({ error: error.message ?? 'Failed to update notification' }, { status: 500 })
  }
}
