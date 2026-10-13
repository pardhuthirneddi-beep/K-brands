import type { Metadata, Viewport } from 'next';
// Self-hosted, OFL-licensed variable fonts. Before this the site declared
// 'Inter Variable'/'Fraunces Variable' by name with no @font-face behind them, so every
// visitor was actually getting Arial or Didot depending on their OS — the single biggest
// reason the interface read as generic. They are bundled, not fetched from a third-party
// CDN: no external request, no layout-blocking fetch, works offline in the preview.
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './globals.css';
import { AppProviders } from '@/components/providers.tsx';
import { SiteHeader } from '@/components/site/header.tsx';
import { SiteFooter } from '@/components/site/footer.tsx';
import { readUser } from '@/lib/session.ts';
import { readCartKey } from '@/lib/session.ts';
import { countItems } from '@/domain/cart.ts';
import { runtimeBanner } from '@/lib/banner.ts';
import { CartDrawer } from '@/components/cart/cart-drawer.tsx';
import { ensureDb } from '@/lib/bootstrap.ts';

ensureDb();

export const metadata: Metadata = {
  metadataBase: new URL(process.env.KBRANDS_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'K-brands — Considered Menswear',
    template: '%s — K-brands',
  },
  description:
    'K-brands is a premium contemporary menswear label for young professionals. Sample catalogue currently in development.',
  openGraph: {
    type: 'website',
    siteName: 'K-brands',
    title: 'K-brands — Considered Menswear',
    description: 'Premium contemporary menswear for the working week.',
  },
  robots: { index: true, follow: true },
  icons: [{ url: '/icon.svg', type: 'image/svg+xml' }],
};

export const viewport: Viewport = {
  themeColor: '#F8F6F2',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await readUser();
  const cartKey = await readCartKey(user);
  const cartCount = countItems(cartKey);
  const banner = runtimeBanner();
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-toast focus:rounded-xs focus:bg-ink focus:px-4 focus:py-2.5 focus:text-[13px] focus:text-ivory-100"
        >
          Skip to content
        </a>
        <AppProviders initialCartCount={cartCount} cartKey={cartKey} csrf={user?.csrfToken ?? null}>
          {banner ? (
            <div
              role="status"
              className="border-b border-line bg-stone-100 px-4 py-2 text-center text-[12.5px] leading-snug text-ink-600"
            >
              {banner}
            </div>
          ) : null}
          <SiteHeader cartCount={cartCount} user={user ? { name: user.fullName, role: user.role } : null} />
          {/* tabIndex makes the skip-link target focusable, so the keyboard caret actually
              lands here instead of staying at the top of the document. */}
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <SiteFooter />
          <CartDrawer />
        </AppProviders>
      </body>
    </html>
  );
}
