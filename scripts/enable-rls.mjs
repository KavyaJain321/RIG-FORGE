/**
 * Enable Row-Level Security on EVERY table in the public schema.
 *
 * Why: Supabase auto-exposes the public schema via PostgREST using the anon key
 * (which ships to the browser). Any table without RLS is therefore world
 * read/write through that REST API. This app never uses the Supabase data API —
 * all reads/writes go through Prisma as the table OWNER, which BYPASSES RLS — so
 * turning RLS on (with no policies) closes the anon hole without affecting the
 * app. The 3 realtime chat tables keep their membership policies (prisma/rls/
 * chat-rls.sql); notifications poll over our own API, not Realtime.
 *
 * Idempotent. Uses DIRECT_URL (5432) for DDL.
 *   dev:  node --env-file=.env.local scripts/enable-rls.mjs
 *   prod: point DIRECT_URL at prod, then run the same command.
 */
import { PrismaClient } from '@prisma/client'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error('Missing DIRECT_URL / DATABASE_URL')
  process.exit(1)
}

const prisma = new PrismaClient({ datasourceUrl: url })

const rows = await prisma.$queryRawUnsafe(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
)

let n = 0
for (const r of rows) {
  const t = r.tablename
  await prisma.$executeRawUnsafe(`ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;`)
  console.log('  ✓ RLS enabled:', t)
  n++
}
console.log(`\nDone — RLS enabled on ${n} public table(s).`)

await prisma.$disconnect()
