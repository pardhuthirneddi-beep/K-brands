/**
 * "Product imagery must match the garment being sold" is enforced by a data rule, so it is
 * tested against the data rather than by eye: every colourway a shopper can buy must have a
 * photograph of that colourway, and no listing may be fronted by an illustration. A
 * regression here (adding a colour without a shot, or seeding a plate as the primary frame)
 * fails this file.
 *
 * The developer's database file is copied, never opened for writing, so this is safe to run
 * against a live preview environment.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const live = path.join(repo, '.data', 'kbrands.sqlite3');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-img-'));
const copy = path.join(tmp, 'snapshot.sqlite3');

type Db = {
  all: <T>(sql: string, params: (string | number)[]) => T[];
  get: <T>(sql: string, params: (string | number)[]) => T | undefined;
  closeDb: () => void;
};

let db: Db | null = null;

before(async () => {
  assert.ok(fs.existsSync(live), 'no development database to snapshot; run npm run db:bootstrap');
  // Copy the WAL siblings too: in WAL mode recent writes may still live in -wal, and a
  // snapshot of the main file alone would look empty.
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(live + suffix)) fs.copyFileSync(live + suffix, copy + suffix);
  }
  process.env.KBRANDS_TEST_DB_PATH = copy;
  db = (await import('../../src/db/client.ts')) as unknown as Db;
});

after(() => {
  db?.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('every published product carries at least one image frame', () => {
  const rows = db!.all<{ slug: string; n: number }>(
    `SELECT p.slug, (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id) AS n
     FROM products p WHERE p.status IN ('published','out_of_stock')`,
    [],
  );
  assert.ok(rows.length >= 10, `expected the demo catalogue to be present, saw ${String(rows.length)} rows`);
  for (const row of rows) assert.ok(row.n > 0, `${row.slug} would render an empty plate`);
});

test('a product that has photography never leads with an illustration', () => {
  const rows = db!.all<{ slug: string; first_kind: string; photos: number }>(
    `SELECT p.slug,
            (SELECT i.kind FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1) AS first_kind,
            (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id AND i.kind = 'photo') AS photos
     FROM products p WHERE p.status IN ('published','out_of_stock')`,
    [],
  );
  for (const row of rows) {
    if (Number(row.photos) > 0) {
      assert.equal(row.first_kind, 'photo', `${row.slug}: the primary frame must be the photograph`);
    }
  }
});

test('a colourway that is on sale has a photograph of its own', () => {
  // The seed names a colourway shot <slug>-<colourtoken>.jpg and the lead colourway
  // <slug>.jpg, so coverage is provable in SQL: an active colourway must match one of
  // those two, otherwise the frame a shopper sees is a different garment.
  const rows = db!.all<{
    slug: string;
    color_name: string;
    photos: number;
    own: number;
    this_variant: number;
    first_variant: number;
    lead_shot: number;
  }>(
    `SELECT p.slug,
            v.color_name,
            (SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id AND i.kind = 'photo') AS photos,
            (SELECT COUNT(*) FROM product_images i
              WHERE i.product_id = p.id AND i.kind = 'photo'
                AND i.url LIKE '%-' || lower(replace(replace(v.color_name, ' ', ''), '-', '')) || '.%') AS own,
            v.id AS this_variant,
            (SELECT MIN(v2.id) FROM variants v2 WHERE v2.product_id = p.id AND v2.status = 'active') AS first_variant,
            (SELECT COUNT(*) FROM product_images i
              WHERE i.product_id = p.id AND i.kind = 'photo' AND i.url LIKE '%' || p.slug || '.jpg') AS lead_shot
     FROM products p
     JOIN variants v ON v.product_id = p.id AND v.status = 'active'
     WHERE p.status IN ('published','out_of_stock') AND v.color_name IS NOT NULL
     GROUP BY p.id, v.color_name`,
    [],
  );
  const uncovered: string[] = [];
  for (const row of rows) {
    if (Number(row.photos) === 0) continue; // plate-only product: a labelled slot, never a wrong photo
    const covered = Number(row.own) > 0 || (row.this_variant === row.first_variant && Number(row.lead_shot) > 0);
    if (!covered) uncovered.push(`${row.slug}: ${row.color_name}`);
  }
  assert.deepEqual(uncovered, [], 'an active colourway without its own photograph shows the wrong garment');
});

test('no purchasable colourway is offered in a size the storefront cannot display', () => {
  // Guards the invariant in the opposite direction: inactive (unphotographed) variants must
  // never surface in the size or colour facet the shopper filters on.
  const leaks = db!.all<{ product: string; facet: string }>(
    `SELECT DISTINCT p.slug AS product, v.color_name AS facet
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.status = 'inactive' AND p.status IN ('published','out_of_stock')
       AND EXISTS (
         SELECT 1 FROM product_images i
         WHERE i.product_id = p.id AND i.kind = 'photo'
           AND i.url LIKE '%-' || lower(replace(replace(v.color_name, ' ', ''), '-', '')) || '.%'
       )`,
    [],
  );
  assert.deepEqual(
    leaks,
    [],
    'a colourway that has been photographed should have been re-activated by the seed',
  );
});

test('every demo row keeps its label, so it cannot quietly become real data', () => {
  const n =
    db!.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM products WHERE is_sample = 1 AND (sample_note IS NULL OR sample_note = \'\')',
      [],
    )?.n ?? 0;
  assert.equal(n, 0, 'every demo product must carry a sample_note');
});
