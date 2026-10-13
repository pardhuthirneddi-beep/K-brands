# Responsive behaviour and accessibility

Two kinds of statement below. **Contract** = enforced by code/tests, so a regression fails the build.
**Not measured** = true by construction but never checked on real hardware in this environment.

## Viewport contract

| Width | What the layout does |
| --- | --- |
| ≤ 400px (small Android) | `.container` padding drops to 1rem (`@media (max-width:400px)`); product grid is 2-up at 50vw per card; nav collapses to the hamburger sheet; the 44px targets stay, text stays ≥ 11.5px. |
| 401–640px | Same 2-up grid, wider gutters. |
| 641–768px | 3-up grid (`33vw` per card in `sizes`), filters move inline where the page supports it. |
| 769–1199px | 3–4-up, sticky header at 64px. |
| 1200–1359px | Full container (max 1200px), primary nav row visible, header 64px. |
| ≥ 1360px | Container caps at 1360px, header 72px, admin rail offset to `xl:top-[72px]`. |

Rules that hold at every width, all of them in `src/app/globals.css`:

* `body { overflow-x: clip; max-width: 100% }` — a stray wide child cannot create a horizontal
  scrollbar for the whole document. `clip` rather than `hidden` so the page keeps a working
  `position: sticky` header.
* `html { scroll-padding-top: 6.5rem }` — anchor jumps and `:target` never land under the sticky
  header.
* `a, button, h1…h4, label, p, td, th { overflow-wrap: anywhere }` — a long pincode, an email or a
  URL breaks instead of pushing a card out of its grid.
* `img { background-color: #EDE9E2 }` — an unloaded frame is a stone block, not a white hole.
* `.field { min-height: 46px; max-width: 100%; font-size: 16px }`, `.btn-* { min-height: 44px }` —
  every control is a thumb-sized target, and inputs are 16px because iOS Safari zooms the whole page
  when a focused field is smaller than that (the field used to be 15px, which is a checkout you have
  to pan back). Desktop-only controls may drop the size again with `lg:text-[13px]`; the base rule
  stays 16px.
* Colour is single-sourced: `tests/unit/design-tokens.test.ts` fails if a hex literal appears
  anywhere in `src/` that `tailwind.config.ts` does not define. `#1b1a17`, `#1a1815`, `#dedad3`,
  `#f2efe9`, `#e6e1d8` and `#b7b1a6` were still in the tree at the time of writing and are now
  `ink`, `line` and `stone-400`/`ivory-300` tokens (or palette values, in the generated plate).
* `.table-scroll` wraps admin tables so a wide table scrolls inside its own box rather than the page.
* Cards carry `min-w-0` inside flex/grid rows — the single most common cause of "text is clipped" and
  "one card escaped the grid" in the earlier build.

## Accessibility contract

* One `<h1>` per page, in document order; the account layout's greeting is a styled `<p>` now, so
  sub-pages are not competing with it for the top of the outline.
* `<main id="main" tabIndex={-1}>` + a skip link that focuses it. The skip link is sentence-case and
  visible on first `:focus-visible`.
* `<nav aria-label="Primary">`, `<nav aria-label="Help">`, `<nav aria-label="Policies (draft)">`;
  `aria-current="page"` is set from `usePathname()` in the mobile sheet and server-side in the admin
  rail, so a screen reader knows where you are, not just where the colour moved.
* `:focus-visible { outline: 2px solid var(--text); outline-offset: 2px }`, plus
  `[data-focus-ring="on-dark"]` for the ink bands. Focus is never `outline: none` without a
  replacement.
* Every icon-only control has an `aria-label` (`Submit search`, `Clear search`, `Cart, N items`,
  `Login to your account` / `Your account`).
* `@media (prefers-reduced-motion: reduce)` disables smooth scrolling and cuts transitions to
  0.001ms — the card image zoom and the hover underline both stop.
* Alt text describes the garment and, for demo frames, says so: *"… — demo photograph of the Ivory
  garment, not verified product photography"*. Decorative SVGs are `aria-hidden`.
* Forms: real `<label for>` on every field, `aria-invalid`, an inline error message with the field id
  in `aria-describedby`, and `role="status"` on async results so the message is announced without
  moving focus.
* Quick view is `opacity-100` by default and only *adds* `lg:group-hover:opacity-100` — a keyboard or
  touch user is not required to hover to find the control.

## Contrast, measured not eyeballed

Computed from the tokens in `tailwind.config.ts` against the `#F8F6F2` canvas:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `ink #191919` on canvas | 16.29:1 | AAA |
| `ink-600 #4D4D4D` on canvas | 8.90:1 | AAA at body size |
| `ink-600` on `stone-100` | 6.99:1 | AA/AAA |
| `ink-500 #737373` on canvas | 4.39:1 | **AA large only** — 18px+ or 14px bold |
| `stone-500 #7A746A` on canvas | 4.63:1 | AA |
| white on `ink` | 17.58:1 | AAA |
| `alert-error #8F3B32` on white | 6.85:1 | AA |
| `alert-ok #3F6A52` on white | 5.73:1 | AA |
| ~~`ink-400 #8E8B86`~~ | 3.14:1 | fails — removed from text |
| ~~`stone-400 #ABA69C`~~ | 2.42:1 | fails — removed from text |

150 `text-ink-400` and 13 `text-stone-400` uses were moved to `ink-600`/`stone-500`, and 26 small
secondary strings darkened. `tests/unit/design-tokens.test.ts` walks every `.tsx` in `src/` and fails
if a sub-AA text tone comes back; it computes the ratios from the hexes, so changing a palette value
re-checks the whole tree.

## Verified how

* `tests/e2e/storefront.smoke.test.ts` asserts against **rendered HTML and the compiled CSS**: viewport
  meta, `overflow-x: clip`, `scroll-padding-top`, the reduced-motion block, the 44px minimum height,
  exactly one `<h1>`, the skip target `id="main" tabindex="-1"`, `<nav aria-label="Primary">`, a named
  account control, and that the login affordance reads "Login".
* `npm run audit:guard` covers the catalogue-scope half (no women's or accessory merchandise).

## Not measured here — read before signing off

* **No device lab and no browser automation** was available in this environment (Playwright's browsers
  cannot be downloaded here). Nothing below was checked on a real phone, in real iOS Safari, or with a
  real screen reader:
  - the actual rendered width of any element at 360×640, 412×915, 820×1180, 1366×768 and 1920×1080;
  - the iOS zoom behaviour itself: `.field` is 16px, which is the documented guard, but it has not
    been observed on an actual iPhone here;
  - NVDA/VoiceOver reading order of the cart and checkout stepper;
  - hit-target *spacing* (44px minimum size is enforced; the 8px gaps between stepper buttons are not);
  - keyboard operation of the admin product editor beyond the checks above.
* Colour-only signalling was avoided by convention (status text always accompanies the `alert-*`
  colours), but a colour-blindness simulation was not run.
* The 44px rule is enforced on `.btn`, `.field` and the header controls by CSS; a component that
  invents its own button class can still escape it, and no test measures rendered geometry.
