# Brand assets

**Read this first: there is no supplied brand asset in this repository.** The tracked history starts
with a one-line `README.md` (`fc26a90`), and no logo file, brand sheet or font licence was ever
committed here. Everything below is therefore *proposed, implemented and internally consistent*, but
it is **not owner-approved identity** — `tailwind.config.ts` says so in its header comment too. The
swap-in point for the real asset is one component and one config block.

## The mark

* `src/components/site/wordmark.tsx` — a **type-based** wordmark: a square `K` block plus "K-brands"
  set in the display face, with `tone="ink" | "ivory"` so it inverts on dark bands. It is a component,
  not a bitmap: it scales, inherits colour, costs no request, and reads as text to a screen reader.
* `public/icon.svg` — the same `K` block as a 214-byte SVG, used only as the favicon. Added in
  `adff4e1` as a stand-in.
* Nothing else in the tree draws the brand mark. To replace it: put the supplied file in
  `public/brand/` and point `Wordmark` at it.
* **Do not recolour a supplied logo** to suit a surface. Use the dark artwork on the light canvas and
  the light artwork on ink, which is what the type-based mark already does.

## Colour

`tailwind.config.ts` is the only place a colour literal is written; components use token names, so a
re-skin touches that block instead of every component. `tests/unit/design-tokens.test.ts` fails the
build if an off-palette hex or a low-contrast tone reappears in `src/`.

| Role | Token | Hex | Notes |
| --- | --- | --- | --- |
| Page canvas | `canvas`, `ivory` / `ivory-200` | `#F8F6F2` | Warm off-white; never pure white behind body copy. |
| Surface | `ivory-100` | `#FFFFFF` | Cards, fields. |
| Primary text | `ink` / `ink-800` | `#191919` | Also the dark editorial band and solid buttons. |
| Secondary text, small | `ink-600` | `#4D4D4D` | 8.9:1 on the canvas — carries every small label. |
| Secondary text, large | `ink-500` | `#737373` | 4.39:1: **18px+/bold-14px+ only.** |
| Muted stone | `stone-100` | `#EDE9E2` | Wells, image plates. |
| Hairline | `line`, `stone-200` | `#E4E0D9` | Borders and rules; the only border colour in the storefront. |
| The one accent | `sand` | `#97947F` | Tints (`sand-100/200`) for wells, `sand-500` for the demo marker and one editorial band. There is no second accent. |
| Status | `alert.ok / warn / error / info` | `#3F6A52 / #9A7226 / #8F3B32 / #3A5A72` | Messages only, never decoration. |

Shades above `ink-600` (`ink-700/800/900`) exist for dark surfaces; `stone-300/400/500` exist for
photography overlays. `stone-400` and `ink-400` are **not** available for text — the unit test
enforces that.

## Type

* **Display:** Fraunces (variable), then `Iowan Old Style, Palatino Linotype, Georgia, serif`.
* **Text/UI:** Inter (variable), then `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica Neue, Arial, sans-serif`.
* Both are **self-hosted** from `@fontsource-variable/fraunces` and `@fontsource-variable/inter`
  (`src/app/layout.tsx` imports them), so the font files are served by this app at build time and
  nothing calls Google Fonts at runtime. That matters both for visitors behind a filtering network
  and for any privacy statement the store later publishes.
* Both faces are SIL Open Font License 1.1, which is why they can be shipped at all. If the brand
  sheet specifies a licensed face (a Didot, say), that licence has to be bought and the files placed
  in `public/brand/fonts/` before the token changes; the scale below does not have to.
* Scale: body 15px/1.6, hard floor **11.5px** for the smallest permitted label. Display sizes are
  `clamp()`-based classes (`.display-hero`, `.display-section`, `.title-product`). Letter-spacing
  never exceeds `0.08em`, and the storefront uses no all-caps micro-labels: small text set in caps
  with wide tracking reads as a mock-up rather than a premium page, and it is the thing that most
  often fails contrast and line-length at 360px.
  Search/admin chrome keeps `eyebrow` labels sentence-case.

## Photography

See `docs/product-imagery.md`. The short version: only photographs on customer-facing surfaces, one
frame per purchasable colourway, and a demo frame is never described as verified product photography.

## Claims not made

No founding year, no manufacturing origin, no sustainability certification, no press logos, no
"as worn by", no review counts. Nothing in `src/` asserts any of them (`npm run audit:guard` and
`tests/unit/scope.test.ts` cover the merchandise-scope half of that). These are the kinds of
statements a store owner has to stand behind, so they need text from the owner — not copy written by
 whoever built the theme.
