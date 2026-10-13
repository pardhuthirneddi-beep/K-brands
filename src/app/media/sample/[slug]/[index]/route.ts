import { NextResponse } from 'next/server';

/**
 * Sample catalogue artwork.
 *
 * The repository shipped with NO product photography, so storefront imagery is
 * deterministic SVG illustration derived from the product slug. It is labelled
 * as sample art in the alt text, in the admin image list and in
 * docs/brand-assets.md — it must never be presented as a photograph of a
 * stocked garment.
 */
const TONES = ['#1b1a17', '#2a2724', '#767068', '#c6ad8b', '#d9c7ab', '#9d978c', '#3a5a72', '#4d5340'];
const BACKDROPS = ['#efece7', '#f3ede2', '#e7d8c2', '#dedad3'];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

type Drawer = (x: number, y: number, w: number, h: number) => string;

const GARMENTS: Record<string, Drawer> = {
  shirt: (x, y, w, h) =>
    `M${x + w * 0.18} ${y} L${x + w * 0.38} ${y + h * 0.06} L${x + w * 0.5} ${y + h * 0.14} L${x + w * 0.62} ${y + h * 0.06} L${x + w * 0.82} ${y} L${x + w} ${y + h * 0.16} L${x + w * 0.86} ${y + h * 0.24} L${x + w * 0.88} ${y + h} L${x + w * 0.12} ${y + h} L${x + w * 0.14} ${y + h * 0.24} L${x} ${y + h * 0.16} Z`,
  trouser: (x, y, w, h) =>
    `M${x + w * 0.1} ${y} L${x + w * 0.9} ${y} L${x + w * 0.84} ${y + h} L${x + w * 0.56} ${y + h} L${x + w * 0.5} ${y + h * 0.42} L${x + w * 0.44} ${y + h} L${x + w * 0.16} ${y + h} Z`,
  blazer: (x, y, w, h) =>
    `M${x + w * 0.2} ${y} L${x + w * 0.5} ${y + h * 0.22} L${x + w * 0.8} ${y} L${x + w} ${y + h * 0.18} L${x + w * 0.9} ${y + h} L${x + w * 0.55} ${y + h} L${x + w * 0.5} ${y + h * 0.5} L${x + w * 0.45} ${y + h} L${x + w * 0.1} ${y + h} L${x} ${y + h * 0.18} Z`,
  sweater: (x, y, w, h) =>
    `M${x + w * 0.24} ${y} L${x + w * 0.4} ${y + h * 0.09} L${x + w * 0.6} ${y + h * 0.09} L${x + w * 0.76} ${y} L${x + w} ${y + h * 0.2} L${x + w * 0.85} ${y + h * 0.3} L${x + w * 0.87} ${y + h} L${x + w * 0.13} ${y + h} L${x + w * 0.15} ${y + h * 0.3} L${x} ${y + h * 0.2} Z`,
  't-shirt': (x, y, w, h) =>
    `M${x + w * 0.28} ${y} Q${x + w * 0.5} ${y + h * 0.18} ${x + w * 0.72} ${y} L${x + w} ${y + h * 0.22} L${x + w * 0.84} ${y + h * 0.34} L${x + w * 0.84} ${y + h} L${x + w * 0.16} ${y + h} L${x + w * 0.16} ${y + h * 0.34} L${x} ${y + h * 0.22} Z`,
  waistcoat: (x, y, w, h) =>
    `M${x + w * 0.22} ${y} L${x + w * 0.5} ${y + h * 0.28} L${x + w * 0.78} ${y} L${x + w * 0.94} ${y + h * 0.2} L${x + w * 0.8} ${y + h} L${x + w * 0.2} ${y + h} L${x + w * 0.06} ${y + h * 0.2} Z`,
  accessory: (x, y, w, h) =>
    `M${x + w * 0.3} ${y} L${x + w * 0.7} ${y} L${x + w * 0.7} ${y + h * 0.86} L${x + w * 0.3} ${y + h * 0.86} Z`,
};

const KEYS = Object.keys(GARMENTS);

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; index: string }> }) {
  const { slug, index } = await ctx.params;
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  const i = Math.min(Math.max(Number.parseInt(index, 10) || 0, 0), 5);
  const seed = hash(`${safeSlug}:${String(i)}`);
  const tone = TONES[seed % TONES.length]!;
  const bg = BACKDROPS[seed % BACKDROPS.length]!;
  const garmentKey = KEYS[seed % KEYS.length]!;
  const draw = GARMENTS[garmentKey] ?? GARMENTS.shirt!;
  // Second and third "angles" shift the silhouette so a gallery looks intentional.
  const box = i === 0 ? [150, 190, 400, 560] : i === 1 ? [205, 150, 300, 640] : [120, 250, 460, 470];
  const path = draw(box[0]!, box[1]!, box[2]!, box[3]!);
  const lines = Array.from(
    { length: 9 },
    (_, k) => `<line x1="0" y1="${String(90 * k + 40)}" x2="700" y2="${String(90 * k + 40)}"/>`,
  ).join('');
  const label = i === 0 ? 'FRONT VIEW' : i === 1 ? 'DETAIL VIEW' : 'ALTERNATE VIEW';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 950" width="700" height="950" role="img" aria-label="Sample artwork (${garmentKey}) for ${safeSlug}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#e5dccc"/></linearGradient></defs>
<rect width="700" height="950" fill="url(#g)"/>
<g fill="none" stroke="#1b1a17" stroke-opacity="0.07" stroke-width="1">${lines}</g>
<g opacity="0.95"><path d="${path}" fill="${tone}"/></g>
<text x="46" y="66" font-family="ui-sans-serif,system-ui,sans-serif" font-size="17" letter-spacing="4.2" fill="#1b1a17" fill-opacity="0.5">K-BRANDS · ${label}</text>
<text x="46" y="902" font-family="ui-sans-serif,system-ui,sans-serif" font-size="18" letter-spacing="3" fill="#1b1a17" fill-opacity="0.4">SAMPLE ARTWORK · NOT PRODUCT PHOTOGRAPHY</text>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
