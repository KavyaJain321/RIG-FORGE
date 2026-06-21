/**
 * One-time: create the public Storage bucket for chat media (group photos now,
 * image messages later). Run with the dev project's service-role key:
 *
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service_role>" node scripts/setup-storage.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }

const supabase = createClient(url, key)
const BUCKET = 'chat-media'

const { error } = await supabase.storage.createBucket(BUCKET, {
  public: true,
  fileSizeLimit: '5MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
})

if (error) {
  if (/already exists/i.test(error.message)) console.log(`✓ bucket "${BUCKET}" already exists`)
  else { console.error('createBucket error:', error.message); process.exit(1) }
} else {
  console.log(`✓ created public bucket "${BUCKET}"`)
}

const { data: buckets } = await supabase.storage.listBuckets()
console.log('buckets:', (buckets ?? []).map((b) => `${b.name}${b.public ? ' (public)' : ''}`).join(', '))
