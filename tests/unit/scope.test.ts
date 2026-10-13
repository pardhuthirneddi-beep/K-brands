/**
 * The men's-only rule is a product requirement, not a style preference, so it is tested
 * as a unit — `npm run test:unit`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogueScopeIssue, CATALOGUE_CATEGORIES, CATALOGUE_GARMENTS, outOfScopeTerm } from '../../src/domain/catalog.ts';
import { discountPercent, formatMoney } from '../../src/domain/money.ts';

test('every approved garment type is accepted', () => {
  for (const garment of CATALOGUE_GARMENTS) {
    assert.equal(
      catalogueScopeIssue({ garment_type: garment, category_slug: 'shirts', title: 'A shirt', tags: [] }),
      null,
      `${garment} should be in scope`,
    );
  }
});

test('accessory and womenswear saves are refused with an actionable reason', () => {
  const belt = catalogueScopeIssue({ garment_type: 'accessory', title: 'Leather belt', tags: [] });
  assert.match(String(belt), /outside the catalogue/);

  const women = catalogueScopeIssue({ garment_type: 'shirt', title: 'Linen shirt for women', tags: [] });
  assert.match(String(women), /women/);

  const watch = catalogueScopeIssue({ garment_type: 'shirt', title: 'Shirt', tags: ['free-watch-offer'] });
  assert.match(String(watch), /cross-sold/);

  const category = catalogueScopeIssue({ garment_type: 'shirt', category_slug: 'footwear', title: 'Shirt', tags: [] });
  assert.match(String(category), /not part of the approved menswear category tree/);
});

test('the category allowlist matches the seeded tree', () => {
  assert.deepEqual(
    [...CATALOGUE_CATEGORIES].sort(),
    [
      'casual-shirts', 'chinos', 'formal-shirts', 'jeans', 'jackets-overshirts', 'linen-shirts',
      'polos', 'shorts', 'shirts', 'sweatshirts-knitwear', 't-shirts', 'trousers',
    ].sort(),
  );
});

test('textile vocabulary is not mistaken for merchandise', () => {
  assert.equal(outOfScopeTerm('Ring-spun cotton oxford with a soft collar roll'), null);
  assert.equal(outOfScopeTerm('A shirt that breathes in humidity — that is the point'), null);
});

test('money is formatted in rupees from integer paise', () => {
  assert.equal(formatMoney(340000), '₹3,400');
  assert.equal(discountPercent(280000, 320000), 13);
  assert.equal(discountPercent(280000, 280000), null);
});
