/**
 * Forgie WhatsApp Bridge
 *
 * Lightweight Node.js service that connects Forgie (RIG FORGE's AI assistant)
 * to WhatsApp using Baileys — an open-source WhatsApp Web implementation that
 * uses WebSockets directly (no Puppeteer/Chrome, ~80MB RAM, free-tier friendly).
 *
 * Session is persisted in Supabase (same DB as RIG FORGE) so it survives
 * Render restarts without needing a QR re-scan.
 *
 * REST API (all POST/GET routes require x-bridge-secret header except /health and /qr):
 *   GET  /health               — liveness check (used by UptimeRobot)
 *   GET  /qr                   — HTML page showing QR code to scan (no auth)
 *   GET  /status               — connection state + phone number
 *   POST /send                 — send a text message to a number or group
 *   POST /create-group         — create a new WhatsApp group
 *   GET  /groups               — list all groups the bot is in
 *
 * Incoming messages are forwarded to RIG FORGE via webhook.
 */

import express from 'express'
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import pino from 'pino'
import pg from 'pg'
import { existsSync, mkdirSync } from 'fs'
import { writeFileSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT          = process.env.PORT ?? 3001
const BRIDGE_SECRET = process.env.BRIDGE_SECRET
const DATABASE_URL  = process.env.DATABASE_URL
const RIGFORGE_URL  = process.env.RIGFORGE_URL          // e.g. https://rig-forge.onrender.com
const RIGFORGE_WA_SECRET = process.env.RIGFORGE_WA_SECRET  // shared secret for /api/whatsapp/incoming

if (!BRIDGE_SECRET)  { console.error('BRIDGE_SECRET env var required'); process.exit(1) }
if (!DATABASE_URL)   { console.error('DATABASE_URL env var required'); process.exit(1) }

// ─── Postgres (Supabase) — for session backup ─────────────────────────────────
// We store the Baileys auth state as JSON rows so the session survives restarts.
// Table is auto-created on first run.

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
  const { rows } = await pool.query(
    'SELECT data FROM "WhatsappAuth" WHERE id = $1',
    [id],
  )
  if (!rows[0]) return null
  try { return JSON.parse(rows[0].data) } catch { return null }
}

async function dbSet(id, value) {
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

// ─── Supabase-backed auth state ───────────────────────────────────────────────
// Implements the Baileys AuthenticationState interface using Supabase rows.
// Each credential or key is one row: id = 'creds' | 'key:{type}:{id}'

const { BufferJSON } = await import('@whiskeysockets/baileys')

async function useSupabaseAuthState() {
  await dbEnsureTable()

  // Load or initialise creds
  let creds = await dbGet('creds')
  if (!creds) {
    const { initAuthCreds } = await import('@whiskeysockets/baileys')
    creds = initAuthCreds()
  }

  // Persist creds on every update
  async function saveCreds() {
    await dbSet('creds', JSON.parse(JSON.stringify(creds, BufferJSON.replacer)))
  }

  const keys = {
    async get(type, ids) {
      const result = {}
      await Promise.all(
        ids.map(async (id) => {
          const raw = await dbGet(`key:${type}:${id}`)
          result[id] = raw ? JSON.parse(JSON.stringify(raw), BufferJSON.reviver) : null
        }),
      )
      return result
    },

    async set(data) {
      const tasks = []
      for (const [type, typeData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(typeData)) {
          const dbId = `key:${type}:${id}`
          if (value) {
            tasks.push(dbSet(dbId, JSON.parse(JSON.stringify(value, BufferJSON.replacer))))
          } else {
            tasks.push(dbSet(dbId, null))
          }
        }
      }
      await Promise.all(tasks)
    },
  }

  return { state: { creds, keys }, saveCreds }
}

// ─── App state ────────────────────────────────────────────────────────────────

let sock = null
let qrData = null      // latest QR string (null when connected)
let isReady = false    // true when WhatsApp is connected and ready

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireSecret(req, res, next) {
  const secret = req.headers['x-bridge-secret'] ?? req.query.secret
  if (!secret || secret !== BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ─── WhatsApp client ──────────────────────────────────────────────────────────

const logger = pino({ level: 'warn' })

async function startWA() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useSupabaseAuthState()

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: true,   // also print in Render logs as fallback
    browser: ['Forgie', 'Chrome', '120.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })

  // Persist credentials on every update
  sock.ev.on('creds.update', saveCreds)

  // QR code generated — store for the /qr endpoint
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrData = qr
      isReady = false
      console.log('[bridge] QR ready — open /qr in a browser to scan')
    }

    if (connection === 'close') {
      isReady = false
      qrData = null
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut

      console.log('[bridge] Connection closed —', lastDisconnect?.error, '— reconnect:', shouldReconnect)

      if (shouldReconnect) {
        setTimeout(startWA, 5000)
      } else {
        console.log('[bridge] Logged out. Delete WhatsappAuth rows and restart to re-scan.')
      }
    }

    if (connection === 'open') {
      isReady = true
      qrData = null
      console.log('[bridge] ✅ WhatsApp connected as', sock.user?.id)
    }
  })

  // Forward incoming messages to RIG FORGE
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    if (!RIGFORGE_URL || !RIGFORGE_WA_SECRET) return

    for (const msg of messages) {
      // Skip our own messages
      if (msg.key.fromMe) continue

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
      if (!body) continue

      const from      = msg.key.remoteJid ?? ''
      const isGroup   = isJidGroup(from)
      const pushName  = msg.pushName ?? ''
      const sender    = isGroup ? (msg.key.participant ?? '') : from

      try {
        await fetch(`${RIGFORGE_URL}/api/whatsapp/incoming`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wa-secret': RIGFORGE_WA_SECRET,
          },
          body: JSON.stringify({
            from: sender,          // sender's JID (phone@c.us)
            chatJid: from,         // chat JID (could be group@g.us)
            body,
            isGroup,
            pushName,
            timestamp: msg.messageTimestamp,
          }),
        })
      } catch (err) {
        console.error('[bridge] Failed to forward message to RIG FORGE:', err.message)
      }
    }
  })
}

