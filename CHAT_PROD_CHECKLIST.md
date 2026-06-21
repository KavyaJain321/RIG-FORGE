# Native Chat — Production Go-Live Checklist

The native chat (Phases 1–5) is **built, type-checked, and verified on the dev Supabase
project** (`ugbjsnygfssctiuoyhks`). Before it ships to production, work through the items
below. They are infra/security decisions that need the owner's call — they were intentionally
**not** done autonomously.

## 🔴 Must-do before prod (security)

1. **Row-Level Security (RLS) on chat tables.** RLS is currently **OFF** on dev. Enable it on
   `Conversation`, `ConversationMember`, `ChatMessage`, `MessageReaction`, `MessageStar`,
   `Block`, `PushSubscription`. All app reads/writes go through Prisma (direct connection, bypasses
   RLS) so the app keeps working — RLS matters for the **Supabase Realtime** path below.

2. **Scope Supabase Realtime to the user's conversations.** Today the browser subscribes to a
   single `rf-chat` channel with the **anon key** and receives every `ChatMessage` INSERT/UPDATE
   org-wide; the client filters by `conversationId` but the rows are still delivered over the wire.
   For prod:
   - Authenticate the realtime socket as the user (`supabase.realtime.setAuth(<supabase-jwt>)`),
     minting a Supabase-compatible JWT (claim `sub` = userId) signed with the project's JWT secret,
     or adopt Supabase Auth.
   - Add RLS policies so `postgres_changes` only emits rows for conversations the user is a member
     of (policy via a `ConversationMember` lookup on `auth.uid()`).
   - This closes the main data-exposure gap in the realtime layer.

3. **SSRF hardening on link previews.** `fetchOgPreview()` in `lib/chat/service.ts` fetches
   arbitrary user-supplied URLs server-side. Add a guard: resolve the host, block private/loopback/
   link-local ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7), cap redirects,
   and keep the existing 5s timeout + size cap.

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
