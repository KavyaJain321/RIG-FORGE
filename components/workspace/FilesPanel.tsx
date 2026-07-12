'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface NasEntry {
  name: string
  isDir: boolean
  size: number
  mtime: number
}
interface SearchHit {
  name: string
  path: string
  isDir: boolean
  size: number
}

async function api<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Request failed')
  return j.data as T
}

function fmtSize(n: number): string {
  if (!n) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
function ext(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}
function icon(e: { isDir: boolean; name: string }): string {
  if (e.isDir) return '📁'
  const x = ext(e.name)
  if (['pdf'].includes(x)) return '📕'
  if (['xls', 'xlsx', 'csv'].includes(x)) return '📊'
  if (['doc', 'docx'].includes(x)) return '📄'
  if (['dwg', 'dxf', 'rvt', 'skp', '3ds', 'max'].includes(x)) return '📐'
  if (['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'bmp', 'webp'].includes(x)) return '🖼️'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(x)) return '🎬'
  if (['mp3', 'wav', 'amr', 'm4a'].includes(x)) return '🎵'
  if (['zip', 'rar', '7z'].includes(x)) return '🗜️'
  return '📦'
}
function joinPath(dir: string, name: string): string {
  return (dir.endsWith('/') ? dir : dir + '/') + name
}

export default function FilesPanel() {
  const [servers, setServers] = useState<string[] | null>(null)
  const [server, setServer] = useState<string>('')
  const [path, setPath] = useState('/')
  const [items, setItems] = useState<NasEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const r = await api<{ enabled: boolean; servers: { label: string }[] }>('/api/nas/servers')
        const labels = (r.servers || []).map((s) => s.label)
        setServers(labels)
        if (labels[0]) setServer(labels[0])
      } catch {
        setServers([])
      }
    })()
  }, [])

  const load = useCallback(async (srv: string, p: string) => {
    if (!srv) return
    setLoading(true); setErr(null); setHits(null)
    try {
      const r = await api<{ path: string; items: NasEntry[] }>(
        `/api/nas/list?server=${encodeURIComponent(srv)}&path=${encodeURIComponent(p)}`,
      )
      setItems(r.items || [])
      setPath(r.path || p)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (server) void load(server, '/') }, [server, load])

  const runSearch = useCallback(async () => {
    if (!q.trim() || !server) return
    setLoading(true); setErr(null)
    try {
      const r = await api<{ results: SearchHit[]; truncated: boolean }>(
        `/api/nas/search?server=${encodeURIComponent(server)}&q=${encodeURIComponent(q.trim())}`,
      )
      setHits(r.results || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [q, server])

  const openFile = (p: string) => {
    window.open(`/api/nas/download?server=${encodeURIComponent(server)}&path=${encodeURIComponent(p)}`, '_blank')
  }

  const onUpload = async (f: File) => {
    setUploading(true); setErr(null)
    try {
      const form = new FormData()
      form.append('file', f, f.name)
      const r = await fetch(`/api/nas/upload?server=${encodeURIComponent(server)}&path=${encodeURIComponent(path)}`, {
        method: 'POST', body: form, credentials: 'include',
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Upload failed')
      await load(server, path)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const crumbs = path.split('/').filter(Boolean)

  if (servers === null) return <div className="text-sm text-text-secondary p-4">Loading…</div>
  if (servers.length === 0)
    return <div className="text-sm text-text-secondary p-4">NAS is not available for this workspace.</div>

  return (
    <div className="space-y-3">
      {/* Server tabs + search + upload */}
      <div className="flex flex-wrap items-center gap-2">
        {servers.map((s) => (
          <button
            key={s}
            onClick={() => { setServer(s); setQ(''); setHits(null) }}
            className={`px-3 py-1 text-sm font-mono rounded border ${
              server === s ? 'border-accent-ink text-text-primary bg-surface-raised' : 'border-border-default text-text-secondary'
            }`}
          >
            🗄️ {s}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }}
            placeholder="Search files…"
            className="px-2 py-1 text-sm border border-border-default rounded bg-transparent text-text-primary w-40"
          />
          <button onClick={() => void runSearch()} className="px-2 py-1 text-sm border border-border-default rounded text-text-secondary">Go</button>
        </div>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading || !!hits}
          className="px-3 py-1 text-sm border border-border-default rounded text-text-primary disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : '⬆ Upload'}
        </button>
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f) }} />
      </div>

      {/* Breadcrumb */}
      {!hits && (
        <div className="flex items-center gap-1 text-sm font-mono text-text-secondary flex-wrap">
          <button onClick={() => void load(server, '/')} className="hover:text-text-primary">{server}</button>
          {crumbs.map((c, i) => {
            const p = '/' + crumbs.slice(0, i + 1).join('/')
            return (
              <span key={p} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => void load(server, p)} className="hover:text-text-primary">{c}</button>
              </span>
            )
          })}
        </div>
      )}

      {err && <div className="text-sm text-red-500">{err}</div>}
      {loading && <div className="text-sm text-text-secondary">Loading…</div>}

      {/* Search results */}
      {hits && (
        <div className="border border-border-default rounded divide-y divide-border-default">
          <div className="px-3 py-2 text-xs font-mono text-text-secondary flex justify-between">
            <span>{hits.length} result{hits.length === 1 ? '' : 's'} for “{q}” on {server}</span>
            <button onClick={() => { setHits(null); void load(server, path) }} className="hover:text-text-primary">✕ clear</button>
          </div>
          {hits.map((h) => (
            <button
              key={h.path}
              onClick={() => (h.isDir ? void load(server, h.path) : openFile(h.path))}
              className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-raised"
              title={h.path}
            >
              <span>{icon(h)}</span>
              <span className="text-text-primary truncate flex-1">{h.name}</span>
              <span className="text-text-secondary text-xs font-mono truncate max-w-[45%]">{h.path}</span>
              {!h.isDir && <span className="text-text-secondary text-xs">{fmtSize(h.size)}</span>}
            </button>
          ))}
          {hits.length === 0 && !loading && <div className="px-3 py-3 text-sm text-text-secondary">No matches.</div>}
        </div>
      )}

      {/* Folder listing */}
      {!hits && !loading && (
        <div className="border border-border-default rounded divide-y divide-border-default">
          {path !== '/' && (
            <button
              onClick={() => void load(server, '/' + crumbs.slice(0, -1).join('/'))}
              className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-raised text-text-secondary"
            >
              <span>↩</span><span>..</span>
            </button>
          )}
          {items.map((e) => (
            <button
              key={e.name}
              onClick={() => (e.isDir ? void load(server, joinPath(path, e.name)) : openFile(joinPath(path, e.name)))}
              className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-raised"
            >
              <span>{icon(e)}</span>
              <span className="text-text-primary truncate flex-1">{e.name}</span>
              {!e.isDir && <span className="text-text-secondary text-xs">{fmtSize(e.size)}</span>}
            </button>
          ))}
          {items.length === 0 && <div className="px-3 py-3 text-sm text-text-secondary">Empty folder.</div>}
        </div>
      )}
    </div>
  )
}
