import type { Config } from 'tailwindcss';

/**
 * K-brands design system.
 *
 * NOTE (audit finding): the repository as delivered contained NO brand assets
 * — no logo file, no photography, no font files, no brand guideline document.
 * The palette below is therefore the *proposed* restrained system from the
 * project brief (deep charcoal, warm ivory, sand, muted stone) and is marked
 * for owner review rather than treated as approved brand identity.
 * See docs/brand-assets.md.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.25rem', lg: '2rem' },
      screens: { sm: '640px', md: '768px', lg: '1200px', xl: '1360px', '2xl': '1360px' },
    },
    extend: {
      colors: {
        // Approved brand palette (owner-supplied). Named by role rather than hue so a
        // future re-skin touches this block only, never 139 component files.
        ink: {
          DEFAULT: '#191919', // primary text
          50: '#F5F4F2',
          100: '#E7E5E1',
          200: '#CFCBC4',
          300: '#B0ABA2',
          400: '#8E8B86',
          500: '#737373', // secondary text
          600: '#4D4D4D',
          700: '#2E2E2D',
          800: '#191919',
          900: '#121212',
          950: '#0B0B0B',
        },
        ivory: {
          // warm off-white canvas + white surfaces
          DEFAULT: '#F8F6F2',
          50: '#FDFCFA',
          100: '#FFFFFF',
          200: '#F8F6F2',
          300: '#EFECE6',
        },
        stone: {
          // muted stone + hairline borders
          50: '#FBFAF8',
          100: '#EDE9E2',
          200: '#E4E0D9',
          300: '#D5D0C6',
          400: '#ABA69C',
          500: '#7A746A',
        },
        // The single accent: a muted olive-taupe drawn from undyed cotton. Used for the
        // sample/demo markers and the one dark editorial band — never for decoration.
        sand: {
          DEFAULT: '#97947F',
          100: '#F0F0E9',
          200: '#E4E4D8',
          300: '#CFCDBE',
          400: '#B4B2A0',
          500: '#97947F',
          600: '#7C7963',
        },
        line: '#E4E0D9',
        canvas: '#F8F6F2',
        alert: { ok: '#3F6A52', warn: '#9A7226', error: '#8F3B32', info: '#3A5A72' },
      },
      fontFamily: {
        // Fraunces (display serif) + Inter (UI sans), both OFL and self-hosted from
        // node_modules via @fontsource-variable. Fallbacks are real, installed faces so
        // the layout still holds if the bundle is served without its font files.
        display: ['Fraunces Variable', 'Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
        sans: ['Inter Variable', "-apple-system", 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Rebalanced scale: the previous build leaned on 9.5–11px metadata, which reads as
        // cramped rather than refined. Smallest UI text is now 11.5px, body 15px.
        xs: ['0.75rem', { lineHeight: '1.15rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.2rem' }],
        base: ['0.9375rem', { lineHeight: '1.6' }],
      },
      letterSpacing: {
        hero: '-0.022em',
        tightest: '-0.03em',
        wide: '0.06em',
        label: '0.08em',
      },
      borderRadius: { none: '0', xs: '2px', sm: '3px', DEFAULT: '4px', lg: '6px', full: '9999px' },
      // Elevation is intentionally almost invisible: on a paper-toned canvas, cards are
      // separated by hairlines and whitespace, not by shadows.
      boxShadow: {
        card: '0 1px 1px rgba(25,25,25,0.03)',
        lift: '0 1px 2px rgba(25,25,25,0.04), 0 16px 40px -28px rgba(25,25,25,0.22)',
        inset: 'inset 0 0 0 1px rgba(25,25,25,0.08)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translate3d(0, 10px, 0)' },
          to: { opacity: '1', transform: 'translate3d(0,0,0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': {
          from: { transform: 'translate3d(100%,0,0)' },
          to: { transform: 'translate3d(0,0,0)' },
        },
        shimmer: {
          '100%': { transform: 'translate3d(100%,0,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 620ms cubic-bezier(0.22,0.61,0.36,1) both',
        'fade-in': 'fade-in 420ms ease-out both',
        'slide-in-right': 'slide-in-right 340ms cubic-bezier(0.22,0.61,0.36,1) both',
      },
      // The project writes translucent surfaces at fine-grained steps (8%, 12%, 35%).
      // Tailwind v3 only emits opacity modifiers present in this scale, so the extra
      // steps are declared here rather than left to silently no-op in the CSS.
      opacity: { 8: '0.08', 12: '0.12', 15: '0.15', 35: '0.35', 85: '0.85' },
      zIndex: { drawer: '70', toast: '90', overlay: '60' },
    },
  },
  plugins: [],
};
export default config;
