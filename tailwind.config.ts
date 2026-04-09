import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.ts',
    './store/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#EAEAE4',
          secondary: '#F2F2ED',
          tertiary: '#EFEFEA',
        },
        surface: {
          base: '#EAEAE4',
          raised: '#FFFFFF',
          sunken: '#E2E2DC',
          highlight: '#F8F8F5',
          mid: '#F4F4F0',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#666666',
          muted: '#AAAAAA',
        },
        border: {
          default: 'rgba(0,0,0,0.08)',
          subtle: 'rgba(0,0,0,0.04)',
          strong: 'rgba(0,0,0,0.14)',
        },
        accent: {
          DEFAULT: '#85D933',
          hover: '#9DED47',
          pressed: '#6EBF20',
          spark: '#FF6B4A',
          'spark-muted': '#E55A38',
        },
        primary: '#1A1A1A',
        secondary: '#666666',
        muted: '#AAAAAA',
        status: {
          success: '#85D933',
          warning: '#FF8A00',
          danger: '#FF4D4D',
          offline: '#CCCCCC',
        },
        focus: {
          ring: '#85D933',
          muted: 'rgba(0,0,0,0.08)',
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
  plugins: [],
}

export default config
