# Native Chat — Production Go-Live Checklist

The native chat (Phases 1–5) is **built, type-checked, and verified on the dev Supabase
project** (`ugbjsnygfssctiuoyhks`). Before it ships to production, work through the items
below. They are infra/security decisions that need the owner's call — they were intentionally
**not** done autonomously.

## ✅ DONE (security) — implemented + verified on dev

1. **RLS on chat tables + scoped realtime** — DONE. `prisma/rls/chat-rls.sql` enables RLS on
   Conversation, ConversationMember, ChatMessage, MessageReaction, MessageStar, Block,
   PushSubscription with membership-scoped SELECT policies (`rf_uid()` reads the JWT `sub`;
   `rf_is_member`/`rf_can_see_msg` are SECURITY DEFINER to avoid recursion). The realtime socket
   is authenticated per-user: `GET /api/chat/realtime-token` mints a Supabase JWT (sub=userId,
   role=authenticated) signed with `SUPABASE_JWT_SECRET`; ChatApp calls `supabase.realtime.setAuth()`
   before subscribing. Prisma (table owner) bypasses RLS so the app is unaffected.
   **Verified:** a non-member sees 0 messages; a member still receives messages live.
   **➜ PROD STEPS:** (a) set `SUPABASE_JWT_SECRET` (prod project → Settings → API → JWT Secret) in
   the prod env; (b) apply `prisma/rls/chat-rls.sql` against the prod DB.

2. **SSRF hardening on link previews** — DONE. `lib/net/safe-fetch.ts` (`assertPublicUrl` +
   `safeFetch`) blocks non-public hosts (10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, CGNAT,
   multicast/reserved, ::1, ULA, link-local, v4-mapped-v6) and re-validates each redirect hop;
   `fetchOgPreview()` uses it. No prod step needed (code).

3. **Disappearing-message deletion + push focus suppression** — DONE (`/api/cron/disappearing-cleanup`
   hard-deletes past-TTL messages; SW skips notifications when the messages tab is focused).
   **➜ PROD STEP:** schedule the new cron alongside the others.

## 🟠 Infra / config

4. **Move off the dev Supabase project.** Point `DATABASE_URL`/`DIRECT_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, anon + service-role keys at the production project, run
   `prisma db push` (or a migration) there, and re-create the `chat-media` storage bucket
   (public, 50 MB limit — or private + signed URLs, see #6).

5. **Paid Supabase + hosting tier.** Realtime concurrent-connection and storage limits on the free
   tier won't cover the team; size the plan before rollout.

6. **`chat-media` bucket privacy.** The bucket is currently **public** (anyone with the URL can
   fetch). For sensitive attachments, switch to a private bucket + short-lived signed URLs, and add
   a cleanup job for media orphaned by delete-for-everyone / disappearing messages.

7. **VAPID keys for Web Push.** Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` in the prod environment (dev keys live in `.env.local`, which is gitignored).
   Push also requires the app be served over HTTPS.

## 🟢 Nice-to-have polish

8. **Disappearing messages** currently hide on read (filtered in `listMessages`). Add a scheduled
   job to hard-delete expired rows + their media server-side.
9. **Suppress push when the chat is focused** (today every message pushes to non-muted members).
10. **@mention notify-override** — mentions are highlighted in render; wire them to override mute
    for push once #2 is in place.

---
_Generated alongside the Phase 5 chat build. See `memory/project_native_chat.md` for the full
phase log._
