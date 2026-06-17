/**
 * Forgie WhatsApp Bridge — Baileys + Supabase-backed session.
 * In-memory auth cache with async DB persistence (avoids handshake timeouts).
 */

import express from 'express'
import {
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
  initAuthCreds,
  BufferJSON,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import pino from 'pino'
import pg from 'pg'
import { timingSafeEqual } from 'node:crypto'

const { Pool } = pg

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT               = process.env.PORT ?? 3001
const BRIDGE_SECRET      = process.env.BRIDGE_SECRET
const DATABASE_URL       = process.env.DATABASE_URL
const RIGFORGE_URL       = process.env.RIGFORGE_URL
const RIGFORGE_WA_SECRET = process.env.RIGFORGE_WA_SECRET

if (!BRIDGE_SECRET) { console.error('BRIDGE_SECRET required'); process.exit(1) }
if (!DATABASE_URL)  { console.error('DATABASE_URL required');  process.exit(1) }

// ─── Postgres (Supabase) — for persistence only ───────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

async function dbEnsureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "WhatsappAuth" (
      "id"        TEXT PRIMARY KEY,
      "data"      TEXT NOT NULL,
      "updatedAt" TIMESTAMP DEFAULT NOW()
    )
  `)
}

async function dbLoadAll() {
  const { rows } = await pool.query('SELECT id, data FROM "WhatsappAuth"')
  const map = new Map()
  for (const r of rows) {
    try { map.set(r.id, JSON.parse(r.data)) } catch {}
  }
  return map
}

async function dbWrite(id, value) {
  if (value === null || value === undefined) {
    await pool.query('DELETE FROM "WhatsappAuth" WHERE id = $1', [id])
  } else {
    await pool.query(
      `INSERT INTO "WhatsappAuth" (id, data, "updatedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, "updatedAt" = NOW()`,
      [id, JSON.stringify(value)],
    )
  }
}

// ─── In-memory auth state with async persistence ──────────────────────────────
// CRITICAL: Baileys's signal protocol makes many rapid key reads/writes during
// the QR-scan auth handshake. If every operation hits Supabase synchronously,
// each round-trip (50-200ms) accumulates and WhatsApp's auth times out before
// we can complete the handshake. Solution: keep everything in memory, persist
// to DB in the background.

const memCache = new Map()   // id → parsed value
const dirty    = new Set()   // ids that need flushing
let flushInFlight = false

async function loadCacheFromDB() {
  const all = await dbLoadAll()
  memCache.clear()
  for (const [id, value] of all) memCache.set(id, value)
  console.log(`[bridge] loaded ${memCache.size} auth rows from Supabase`)
}

async function flushDirty() {
  if (flushInFlight || dirty.size === 0) return
  flushInFlight = true
  const ids = Array.from(dirty)
  dirty.clear()
  try {
    await Promise.all(ids.map(id => dbWrite(id, memCache.has(id) ? memCache.get(id) : null)))
  } catch (err) {
    console.error('[bridge] flush error:', err.message)
    for (const id of ids) dirty.add(id) // retry next tick
  } finally {
    flushInFlight = false
  }
}

setInterval(flushDirty, 2_000)

function memGet(id) {
  return memCache.get(id) ?? null
}

function memSet(id, value) {
  if (value === null || value === undefined) {
    memCache.delete(id)
  } else {
    memCache.set(id, value)
  }
  dirty.add(id)
}

async function useInMemoryAuthState() {
  await dbEnsureTable()
  await loadCacheFromDB()

  // Load or initialise creds
  const rawCreds = memGet('creds')
  const creds = rawCreds
    ? JSON.parse(JSON.stringify(rawCreds), BufferJSON.reviver)
    : initAuthCreds()

  async function saveCreds() {
    memSet('creds', JSON.parse(JSON.stringify(creds, BufferJSON.replacer)))
  }

  const keys = {
    async get(type, ids) {
      const result = {}
      for (const id of ids) {
        const raw = memGet(`key:${type}:${id}`)
        result[id] = raw
          ? JSON.parse(JSON.stringify(raw), BufferJSON.reviver)
          : null
      }
      return result
    },
    async set(data) {
      for (const [type, typeData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(typeData)) {
          memSet(
            `key:${type}:${id}`,
            value ? JSON.parse(JSON.stringify(value, BufferJSON.replacer)) : null,
          )
        }
      }
    },
  }

  return { state: { creds, keys }, saveCreds }
}

