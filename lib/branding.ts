// Neutral platform branding — the shared default shown pre-login (landing/login)
// and in server-generated text (Forgie replies, welcome, notifications). It's
// intentionally org-agnostic ("Forge") so no tenant sees another tenant's name.
// Per-ORG names ("Rig Forge" / "Trijya Forge") come from Organization.branding
// after login (lib/use-branding + lib/org-branding). Env can still override the
// whole deployment via NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SHORT.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Forge'
export const APP_SHORT = process.env.NEXT_PUBLIC_APP_SHORT || 'F'
export const APP_NAME_UPPER = APP_NAME.toUpperCase()
