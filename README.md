# zoku-scripts

Front-end JavaScript modules for the Zoku Webflow site, served to production
via [jsDelivr](https://www.jsdelivr.com/) so they can be referenced from Webflow's
Custom Code (which cannot host local files).

This repo is the **source of truth** for the Zoku front-end scripts — edit the source
modules here and cut a release (see below). The site markup and design live in the
separate `zoku-webflow` repo.

## Modules

Source modules are one IIFE each. `./build.sh` concatenates them into the two committed
bundles that actually ship — do **not** edit the bundles by hand.

| File | Purpose |
|------|---------|
| `barba-init.js` | SPA page transitions (Barba.js) + the rising pixel-band, per-page script lifecycle (`window.ZokuPage`) |
| `nav-menu.js` | Nav MENU chip → slide-out menu drawer, active-link sync |
| `nav-theme.js` | Adaptive nav `.cc-light` flip over light/dark surfaces |
| `halftone-shader.js` | WebGL2 halftone-circle renderer (`[data-halftone]`, still images + sprite scrub) |
| `scroll-scrub.js` | Scroll-progress driver for halftone sprite scrub (`[data-scrub-track]`) |
| `card-deck.js` | Glass-card hover-repel effect (`[data-deck]` / `[data-deck-card]`); also drives the home results deck via a class-based shim |
| `hero-intro.js` | Home hero headline + CTA intro load animation |
| `testimonials-slider.js` | Smooothy-powered testimonials carousel + trailing `//DRAG` pill |
| `pillars.js` | Home pillars section interactions |
| `portfolio.js` | Portfolio accordion behaviour |
| `filter.js` | Generic data-driven list filter (`[data-filter]` buttons + `[data-filter-item]` cards) — powers the Portfolio "Product" and Resources "Category" listings |
| `process-scroll.js` | "How it works" process rail progress |
| `pullquote-cranes.js` | Ventures pull-quote crane parallax |
| `trifecta-line.js` | Holy Trifecta timeline connector line |
| `zoku-core.js` | **Generated bundle** — loaded on every page (barba-init first). Do not edit; run `./build.sh` |
| `zoku-halftone.js` | **Generated bundle** — lazy-loaded by the core bundle only on `[data-halftone]` pages. Do not edit; run `./build.sh` |
| `webflow-snippet.html` | The exact Head + Footer custom code pasted into Webflow Site Settings |
| `build.sh` | Stamps the release pins and rebuilds the two bundles from the source modules |
| `VERSION` | Single bump point for the shipped release tag (currently `1.3.1`) |
| `archive/` | Retired custom code kept for reference (`old-site-custom-code.html`) |

## Usage (jsDelivr)

Production loads a single bundle, `zoku-core.js`, pinned to a tagged release. The core
bundle fetches `zoku-halftone.js` on demand, so the WebGL shader never ships to pages
that don't use it.

```html
<script src="https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@v1.2.0/zoku-core.js" defer></script>
```

`@main` always tracks the latest push (no retag needed, but not immutable):

```html
<script src="https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@main/zoku-core.js" defer></script>
```

> jsDelivr caches tagged URLs immutably. To force-refresh a `@main` URL after a push,
> hit `https://purge.jsdelivr.net/gh/0x5am5/zoku-scripts@main/zoku-core.js` once.

### Webflow

The full Head + Footer block lives in `webflow-snippet.html` — paste it into
**Site Settings → Custom Code**. The Footer loads the third-party libraries (GSAP,
ScrollTrigger, Smooothy, Barba) before `zoku-core.js`; keep that order.

## Releasing a new version

1. Edit the source module(s).
2. Bump `VERSION` (e.g. `1.2.0` → `1.2.1`).
3. Run `./build.sh` — it stamps the new `@vX.Y.Z` pin into `barba-init.js` and
   `webflow-snippet.html`, then rebuilds `zoku-core.js` and `zoku-halftone.js`.
4. Commit, then tag and push — the tag **must** match `VERSION`:

   ```bash
   git tag v1.2.1 && git push && git push --tags
   ```

5. Paste the updated Footer block from `webflow-snippet.html` into Webflow Custom Code.
   The pin is already stamped, so no manual tag edit is needed.

## Guard rails

`./build.sh --check` verifies the committed bundles are fresh and stamped without
touching the working tree. The `.githooks/pre-commit` hook runs it on every commit, so a
stale or unstamped bundle can't be committed. A fresh clone must enable the hook once:

```bash
git config core.hooksPath .githooks
```
