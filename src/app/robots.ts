import type { MetadataRoute } from 'next';
import * as env from '@/lib/env.ts';

export default function robots(): MetadataRoute.Robots {
  // A pre-launch store must not be indexed at all — a real catalogue could
  // otherwise be crawled while prices and policies are still placeholders.
  if (!env.liveCommerceEnabled) {
    return { rules: [{ userAgent: '*', disallow: '/' }], sitemap: undefined };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/account', '/cart', '/checkout', '/order/', '/search'],
      },
    ],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
