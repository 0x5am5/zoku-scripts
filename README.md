# zoku-scripts

Shared front-end JavaScript modules for the Zoku Webflow site, served to production
via [jsDelivr](https://www.jsdelivr.com/) so they can be referenced from Webflow's
Custom Code (which cannot host local files).

This repo is the **published mirror**. The source of truth lives in the website repo at
`zoku-webflow/template/assets/scripts/` — edit there, then publish here (see below).

## Modules

| File | Purpose |
|------|---------|
| `barba-init.js` | SPA page transitions (Barba.js) + the rising pixel-band, per-page script lifecycle (`window.ZokuPage`) |
| `nav-menu.js` | Nav MENU chip → slide-out menu drawer, active-link sync |
| `nav-theme.js` | Adaptive nav `.cc-light` flip over light/dark surfaces |
| `halftone-shader.js` | WebGL2 halftone-circle renderer (`[data-halftone]`, still images + sprite scrub) |
| `scroll-scrub.js` | Scroll-progress driver for halftone sprite scrub (`[data-scrub-track]`) |
| `card-deck.js` | Glass-card hover-repel effect (`[data-deck]` / `[data-deck-card]`) |
| `hero-intro.js` | Home hero headline + CTA intro load animation |
| `testimonials-slider.js` | Smooothy-powered testimonials carousel + trailing `//DRAG` pill |
| `pillars.js` | Home pillars section interactions |
| `results.js` | Home results stat-deck hover-repel |
| `portfolio.js` | Portfolio accordion behaviour |
| `process-scroll.js` | "How it works" process rail progress |
| `pullquote-cranes.js` | Ventures pull-quote crane parallax |
| `trifecta-line.js` | Holy Trifecta timeline connector line |

## Usage (jsDelivr)

Pin a tagged release for production stability:

```html
<script src="https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@v1.0.0/barba-init.js" defer></script>
```

`@main` always tracks the latest push (no retag needed, but not immutable):

```html
<script src="https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@main/barba-init.js" defer></script>
```

> jsDelivr caches tagged URLs immutably. To force-refresh a `@main` URL after a push,
> hit `https://purge.jsdelivr.net/gh/0x5am5/zoku-scripts@main/<file>.js` once.

### Webflow

Paste the tags into **Site Settings → Custom Code → Footer Code**, after the third-party
libraries (GSAP, ScrollTrigger, Barba, Smooothy) and in the same order as the local
`template/` build. See `webflow-snippet.html` for the full block.

## Publishing a new version

The website repo is the source of truth. From this repo:

```bash
./publish.sh            # syncs the latest .js from ../zoku-webflow/template/assets/scripts
git add -A && git commit -m "Update scripts"
git tag v1.0.1 && git push && git push --tags
```

Then bump the `@vX.Y.Z` tag in the Webflow Custom Code snippet (and in `webflow-snippet.html`).
