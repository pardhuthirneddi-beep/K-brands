import { NextResponse } from 'next/server';

/**
 * Demo catalogue artwork.
 *
 * The repository shipped with no product photography, so until the owner supplies
 * approved imagery the storefront draws deterministic SVG plates instead of borrowing
 * stock or hotlinked photos. Each plate is a menswear silhouette only (shirt, polo, tee,
 * trouser, denim, short, sweatshirt, knitwear, overshirt), tinted to the exact colourway
 * it stands in for, and watermarked as a demo illustration so it can never be mistaken
 * for a photograph of a stocked garment.
 *
 * Query parameters:
 *   ?garment=<type>  which silhouette to draw (defaults to the slug's product row)
 *   ?c=<hex>         garment fill colour, so a colourway swatch and its plate agree
 *   ?t=<label>       short caption printed on the plate (the colourway name)
 *
 * Banned here on purpose: there is no accessory, footwear, bag, women's or home-goods
 * silhouette in this file, and adding one is out of brand scope.
 */
/* Palette values only — the plate has to sit inside the grid like a photograph would. */
const BACKDROPS = ['#F8F6F2', '#EFECE6', '#EDE9E2'];
const FALLBACK_TONE = '#ABA69C'; // stone-400

type Drawer = (x: number, y: number, w: number, h: number) => string;

const GARMENTS: Record<string, Drawer> = {
  shirt: (x, y, w, h) =>
    `M${x + w * 0.18} ${y} L${x + w * 0.38} ${y + h * 0.06} L${x + w * 0.5} ${y + h * 0.14} L${x + w * 0.62} ${
      y + h * 0.06
    } L${x + w * 0.82} ${y} L${x + w} ${y + h * 0.16} L${x + w * 0.86} ${y + h * 0.24} L${x + w * 0.88} ${y + h} L${
      x + w * 0.12
    } ${y + h} L${x + w * 0.14} ${y + h * 0.24} L${x} ${y + h * 0.16} Z`,
  polo: (x, y, w, h) =>
    `M${x + w * 0.26} ${y + h * 0.02} L${x + w * 0.42} ${y + h * 0.09} L${x + w * 0.58} ${y + h * 0.09} L${
      x + w * 0.74
    } ${y + h * 0.02} L${x + w} ${y + h * 0.2} L${x + w * 0.86} ${y + h * 0.3} L${x + w * 0.86} ${y + h * 0.96} L${
      x + w * 0.14
    } ${y + h * 0.96} L${x + w * 0.14} ${y + h * 0.3} L${x} ${y + h * 0.2} Z`,
  tee: (x, y, w, h) =>
    `M${x + w * 0.28} ${y} Q${x + w * 0.5} ${y + h * 0.18} ${x + w * 0.72} ${y} L${x + w} ${y + h * 0.22} L${
      x + w * 0.84
    } ${y + h * 0.34} L${x + w * 0.84} ${y + h} L${x + w * 0.16} ${y + h} L${x + w * 0.16} ${y + h * 0.34} L${x} ${
      y + h * 0.22
    } Z`,
  sweatshirt: (x, y, w, h) =>
    `M${x + w * 0.24} ${y} L${x + w * 0.4} ${y + h * 0.09} L${x + w * 0.6} ${y + h * 0.09} L${x + w * 0.76} ${y} L${
      x + w
    } ${y + h * 0.2} L${x + w * 0.85} ${y + h * 0.3} L${x + w * 0.87} ${y + h * 0.94} L${x + w * 0.13} ${y + h * 0.94} L${
      x + w * 0.15
    } ${y + h * 0.3} L${x} ${y + h * 0.2} Z`,
  knitwear: (x, y, w, h) =>
    `M${x + w * 0.22} ${y + h * 0.02} L${x + w * 0.4} ${y + h * 0.1} L${x + w * 0.6} ${y + h * 0.1} L${x + w * 0.78} ${
      y + h * 0.02
    } L${x + w} ${y + h * 0.24} L${x + w * 0.88} ${y + h * 0.34} L${x + w * 0.9} ${y + h * 0.9} L${x + w * 0.1} ${
      y + h * 0.9
    } L${x + w * 0.12} ${y + h * 0.34} L${x} ${y + h * 0.24} Z`,
  overshirt: (x, y, w, h) =>
    `M${x + w * 0.2} ${y} L${x + w * 0.5} ${y + h * 0.2} L${x + w * 0.8} ${y} L${x + w} ${y + h * 0.18} L${
      x + w * 0.9
    } ${y + h} L${x + w * 0.55} ${y + h} L${x + w * 0.5} ${y + h * 0.5} L${x + w * 0.45} ${y + h} L${x + w * 0.1} ${
      y + h
    } L${x} ${y + h * 0.18} Z`,
  trouser: (x, y, w, h) =>
    `M${x + w * 0.1} ${y} L${x + w * 0.9} ${y} L${x + w * 0.84} ${y + h} L${x + w * 0.56} ${y + h} L${x + w * 0.5} ${
      y + h * 0.42
    } L${x + w * 0.44} ${y + h} L${x + w * 0.16} ${y + h} Z`,
  denim: (x, y, w, h) =>
    `M${x + w * 0.12} ${y} L${x + w * 0.88} ${y} L${x + w * 0.88} ${y + h * 0.1} L${x + w * 0.84} ${y + h} L${
      x + w * 0.56
    } ${y + h} L${x + w * 0.5} ${y + h * 0.44} L${x + w * 0.44} ${y + h} L${x + w * 0.16} ${y + h} L${x + w * 0.12} ${
      y + h * 0.1
    } Z`,
  short: (x, y, w, h) =>
    `M${x + w * 0.12} ${y} L${x + w * 0.88} ${y} L${x + w * 0.86} ${y + h * 0.62} L${x + w * 0.54} ${y + h * 0.62} L${
      x + w * 0.5
    } ${y + h * 0.3} L${x + w * 0.46} ${y + h * 0.62} L${x + w * 0.14} ${y + h * 0.62} Z`,
};

