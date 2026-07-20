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
| `hero-parallax.js` | Hero halftone artwork upward parallax drift (`[data-hero-parallax]`) |
| `testimonials-slider.js` | Smooothy-powered testimonials carousel + trailing `//DRAG` pill |
| `pillars.js` | Home pillars section interactions |
| `portfolio.js` | Portfolio accordion behaviour |
| `filter.js` | Generic data-driven list filter (`[data-filter]` buttons + `[data-filter-item]` cards) — powers the Portfolio "Product" and Resources "Category" listings |
| `pullquote-cranes.js` | Ventures pull-quote crane parallax |
| `trifecta-line.js` | Holy Trifecta timeline connector line |
| `zoku-core.js` | **Generated bundle** — loaded on every page (barba-init first). Do not edit; run `./build.sh` |
| `zoku-halftone.js` | **Generated bundle** — lazy-loaded by the core bundle only on `[data-halftone]` pages. Do not edit; run `./build.sh` |
| `webflow-snippet.html` | The exact Head + Footer custom code pasted into Webflow Site Settings |
| `build.sh` | Stamps the release pins and rebuilds the two bundles from the source modules |
| `VERSION` | Single bump point for the shipped release tag (currently `1.3.1`) |
| `archive/` | Retired custom code kept for reference (`old-site-custom-code.html`) |

## Usage (jsDelivr)

Production loads a single bundle pinned to a tagged release — as **`zoku-core.min.js`**:
jsDelivr auto-minifies the committed `zoku-core.js` on the fly (~7.5KB gzipped vs
~31KB), so the repo keeps the readable bundle and the CDN serves the small one. The
core bundle fetches `zoku-halftone.min.js` on demand, so the WebGL shader never ships
to pages that don't use it.

```html
<script src="https://cdn.jsdelivr.net/gh/zoku-dev/zoku-scripts@v1.4.1/zoku-core.min.js" defer></script>
```

`@main` always tracks the latest push (no retag needed, but not immutable):

```html
<script src="https://cdn.jsdelivr.net/gh/zoku-dev/zoku-scripts@main/zoku-core.min.js" defer></script>
```

> jsDelivr caches tagged URLs immutably. To force-refresh a `@main` URL after a push,
> hit `https://purge.jsdelivr.net/gh/zoku-dev/zoku-scripts@main/zoku-core.min.js` once.

### Webflow

The full Head + Footer block lives in `webflow-snippet.html` — paste it into
**Site Settings → Custom Code**. The Footer loads the third-party libraries (GSAP,
ScrollTrigger, Smooothy, Barba) before `zoku-core.js`; keep that order.

## Halftone shader (`halftone-shader.js`)

A declarative, dependency-free WebGL2 module that renders an `<img>` as a grid of
anti-aliased halftone circles, sampling each dot's colour from the source image and
discarding the gaps to transparency so the wrapper's background shows through.

Everything is driven by `data-halftone-*` attributes in the Designer — no per-page
JavaScript is needed. The module ships inside the `zoku-halftone.js` bundle, which the
core bundle lazy-loads only on pages containing a `[data-halftone]` element.

### Quick start

Wrap an image in an element carrying `data-halftone`. The wrapper defines the render
area (the canvas fills it, `position: absolute; inset: 0`), and its background colour
shows through the gaps between dots.

```html
<!-- Still image -->
<div data-halftone style="background:#0b0b0f">
  <img src="hero.webp" alt="Team at work">
</div>
```

That's it for the common case. The original `<img>` stays in the DOM for accessibility
and as the no-WebGL2 fallback; the canvas fades in over it on first paint.

### Source modes

The shader has two source modes, picked automatically by default
(`data-halftone-type="auto"`):

1. **Still image** — a normal picture, rendered once and redrawn on resize.
2. **Sprite sheet** — a grid of animation frames packed into one image, either
   auto-played at a fixed fps or scrubbed by scroll position.

**Auto-detection** assumes the Zoku authoring cell size of **960×540**: if the image's
natural dimensions are a clean multiple of that cell (e.g. 3840×1080 = 4×2), it is
treated as a sprite sheet. Force a mode with `data-halftone-type="image"` /
`"sprite"`, or declare the grid explicitly with `data-halftone-cols` +
`data-halftone-rows` for sheets packed at another cell size.

```html
<!-- Auto-playing sprite sheet (grid auto-detected from 960×540 cells) -->
<div data-halftone data-halftone-type="sprite" data-halftone-fps="12">
  <img src="branch-sprite.avif" alt="">
</div>

<!-- Play once instead of looping -->
<div data-halftone data-halftone-type="sprite" data-halftone-loop="false">
  <img src="intro-sprite.webp" alt="">
</div>
```

### Attribute reference

