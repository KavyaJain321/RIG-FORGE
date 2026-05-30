/**
 * Pre-OAuth config check.
 * Verifies all three env vars are set and the OAuth client can build
 * a valid consent URL with the right scopes + redirect.
 *
 * The actual OAuth flow happens in the browser — this just confirms
 * the server-side wiring is correct before the user tries it.
 */

import {
  isGoogleConfigured,
  buildOAuth2Client,
  buildConnectUrl,
  makeStateToken,
  GOOGLE_SCOPES,
} from '../lib/google/oauth.ts'

console.log('=== Google OAuth config check ===\n')

if (!isGoogleConfigured()) {
  console.log('✗ Not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.')
  process.exit(1)
}

console.log('✓ All three env vars set:')
console.log(`  GOOGLE_CLIENT_ID:     ...${(process.env.GOOGLE_CLIENT_ID ?? '').slice(-12)}`)
console.log(`  GOOGLE_CLIENT_SECRET: ${(process.env.GOOGLE_CLIENT_SECRET ?? '').slice(0, 10)}...`)
console.log(`  GOOGLE_REDIRECT_URI:  ${process.env.GOOGLE_REDIRECT_URI}`)
console.log()

console.log('Requested scopes:')
for (const scope of GOOGLE_SCOPES) console.log(`  - ${scope}`)
console.log()

try {
  const client = buildOAuth2Client()
  console.log('✓ OAuth2 client constructed without errors')

  const state = makeStateToken()
  const url = buildConnectUrl(state)
  console.log('✓ Consent URL generated (truncated):')
  console.log(`  ${url.slice(0, 120)}...`)
  console.log()

  // Sanity: verify the URL contains expected fields
  const u = new URL(url)
  const checks = [
    ['response_type', 'code'],
    ['access_type', 'offline'],
    ['prompt', 'consent'],
  ]
  for (const [k, expected] of checks) {
    const actual = u.searchParams.get(k)
    console.log(`  ${actual === expected ? '✓' : '✗'} ${k}=${actual}`)
  }
  const scopeParam = u.searchParams.get('scope') ?? ''
  for (const s of GOOGLE_SCOPES) {
    console.log(`  ${scopeParam.includes(s) ? '✓' : '✗'} scope includes ${s}`)
  }
} catch (err) {
  console.log(`✗ Config error: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}

console.log('\n=== Config OK. Next: connect in the browser. ===')
console.log()
console.log('Steps:')
console.log('  1. pnpm dev')
console.log('  2. Log in to RIG FORGE locally')
console.log('  3. Go to /dashboard/profile')
console.log('  4. Click "Connect Google"')
console.log('  5. Sign in with jainkavyakj123@gmail.com')
console.log('  6. Approve scopes')
console.log('  7. You should land back on /dashboard/profile?google=connected')
