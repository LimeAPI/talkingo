import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        border: 'oklch(var(--border) / <alpha-value>)',
        input: 'oklch(var(--input) / <alpha-value>)',
        ring: 'oklch(var(--ring) / <alpha-value>)',
        background: 'oklch(var(--background) / <alpha-value>)',
        foreground: 'oklch(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground) / <alpha-value>)',
          glow: 'oklch(var(--primary-glow) / <alpha-value>)',
          subtle: 'oklch(var(--primary-subtle) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)',
          glow: 'oklch(var(--secondary-glow) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground) / <alpha-value>)',
          glow: 'oklch(var(--accent-glow) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'oklch(var(--card) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground) / <alpha-value>)',
          elevated: 'oklch(var(--card-elevated) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
          foreground: 'oklch(var(--popover-foreground) / <alpha-value>)',
        },
        correction: {
          DEFAULT: 'oklch(var(--correction) / <alpha-value>)',
          soft: 'oklch(var(--correction-soft) / <alpha-value>)',
          bg: 'oklch(var(--correction-bg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'oklch(var(--success) / <alpha-value>)',
          foreground: 'oklch(var(--success-foreground) / <alpha-value>)',
        },
        warning: { DEFAULT: 'oklch(var(--warning) / <alpha-value>)' },
        error: { DEFAULT: 'oklch(var(--error) / <alpha-value>)' },
        info: { DEFAULT: 'oklch(var(--info) / <alpha-value>)' },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        lg: 'var(--radius)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-xl)',
        '3xl': 'var(--radius-2xl)',
        '4xl': 'var(--radius-3xl)',
        full: 'var(--radius-full)',
      },
      backgroundImage: {},
      boxShadow: {
        'sm':         'var(--shadow-sm)',
        'md':         'var(--shadow-md)',
        'lg':         'var(--shadow-lg)',
        'xl':         'var(--shadow-xl)',
        '2xl':        'var(--shadow-2xl)',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.7' },
        },
        'pulse-subtle': {
          '0%, 100%': { boxShadow: '0 0 0 0 oklch(var(--secondary) / 0.4)' },
          '50%':       { boxShadow: '0 0 0 6px oklch(var(--secondary) / 0)' },
        },
        wave: {
          '0%':   { transform: 'translateY(0)' },
          '50%':  { transform: 'translateY(-8px)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        'slide-down': {
          '0%':   { transform: 'translateY(-12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        'slide-right': {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        'scale-in': {
          '0%':   { transform: 'scale(0.94)', opacity: '0' },
          '100%': { transform: 'scale(1)',     opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(-10px)' },
        },
        'avatar-breathe': {
          '0%, 100%': { transform: 'scale(1)',    filter: 'brightness(1) saturate(1)' },
          '50%':       { transform: 'scale(1.04)', filter: 'brightness(1.08) saturate(1.1)' },
        },
        'ring-expand': {
          '0%':   { transform: 'scale(1)',   opacity: '1' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'aurora-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':       { backgroundPosition: '100% 50%' },
        },
        'shimmer-slide': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'orb-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%':       { transform: 'translate(40px, -40px) scale(1.08)' },
          '50%':       { transform: 'translate(-30px, 30px) scale(0.92)' },
          '75%':       { transform: 'translate(30px, 40px) scale(1.05)' },
        },
        'orbital-spin': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        'star-twinkle': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '50%':       { opacity: '1',   transform: 'scale(1.2)' },
        },
        'nebula-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%':       { opacity: '0.7' },
        },
        'constellation-draw': {
          from: { strokeDashoffset: '1000' },
          to:   { strokeDashoffset: '0' },
        },
      },
      animation: {
        'pulse-slow':   'pulse-slow 3s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave':         'wave 1.5s ease-in-out infinite',
        'fade-in':      'fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in-up':   'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':     'slide-up 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-down':   'slide-down 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-right':  'slide-right 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in':     'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ping-slow':    'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
        'float':        'float 6s ease-in-out infinite',
        'avatar-breathe': 'avatar-breathe 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ring-expand':  'ring-expand 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'aurora-shift': 'aurora-shift 18s ease-in-out infinite',
        'shimmer-slide':'shimmer-slide 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'orbital-spin': 'orbital-spin 12s linear infinite',
        'star-twinkle': 'star-twinkle 2.4s ease-in-out infinite',
        'nebula-pulse': 'nebula-pulse 8s ease-in-out infinite',
        'constellation-draw': 'constellation-draw 2s ease-out forwards',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
