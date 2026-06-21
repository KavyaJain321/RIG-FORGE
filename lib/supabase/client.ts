import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client — used ONLY for Realtime (live chat delivery).
 * Auth and all data reads/writes go through our own JWT + Prisma API; Supabase
 * here is just the realtime transport subscribing to Postgres changes on the
 * chat tables. Returns null if env is missing so the UI degrades to non-live.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return client
}
