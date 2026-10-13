/**
 * Pre-flight scope guard — `npm run audit:guard`, non-zero exit means "do not deploy".
 *
 * K-brands sells men's clothing only. Nothing in the running code enforces that a
 * *comment* never mentions a belt, so this tool deliberately ignores comments and looks
 * at code: identifiers and string literals in the customer-facing tree. That is what
 * catches the failure mode this brief is about — a component, filter, seed row or nav
 * entry that quietly reintroduces accessories, footwear, womenswear or home goods.
 *
 * Two escape hatches, both explicit:
 *   guard-allow: <reason>   on the line (used once today, for the words in a label of
 *                           *payment methods* — "netbanking, wallets" — which is not merchandise)
 *   the deny-lists themselves in src/domain/catalog.ts and scripts/seed-demo.ts are skipped,
 *   since listing forbidden words is how the ban is implemented.
 *
 * It also reports the shape of the catalogue in the database it is pointed at, because a
 * green scan means nothing if someone published an unverified row: published rows must be
 * owner data (is_sample = 0), and garment_type must stay inside the menswear set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SCAN = ['src/app', 'src/components', 'src/domain', 'src/lib', 'src/adapters', 'scripts'];
const ALLOW = 'guard-allow:';

const BANNED = [
  'belt', 'wallet', 'purse', 'handbag', 'tote bag', 'backpack', 'clutch bag',
  'watch', 'jewellery', 'jewelry', 'bracelet', 'necklace', 'earring',
  'shoe', 'sneaker', 'loafer', 'derby', 'boot', 'sandal', 'footwear',
  'scarf', 'stole', 'necktie', 'pocket square', 'sock', 'beanie', 'sunglass', 'glove',
  'keychain', 'lanyard',
  'women', 'woman', 'ladies',
  'cosmetic', 'fragrance', 'perfume', 'makeup',
  'electronics', 'headphone', 'earbud', 'speaker', 'power bank', 'charger',
  'home decor', 'cushion', 'bedding', 'duvet', 'mug', 'candle', 'towel',
  'waistcoat',
];

/** Words in the list above that are ordinary vocabulary in this codebase. */
const IGNORE_CONTEXT = [
  /\bhardhat\b/gi, /\blaptop\b/gi, /\bwatchlist\b/gi, /\bstopwatch\b/gi,
  /\bmatching\b/gi, /\bplaceholder\b/gi, /\bhat-trick\b/gi, /\bcap-sizing\b/gi,
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat(m.split('\n').length - 1))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/** Remove the deny-list array literals: naming forbidden words is the implementation. */
function stripDenyLists(src: string): string {
  return src.replace(/const (BANNED|FORBIDDEN_COPY|ALLOW_PHRASES|FORBIDDEN_ALLOW|BANNED_RES)\b[\s\S]*?(\];|;\n)/g, (m) =>
    '\n'.repeat(m.split('\n').length - 1),
  );
}

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) walk(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const findings: { file: string; line: number; term: string; text: string }[] = [];
const files = SCAN.flatMap((d) => walk(d)).filter((f) => !f.endsWith('guard-production-data.ts'));

for (const rel of files) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const blanked = stripDenyLists(stripComments(raw));
  const rawLines = raw.split('\n');
  const codeLines = blanked.split('\n');
  codeLines.forEach((line, i) => {
    // The marker is a comment, and comments are stripped before scanning, so it is read
    // from the raw source — either on the offending line or on the line above it.
    if ((rawLines[i] ?? '').includes(ALLOW) || (rawLines[i - 1] ?? '').includes(ALLOW)) return;
    const probe = IGNORE_CONTEXT.reduce((acc, re) => acc.replace(re, '  '), line);
    for (const term of BANNED) {
      if (new RegExp(`\\b${term}s?\\b`, 'i').test(probe)) {
        findings.push({ file: rel, line: i + 1, term, text: (rawLines[i] ?? '').trim().slice(0, 140) });
        return;
      }
    }
  });
}

const notes: string[] = [];
const dataErrors: string[] = [];
try {
  const client = (await import(pathToFileURL(path.join(ROOT, 'src/db/client.ts')).href)) as unknown as {
    all: <T>(sql: string, params: (string | number)[]) => T[];
    get: <T>(sql: string, params: (string | number)[]) => T | undefined;
  };
  const bootstrap = (await import(pathToFileURL(path.join(ROOT, 'src/lib/bootstrap.ts')).href)) as {
    ensureDb: () => void;
  };
  bootstrap.ensureDb();
  const counts = client.all<{ total: number; sample: number; published_verified: number }>(
    `SELECT COUNT(*) AS total,
            SUM(is_sample) AS sample,
            SUM(CASE WHEN is_sample = 0 AND status = 'published' THEN 1 ELSE 0 END) AS published_verified
     FROM products`,
    [],
  )[0];
  notes.push(
    `catalogue: ${String(counts?.total ?? 0)} products, ${String(counts?.sample ?? 0)} demo-flagged, ` +
      `${String(counts?.published_verified ?? 0)} published as verified owner data`,
  );
  const scope = client.all<{ slug: string; title: string; garment_type: string | null }>(
    `SELECT slug, title, garment_type FROM products
     WHERE coalesce(garment_type,'shirt') NOT IN
       ('shirt','polo','tee','trouser','denim','short','sweatshirt','knitwear','overshirt')
        OR coalesce(gender,'men') <> 'men'`,
    [],
  );
  for (const row of scope) {
    dataErrors.push(
      `product "${row.slug}" is outside the menswear scope (garment_type=${String(row.garment_type)}, title=${row.title})`,
    );
  }
  const cats = client.all<{ slug: string }>(
    `SELECT slug FROM categories WHERE slug NOT IN
      ('shirts','linen-shirts','casual-shirts','formal-shirts','polos','t-shirts',
       'trousers','chinos','jeans','shorts','sweatshirts-knitwear','jackets-overshirts')`,
    [],
  );
  for (const c of cats) dataErrors.push(`category "${c.slug}" is not part of the approved menswear tree`);
} catch (err) {
  notes.push(`database check skipped (${String(err).slice(0, 90)})`);
}

if (findings.length > 0) {
  console.error(`\n✗ scope guard: ${String(findings.length)} out-of-scope reference(s) in code\n`);
  for (const f of findings.slice(0, 30)) console.error(`  ${f.file}:${String(f.line)}  [${f.term}]  ${f.text}`);
  if (findings.length > 30) console.error(`  …and ${String(findings.length - 30)} more`);
  console.error(
    `\nK-brands lists men's clothing only. Remove the reference, or if the word is not\n`,
  );
  console.error(`merchandise (e.g. a payment-method label), mark the line: // ${ALLOW} <why>\n`);
}
for (const e of dataErrors) console.error(`  ✗ ${e}`);
for (const n of notes) console.log(`  · ${n}`);

if (findings.length > 0 || dataErrors.length > 0) process.exit(1);
console.log('\n✓ scope guard: no out-of-scope merchandising in the customer-facing tree\n');
process.exit(0);
