/**
 * rf-media — Cloudflare Worker fronting the R2 bucket `rf-chat-media`.
 *
 * Why this exists: Indian ISPs SNI-block R2's S3 endpoint (*.r2.cloudflarestorage.com),
 * so the app can't presign-PUT/GET directly. This Worker is served on our own domain
 * (media.rig360media.com) — reachable everywhere — and is bound to the bucket.
 *
 * Access is PRIVATE: every request must carry a short-lived HMAC token minted by the
 * Next server (lib/storage/r2.ts) with the shared R2_SIGNING_SECRET. The token binds
 * the HTTP method + object key + expiry, so a read token can't write and a token for
 * one key can't touch another.
 *
 *   GET    /<key>?exp=<ms>&sig=<hex>   → stream object (private, cached)
 *   PUT    /<key>?exp=<ms>&sig=<hex>   → store object (direct browser upload)
 *   DELETE /<key>?exp=<ms>&sig=<hex>   → remove object (cleanup)
 */

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 // 100 MB
const ENC = new TextEncoder()

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '3600',
  }
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time string compare (avoids signature-timing leaks).
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function tokenValid(secret, method, key, exp, sig) {
  if (!exp || !sig) return false
  const expMs = Number(exp)
  if (!Number.isFinite(expMs) || Date.now() > expMs) return false
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, ENC.encode(`${method}:${key}:${exp}`))
  return safeEqual(hex(mac), sig)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const method = request.method

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const key = decodeURIComponent(url.pathname.slice(1))
    if (!key) return new Response('Not found', { status: 404, headers: corsHeaders() })

    const secret = env.R2_SIGNING_SECRET
    if (!secret) return new Response('Worker not configured', { status: 500, headers: corsHeaders() })

    const exp = url.searchParams.get('exp')
    const sig = url.searchParams.get('sig')
    if (!(await tokenValid(secret, method, key, exp, sig))) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders() })
    }

    if (method === 'GET') {
      const object = await env.BUCKET.get(key)
      if (!object) return new Response('Not found', { status: 404, headers: corsHeaders() })
      const headers = new Headers(corsHeaders())
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      // Private but cacheable in the browser for the life of the signed URL.
      headers.set('Cache-Control', 'private, max-age=86400')
      return new Response(object.body, { headers })
    }

    if (method === 'PUT') {
      const len = Number(request.headers.get('content-length') || '0')
      if (len > MAX_UPLOAD_BYTES) {
        return new Response('Too large', { status: 413, headers: corsHeaders() })
      }
      await env.BUCKET.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
      })
      return new Response('OK', { status: 200, headers: corsHeaders() })
    }

    if (method === 'DELETE') {
      await env.BUCKET.delete(key)
      return new Response('OK', { status: 200, headers: corsHeaders() })
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders() })
  },
}