All attributes go on the **wrapper** element (the one carrying `data-halftone`), not
the `<img>`. Marker attributes take no value — their presence enables the feature.

**Responsive overrides** — every attribute below (except the `data-halftone` marker
itself) accepts per-breakpoint variants matching the Webflow breakpoints, by suffixing
`-tablet` (≤991px), `-mobile` (≤767px) or `-mobile-portrait` (≤479px) — e.g.
`data-halftone-cell-mobile="6"`, `data-halftone-hover-tablet="false"`. Resolution
cascades down like the Designer: the most specific active tier carrying a valid value
wins, unset tiers inherit the next-wider tier's value, falling back to the un-suffixed
base, then the built-in default. Marker attributes become boolean at a tier — any
value except `"false"` switches the feature on, `"false"` switches it off — so a
suffix-only marker (e.g. `data-halftone-scrub-mobile`) enables a feature on just that
tier and below, and a `"false"` suffix retires a base marker under a given width.
Values re-resolve **live** when the viewport crosses a breakpoint: a tier that retires
`scrub` hands the sprite back to its fps clock, one that retires `hover` fades the
glow out, and a grid change re-derives the sprite from the already-loaded source (no
network). The one exception is `data-halftone-eager`, which is resolved once at page
scan — activation is one-shot, so it cannot toggle on resize.

#### Core

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-halftone` | marker | — | **Required.** Activates the effect on this element's child `<img>`. |
| `data-halftone-type` | `image` \| `sprite` \| `auto` | `auto` | Source mode. `auto` runs the 960×540 sprite-grid detection; `image` skips it; `sprite` forces it. |
| `data-halftone-fit` | `fill` \| `cover` \| `contain` | `fill` | `cover` scales/crops the source to fill the wrapper while preserving aspect ratio (like `object-fit: cover`) — use for full-bleed wrappers whose aspect differs from the source, e.g. the home hero. `contain` scales the source so all of it is visible (like `object-fit: contain`), dropping the dots in the letterbox bars so the wrapper's background fills the spare space. |
| `data-halftone-eager` | marker | off | Render immediately on page load instead of lazily when scrolled near the viewport (the default uses an IntersectionObserver with a 200px margin). |

#### Dot appearance

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-halftone-density` | number (5–1000) | `260` | Number of grid cells across the width. Higher = smaller, more numerous dots. |
| `data-halftone-cell` | CSS px | off | Target dot pitch in CSS pixels. When set, density is **derived** from the wrapper's rendered width (`density = width / cell`) and recomputed on resize, so dots keep a constant on-screen size at every breakpoint. Overrides `data-halftone-density`. |
| `data-halftone-radius` | number (0–0.5) | `0.47` | Fixed circle radius as a fraction of the cell. `0.5` = dots touch; smaller values open the gaps. |
| `data-halftone-luma` | marker | off | Size each dot by the luminance of its sampled pixel instead of the fixed radius — bright areas get big dots, dark areas small ones (classic halftone). |
| `data-halftone-depth` | integer ≥ 1 | `10` | Number of discrete dot-size levels when `data-halftone-luma` is on. |

#### Sprite playback

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-halftone-fps` | number ≥ 1 | `10` | Playback speed for auto-played sprites. |
| `data-halftone-loop` | `"false"` to disable | loop | By default sprites loop; set `"false"` to play once and hold the last frame. |
| `data-halftone-cols` | integer | auto | Explicit sprite-sheet columns. |
| `data-halftone-rows` | integer | auto | Explicit sprite-sheet rows. Set **both** cols and rows to override the 960×540 auto-detect for sheets packed at another cell size. |
| `data-halftone-scrub` | marker | off | Drive the sprite frame from scroll position instead of the fps clock. Progress is fed in externally via `ZokuHalftone.setProgress()` — pair with `scroll-scrub.js` (see below). |

#### Hover glow

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-halftone-hover` | marker | off | Holographic pointer glow: the whole wrapper tints towards the hover colour while hovering, blooming to full intensity around the cursor. The tint's luminance follows the source's white value — highlights bloom to a pale lavender, shadows sink to a deep violet. The glow trails the pointer with an eased lag and fades out on leave. |
| `data-halftone-hover-radius` | number (0.05–2) | `0.5` | Bloom radius as a fraction of the wrapper's width. |
| `data-halftone-hover-color` | `#rrggbb` | `#c88dfb` | Shadow tint (defaults to the deep Zoku brand purple). |
| `data-halftone-hover-color2` | `#rrggbb` | `#e2b0ff` | Highlight tint (defaults to a paler, slightly pinker lavender). |
| `data-halftone-hover-base` | number (0–1) | `0.4` | Whole-area tint floor while hovering — how strongly the tint applies away from the cursor. |

### Scroll-scrubbed sprites (with `scroll-scrub.js`)

