import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.ts',
    './store/**/*.ts',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens. Values are CSS vars in channel format
        // (`R G B`) so Tailwind opacity modifiers (e.g. bg-accent/10) work.
        // Light + dark palettes are defined in app/globals.css (:root / .dark).
        background: {
          primary: 'rgb(var(--c-bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--c-bg-tertiary) / <alpha-value>)',
        },
        surface: {
          base: 'rgb(var(--c-surface-base) / <alpha-value>)',
          raised: 'rgb(var(--c-surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--c-surface-sunken) / <alpha-value>)',
          highlight: 'rgb(var(--c-surface-highlight) / <alpha-value>)',
          mid: 'rgb(var(--c-surface-mid) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--c-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
        },
        border: {
          default: 'var(--c-border-default)',
          subtle: 'var(--c-border-subtle)',
          strong: 'var(--c-border-strong)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
          pressed: 'rgb(var(--c-accent-pressed) / <alpha-value>)',
          // Accent/success used as TEXT: dark lime on light (AA), bright on dark.
          ink: 'rgb(var(--c-accent-ink) / <alpha-value>)',
          spark: 'rgb(var(--c-accent-spark) / <alpha-value>)',
          'spark-muted': 'rgb(var(--c-accent-spark-muted) / <alpha-value>)',
        },
        primary: 'rgb(var(--c-text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
        muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
        status: {
          success: 'rgb(var(--c-status-success) / <alpha-value>)',
          warning: 'rgb(var(--c-status-warning) / <alpha-value>)',
          danger: 'rgb(var(--c-status-danger) / <alpha-value>)',
          offline: 'rgb(var(--c-status-offline) / <alpha-value>)',
        },
        // Chat "sent/mine" message bubble — purple that flips with the theme.
        bubble: {
          mine: 'rgb(var(--c-bubble-mine) / <alpha-value>)',
          'mine-ink': 'rgb(var(--c-bubble-mine-ink) / <alpha-value>)',
        },
        focus: {
          ring: 'rgb(var(--c-accent) / <alpha-value>)',
          muted: 'var(--c-border-default)',
        },
        elevation: {
          soft: 'rgba(0, 0, 0, 0.06)',
          strong: 'rgba(0, 0, 0, 0.12)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        instrument: ['var(--font-instrument)', 'Georgia', 'serif'],
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        playfair: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
      keyframes: {
        fadeRise: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-rise': 'fadeRise 0.8s ease-out forwards',
        'fade-rise-delay': 'fadeRise 0.8s ease-out 0.2s forwards',
        'fade-rise-delay-2': 'fadeRise 0.8s ease-out 0.4s forwards',
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.0', letterSpacing: '-0.01em' }],
        h1: ['2rem', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
        h2: ['1.5rem', { lineHeight: '1.1' }],
        h3: ['1.25rem', { lineHeight: '1.2' }],
        body: ['0.95rem', { lineHeight: '1.6' }],
        'body-sm': ['0.85rem', { lineHeight: '1.5' }],
        meta: ['0.7rem', { lineHeight: '1.4', letterSpacing: '0.16em' }],
      },
      boxShadow: {
        'elevation-1': '0 1px 0 0 rgba(255, 200, 100, 0.03), 0 6px 24px rgba(0, 0, 0, 0.55)',
        'elevation-2': '0 1px 0 0 rgba(255, 200, 100, 0.04), 0 10px 40px rgba(0, 0, 0, 0.7)',
        'forge-glow': '0 0 24px rgba(232, 87, 10, 0.18), 0 0 6px rgba(232, 87, 10, 0.1)',
      },
      borderRadius: {
        card: '14px',
        panel: '20px',
        pill: '999px',
      },
      spacing: {
        'page-gutter': '2.5rem',
        'page-gutter-sm': '1.5rem',
        topbar: '60px',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
