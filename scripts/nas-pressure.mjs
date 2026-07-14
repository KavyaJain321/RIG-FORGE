/**
 * NAS pipeline pressure + latency harness.
 *   BASE=http://localhost:3005 TEST_USER=root@dev.local node scripts/nas-pressure.mjs [N]
 *
 * Proves two things:
 *  1. Every NAS surface works end-to-end (search fast-lane, semantic/RAG, read
 *     fast-path, list, download, share link).
 *  2. NAS work does NOT slow the ordinary LLM path (tool subsetting keeps NAS
 *     tools out of non-NAS turns), measured under concurrency.
 */
const BASE = process.env.BASE || 'http://localhost:3005'
const N = Number(process.argv[2] || 12)

async function login(email = process.env.TEST_USER || 'root@dev.local') {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Dev@2026' }),
  })
  const m = (r.headers.get('set-cookie') || '').match(/forge-token=([^;]+)/)
  if (!m) throw new Error(`login failed ${r.status}`)
  return m[1]
}

async function ask(ck, content) {
  const t0 = Date.now()
  try {
    const r = await fetch(`${BASE}/api/assistant/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `forge-token=${ck}` },
      body: JSON.stringify({ content }),
    })
    if (!r.ok) return { ok: false, ms: Date.now() - t0, err: `http ${r.status}` }
    let text = '', provider = '?', err = null
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
    while (true) {
      const { done, value } = await rd.read(); if (done) break
      buf += dec.decode(value, { stream: true }); let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue
        try { const f = JSON.parse(line)
          if (f.type === 'text') text += f.delta
          if (f.type === 'error') err = f.error
          if (f.type === 'done') provider = f.provider
        } catch {}
      }
    }
    return { ok: !err && text.length > 0, ms: Date.now() - t0, provider, err, text: text.slice(0, 60) }
  } catch (e) { return { ok: false, ms: Date.now() - t0, err: e.message } }
}

async function apiGet(ck, path) {
  const t0 = Date.now()
  try {
    const r = await fetch(`${BASE}${path}`, { headers: { Cookie: `forge-token=${ck}` } })
    const ok = r.ok
    await r.arrayBuffer()
    return { ok, ms: Date.now() - t0, status: r.status }
  } catch (e) { return { ok: false, ms: Date.now() - t0, err: e.message } }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0 }
const stat = (label, rs) => {
  const lat = rs.map((r) => r.ms)
  const ok = rs.filter((r) => r.ok).length
  const provs = {}; rs.forEach((r) => { if (r.provider) provs[r.provider] = (provs[r.provider] || 0) + 1 })
  console.log(
    `  ${label.padEnd(22)} n=${String(rs.length).padStart(2)} ok=${ok}/${rs.length} ` +
    `p50=${String(pct(lat, 0.5)).padStart(6)}ms p95=${String(pct(lat, 0.95)).padStart(6)}ms ` +
    `${Object.keys(provs).length ? JSON.stringify(provs) : ''}`,
  )
  const errs = rs.filter((r) => !r.ok)
  if (errs.length) console.log(`      ERRORS: ${JSON.stringify(errs.slice(0, 2).map((e) => e.err))}`)
  return errs.length
}

async function main() {
  const ck = await login()
  let errors = 0

  console.log('=== A. FUNCTIONAL: every NAS surface ===')
  const nasSearch = await ask(ck, 'find windlass on the nas')
  console.log(`  nas search fast-lane : ${nasSearch.ms}ms provider=${nasSearch.provider} | ${nasSearch.text}`)
  const semantic = await ask(ck, 'find hotel elevation drawings on the nas')
  console.log(`  semantic/RAG         : ${semantic.ms}ms provider=${semantic.provider} | ${semantic.text}`)
  const nasRead = await ask(ck, 'summarize paint.pdf on the nas')
  console.log(`  nas read fast-path   : ${nasRead.ms}ms provider=${nasRead.provider} | ${nasRead.text}`)
  const list = await apiGet(ck, '/api/nas/list?server=WD&path=/')
  console.log(`  browse (list)        : ${list.ms}ms http=${list.status}`)
  const dl = await apiGet(ck, '/api/nas/download?server=WD&path=/paint.pdf&inline=1')
  console.log(`  view/download        : ${dl.ms}ms http=${dl.status}`)
  for (const r of [nasSearch, semantic, nasRead, list, dl]) if (!r.ok) errors++

  console.log('\n=== B. LATENCY: does NAS slow the ordinary LLM path? ===')
  const plain = []
  for (let i = 0; i < 3; i++) plain.push(await ask(ck, `in one sentence, why do short standups help a team ${i}`))
  errors += stat('plain LLM (no NAS)', plain)
  const nasQ = []
  for (let i = 0; i < 3; i++) nasQ.push(await ask(ck, `find drawing ${i} on the nas`))
  errors += stat('NAS search', nasQ)

  console.log(`\n=== C. PRESSURE: ${N} concurrent, mixed workload ===`)
  const jobs = Array.from({ length: N }, (_, i) => {
    const k = i % 4
    if (k === 0) return () => ask(ck, `find plan ${i} on the nas`).then((r) => ({ ...r, cat: 'nas-search' }))
    if (k === 1) return () => ask(ck, `what is on my plate ${i}`).then((r) => ({ ...r, cat: 'rule' }))
    if (k === 2) return () => ask(ck, `one short tip ${i} about design reviews`).then((r) => ({ ...r, cat: 'llm' }))
    return () => apiGet(ck, `/api/nas/search?server=WD&q=plan`).then((r) => ({ ...r, cat: 'nas-api' }))
  })
  const t0 = Date.now()
  const all = await Promise.all(jobs.map((j) => j()))
  const wall = Date.now() - t0
  for (const cat of ['nas-search', 'rule', 'llm', 'nas-api']) {
    errors += stat(cat, all.filter((r) => r.cat === cat))
  }
  const lat = all.map((r) => r.ms)
  console.log(`  ${'OVERALL'.padEnd(22)} n=${all.length} ok=${all.filter((r) => r.ok).length}/${all.length} ` +
    `p50=${pct(lat, 0.5)}ms p95=${pct(lat, 0.95)}ms wall=${wall}ms`)

  console.log(errors === 0 ? '\nRESULT: PASS — no errors' : `\nRESULT: ${errors} FAILURES`)
  process.exit(errors === 0 ? 0 : 1)
}
main().catch((e) => { console.error('harness crash:', e); process.exit(2) })