// ─── Express server ───────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// Health — used by UptimeRobot
app.get('/health', (_req, res) => {
  res.json({ ok: true, ready: isReady })
})

// QR code page — no auth, just open in a browser tab
app.get('/qr', async (_req, res) => {
  if (isReady) {
    return res.send(`
      <!DOCTYPE html><html>
      <head><title>Forgie WA</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#111;color:#fff;font-family:sans-serif">
        <h2>✅ Forgie is connected to WhatsApp!</h2>
        <p style="color:#888">Phone: ${sock?.user?.id?.split(':')[0] ?? 'unknown'}</p>
      </body></html>
    `)
  }

  if (!qrData) {
    return res.send(`
      <!DOCTYPE html><html>
      <head><title>Forgie WA QR</title><meta http-equiv="refresh" content="5"></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#111;color:#fff;font-family:sans-serif">
        <h2>⏳ Waiting for QR...</h2>
        <p style="color:#888">Page auto-refreshes every 5s</p>
      </body></html>
    `)
  }

  const qrImage = await QRCode.toDataURL(qrData)
  res.send(`
    <!DOCTYPE html><html>
    <head>
      <title>Forgie WA QR</title>
      <meta http-equiv="refresh" content="30">
      <style>
        body{display:flex;flex-direction:column;align-items:center;justify-content:center;
             min-height:100vh;background:#111;color:#fff;font-family:sans-serif;text-align:center}
        img{border:8px solid white;border-radius:12px;margin:24px 0}
        p{color:#aaa;margin:8px 0}
      </style>
    </head>
    <body>
      <h1>🤖 Scan to connect Forgie</h1>
      <img src="${qrImage}" width="280" height="280" />
      <p>Open WhatsApp on the Forgie phone</p>
      <p>→ <b>Settings → Linked Devices → Link a Device</b></p>
      <p style="color:#666;font-size:12px;margin-top:16px">QR expires in ~60s — page auto-refreshes every 30s</p>
    </body>
    </html>
  `)
})

// Status
app.get('/status', requireSecret, (_req, res) => {
  res.json({
    ready: isReady,
    hasQR: !!qrData,
    phone: sock?.user?.id?.split(':')[0] ?? null,
  })
})

// Send a message
// Body: { to: "+91XXXXXXXXXX" | "XXXXXXXXXX@g.us", message: "text" }
app.post('/send', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })

  const { to, message } = req.body
  if (!to || !message) return res.status(400).json({ error: '"to" and "message" required' })

  try {
    // Normalise number → JID
    // Already a JID (group or contact): use as-is
    // Raw number like +919876543210: strip + and add @c.us
    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`
    await sock.sendMessage(jid, { text: message })
    res.json({ ok: true, to: jid })
  } catch (err) {
    console.error('[bridge] Send error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Create a WhatsApp group
// Body: { name: "Group name", participants: ["+91...", "+91..."] }
app.post('/create-group', requireSecret, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })

  const { name, participants } = req.body
  if (!name || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: '"name" and "participants" array required' })
  }

  try {
    const jids = participants.map((p) =>
      p.includes('@') ? p : `${p.replace(/\D/g, '')}@c.us`,
    )
    const result = await sock.groupCreate(name, jids)
    res.json({ ok: true, groupId: result.id, name })
  } catch (err) {
    console.error('[bridge] Create group error:', err)
    res.status(500).json({ error: err.message })
  }
})

// List all groups the bot is in
app.get('/groups', requireSecret, async (_req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp not connected' })

  try {
    // Baileys doesn't have a direct "list groups" API — we get chats and filter
    // Note: this may return an incomplete list if chats haven't been loaded yet.
    // For a fresh session, ask users to send a message first to populate chats.
    const chats = await sock.groupFetchAllParticipating()
    const groups = Object.entries(chats).map(([jid, meta]) => ({
      id: jid,
      name: meta.subject,
      participants: meta.participants?.length ?? 0,
    }))
    res.json({ groups })
  } catch (err) {
    console.error('[bridge] List groups error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[bridge] Forgie WhatsApp Bridge on port ${PORT}`)
  console.log(`[bridge] QR page: http://localhost:${PORT}/qr`)
})

startWA().catch((err) => {
  console.error('[bridge] Fatal:', err)
  process.exit(1)
})
