import { NextRequest, NextResponse } from 'next/server'

// Appwrite web SDK stores sessions in localStorage (client-side only).
// Server-side middleware cannot read localStorage, so we skip auth checks here
// and handle protection in the AuthGuard client component instead.
// This middleware only handles routing — no auth logic.

export function middleware(req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