`data-halftone-scrub` decouples the sprite from the clock; `scroll-scrub.js` then maps
scroll position to frame progress, so the animation plays forward and backward under
the reader's scroll.

```html
<section data-scrub-track>
  <div data-halftone data-halftone-scrub
       data-halftone-cols="4" data-halftone-rows="2">
    <img src="scroll-sprite_4x2.webp" alt="">
  </div>
</section>
```

Progress tracks the **`[data-scrub-track]`** element's travel through the viewport
(defaulting to the sprite's parent when no ancestor carries the attribute): progress is
0 as the track enters from the bottom and 1 just before it leaves the top.

The scrub window is tunable with two attributes on the **`[data-halftone-scrub]`**
element, both fractions of the viewport height:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-scrub-enter` | `0.9` | Viewport line (fraction of vh from the top) the track's **top** must reach for progress to start — the default holds frame 0 until the track is 90% up the screen. |
| `data-scrub-leave` | `0.1` | Viewport line the track's **bottom** must reach for progress to hit 1. |

Both accept per-breakpoint overrides matching the Webflow breakpoints, by suffixing
`-tablet` (≤991px), `-mobile` (≤767px) or `-mobile-portrait` (≤479px) — e.g.
`data-scrub-enter-mobile="0.7"`. Unset breakpoints inherit the next-wider tier's value,
falling back to the un-suffixed base, and values re-resolve live on resize.

The `data-halftone-scrub` marker itself is responsive with the same suffixes:
`data-halftone-scrub-mobile="false"` retires scrubbing on phones (the sprite is handed
back to its fps clock), while a suffix-only marker like `data-halftone-scrub-tablet`
enables scrubbing on tablet and below only. `scroll-scrub.js` skips inactive tiers so
they are never claimed away from auto-play, and re-resolves the active set on resize.

### Public API

The module exposes `window.ZokuHalftone`:

```js
// Set a scrubbed sprite's progress: 0 = first frame, 1 = last frame.
// `el` is the [data-halftone][data-halftone-scrub] wrapper element.
ZokuHalftone.setProgress(el, 0.5);

// Re-scan a DOM scope for new [data-halftone] wrappers (used after SPA swaps).
ZokuHalftone.scan(scopeElement);
```

`setProgress` draws synchronously (when the instance is on screen and loaded) so the
frame lands in the same scroll frame as the caller — no rAF lag — and it only actually
redraws when the quantised sprite frame changes. Claiming an off-screen sprite is cheap
and does **not** force its sheet to download: the instance stays lazy until the
IntersectionObserver activates it near the viewport, then applies the stored progress.
You only need `scan()` when injecting halftone elements outside the Barba page
lifecycle; `barba-init.js` already re-scans each swapped `<main>`.

### Behaviour notes & gotchas

- **Wrapper CSS** — the wrapper needs a size (the canvas fills it) and a background
  colour, which is what shows through the dot gaps. The module sets
  `position: relative` on it automatically if it's `static`.
- **Flash prevention** — the Webflow snippet hides `[data-halftone] > img` with CSS so
  the raw image (or worse, the whole sprite sheet) never flashes before the canvas
  paints. If WebGL2 is unavailable the module adds the `no-halftone` class to every
  wrapper, which reveals the original `<img>` as the fallback. Keep that CSS block
  (see `webflow-snippet.html`) when restyling.
- **Webflow responsive images (srcset)** — *sprites* always texture from the img's
  original `src` attribute, because Webflow's scaled srcset variants would shrink every
  frame cell and break the 960×540 auto-detect. *Stills* use the browser's srcset pick
  and automatically re-texture when a larger variant loads (e.g. after a window
  resize), never downgrading.
- **CORS** — Webflow renders imgs without `crossorigin`, which would taint the canvas,
  so the module fetches its own CORS-enabled copy of the image URL for texturing.
  Sources must therefore come from a CORS-friendly host (Webflow's CDN,
  `cdn.prod.website-files.com`, is).
- **Reduced motion** — with `prefers-reduced-motion: reduce`, auto-played sprites
  freeze on their first frame, the canvas reveal is instant, and the hover glow snaps
  to the cursor without trailing.
- **Performance** — one shared WebGL2 context is multiplexed across every instance on
  the page (browsers cap live contexts at ~16), device-pixel ratio is capped at 2, and
  instances only render while near the viewport. Draws happen only when an instance's
  pixels actually change: auto-played sprites redraw at their own fps (not per display
  frame), scrubbed sprites only when the quantised frame crosses, and stills re-upload
  their texture only when the source itself changes (not on resize/hover). The shared
  GL canvas is sized grow-only so its framebuffer is never thrashed between
  differently-sized instances. Context loss is handled: textures are re-minted and
  re-uploaded on restore.

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
