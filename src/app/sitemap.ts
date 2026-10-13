import type { MetadataRoute } from 'next';
import { ensureDb } from '@/lib/bootstrap.ts';
import { listCategories, listProducts } from '@/domain/catalog.ts';
import { POLICIES } from '@/domain/policies.ts';
import * as env from '@/lib/env.ts';

ensureDb();
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = env.siteUrl;
  // Sample records are excluded on purpose: a fictional product must never be
  // indexed as a real offer.
  const products = listProducts({ perPage: 60, admin: false, includeSamples: false }).items;
  const statics: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/shop`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/about`, lastModified: now, priority: 0.4 },
    { url: `${base}/faq`, lastModified: now, priority: 0.4 },
    { url: `${base}/contact`, lastModified: now, priority: 0.4 },
    { url: `${base}/size-guide`, lastModified: now, priority: 0.5 },
  ];
  const collections: MetadataRoute.Sitemap = listCategories({ includeSamples: false }).map((c) => ({
    url: `${base}/collections/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
  const items: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
  const policies: MetadataRoute.Sitemap = Object.keys(POLICIES).map((k) => ({
    url: `${base}/policies/${k}`,
    lastModified: now,
    priority: 0.3,
  }));
  return [...statics, ...collections, ...items, ...policies];
}
