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
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        gold: 'hsl(var(--primary))',
        sky: 'hsl(var(--secondary))',
        lavender: 'hsl(var(--accent))',
        mint: 'hsl(var(--success))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow: 'hsl(var(--primary-glow))',
          subtle: 'hsl(var(--primary-subtle))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          glow: 'hsl(var(--secondary-glow))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          glow: 'hsl(var(--accent-glow))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          elevated: 'hsl(var(--card-elevated))',
        },
        correction: {
          DEFAULT: 'hsl(var(--correction))',
          soft: 'hsl(var(--correction-soft))',
          bg: 'hsl(var(--correction-bg))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: { DEFAULT: 'hsl(var(--warning))' },
        error: { DEFAULT: 'hsl(var(--error))' },
        info: { DEFAULT: 'hsl(var(--info))' },
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
      backgroundImage: {
        'mesh':         'var(--gradient-mesh)',
        'aurora':       'var(--gradient-aurora)',
        'sunset':       'var(--gradient-sunset)',
        'primary':      'var(--gradient-primary)',
        'secondary':    'var(--gradient-secondary)',
        'glass':        'var(--gradient-glass)',
        'shimmer':      'var(--gradient-shimmer)',
        'card-border':  'var(--gradient-card-border)',
      },
      boxShadow: {
        'sm':         'var(--shadow-sm)',
        'md':         'var(--shadow-md)',
        'lg':         'var(--shadow-lg)',
        'xl':         'var(--shadow-xl)',
        '2xl':        'var(--shadow-2xl)',
        'glow-primary':   '0 0 32px hsl(var(--primary) / 0.35), 0 0 8px hsl(var(--primary) / 0.25)',
        'glow-secondary': '0 0 32px hsl(var(--secondary) / 0.35), 0 0 8px hsl(var(--secondary) / 0.25)',
        'glow-accent':    '0 0 32px hsl(var(--accent) / 0.35), 0 0 8px hsl(var(--accent) / 0.25)',
        'inset-soft': 'inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.04)',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.7' },
        },
        'pulse-subtle': {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--secondary) / 0.4)' },
          '50%':       { boxShadow: '0 0 0 6px hsl(var(--secondary) / 0)' },
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