/** Garment types the brand sells, and only these. */
const GARMENT_KEYS = Object.keys(GARMENTS);
const VIEW_LABELS = ['FRONT', 'COLLAR & PLACKET', 'FIT & HEM'];

function hex(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.replace('#', '').trim().toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  if (/^[0-9a-f]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  return null;
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Relative luminance, so the plate picks visible detail strokes on light or dark cloth. */
function isDark(hexColor: string): boolean {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string; index: string }> }) {
  const { slug, index } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  const i = Math.min(Math.max(Number.parseInt(index, 10) || 0, 0), 2);

  const requested = (params.get('garment') ?? '').toLowerCase().replace(/[^a-z-]/g, '');
  const seed = hash(`${safeSlug}:${String(i)}`);
  // An unknown garment still resolves to a menswear silhouette, never to a generic box.
  const garmentKey = GARMENT_KEYS.includes(requested) ? requested : GARMENT_KEYS[seed % GARMENT_KEYS.length]!;
  const draw = GARMENTS[garmentKey] ?? GARMENTS.shirt!;

  const tone = hex(params.get('c')) ?? FALLBACK_TONE;
  const dark = isDark(tone);
  const detail = dark ? 'rgba(248,246,242,0.45)' : 'rgba(25,25,25,0.35)';
  const bg = BACKDROPS[seed % BACKDROPS.length]!;
  const box = i === 0 ? [150, 200, 400, 540] : i === 1 ? [215, 170, 270, 600] : [125, 250, 450, 470];
  const path = draw(box[0]!, box[1]!, box[2]!, box[3]!);
  const colourTag = (params.get('t') ?? '').replace(/[<>&"']/g, '').slice(0, 24);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 950" width="700" height="950" role="img" aria-label="Demo illustration, ${garmentKey}${
    colourTag ? ` in ${colourTag}` : ''
  }, for ${safeSlug}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#E4E0D9"/></linearGradient>
  <linearGradient id="cloth" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${tone}"/><stop offset="1" stop-color="${tone}" stop-opacity="0.86"/></linearGradient>
</defs>
<rect width="700" height="950" fill="url(#bg)"/>
<g fill="none" stroke="#191919" stroke-opacity="0.05" stroke-width="1">${Array.from(
  { length: 9 },
  (_, k) => `<line x1="0" y1="${String(90 * k + 45)}" x2="700" y2="${String(90 * k + 45)}"/>`,
).join('')}</g>
<ellipse cx="350" cy="${String(box[1]! + box[3]! + 26)}" rx="${String(box[2]! * 0.42)}" ry="14" fill="#191919" fill-opacity="0.06"/>
<path d="${path}" fill="url(#cloth)" stroke="${detail}" stroke-width="2"/>
<g stroke="${detail}" stroke-width="2" fill="none">
  <line x1="${String(box[0]! + box[2]! * 0.5)}" y1="${String(box[1]! + box[3]! * 0.2)}" x2="${String(
    box[0]! + box[2]! * 0.5,
  )}" y2="${String(box[1]! + box[3]! * 0.96)}"/>
  ${Array.from({ length: 4 }, (_, k) => {
    const yy = box[1]! + box[3]! * (0.26 + k * 0.17);
    return `<circle cx="${String(box[0]! + box[2]! * 0.5)}" cy="${String(yy)}" r="4" fill="${detail}" stroke="none"/>`;
  }).join('')}
</g>
<text x="48" y="70" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" letter-spacing="3.6" fill="#191919" fill-opacity="0.45">K-BRANDS · ${
    VIEW_LABELS[i] ?? 'FRONT'
  }${colourTag ? ` · ${colourTag.toUpperCase()}` : ''}</text>
<text x="48" y="900" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" letter-spacing="3" fill="#191919" fill-opacity="0.38">DEMO ILLUSTRATION · NOT PRODUCT PHOTOGRAPHY</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
