/**
 * Runs against a throwaway SQLite file (KBRANDS_TEST_DB_PATH), never the developer's
 * .data database. `npm run test:integration`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
// A throwaway file, so `npm run test:integration` can never touch .data/kbrands.sqlite3.
// (NODE_ENV is deliberately not reassigned: it is read-only under Next's types, and the
//  production-only guards this suite exercises do not depend on it.)
process.env.KBRANDS_TEST_DB_PATH = path.join(tmp, 'test.sqlite3');

const client = await import('../../src/db/client.ts');
const { runMigrations } = await import('../../src/db/migrate.ts');
const catalog = await import('../../src/domain/catalog.ts');

before(() => {
  runMigrations();
  client.run(
    `INSERT INTO categories (slug, name, sort_order, created_at, updated_at) VALUES ('shirts','Shirts',1,?,?)`,
    [new Date().toISOString(), new Date().toISOString()],
  );
  client.run(
    `INSERT INTO categories (slug, name, parent_id, sort_order, created_at, updated_at)
     SELECT 'linen-shirts','Linen Shirts',id,2,?,? FROM categories WHERE slug='shirts'`,
    [new Date().toISOString(), new Date().toISOString()],
  );
});

after(() => {
  client.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('creating a product through the domain works and is flagged as demo data', () => {
  const res = catalog.upsertProduct({
    slug: 'test-tee',
    title: 'Test Tee',
    price_cents: 120000,
    garment_type: 'tee',
    category_slug: 't-shirts',
    status: 'draft',
    tags: ['demo'],
    images: [{ url: '/media/sample/test-tee/0.svg', alt: 'demo', kind: 'generated' }],
  });
  assert.ok(res.id > 0);
  const row = client.get<{ is_sample: number; gender: string }>('SELECT is_sample, gender FROM products WHERE id = ?', [
    res.id,
  ]);
  assert.equal(row?.is_sample, 1, 'an unverified create must default to demo data');
  assert.equal(row?.gender, 'men');
});

test('the scope guard rejects out-of-scope merchandise at the database boundary', () => {
  assert.throws(
    () =>
      catalog.upsertProduct({
        slug: 'test-belt',
        title: 'Leather Belt',
        price_cents: 150000,
        garment_type: 'accessory',
        status: 'draft',
      }),
    /outside the catalogue/,
  );
  assert.equal(client.get('SELECT id FROM products WHERE slug = ?', ['test-belt']), undefined);
});

test('a parent category counts the products in its subtree', () => {
  catalog.upsertProduct({ slug: 'linen-a', title: 'Linen A', price_cents: 300000, garment_type: 'shirt', category_slug: 'linen-shirts', status: 'published' });
  const cats = catalog.listCategories({ includeSamples: true });
  const shirts = cats.find((c: { slug: string }) => c.slug === 'shirts');
  const linen = cats.find((c: { slug: string }) => c.slug === 'linen-shirts');
  assert.equal(linen?.product_count, 1);
  assert.equal(shirts?.product_count, 1, 'the parent must include its subcategory, or the nav drops it');
});
