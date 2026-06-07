/**
 * Forgie WhatsApp Bridge
 * Lightweight Node.js service — Baileys (WebSocket, no Puppeteer), ~80MB RAM.
 * Session persisted in Supabase so it survives Render restarts.
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

const { Pool } = pg

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT               = process.env.PORT ?? 3001
const BRIDGE_SECRET      = process.env.BRIDGE_SECRET
const DATABASE_URL       = process.env.DATABASE_URL
const RIGFORGE_URL       = process.env.RIGFORGE_URL
const RIGFORGE_WA_SECRET = process.env.RIGFORGE_WA_SECRET

if (!BRIDGE_SECRET) { console.error('BRIDGE_SECRET required'); process.exit(1) }
if (!DATABASE_URL)  { console.error('DATABASE_URL required');  process.exit(1) }

// ─── Postgres (Supabase) ──────────────────────────────────────────────────────
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

async function dbGet(id) {
  try {
    const { rows } = await pool.query('SELECT data FROM "WhatsappAuth" WHERE id = $1', [id])
    if (!rows[0]) return null
    return JSON.parse(rows[0].data)
  } catch { return null }
}

async function dbSet(id, value) {
  try {
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
  } catch (err) {
    console.error('[db] write error:', err.message)
  }
}

// ─── Supabase-backed Baileys auth state ───────────────────────────────────────
async function useSupabaseAuthState() {
  await dbEnsureTable()

  // Load creds from DB or initialise fresh
  const rawCreds = await dbGet('creds')
  let creds = rawCreds
    ? JSON.parse(JSON.stringify(rawCreds), BufferJSON.reviver)
    : initAuthCreds()

  async function saveCreds() {
    await dbSet('creds', JSON.parse(JSON.stringify(creds, BufferJSON.replacer)))
  }

  const keys = {
    async get(type, ids) {
      const result = {}
      await Promise.all(
        ids.map(async (id) => {
          const raw = await dbGet(`key:${type}:${id}`)
          result[id] = raw
            ? JSON.parse(JSON.stringify(raw), BufferJSON.reviver)
            : null
        }),
      )
      return result
    },
    async set(data) {
      await Promise.all(
        Object.entries(data).flatMap(([type, typeData]) =>
          Object.entries(typeData).map(([id, value]) =>
            dbSet(
              `key:${type}:${id}`,
              value ? JSON.parse(JSON.stringify(value, BufferJSON.replacer)) : null,
            ),
          ),
        ),
      )
    },
  }

  return { state: { creds, keys }, saveCreds }
}

// ─── App state ────────────────────────────────────────────────────────────────
let sock         = null
let qrData       = null   // latest QR string
let isReady      = false  // fully connected
let isScanning   = false  // QR was scanned, waiting for auth to complete
let startingUp   = true   // still initialising Baileys

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireSecret(req, res, next) {
  const secret = req.headers['x-bridge-secret'] ?? req.query.secret
  if (!secret || secret !== BRIDGE_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ─── WhatsApp client ──────────────────────────────────────────────────────────
const logger = pino({ level: 'silent' }) // suppress Baileys internal logs

async function startWA() {
  startingUp = true
  isReady    = false
  isScanning = false
  qrData     = null

  let version
  try {
    const result = await fetchLatestBaileysVersion()
    version = result.version
  } catch {
    version = [2, 3000, 1023456789]
  }

  const { state, saveCreds } = await useSupabaseAuthState()

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
    connectTimeoutMs: 60_000,  // give it 60s to connect after QR scan
    defaultQueryTimeoutMs: 30_000,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      // New QR generated (valid for ~60s, Baileys auto-regenerates)
      qrData     = qr
      isReady    = false
      isScanning = false
      startingUp = false
      console.log('[bridge] QR ready — open /qr to scan')
    }

    if (connection === 'connecting') {
      // 'connecting' fires both on initial startup AND after a QR is scanned.
      // We distinguish: if we previously had a QR (qrData was set) and it's
      // now being cleared, that means the QR was used → scanning state.
      // Otherwise it's just the initial connect — stay in startingUp.
      if (qrData !== null) {
        isScanning = true
        qrData     = null
        startingUp = false
        console.log('[bridge] QR scanned — authenticating...')
      }
      // else: still starting up, leave startingUp = true
    }

    if (connection === 'open') {
      isReady    = true
      isScanning = false
      qrData     = null
      startingUp = false
      console.log('[bridge] ✅ Connected as', sock.user?.id?.split('@')[0])
    }

    if (connection === 'close') {
      isReady    = false
      isScanning = false
      qrData     = null
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log('[bridge] Disconnected (code', code, ') — reconnect:', shouldReconnect)
      if (shouldReconnect) setTimeout(startWA, 5000)
      else console.log('[bridge] Logged out — delete WhatsappAuth rows to reset.')
    }
  })

  // Forward incoming messages to RIG FORGE
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' || !RIGFORGE_URL || !RIGFORGE_WA_SECRET) return
    for (const msg of messages) {
      if (msg.key.fromMe) continue
      const body =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ?? ''
      if (!body.trim()) continue
      const from    = msg.key.remoteJid ?? ''
      const isGroup = isJidGroup(from)
      const sender  = isGroup ? (msg.key.participant ?? '') : from
      try {
        await fetch(`${RIGFORGE_URL}/api/whatsapp/incoming`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wa-secret': RIGFORGE_WA_SECRET,
          },
          body: JSON.stringify({
            from: sender, chatJid: from, body, isGroup,
            pushName: msg.pushName ?? '',
            timestamp: msg.messageTimestamp,
          }),
        })
      } catch (err) {
        console.error('[bridge] Forward error:', err.message)
      }
    }
  })

  // Stuck-state watchdog: if we've had stored creds but never get a QR
  // and never connect within 25s, the saved session is bad — wipe it
  // and force a fresh start. Prevents the "Generating QR..." dead state.
  setTimeout(async () => {
    if (!isReady && !qrData && !isScanning) {
      console.log('[bridge] Stuck after 25s — wiping auth and restarting')
      try { await pool.query('DELETE FROM "WhatsappAuth"') } catch {}
      try { sock?.end?.(new Error('stuck')) } catch {}
      setTimeout(() => startWA().catch(() => {}), 1000)
    }
  }, 25_000)

  await sock.waitForConnectionUpdate(() => false).catch(() => {})
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// Health — UptimeRobot target
app.get('/health', (_req, res) => res.json({ ok: true, ready: isReady }))

// Reset — nukes the auth state and restarts. Use when stuck after a half-
// completed scan: Baileys saves partial creds, tries to reconnect with them
// on next start, never generates a fresh QR. This wipes and starts over.
// Hit it from a browser: /reset?secret=<BRIDGE_SECRET>
app.get('/reset', requireSecret, async (_req, res) => {
  console.log('[bridge] /reset triggered — wiping auth state')
  try {
    await pool.query('DELETE FROM "WhatsappAuth"')
    console.log('[bridge] auth cleared — closing socket and restarting')
    try { sock?.end?.(new Error('reset')) } catch {}
    sock       = null
    qrData     = null
    isReady    = false
    isScanning = false
    startingUp = true
    setTimeout(() => startWA().catch(err => console.error('[bridge] restart err:', err)), 500)
    res.send(page('🔄 Reset', `
      <h1>🔄 Auth wiped — restarting...</h1>
      <p>Open <a href="/qr" style="color:#4ade80">/qr</a> in ~10 seconds for a fresh QR code.</p>`,
      10))
  } catch (err) {
    console.error('[bridge] reset error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// QR page — no auth, just open in browser
app.get('/qr', async (_req, res) => {
  if (isReady) {
    return res.send(page('✅ Connected!',
      `<h1 style="color:#4ade80">✅ Forgie is connected to WhatsApp</h1>
       <p>Phone: <b>${sock?.user?.id?.split(':')[0] ?? 'unknown'}</b></p>
       <p style="color:#666">You can close this tab.</p>`))
  }

  if (isScanning) {
    return res.send(page('🔄 Connecting...', `
      <h1>🔄 QR scanned — connecting...</h1>
      <p>This can take up to 30 seconds. Page auto-refreshes.</p>
      <div class="spinner"></div>`,
      3)) // fast refresh while connecting
  }

  if (startingUp && !qrData) {
    return res.send(page('⏳ Starting up...', `
      <h1>⏳ Bridge is starting up...</h1>
      <p>Baileys is initialising — QR will appear in ~10 seconds.</p>`,
      3))
  }

  if (!qrData) {
    return res.send(page('⏳ Waiting for QR...', `
      <h1>⏳ Generating QR code...</h1>
      <p>Please wait a few seconds.</p>`,
      3))
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
      QR valid for ~60s — page auto-refreshes with a new one if it expires.<br>
      After scanning, wait up to 30 seconds for the connection to complete.
    </p>`,
    20)) // 20s refresh — QR valid for 60s so 3 refreshes before it expires
})

// Status
app.get('/status', requireSecret, (_req, res) => res.json({
  ready: isReady, scanning: isScanning, startingUp,
  hasQR: !!qrData, phone: sock?.user?.id?.split(':')[0] ?? null,
}))

// Send message — { to: "+91XXXXXXXXXX" | "XXXXXXXXXX@g.us", message: "..." }
app.post('/send', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })
  const { to, message } = req.body
  if (!to || !message) return res.status(400).json({ error: '"to" and "message" required' })
  try {
    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`
    await sock.sendMessage(jid, { text: message })
    res.json({ ok: true, to: jid })
  } catch (err) {
    console.error('[bridge] Send error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Create group — { name: "...", participants: ["+91...", ...] }
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
    console.error('[bridge] Create group error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// List groups
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

// ─── HTML page helper ─────────────────────────────────────────────────────────
function page(title, body, refreshSec = 20) {
  return `<!DOCTYPE html><html>
  <head>
    <title>Forgie WA — ${title}</title>
    <meta http-equiv="refresh" content="${refreshSec}">
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
  </head>
  <body>${body}</body></html>`
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[bridge] Running on port ${PORT}`))
startWA().catch(err => { console.error('[bridge] Fatal:', err); process.exit(1) })
