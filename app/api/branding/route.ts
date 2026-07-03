import { type NextRequest } from 'next/server'

import { successResponse } from '@/lib/api-helpers'
import { getBrandingForHost } from '@/lib/host-branding'

// GET /api/branding — public (no auth). Returns the white-label branding for the
// request host so pre-login pages (login/landing) can render the right brand.
export async function GET(request: NextRequest) {
  const b = await getBrandingForHost(request.headers.get('host'))
  return successResponse({ appName: b.appName, appShort: b.appShort })
}
