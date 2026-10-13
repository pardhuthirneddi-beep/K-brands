# Product imagery

The rule this repo is built around: **the image a shopper sees must be a photograph of the garment
they are buying.** Illustration is not allowed to front a collection or a product page.

## Where images live

| Path | Role |
| --- | --- |
| `public/media/demo/<slug>.jpg` | The lead photograph for a product. |
| `public/media/demo/<slug>-<colourtoken>.jpg` | A colourway photograph. `<colourtoken>` is the colour name lower-cased with everything that is not a letter or digit removed — `Pale Sage` → `palesage`, `Off-White` → `offwhite`. |
| `public/media/demo/hero-editorial.jpg` | The 4:3 campaign frame used by the homepage story band. |
| `/media/sample/<slug>/<index>.svg?garment=…` | A generated silhouette plate. It is a **fallback slot**, plus the thumbnail used on order lines. It must never be the primary frame of a product that has photography. |

## How the demo catalogue is fed

`scripts/seed-demo.ts` does not contain a list of image URLs. It looks at the filesystem:

```ts
function photoFor(slug, colour, isLead) → /media/demo/<file> if the file exists, otherwise null
```

* A colourway with no matching file is written with `variants.status = 'inactive'`. Its stock is
  still recorded and visible in admin, but `getProductBySlug` and the facet queries filter on
  `status = 'active'`, so **an unphotographed colour cannot be selected or purchased**.
* The seed prints every colourway it held back, so the gap is visible at seed time:
  `pendingColourways` names product + colour for each one.
* Drop the missing photograph in and re-seed: the colourway activates. No component changes.

## What the storefront renders

`src/components/product/product-card.tsx` and the gallery:

* a file ending in `.jpg/.jpeg/.png/.webp` is rendered through `next/image` with `fill` and a
  `sizes` attribute matched to the grid (`50vw` on phones, `33vw` in the tablet grid, `24vw` on
  wide screens), so the browser picks a candidate from the configured `deviceSizes`
  (360–1536) instead of downloading the original;
* an SVG plate is rendered as a plain `<img>`, since there is nothing to resize;
* `alt` text says what is true: *"… — demo photograph of the Ivory garment, not verified product
  photography"*. Photography that has been approved by the owner should be recorded with
  `kind = 'photo'` and given a plain descriptive `alt` instead.

`product_images.kind` is a CHECK constraint: `photo` | `placeholder` | `generated`. Today the
storefront has `photo: 17`, `generated: 3`, `placeholder: 1`; the three `generated` rows belong to
one archived product and are not offered to shoppers.

## Verifying it

`tests/integration/imagery.test.ts` (part of `npm test`) asserts against a **read-only copy** of the
development database that:

* every published product has at least one frame;
* a product with photography never leads with an illustration;
* every *active* colourway has its own file, or is the lead colourway of `<slug>.jpg`;
* a colourway that has a photograph is not left `inactive`;
* every `is_sample = 1` product still carries its `sample_note`.

`tests/e2e/storefront.smoke.test.ts` additionally fails if any listing or product page renders a
`/media/sample/` frame, and requires `next/image` output (`/_next/image?url=`, `srcSet`, `sizes`)
on `/shop`.

## Adding real photography

1. Shoot or source one frame per colourway, on a person or on a flat surface, consistent framing,
   no watermark, and confirm you hold the rights to publish it.
2. Save it under `public/media/` with the naming contract above (any directory works for real
   products; `<slug>` naming is what the demo seed looks for).
3. Insert the row: `product_images(product_id, url, alt, position, kind, width, height)` with
   `kind = 'photo'`, `position = 0` for the garment frame a shopper lands on.
4. There is **no image uploader in this build**. `/api/admin/products` writes product fields only —
   `adminProductSchema` has no image keys — so frames are added by placing the file under
   `/media/**` and inserting the row (the demo seed does exactly this). Admin shows the count per
   product and calls out how many frames are still generated placeholders, which is the checklist
   for step 3. Adding real storage (S3/GCS + signed uploads) is a deliberate feature to build, not
   a config flag to flip.
5. Never point `product_images.url` at an external host: `next/image` is restricted to
   `localPatterns: ['/media/**']`, and hot-linked images break and carry unknown licences.

---

## Screening log — `public/media/demo/` (visual review, not a source read)

Every frame was looked at, at reduced size, against one question: **does this image show anything the
shopper cannot buy?** A wristwatch, a belt or a pair of shoes in a shirt/trouser frame is a merchandising
claim in itself, and the previous version of this site was rejected partly because the imagery did not
match the product. Verdicts below are from that review.

| Frame | Garment shown matches? | Accessory in frame | Verdict |
| --- | --- | --- | --- |
| `pure-linen-shirt.jpg` | ✓ ivory linen shirt | none | ship |
| `pure-linen-shirt-pale-sage.jpg` | ✓ | none | ship |
| `pure-linen-shirt-stone.jpg` | ✓ | none | ship |
| `cotton-twill-overshirt.jpg` | ✓ olive overshirt | none | ship |
| `heavyweight-crew-tee.jpg` | ✓ white tee | none | ship |
| `heavyweight-crew-tee-navy.jpg` | ✓ navy tee | none | ship |
| `linen-cotton-shorts.jpg` | ✓ sand shorts | bare feet only | ship |
| `loopback-sweatshirt.jpg` | ✓ grey sweatshirt | none | ship |
| `pima-pique-polo-bone.jpg` | ✓ bone polo | none | ship |
| `two-ply-poplin-shirt.jpg` | ✓ white poplin shirt | none | ship |
| `hero-editorial.jpg` | ✓ linen shirt, campaign band | none | ship |
| `brushed-oxford-shirt.jpg` | ✓ light-blue oxford | **wristwatch + belt** | re-shoot |
| `brushed-oxford-shirt-navy.jpg` | ✓ navy oxford | **belt** | re-shoot |
| `essential-combed-tee.jpg` | ✓ black tee | **wristwatch** | re-shoot |
| `fine-gauge-knit-polo.jpg` | ✓ charcoal polo | **wristwatch + belt** | re-shoot |
| `pima-pique-polo.jpg` | ✓ navy polo | **wristwatch** | re-shoot |
| `pleated-smart-trouser.jpg` | ✓ grey trousers | **belt + white sneakers** | re-shoot |
| `slim-cotton-chino.jpg` | ✓ sand chino | **brown loafers** | re-shoot |
| `straight-leg-denim.jpg` | ✓ indigo denim | **belt + brown boots** | re-shoot |

**No frame is wrong about the garment** — colour and item match the listing in all 19 — which is the
thing the previous build got wrong. The eight flagged frames are a *styling* problem: they sell a look
that includes stock we do not carry. Until they are re-shot they stay labelled in the alt text as demo
photography that is not verified product photography, which is true and is what a customer is owed.

### Re-shooting one frame

The gate is a filename, not a code change. Produce a frame that satisfies the naming contract, and it
is live on the next seed:

* one garment, worn untucked where a waistband would otherwise show;
* **bare wrists, no belt, no footwear in frame** (crop above the ankle, or shoot the waist-up);
* the colour in the frame must be the colour in the colourway name;
* `KBRANDS_DEMO_CATALOGUE` rows keep their demo badge regardless of how good the photo is.

A frame that fails any of those is worse than no frame: the seed will happily sell it, and a shopper who
receives a shirt without the watch in the picture has been misled by us.
