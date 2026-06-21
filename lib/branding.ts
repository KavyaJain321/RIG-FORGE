// White-label app branding. Per-deployment overrides via env:
//   NEXT_PUBLIC_APP_NAME   e.g. "TRIJYA FORGE"   (default "Rig Forge")
//   NEXT_PUBLIC_APP_SHORT  e.g. "TF"             (default "RF")
// NEXT_PUBLIC_ vars are inlined by Next at build/dev start, so these consts
// work in both server and client components.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Rig Forge'
export const APP_SHORT = process.env.NEXT_PUBLIC_APP_SHORT || 'RF'
export const APP_NAME_UPPER = APP_NAME.toUpperCase()