// ─── App state ────────────────────────────────────────────────────────────────
let sock         = null
let qrData       = null
let qrVersion    = 0    // bumped each time a fresh QR is issued so the /qr page can detect rotation
let isReady      = false
let isScanning   = false
let startingUp   = true
let reconnectAttempts = 0   // for exponential reconnect backoff
let startingLock = false    // guards against overlapping startWA() → twin-socket 440 conflicts
const events     = []   // ring buffer of recent connection events for /debug

// LRU of recently-seen message IDs so we don't double-process a message
// that Baileys re-fires (e.g. once as 'notify' during real-time, then again
// as 'append' during a server-replay after a brief reconnect). Bounded so
// long-running processes don't grow unbounded.
const SEEN_LRU_CAP = 500
const seenIds = new Map()  // id → ts (insertion order = LRU)
function markSeen(id) {
  if (!id) return false
  if (seenIds.has(id)) return true  // already processed
  seenIds.set(id, Date.now())
  if (seenIds.size > SEEN_LRU_CAP) {
    const firstKey = seenIds.keys().next().value
    seenIds.delete(firstKey)
  }
  return false
}

// WhatsApp is migrating newer accounts to send messages with @lid (Local
// Identifier — a privacy-preserving ID that is NOT the phone number)
// instead of @c.us (phone-number JID). The main app matches users by
// phone number, so we MUST resolve @lid → @c.us before forwarding or
// every message becomes "unknown sender".
//
// Strategy, in order:
//   1. If the message key already carries an alt-form PN (senderPn,
//      participantPn, remoteJidAlt with @c.us), use it directly. Baileys
//      puts both forms on many keys precisely so we don't have to look up.
//   2. Otherwise check our locally-learned cache (lid → pn). We populate
//      this from any message where both forms are present.
//   3. Otherwise ask Baileys's signalRepository.lidMapping (available in
//      6.7+) for the cached PN, and remember the answer.
//   4. If all of the above fail, return the @lid unchanged. The main app
//      will log "unknown-sender" — at least visibly, not silently.
const lidToPnCache = new Map()  // "<lid>@lid" → "<digits>@s.whatsapp.net" or @c.us

function learnLidPn(key) {
  if (!key) return
  const pairs = [
    [key.senderLid,    key.senderPn],
    [key.participant,  key.participantPn],
    [key.remoteJid,    key.remoteJidAlt],
    [key.remoteJidAlt, key.remoteJid],
  ]
  for (const [a, b] of pairs) {
    if (typeof a === 'string' && typeof b === 'string' &&
        a.endsWith('@lid') && (b.endsWith('@c.us') || b.endsWith('@s.whatsapp.net'))) {
      lidToPnCache.set(a, b)
    }
  }
}

function resolvePn(jid, key) {
  if (typeof jid !== 'string' || !jid) return jid
  if (jid.endsWith('@c.us') || jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us')) {
    return jid
  }
  if (!jid.endsWith('@lid')) return jid

  // 1. Alt-form already on this key
  if (key) {
    if (typeof key.senderPn === 'string' && key.senderPn) return key.senderPn
    if (typeof key.participantPn === 'string' && key.participantPn) return key.participantPn
    if (typeof key.remoteJidAlt === 'string' &&
        (key.remoteJidAlt.endsWith('@c.us') || key.remoteJidAlt.endsWith('@s.whatsapp.net'))) {
      return key.remoteJidAlt
    }
  }
  // 2. Our local cache
  const cached = lidToPnCache.get(jid)
  if (cached) return cached
  // 3. Baileys's own LID mapping (best-effort — API surface varies by version)
  try {
    const mapped =
      sock?.signalRepository?.lidMapping?.getPNForLID?.(jid) ??
      sock?.signalRepository?.lidMapping?.getPnForLid?.(jid)
    if (typeof mapped === 'string' && mapped) {
      lidToPnCache.set(jid, mapped)
      return mapped
    }
  } catch (err) {
    logEvent(`lid lookup error for ${jid}: ${err.message}`)
  }
  // 4. Give up — let the main app see the raw lid and log unknown-sender.
  return jid
}

