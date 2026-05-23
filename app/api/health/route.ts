import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'

// Touches the DB so UptimeRobot's pings reset the Supabase idle-pause clock.
// Returns 200 only if Postgres responds; 503 otherwise — also gives us a
// usable "DB is reachable" signal for monitoring.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: 'up' })
  } catch (err) {
    console.error('[GET /api/health] DB unreachable', err)
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 })
  }
}
