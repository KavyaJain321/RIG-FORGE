# Security TODO — Rig Forge

Tracking list from the architecture/security audit. **Code fixes already applied**
live in the working tree (see git status); items below are what still needs a
human (mostly operational: secrets, deploy, one schema migration).

Severity: 🔴 Critical · 🟠 High · 🟡 Medium

---

## 1. Apply the H1 schema migration (one command)

`whatsappNumber` is now `@unique` in `prisma/schema.prisma`. Push it to Supabase:

```bash
cd RIG-FORGE-main          # the inner repo
# 1) Check for existing duplicate numbers FIRST — the unique index will fail to
#    create if any active dupes exist. (psql against DATABASE_URL.)
#    SELECT "whatsappNumber", COUNT(*) FROM "User"
#      WHERE "whatsappNumber" IS NOT NULL
#      GROUP BY "whatsappNumber" HAVING COUNT(*) > 1;
# 2) Resolve any dupes (null out the wrong ones), then:
npx prisma db push
```

> Same Supabase instance backs dev + prod, so this applies once. If `db push`
> reports a unique-constraint violation, fix the duplicate rows and re-run.

---

## 2. 🔴 Rotate ALL secrets (they were present in `.env` on disk)

Treat every secret in `.env` as compromised and rotate it, then store **only**
in the Render dashboard / a secrets manager — never a committed or shared file.

- [ ] **`JWT_SECRET`** — currently the literal placeholder
      `"replace-with-a-secure-random-string-min-32-chars"`. Generate a real one:
      `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
      Until this changes, **any session token (incl. `role:SUPER_ADMIN`) is
      forgeable.** Highest priority.
- [ ] **Supabase `DATABASE_URL`** password — rotate in Supabase, update Render.
- [ ] **All LLM API keys** (Groq/Gemini/etc.).
- [ ] **`GITHUB_TOKEN`** (fine-grained PAT) — revoke + reissue.
- [ ] **`GOOGLE_CLIENT_SECRET`** — rotate in Google Cloud console.
- [ ] **`BRIDGE_SECRET`, `RIGFORGE_WA_SECRET`, `WA_BRIDGE_SECRET`, `CRON_SECRET`.**
- [ ] (Optional) set **`ASSISTANT_ACTION_SECRET`** (32B random) — the new
      action-proposal HMAC falls back to `JWT_SECRET` if unset, which is fine,
      but a dedicated key is cleaner.
- [ ] **`FIELD_ENCRYPTION_KEY`** (32B random) — enables encrypted temp-password
      storage (§6) AND encrypted Google OAuth tokens (§5). Must be set ONCE and
      kept stable (rotating it orphans already-encrypted values).

After rotating, confirm `.gitignore` still excludes `.env` (it does) and that no
secret is echoed in logs.

---

## 3. 🟠 Session JWT no longer handed to page JS  (H3) — ✅ fixed

`GET /api/auth/token` now issues a short-lived (~2 min), socket-scoped token
(`signSocketToken`) instead of the 7-day session JWT, so an XSS can't steal a
full session through it. No manual action. (Note: there's currently no live
socket server — realtime uses polling fallback — so a future socket server
should verify with `verifySocketToken`.)

---

## 4. 🟠 Privileged writes re-validate against the DB  (H4) — partially fixed

Privileged WRITE endpoints (assistant `actions/execute`, `generate-user`,
`reset-password`, user-delete) now call `authenticateActive()`, which re-loads
`role` + `isActive` from the DB — so a deactivated/demoted user is blocked
immediately instead of keeping powers until the 7-day token expires.

**Still open (needs a deliberate auth change, not done):**
- [ ] Shorter access token + refresh-token flow (or a token-version column for
      logout-everywhere). Read-only admin endpoints still trust the JWT role
      for up to 7 days.

---

## 5. 🟡 Google OAuth tokens encrypted at rest  (M5) — ✅ fixed

`GoogleIntegration.accessToken`/`refreshToken` are now encrypted via
`lib/secret-box.ts` (same AES-256-GCM as temp passwords); decrypted on use.
**Requires `FIELD_ENCRYPTION_KEY` (§2).** Without the key they fall back to
plaintext so OAuth keeps working — set the key to actually get encryption.
**The key must be stable**: rotating/removing it after tokens are encrypted
makes them undecryptable (users would need to reconnect Google).

---

## 6. 🔴 Plaintext `tempPassword`  (C3) — ✅ fixed (encrypt-at-rest)

`User.tempPassword` is now encrypted with AES-256-GCM (`lib/secret-box.ts`).
Writers (`generate-user`, `reset-password`, `generate-all-credentials.ts`)
encrypt; the member-detail endpoint decrypts for display, so the admin
"view temp password later" feature still works — but nothing recoverable is
stored in cleartext.

**Action required:**
- [ ] Set **`FIELD_ENCRYPTION_KEY`** in Render (any 32B+ random string;
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
      Until it's set, new temp passwords are stored as `null` (shown once at
      creation only) — secure-by-default, feature just unavailable.
- [ ] Existing rows created before this change remain plaintext until the user
      next changes their password (which clears the field). To purge sooner,
      reset those users' passwords (re-stores them encrypted).

Also: dev scripts `generate-all-credentials.ts` / `list-users-temp.ts` and
`reset-admin-pass.mjs` etc. hardcode/print credentials — remove from the repo or
move under the ignored `scripts/_*` pattern.

---

## 7. Other open code items (lower urgency)

- ✅ timeouts on bridge↔app `fetch` + exponential backoff on bridge reconnect — done.
- 🟡 cron scheduler is external (not in `render.yaml`) — confirm it's configured,
  or the digests/drafts/health jobs silently never fire.
- 🟡 **H6 follow-up** — inbound dedupe is now in-memory (single-instance, in the
  main app process). For a multi-instance deploy, back it with a persisted
  message-id key.
- 🟡 **H4 follow-up** — refresh-token flow / token versioning (see §4).

---

## Already fixed in code (this audit) — for reference

C1 proposal-binding HMAC · C2 task-status RBAC · H2 assignee validation ·
H5 project-status enum · M4 ticket-transition atomicity · H7 atomic rate-limit ·
H9 task/ticket HTML sanitize · M2/M3 constant-time secret compares + `/reset`→POST ·
M1 IST date keying (incl. standup + project-health windows) · H1 `whatsappNumber @unique`
+ dup-check (needs the `db push` above) · H6 inbound idempotency (in-memory) ·
H8 WhatsApp recipient allow-list.