function logEvent(msg) {
  const stamp = new Date().toISOString()
  console.log(`[bridge] ${stamp} ${msg}`)
  events.push({ at: stamp, msg })
  if (events.length > 50) events.shift()
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function requireSecret(req, res, next) {
  // Header only — never accept the secret via query string (it lands in access
  // logs / proxies / browser history). Constant-time compare to avoid timing
  // attacks on the shared secret.
  const secret = req.headers['x-bridge-secret']
  if (typeof secret !== 'string' || !safeEqual(secret, BRIDGE_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ─── WhatsApp client ──────────────────────────────────────────────────────────
const logger = pino({ level: 'silent' })

async function startWA() {
  // Prevent overlapping (re)starts. Two startWA() runs would each open a new
  // socket with the SAME creds, and WhatsApp kicks both with a 440 "Stream
  // Errored (conflict)" — a self-inflicted conflict death-loop. The old
  // reconnect-on-close path could trigger this (it scheduled startWA without
  // tearing down the previous socket).
  if (startingLock) { logEvent('startWA() skipped — already (re)starting'); return }
  startingLock = true
  try {

  // Tear down any previous socket BEFORE opening a new one. Remove its
  // listeners first so the dying socket's own 'close' event can't schedule
  // yet another reconnect behind our back.
  if (sock) {
    try { sock.ev.removeAllListeners() } catch {}
    try { sock.end(new Error('replacing socket')) } catch {}
    sock = null
  }

  startingUp = true
  isReady    = false
  isScanning = false
  qrData     = null
  logEvent('startWA() — initialising')

  let version
  try {
    const result = await fetchLatestBaileysVersion()
    version = result.version
    logEvent(`Baileys version: ${version.join('.')}`)
  } catch {
    version = [2, 3000, 1023456789]
    logEvent('Using fallback Baileys version')
  }

  const { state, saveCreds } = await useInMemoryAuthState()

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Forgie', 'Chrome', '120.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrData     = qr
      qrVersion += 1
      isReady    = false
      isScanning = false
      startingUp = false
      logEvent(`QR ready (v${qrVersion})`)
    }

    if (connection === 'connecting') {
      if (qrData !== null) {
        isScanning = true
        qrData     = null
        startingUp = false
        logEvent('QR scanned — authenticating')
      } else if (!isReady) {
        logEvent('connecting (initial)')
      }
    }

    if (connection === 'open') {
      isReady    = true
      isScanning = false
      qrData     = null
      startingUp = false
      reconnectAttempts = 0   // healthy connection — reset backoff
      // Ensure latest creds are flushed immediately on successful auth.
      await flushDirty()
      logEvent(`✅ Connected as ${sock.user?.id?.split('@')[0] ?? '?'}`)
    }

    if (connection === 'close') {
      isReady    = false
      isScanning = false
      qrData     = null
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const reason = lastDisconnect?.error?.message ?? 'unknown'
      const shouldReconnect = code !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        // Exponential backoff with jitter, capped at 60s, to avoid a tight
        // reconnect storm when the failure is persistent (e.g. 440 conflict).
        reconnectAttempts += 1
        const base = Math.min(5000 * 2 ** (reconnectAttempts - 1), 60_000)
        const delay = Math.round(base / 2 + (base / 2) * Math.random())
        logEvent(`✗ closed code=${code} reason="${reason}" — reconnect #${reconnectAttempts} in ${delay}ms`)
        setTimeout(() => { startWA().catch(err => logEvent(`reconnect err: ${err.message}`)) }, delay)
      } else {
        logEvent(`✗ closed code=${code} reason="${reason}" — logged out, hit /reset to clear state`)
      }
    }
  })

  // Forward incoming messages to RIG FORGE.
  //
  // We accept BOTH 'notify' (real-time) and 'append' (server-side replay after
  // a brief reconnect — see https://github.com/WhiskeySockets/Baileys for the
  // distinction). Without 'append', any message that arrives during a stale
  // recovery window silently never reaches the main app's webhook.
  //
  // Dedupe by message id so the same message firing twice (once notify,
  // once append) doesn't trigger two replies.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!RIGFORGE_URL || !RIGFORGE_WA_SECRET) {
      logEvent(`upsert skipped: webhook not configured (type=${type})`)
      return
    }
    if (type !== 'notify' && type !== 'append') {
      // Other types (e.g. 'replace') aren't user-visible new content.
      return
    }
    logEvent(`upsert type=${type} count=${messages?.length ?? 0}`)
    for (const msg of messages) {
      if (msg.key.fromMe) continue
      learnLidPn(msg.key)
      const body =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ?? ''
      if (!body.trim()) continue
      if (markSeen(msg.key.id)) {
        logEvent(`dedup: skip already-seen id=${msg.key.id}`)
        continue
      }

      const rawRemote   = msg.key.remoteJid ?? ''
      const isGroup     = isJidGroup(rawRemote)
      const chatJid     = isGroup ? rawRemote : resolvePn(rawRemote, msg.key)
      const rawSender   = isGroup ? (msg.key.participant ?? '') : rawRemote
      const senderJid   = resolvePn(rawSender, msg.key)

      // Loud log when we had to resolve a @lid, so future debugging is
      // a one-curl-to-/debug answer instead of an investigation.
      if (rawSender !== senderJid) {
        logEvent(`lid→pn: ${rawSender} → ${senderJid}`)
      }

      try {
        const res = await fetch(`${RIGFORGE_URL}/api/whatsapp/incoming`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wa-secret': RIGFORGE_WA_SECRET,
          },
          body: JSON.stringify({
            from: senderJid, chatJid, body, isGroup,
            msgId: msg.key.id,   // for idempotency on the main app (dedupe replies)
            pushName: msg.pushName ?? '',
            timestamp: msg.messageTimestamp,
            // Also include the raw forms so the main app can fall back if
            // it ever needs to disambiguate or build its own mapping.
            senderLid: rawSender !== senderJid ? rawSender : undefined,
            senderPn: senderJid,
          }),
          // The main app runs the LLM synchronously; cap how long we'll wait so
          // one slow message can't stall the whole upsert batch indefinitely.
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
          logEvent(`Forward HTTP ${res.status} for id=${msg.key.id} from=${senderJid}`)
        } else {
          logEvent(`Forwarded id=${msg.key.id} from=${senderJid} (${isGroup ? 'group' : 'dm'})`)
        }
      } catch (err) {
        logEvent(`Forward error for id=${msg.key.id}: ${err.message}`)
      }
    }
  })

  } finally {
    // Release the lock once setup is done (or if it threw). Connection events
    // fire asynchronously after this point — they don't need the lock held.
    startingLock = false
  }
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true, ready: isReady }))

