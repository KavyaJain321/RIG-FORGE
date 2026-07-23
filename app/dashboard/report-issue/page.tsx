'use client'

import { useEffect, useRef, useState } from 'react'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export default function ReportIssuePage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Capture where the reporter came from — helps reproduce the issue.
  useEffect(() => {
    setPageUrl(document.referrer || '')
  }, [])

  useEffect(() => {
    if (!image) { setPreview(null); return }
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  function pickImage(f: File | null) {
    setError('')
    if (!f) { setImage(null); return }
    if (!f.type.startsWith('image/')) { setError('Attachment must be an image'); return }
    if (f.size > MAX_IMAGE_BYTES) { setError('Image must be under 5MB'); return }
    setImage(f)
  }

  async function handleSubmit() {
    if (loading) return
    setError('')
    if (title.trim().length < 5) { setError('Title must be at least 5 characters'); return }
    if (description.trim().length < 15) { setError('Please describe the issue in a bit more detail (min 15 characters)'); return }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('description', description.trim())
      if (pageUrl) fd.append('pageUrl', pageUrl)
      if (image) fd.append('image', image)

      const res = await fetch('/api/issues', { method: 'POST', credentials: 'include', body: fd })
      const json = (await res.json()) as { error: string | null }
      if (!res.ok) { setError(json.error ?? 'Failed to submit. Please try again.'); return }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setTitle(''); setDescription(''); setImage(null); setError(''); setDone(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-10">
        <div className="bg-surface-raised border border-border-default rounded-card p-8 text-center">
          <h1 className="font-mono text-sm tracking-widest uppercase text-text-primary mb-3">Issue Reported</h1>
          <p className="font-mono text-xs text-text-muted leading-relaxed">
            Thanks. Your report has been sent to the team. We will look into it and follow up if we need more detail.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 h-10 px-6 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 transition-opacity"
          >
            Report Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-mono text-sm tracking-widest uppercase text-text-primary mb-1">Report an Issue</h1>
      <p className="font-mono text-xs text-text-muted mb-6 leading-relaxed">
        Found something not working, confusing, or missing? Tell us in detail and attach a screenshot if you can. It goes straight to the team.
      </p>

      <div className="bg-surface-raised border border-border-default rounded-card p-6 flex flex-col gap-4">
        <div>
          <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-1">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            placeholder="Short summary (e.g. Cannot assign task to a member)"
            className="w-full h-10 bg-background-tertiary border border-border-default rounded-card px-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-1">What happened? *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="What were you trying to do? What did you expect, and what happened instead? Which project/page? The more detail, the faster we can fix it."
            className="w-full bg-background-tertiary border border-border-default rounded-card px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div>
          <label className="font-mono text-xs text-text-muted uppercase tracking-widest block mb-1">Screenshot (optional)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
            className="block w-full font-mono text-xs text-text-muted file:mr-3 file:h-9 file:px-3 file:rounded-card file:border file:border-border-default file:bg-background-tertiary file:font-mono file:text-xs file:text-text-secondary hover:file:text-text-primary"
          />
          {preview && (
            <div className="mt-3 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Screenshot preview" className="max-h-48 rounded-card border border-border-default" />
              <button
                type="button"
                onClick={() => pickImage(null)}
                className="mt-2 font-mono text-[11px] text-text-muted hover:text-status-danger transition-colors"
              >
                Remove screenshot
              </button>
            </div>
          )}
        </div>

        {error && <p className="font-mono text-xs text-status-danger">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading}
          className="h-10 bg-accent text-white font-mono text-xs rounded-card hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Submitting...' : 'Submit Issue'}
        </button>
      </div>
    </div>
  )
}
