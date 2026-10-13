import type { NextConfig } from 'next';

/**
 * K-brands Next.js configuration.
 *
 * Security headers are defined here (not only in middleware) so that they apply
 * to every response, including static assets and error pages.
 *
 * CSP: see the note in the CSP block below for the one allowance this Next
 * version forces us to make, and docs/security.md. `KBRANDS_DISABLE_CSP=1`
 * disables it for local debugging only.
 */
const isProd = process.env.NODE_ENV === 'production';
const cspDisabled = process.env.KBRANDS_DISABLE_CSP === '1';

/**
 * CSP reality check for Next.js 15.5: the framework ships no nonce/`csp`
 * configuration in this version (verified against
 * next/dist/server/config-schema.js), and the App Router bootstrap relies on
 * inline `<script>` payloads, so `script-src 'nonce-…'` cannot be enforced
 * without breaking hydration. We therefore ship a CSP that removes every other
 * script source class (no eval, no remote origins, no object/embed, locked
 * base/form/frame) and record the inline-script allowance as an accepted,
 * documented residual risk in docs/security.md.
 */
const csp = [
  "default-src 'self'",
  isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  isProd ? 'upgrade-insecure-requests' : '',
]
  .filter(Boolean)
  .join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), fullscreen=(self)',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ...(isProd
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The data layer uses node:sqlite (a Node builtin) — nothing external to trace.
  serverExternalPackages: [],
  experimental: {
    inlineCss: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536],
    imageSizes: [160, 240, 320, 480, 640],
    minimumCacheTTL: 3600,
    localPatterns: [{ pathname: '/media/**', search: '' }],
  },
  async headers() {
    const headers = [...securityHeaders];
    if (!cspDisabled) {
      headers.push({ key: 'Content-Security-Policy', value: csp });
    }
    return [
      { source: '/:path*', headers },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/account/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