// Public state — used by the /qr page's JS poller to detect transitions
// (QR → scanning → connected, QR rotation, etc.) and reload promptly.
// Returns only booleans + a rotation counter; no phone, creds, or events.
app.get('/state', (_req, res) => res.json({
  ready: isReady,
  scanning: isScanning,
  startingUp,
  hasQR: !!qrData,
  qrVersion,
}))

// Debug — last events
app.get('/debug', requireSecret, (_req, res) => res.json({
  ready: isReady, scanning: isScanning, startingUp,
  hasQR: !!qrData, cacheSize: memCache.size, dirtyCount: dirty.size,
  phone: sock?.user?.id?.split(':')[0] ?? null,
  events: events.slice(-30),
}))

// Reset — wipe auth + restart. POST + header secret only (this is destructive:
// it deletes the WhatsappAuth table and forces a re-link). Trigger with:
//   curl -X POST -H "x-bridge-secret: <secret>" https://<bridge>/reset
app.post('/reset', requireSecret, async (_req, res) => {
  logEvent('/reset triggered — wiping auth')
  try {
    await pool.query('DELETE FROM "WhatsappAuth"')
    memCache.clear()
    dirty.clear()
    try { sock?.end?.(new Error('reset')) } catch {}
    sock = null
    setTimeout(() => startWA().catch(err => logEvent(`restart err: ${err.message}`)), 500)
    // One-shot redirect — don't use the /state poller here, since that would
    // see the post-reset state diff and reload back to /reset (re-triggering it).
    res.send(page('🔄 Reset', `
      <h1>🔄 Auth wiped — restarting...</h1>
      <p>Taking you to <a href="/qr" style="color:#4ade80">/qr</a> in ~10 seconds.</p>
      <script>setTimeout(() => { location.href = '/qr' }, 10000)</script>`))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/qr', async (_req, res) => {
  // Snapshot the state we're rendering so the client-side poller can detect
  // any change (transition or QR rotation) and reload promptly.
  const snapshot = { ready: isReady, scanning: isScanning, startingUp, hasQR: !!qrData, qrVersion }

  if (isReady) {
    return res.send(page('✅ Connected',
      `<h1 style="color:#4ade80">✅ Forgie is connected to WhatsApp</h1>
       <p>Phone: <b>${sock?.user?.id?.split(':')[0] ?? 'unknown'}</b></p>
       <p style="color:#666">You can close this tab.</p>`, snapshot))
  }

  if (isScanning) {
    return res.send(page('🔄 Connecting...',
      `<h1>🔄 QR scanned — connecting...</h1>
       <p>Authenticating with WhatsApp servers. This can take up to 60 seconds.</p>
       <div class="spinner"></div>`, snapshot))
  }

  if (startingUp && !qrData) {
    return res.send(page('⏳ Starting up...',
      `<h1>⏳ Bridge starting up...</h1>
       <p>QR will appear in ~10 seconds.</p>`, snapshot))
  }

  if (!qrData) {
    return res.send(page('⏳ Generating QR...',
      `<h1>⏳ Generating QR code...</h1>
       <p>Please wait a few seconds.</p>`, snapshot))
  }

  const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2 })
  return res.send(page('📱 Scan QR', `
    <h1>📱 Scan to connect Forgie</h1>
    <img src="${qrImage}" width="300" height="300" style="border:8px solid white;border-radius:12px;margin:24px 0"/>
    <div>
      <p><b>On the Forgie WhatsApp phone:</b></p>
      <p>Settings → Linked Devices → Link a Device → Scan this code</p>
    </div>
    <p style="color:#666;font-size:13px;margin-top:20px">
      QR valid ~60s — this page updates instantly when a new one is issued or when you scan.<br>
      After scanning, wait up to 60 seconds for connection to complete.
    </p>`, snapshot))
})

