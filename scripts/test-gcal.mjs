/**
 * Per-tool smoke test for the Google Calendar integration.
 * Picks the user who has connected Google (the first one we find) and
 * exercises all 4 calendar tools end-to-end.
 *
 * The createEvent test creates a test event 1 hour from now, then
 * cancels it at the end — so we don't leave junk on the calendar.
 */

import { prisma } from '../lib/db.ts'
import {
  isGcalConfigured,
  listEvents,
  findFreeTime,
  createEvent,
  cancelEvent,
} from '../lib/assistant/tools/gcal.ts'

if (!isGcalConfigured()) {
  console.error('Google not configured.')
  process.exit(1)
}

// Find a user with a Google connection
const integ = await prisma.googleIntegration.findFirst({
  include: { user: { select: { id: true, name: true } } },
})

if (!integ) {
  console.error('No user has connected Google yet. Connect from Profile page first.')
  process.exit(1)
}

const userId = integ.userId
const userName = integ.user.name
const userEmail = integ.email

console.log(`Testing as: ${userName} (${userEmail})`)
console.log()

// ─── 1. List events ─────────────────────────────────────────────────────────

console.log('1. listEvents — next 7 days')
try {
  const events = await listEvents(userId, { limit: 10 })
  console.log(`   ✓ ${events.length} events in the next 7 days`)
  for (const e of events.slice(0, 5)) {
    const when = e.start ? new Date(e.start).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }) : '?'
    console.log(`     - ${when}: "${e.title}"${e.meetLink ? ' [Meet]' : ''}`)
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 2. Find free time ──────────────────────────────────────────────────────

console.log('\n2. findFreeTime — just self, 30-min slots, next 3 days')
try {
  const range = new Date()
  const rangeEnd = new Date(range.getTime() + 3 * 24 * 60 * 60 * 1000)
  const result = await findFreeTime(userId, {
    attendees: [userEmail],
    durationMinutes: 30,
    rangeStart: range.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    limit: 5,
  })
  if ('error' in result) {
    console.log(`   ✗ ${result.error}`)
  } else {
    console.log(`   ✓ ${result.candidateSlots.length} candidate 30-min slots found`)
    for (const slot of result.candidateSlots.slice(0, 3)) {
      const s = new Date(slot.start)
      const e = new Date(slot.end)
      const when = s.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
      const dur = Math.round((e.getTime() - s.getTime()) / 60000)
      console.log(`     - ${when} (${dur} min available)`)
    }
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 3. Create an event (with Meet link) ────────────────────────────────────

console.log('\n3. createEvent — test event 1h from now, 15 min long, with Meet link')
let testEventId = null
try {
  const start = new Date(Date.now() + 60 * 60 * 1000)  // 1 hour from now
  const end = new Date(start.getTime() + 15 * 60 * 1000)
  const created = await createEvent(userId, {
    title: 'Forgie smoke test (auto-delete in 30s)',
    start: start.toISOString(),
    end: end.toISOString(),
    description: 'Created by the Forgie integration smoke test. Will be cancelled in a few seconds.',
    withMeetLink: true,
  })
  testEventId = created.id
  console.log(`   ✓ Event created: ${created.title}`)
  console.log(`     id:    ${created.id}`)
  console.log(`     start: ${created.start}`)
  console.log(`     Meet:  ${created.meetLink ?? '(no Meet link returned)'}`)
  console.log(`     URL:   ${created.eventUrl}`)
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 4. Cancel the test event ───────────────────────────────────────────────

console.log('\n4. cancelEvent — clean up the test event')
if (!testEventId) {
  console.log('   (skipped — createEvent failed)')
} else {
  try {
    const cancelled = await cancelEvent(userId, { eventId: testEventId })
    console.log(`   ✓ Cancelled: ${cancelled.eventId}`)
  } catch (e) {
    console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
    console.log(`   You'll need to delete the test event manually from your calendar.`)
  }
}

console.log('\n=== Done. All 4 calendar tools probed. ===')
await prisma.$disconnect()
