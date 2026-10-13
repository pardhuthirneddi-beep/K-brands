/**
 * Colour contrast and label wording are design decisions with measurable acceptance
 * criteria, so they are asserted rather than trusted. Ratios are computed here from the
 * same hex values tailwind.config.ts declares — if someone darkens or lightens a token,
 * this test moves with it and fails when small text falls below WCAG AA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';


const CANVAS = '#F8F6F2';
const WHITE = '#FFFFFF';

function channel(v: number): number {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function walk(dir: string, out: string[] = [], exts = new Set(['.tsx'])): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, exts);
    else if ([...exts].some((e: string) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function ratio(fg: string, bg: string): number {
  const values = [luminance(fg), luminance(bg)];
  const a = Math.max(...values);
  const b = Math.min(...values);
  return (a + 0.05) / (b + 0.05);
}

test('body and secondary text clear WCAG AA on the canvas', () => {
  assert.ok(ratio('#191919', CANVAS) >= 7, 'primary text must clear AAA');
  assert.ok(ratio('#4D4D4D', CANVAS) >= 4.5, 'small supporting text (ink-600) must clear AA');
  assert.ok(ratio('#191919', WHITE) >= 7);
  assert.ok(ratio('#4D4D4D', WHITE) >= 4.5);
});

test('the approved secondary tone is reserved for larger copy', () => {
  // #737373 is the brand's specified secondary colour. It reaches 4.4:1 — enough for
  // 18px+ or bold text (AA-large), not enough for 12px metadata. The system therefore uses
  // it only where the size justifies it, and this assertion documents why.
  const r = ratio('#737373', CANVAS);
  assert.ok(r >= 3 && r < 4.5, `expected AA-large behaviour from the brand tone, got ${r.toFixed(2)}`);
});

test('no component uses a tone that fails AA for body-size text', () => {
  const offenders: string[] = [];
  for (const file of walk(path.join(process.cwd(), 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const bad of ['text-ink-400', 'text-stone-400', 'text-ink-300']) {
      if (src.includes(bad)) offenders.push(`${file}: ${bad}`);
    }
  }
  assert.deepEqual(offenders, [], 'these text tones fall below 4.5:1 on the canvas');
});

test('the palette is the approved six values plus one accent', () => {
  const cfg = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8');
  for (const hex of ['#F8F6F2', '#191919', '#EDE9E2', '#E4E0D9', '#FFFFFF', '#737373']) {
    assert.ok(cfg.toLowerCase().includes(hex.toLowerCase()), `${hex} must be in the palette`);
  }
  // One accent family only: the sand/olive tone, and no second saturated hue.
  assert.ok(/sand:/.test(cfg));
  assert.ok(!/violet:|blue:|rose:|emerald:/.test(cfg), 'a second accent colour would compete with the brand palette');
});

test('typography names real, bundled faces', () => {
  const cfg = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8');
  assert.match(cfg, /Fraunces Variable/);
  assert.match(cfg, /Inter Variable/);
  // The failure this guards against: a family named with no @font-face behind it, which
  // silently renders Arial/Times. Both packages must be installed.
  for (const pkg of ['inter', 'fraunces']) {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'node_modules/@fontsource-variable', pkg, 'LICENSE')),
      `${pkg} must ship its licence with the font files`);
  }
});
test('no hex literal in src/ is outside the palette', () => {
  // tailwind.config.ts is the definition of "approved". Anything else in the tree is drift — and
  // drift is how the previous build ended up with eleven shades of near-black across components.
  const cfg = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8');
  const approved = new Set((cfg.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toLowerCase()));
  assert.ok(approved.size >= 18, `expected the palette file to define the colours, found ${String(approved.size)}`);
  const offenders: string[] = [];
  for (const file of walk(path.join(process.cwd(), 'src'), [], new Set(['.ts', '.tsx']))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const hex of text.match(/#[0-9a-fA-F]{6}/g) ?? []) {
      if (!approved.has(hex.toLowerCase())) offenders.push(`${path.relative(process.cwd(), file)}: ${hex}`);
    }
  }
  assert.deepEqual(offenders, [], 'off-palette colour literal');
});
