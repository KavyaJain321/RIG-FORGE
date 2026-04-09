'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MOBILE_ITEMS = [
  { href: '/dashboard',          label: 'DASH',    symbol: '◆' },
  { href: '/dashboard/people',   label: 'PEOPLE',  symbol: '○' },
  { href: '/dashboard/projects', label: 'PROJ',    symbol: '□' },
  { href: '/dashboard/tickets',  label: 'TICKETS', symbol: '▸' },
  { href: '/dashboard/profile',  label: 'PROFILE', symbol: '■' },
] as const

function isNavActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard') return pathname === '/dashboard'
  return pathname.startsWith(itemHref)
}

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur border-t border-black/[0.07] flex items-stretch z-40">
      {MOBILE_ITEMS.map(({ href, label, symbol }) => {
        const active = isNavActive(href, pathname)

        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex-1 flex flex-col items-center justify-center gap-0.5',
              'transition-colors',
              active ? 'text-[#85D933]' : 'text-[#AAAAAA] hover:text-[#1A1A1A]',
            ].join(' ')}
          >
            <span className="text-sm leading-none">{symbol}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest leading-none">
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