app.get('/status', requireSecret, (_req, res) => res.json({
  ready: isReady, scanning: isScanning, startingUp,
  hasQR: !!qrData, phone: sock?.user?.id?.split(':')[0] ?? null,
}))

app.post('/send', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })
  const { to, message } = req.body
  if (!to || !message) return res.status(400).json({ error: '"to" and "message" required' })
  try {
    // Resolve the recipient to a ROUTABLE JID. The old code blindly appended
    // "@c.us" (whatsapp-web.js format, not Baileys) or trusted whatever JID we
    // were handed. On accounts migrated to WhatsApp's @lid privacy scheme,
    // sending to @c.us / @s.whatsapp.net / a raw @lid is accepted locally by
    // sock.sendMessage (so we'd reply "ok") but SILENTLY DROPPED by WhatsApp —
    // the message never arrives. onWhatsApp() asks WhatsApp for the address it
    // actually routes to, which fixes outbound on @lid accounts.
    let jid
    if (typeof to === 'string' && (to.endsWith('@g.us') || to.endsWith('@lid'))) {
      // Group JID, or an already-resolved @lid we were explicitly told to use.
      jid = to
    } else {
      const number = String(to).replace(/\D/g, '')
      let resolved
      try {
        const [hit] = await sock.onWhatsApp(number)
        if (hit?.exists && hit.jid) resolved = hit.jid
      } catch (e) {
        logEvent(`send: onWhatsApp(${number}) failed: ${e.message}`)
      }
      // Fall back to the canonical Baileys user JID if the lookup is unavailable.
      jid = resolved ?? `${number}@s.whatsapp.net`
    }
    const sent = await sock.sendMessage(jid, { text: message })
    logEvent(`sent to ${jid} (id=${sent?.key?.id ?? '?'})`)
    res.json({ ok: true, to: jid })
  } catch (err) {
    logEvent(`send error to ${to}: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

app.post('/create-group', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })
  const { name, participants } = req.body
  if (!name || !Array.isArray(participants) || !participants.length)
    return res.status(400).json({ error: '"name" and "participants" required' })
  try {
    const jids = participants.map(p => p.includes('@') ? p : `${p.replace(/\D/g, '')}@c.us`)
    const result = await sock.groupCreate(name, jids)
    res.json({ ok: true, groupId: result.id, name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/groups', requireSecret, async (_req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })
  try {
    const chats = await sock.groupFetchAllParticipating()
    const groups = Object.entries(chats).map(([jid, meta]) => ({
      id: jid, name: meta.subject, participants: meta.participants?.length ?? 0,
    }))
    res.json({ groups })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Remove one or more participants from a group. Forgie must be an admin
// of the group for this to actually work — WhatsApp returns 403 otherwise.
// Body: { groupJid: "...@g.us", participants: ["91XXXXXXXXXX", ...] }
app.post('/remove-participants', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })
  const { groupJid, participants } = req.body
  if (typeof groupJid !== 'string' || !groupJid.endsWith('@g.us')) {
    return res.status(400).json({ error: '"groupJid" must be a group JID ending in @g.us' })
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: '"participants" must be a non-empty array' })
  }
  try {
    const jids = participants.map((p) =>
      typeof p === 'string' && p.includes('@')
        ? p
        : `${String(p).replace(/\D/g, '')}@s.whatsapp.net`,
    )
    const result = await sock.groupParticipantsUpdate(groupJid, jids, 'remove')
    // Baileys returns an array of { jid, status }. Surface failures so the
    // caller can tell which numbers actually got removed.
    const removed = result.filter((r) => r.status === '200').map((r) => r.jid)
    const failed  = result.filter((r) => r.status !== '200').map((r) => ({ jid: r.jid, status: r.status }))
    res.json({ ok: true, groupJid, removed, failed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Leave a group. WhatsApp has no "delete group" — leaving is the closest
// equivalent. Group continues to exist for remaining members. If Forgie
// is the only admin, others may be promoted automatically.
// Body: { groupJid: "...@g.us" }
app.post('/leave-group', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })
  const { groupJid } = req.body
  if (typeof groupJid !== 'string' || !groupJid.endsWith('@g.us')) {
    return res.status(400).json({ error: '"groupJid" must be a group JID ending in @g.us' })
  }
  try {
    await sock.groupLeave(groupJid)
    res.json({ ok: true, groupJid, left: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// HTML page helper. Instead of meta-refresh (which had a multi-second blind
// window after the user scanned the QR), pages poll the public /state endpoint
// and reload the instant the state key changes. Pass `snapshot` so the client
// can compare against the moment the page was rendered.
function page(title, body, snapshot) {
  const poller = snapshot ? `<script>
    const initial = ${JSON.stringify(snapshot)};
    const key = (s) => s.ready+'|'+s.scanning+'|'+s.startingUp+'|'+s.hasQR+'|'+s.qrVersion;
    async function poll() {
      try {
        const r = await fetch('/state', { cache: 'no-store' });
        if (!r.ok) return;
        const s = await r.json();
        if (key(s) !== key(initial)) location.reload();
      } catch {}
    }
    setInterval(poll, 1500);
  </script>` : ''
  return `<!DOCTYPE html><html><head>
    <title>Forgie WA — ${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;
           min-height:100vh;background:#0d0d0d;color:#fff;font-family:system-ui,sans-serif;
           text-align:center;padding:24px}
      h1{font-size:1.6rem;margin-bottom:12px}
      p{color:#aaa;line-height:1.6;margin:6px 0}
      b{color:#fff}
      .spinner{width:40px;height:40px;border:4px solid #333;border-top-color:#4ade80;
               border-radius:50%;animation:spin 0.8s linear infinite;margin:24px auto}
      @keyframes spin{to{transform:rotate(360deg)}}
    </style>
  </head><body>${body}${poller}</body></html>`
}

app.listen(PORT, () => console.log(`[bridge] listening on ${PORT}`))
startWA().catch(err => { console.error('[bridge] Fatal:', err); process.exit(1) })
