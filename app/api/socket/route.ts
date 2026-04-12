import { NextResponse } from 'next/server'

/**
 * Socket.io init ping endpoint.
 * Returns 200 so the useSocket hook doesn't log a warning.
 * Real-time is handled via polling fallback when no separate socket server is running.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true })
}
