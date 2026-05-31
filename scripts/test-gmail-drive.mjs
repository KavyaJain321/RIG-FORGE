/**
 * Live smoke test for Gmail + Drive tools.
 * Searches inbox, sends a self-email, then creates test artifacts in
 * Drive and cleans them up at the end so nothing junk is left behind.
 */

import { google } from 'googleapis'
import { prisma } from '../lib/db.ts'
import { getAuthorizedClient } from '../lib/google/oauth.ts'
import {
  isUserGmailEnabled,
  searchMessages,
  getMessage,
  sendMessage,
} from '../lib/assistant/tools/gmail.ts'
import {
  isUserDriveEnabled,
  searchDrive,
  listFolder,
  getFile,
  createFolder,
  createDoc,
} from '../lib/assistant/tools/gdrive.ts'

const integ = await prisma.googleIntegration.findFirst({
  include: { user: { select: { id: true, name: true } } },
})
if (!integ) { console.error('No connected Google user'); process.exit(1) }

const userId = integ.userId
const userEmail = integ.email
const userName = integ.user.name

console.log(`Testing as: ${userName} (${userEmail})\n`)

const gmailOk = await isUserGmailEnabled(userId)
const driveOk = await isUserDriveEnabled(userId)
console.log(`  Gmail enabled: ${gmailOk}`)
console.log(`  Drive enabled: ${driveOk}\n`)
if (!gmailOk || !driveOk) {
  console.error('User needs to reconnect to grant Gmail and Drive scopes.')
  process.exit(1)
}

// ─── 1. Gmail search ─────────────────────────────────────────────────────────

console.log('1. gmail_search — newer_than:7d')
let lastMessageId = null
try {
  const r = await searchMessages(userId, { query: 'newer_than:7d', limit: 5 })
  console.log(`   ✓ ${r.matches} matches, ${r.messages.length} returned`)
  for (const m of r.messages.slice(0, 3)) {
    console.log(`     - [${m.isUnread ? 'unread' : 'read   '}] ${m.from?.slice(0, 40).padEnd(40)} | ${m.subject?.slice(0, 50)}`)
  }
  lastMessageId = r.messages[0]?.id ?? null
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 2. Gmail get message ────────────────────────────────────────────────────

console.log('\n2. gmail_get_message — first result from above')
if (!lastMessageId) {
  console.log('   (skipped — no message id from search)')
} else {
  try {
    const m = await getMessage(userId, { messageId: lastMessageId })
    console.log(`   ✓ subject: "${m.subject}"`)
    console.log(`     from:    ${m.from}`)
    console.log(`     body:    ${m.body.slice(0, 120).replace(/\n/g, ' ')}...`)
  } catch (e) {
    console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
  }
}

// ─── 3. Gmail send ───────────────────────────────────────────────────────────

console.log('\n3. gmail_send — send a test email to self')
try {
  const r = await sendMessage(userId, {
    to: userEmail,
    subject: 'Forgie smoke test — please ignore',
    body: 'This is an automated test from the Forgie integration smoke test script. You can delete this email.',
  })
  console.log(`   ✓ sent message id: ${r.id}`)
  console.log(`     check ${userEmail} inbox — should arrive in <1 min`)
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 4. Drive search ─────────────────────────────────────────────────────────

console.log('\n4. drive_search — find any recently modified file')
try {
  const r = await searchDrive(userId, { query: 'a', limit: 5 })
  console.log(`   ✓ ${r.results.length} files matched`)
  for (const f of r.results.slice(0, 3)) {
    const kb = f.size ? `${Math.round(f.size / 1024)} KB` : '—'
    console.log(`     - ${f.name?.slice(0, 50).padEnd(50)} ${kb.padStart(8)} ${f.isFolder ? '[folder]' : ''}`)
  }
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 5. Drive create folder ──────────────────────────────────────────────────

console.log('\n5. drive_create_folder — "Forgie smoke test (delete me)"')
let folderId = null
try {
  const f = await createFolder(userId, { name: 'Forgie smoke test (delete me)' })
  folderId = f.id ?? null
  console.log(`   ✓ created folder: ${f.name}`)
  console.log(`     id:  ${f.id}`)
  console.log(`     URL: ${f.url}`)
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 6. Drive create doc — plain text ───────────────────────────────────────

console.log('\n6. drive_create_doc — plain text file inside the folder')
let textFileId = null
const testContent = `Forgie test content
====================

Created at: ${new Date().toISOString()}
This file was created by the Forgie smoke test. Safe to delete.
`
try {
  const d = await createDoc(userId, {
    name: 'forgie-test.txt',
    content: testContent,
    format: 'text',
    ...(folderId && { parentFolderId: folderId }),
  })
  textFileId = d.id ?? null
  console.log(`   ✓ created text file: ${d.name}`)
  console.log(`     URL: ${d.url}`)
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 7. Drive create doc — Google Doc ───────────────────────────────────────

console.log('\n7. drive_create_doc — Google Doc inside the folder')
let gdocId = null
try {
  const d = await createDoc(userId, {
    name: 'Forgie test Google Doc',
    content: 'This is a real Google Doc created by Forgie.\n\nDelete me anytime.',
    format: 'gdoc',
    ...(folderId && { parentFolderId: folderId }),
  })
  gdocId = d.id ?? null
  console.log(`   ✓ created Google Doc: ${d.name}`)
  console.log(`     URL: ${d.url}`)
} catch (e) {
  console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
}

// ─── 8. Drive list folder ────────────────────────────────────────────────────

console.log('\n8. drive_list_folder — list the test folder we just made')
if (!folderId) {
  console.log('   (skipped — no folder id)')
} else {
  try {
    const r = await listFolder(userId, { folderId })
    console.log(`   ✓ ${r.entries.length} entries in folder`)
    for (const e of r.entries) {
      console.log(`     - ${e.name} (${e.mimeType})`)
    }
  } catch (e) {
    console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
  }
}

// ─── 9. Drive get file — read back the .txt content ─────────────────────────

console.log('\n9. drive_get_file — read back the text file content')
if (!textFileId) {
  console.log('   (skipped — no text file id)')
} else {
  try {
    const f = await getFile(userId, { fileId: textFileId })
    console.log(`   ✓ name: ${f.name}, size: ${f.size} bytes`)
    if (f.content) {
      console.log('     content preview:')
      const preview = f.content.split('\n').slice(0, 3).join('\n     | ')
      console.log(`     | ${preview}`)
    } else {
      console.log('     (no content retrieved — non-text mime?)')
    }
  } catch (e) {
    console.log(`   ✗ FAIL: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
  }
}

// ─── 10. Cleanup — trash the test artifacts ─────────────────────────────────

console.log('\n10. cleanup — trash the test folder + files')
try {
  const auth = await getAuthorizedClient(userId)
  const drive = google.drive({ version: 'v3', auth })
  // Trashing the parent folder also trashes its contents, but we'll be explicit
  for (const [label, id] of [
    ['text file', textFileId],
    ['google doc', gdocId],
    ['folder', folderId],
  ]) {
    if (!id) continue
    try {
      await drive.files.update({ fileId: id, requestBody: { trashed: true } })
      console.log(`   ✓ trashed ${label}: ${id}`)
    } catch (e) {
      console.log(`   ✗ failed to trash ${label}: ${e instanceof Error ? e.message.slice(0, 120) : e}`)
    }
  }
} catch (e) {
  console.log(`   ✗ Cleanup failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
  console.log(`   Manually delete: ${folderId ?? '(folder)'} and contents from your Drive`)
}

console.log('\n=== Done. ===')
await prisma.$disconnect()
