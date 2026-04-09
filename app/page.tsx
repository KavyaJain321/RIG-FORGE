'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4'

const FADE_DURATION = 0.5

const FEATURES = [
  {
    label: 'Project Tracking',
    desc: 'Find to-end visibility on every initiative.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="20" height="22" rx="2" />
        <line x1="8" y1="8" x2="20" y2="8" />
        <line x1="8" y1="12" x2="20" y2="12" />
        <line x1="8" y1="16" x2="14" y2="16" />
        <polyline points="14,19 16,21 20,17" />
      </svg>
    ),
  },
  {
    label: 'Task Management',
    desc: 'Assign, prioritise, and close work fast.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="20" height="22" rx="2" />
        <polyline points="8,9 10,11 14,7" />
        <line x1="16" y1="9" x2="21" y2="9" />
        <polyline points="8,15 10,17 14,13" />
        <line x1="16" y1="15" x2="21" y2="15" />
        <polyline points="8,21 10,23 14,19" />
        <line x1="16" y1="21" x2="21" y2="21" />
      </svg>
    ),
  },
  {
    label: 'Support Tickets',
    desc: 'Raise, route, and resolve issues in one place.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3C8.477 3 4 7.03 4 12c0 2.16.84 4.13 2.22 5.64L4 24l6.7-2.1A10.54 10.54 0 0014 22c5.523 0 10-4.03 10-9S19.523 3 14 3z" />
        <circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Live Presence',
    desc: 'Know who is working and on what, right now.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="14" cy="10" r="4" />
        <path d="M6 24c0-4.418 3.582-8 8-8s8 3.582 8 8" />
        <circle cx="21" cy="8" r="2" fill="currentColor" stroke="none" />
        <line x1="21" y1="4" x2="21" y2="5" />
        <line x1="21" y1="11" x2="21" y2="12" />
        <line x1="17.5" y1="5.5" x2="18.2" y2="6.2" />
        <line x1="23.8" y1="9.8" x2="24.5" y2="10.5" />
      </svg>
    ),
  },
  {
    label: 'Team Onboarding',
    desc: 'Invite, approve, and activate members seamlessly.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="3.5" />
        <path d="M3 23c0-3.866 3.134-7 7-7s7 3.134 7 7" />
        <line x1="20" y1="7" x2="20" y2="13" />
        <line x1="17" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    label: 'Daily Reports',
    desc: 'Auto-generated logs keep leadership informed.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="22" height="22" rx="2" />
        <polyline points="7,18 11,13 15,16 21,9" />
        <line x1="7" y1="21" x2="21" y2="21" />
      </svg>
    ),
  },
]

export default function LandingPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef   = useRef<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function tick() {
      if (!video) return
      const { currentTime, duration } = video
      if (!duration) { rafRef.current = requestAnimationFrame(tick); return }

      if (currentTime < FADE_DURATION) {
        video.style.opacity = String(currentTime / FADE_DURATION)
      } else if (currentTime > duration - FADE_DURATION) {
        video.style.opacity = String((duration - currentTime) / FADE_DURATION)
      } else {
        video.style.opacity = '1'
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    function handleEnded() {
      if (!video) return
      video.style.opacity = '0'
      setTimeout(() => {
        if (!video) return
        video.currentTime = 0
        void video.play()
      }, 100)
    }

    video.style.opacity = '0'
    video.addEventListener('ended', handleEnded)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      video.removeEventListener('ended', handleEnded)
    }
  }, [])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-white flex flex-col">

      {/* ── Video background ──────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 z-0"
        style={{ top: '80px' }}
        aria-hidden="true"
      >
        <video
          ref={videoRef}
          src={VIDEO_URL}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ opacity: 0 }}
        />
        {/* Subtle gradient: white fade at top edge, transparent middle, gentle white at bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, white 0%, rgba(255,255,255,0.6) 8%, rgba(255,255,255,0) 25%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.85) 100%)',
          }}
        />
      </div>

      {/* ── Top-left brand name ───────────────────────────────────────────── */}
      <header className="relative z-10 px-10 pt-7 pb-2">
        <span
          className="font-instrument font-black tracking-tight select-none"
          style={{ fontSize: '2rem', color: '#000000', letterSpacing: '-0.03em' }}
        >
          RIG FORGE
        </span>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center px-6 text-center" style={{ marginTop: '4vh' }}>

        {/* Eyebrow */}
        <p
          className="font-inter text-xs uppercase tracking-[0.2em] mb-5 animate-fade-rise"
          style={{ color: '#999999' }}
        >
          Team Operations Platform
        </p>

        {/* Headline */}
        <h1
          className="font-instrument font-normal max-w-4xl animate-fade-rise text-center"
          style={{
            fontSize: 'clamp(2.6rem, 6.5vw, 4.5rem)',
            lineHeight: 1.05,
            letterSpacing: '-2px',
            color: '#000000',
          }}
        >
          Beyond the noise,{' '}
          <em style={{ color: '#6F6F6F', fontStyle: 'italic' }}>your team</em>
          {' '}forges{' '}
          <em style={{ color: '#6F6F6F', fontStyle: 'italic' }}>what&nbsp;matters.</em>
        </h1>

        {/* Sub-headline */}
        <p
          className="font-inter text-base max-w-md mt-5 leading-relaxed text-center animate-fade-rise-delay"
          style={{ color: '#6F6F6F', opacity: 0 }}
        >
          One platform for projects, tasks, tickets, and team presence —
          so nothing slips through.
        </p>

        {/* CTA */}
        <Link
          href="/login"
          className="font-inter font-medium rounded-full px-10 py-3 text-sm mt-7 transition-transform hover:scale-[1.03] active:scale-[0.98] animate-fade-rise-delay-2"
          style={{ backgroundColor: '#000000', color: '#FFFFFF', opacity: 0 }}
        >
          Enter Platform
        </Link>
      </section>

      {/* ── Spacer to push features to bottom ─────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Feature strip ─────────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full px-8 py-6"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.92) 40%, white 100%)',
        }}
      >
        <div className="max-w-5xl mx-auto grid grid-cols-3 md:grid-cols-6 gap-6">
          {FEATURES.map(({ label, desc, icon }) => (
            <div
              key={label}
              className="flex flex-col items-center text-center gap-2"
            >
              <div style={{ color: '#333333' }}>{icon}</div>
              <span
                className="font-inter font-semibold text-xs leading-tight"
                style={{ color: '#111111' }}
              >
                {label}
              </span>
              <span
                className="font-inter text-[10px] leading-snug"
                style={{ color: '#888888' }}
              >
                {desc}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
