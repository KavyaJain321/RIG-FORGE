import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service-role key. Used for privileged
 * operations our own auth has already gated — e.g. uploading group photos to
 * Storage. NEVER import this into client components (it holds the secret key).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !serviceKey) return null
  if (!admin) {
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return admin
}
