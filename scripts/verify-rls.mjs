import { PrismaClient } from '@prisma/client'

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// 1) Anon REST API should now see ZERO rows (RLS denies anon).
const res = await fetch(`${supaUrl}/rest/v1/User?select=id&limit=5`, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}` },
})
const body = await res.json().catch(() => null)
const anonRows = Array.isArray(body) ? body.length : `non-array (${res.status})`
console.log(`anon REST GET /User -> status ${res.status}, rows: ${anonRows}  ${anonRows === 0 ? '✅ SECURED' : '❌ STILL EXPOSED'}`)

// 2) App (Prisma, table owner) must still read everything.
const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL })
const users = await prisma.user.count()
const projects = await prisma.project.count()
console.log(`Prisma (app) -> users: ${users}, projects: ${projects}  ${users > 0 ? '✅ APP UNAFFECTED' : '❌ APP BROKEN'}`)
await prisma.$disconnect()
