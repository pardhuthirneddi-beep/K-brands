# Brand assets

**The logo is the owner's; the rest is still pending sign-off.** The owner supplied a reference badge
(a gold `K` with an eagle cut through it, on a dark meshed disc, with a wordmark and tagline set
underneath). The mark is implemented from it; the palette and type below remain *proposed and
internally consistent*, and `tailwind.config.ts` says so in its header comment.

## The mark

| File | What it is |
| --- | --- |
| `public/brand/mark.svg` | The badge: a gold `K`, an eagle cut across it, a dark disc with the mesh texture. Used in the header, the footer and any lockup at 28px or larger. |
| `public/brand/mark-tiny.svg` | The same silhouette with the mesh and the feather cuts removed, for 16-24px. Detail is what turns a mark into a smudge at favicon size. |
| `public/icon.svg` | The tiny variant, served as the favicon. |
| `src/components/site/wordmark.tsx` | Places the artwork beside the name and sets the tone of the *text*. It does not draw the mark and does not tint it. |

Three decisions the owner can overrule:

* **The artwork is never recoloured per surface.** The disc is dark, so it holds on the ivory canvas as
  well as on ink, and `tone="ivory"` changes only the wordmark text. A logo that adapts its palette to
  the background is two logos.
* **The wordmark and tagline set underneath the badge in the reference are not re-typeset on the site.**
  The owner asked for the mark and said the content below it can be ignored, so the lockup stays
  "K-brands" with the site's own strapline rather than the reference's lettering.
* **These are vector renditions in the spirit of the reference, not a trace of it.** The reference arrived
  as a JPEG in the chat and never entered the repository, so the exact curves, the gold and any registry
  marks are not here. If a master vector (AI/SVG/EPS) exists, ship it in `public/brand/` under these two
  names and nothing else has to change - the components read the path, not the artwork.

The logo's gold and cream belong to the **artwork**, not to the palette below: they are not available as
`text-*` / `bg-*` utilities and no interface element borrows them. A gold accent in the UI would be a
palette decision to make deliberately - this system keeps one accent.

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
