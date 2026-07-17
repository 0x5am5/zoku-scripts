/* zoku-core.js — generated bundle from: barba-init nav-menu nav-theme canvas-theme hero-intro hero-parallax pillars portfolio filter card-deck testimonials-slider pullquote-cranes. Do not edit directly; edit the source modules and run ./build.sh. */

/* ==== barba-init.js ==== */
/**
 * Barba.js page transitions + per-page script lifecycle.
 *
 * The site navigates as a single-page app: Barba fetches the next page and swaps
 * only the <main data-barba="container"> region, leaving the nav, menu drawer and
 * footer (all siblings of <main>) in place. Because the destination page's own
 * <script> tags are never executed, EVERY page loads the full superset of modules
 * once, and each module registers an init/destroy with the registry below so it
 * can re-run against the freshly-swapped <main> and tear down any global state
 * (window listeners, rAF loops, ScrollTriggers, Smooothy instances, WebGL).
 *
 * The transition itself is the rising "pixel band": a single full-viewport
 * <canvas> onto which a ~3/4-viewport-tall cloud of dark + brand-purple pixels is
 * repainted each frame — the cloud dissolves in from transparent and sweeps
 * bottom -> top while the next page is revealed underneath it (Barba `sync` keeps
 * both pages in the DOM at once). The outgoing <main> is frozen position:fixed
 * for the sweep; if any of the persistent footer was on screen, a frozen CLONE
 * of it stands in below the frozen <main> (the live footer reflows to the new,
 * taller document's end the instant the next container is inserted) and both are
 * clipped away together. A single canvas replaces the former CSS-grid of
 * hundreds of <span> cells, each of which had its opacity written every frame;
 * now one clearRect + a handful of fillRects paints the whole band. Honours
 * prefers-reduced-motion (instant swap) and degrades to ordinary navigation with
 * no JS / no Barba.
 *
 * Module contract:
 *   window.ZokuPage.register({ init(scope), destroy() })
 *     init(scope)  run on first load (scope = document) and after every swap
 *                  (scope = the new <main>); query DOM within `scope`.
 *     destroy()    optional; called before each navigation to release global
 *                  state belonging to the outgoing page.
 */
(function () {
    'use strict';

    // JS-enabled flag (gates the hero intro pre-hide). index.html also sets this
    // inline for a flash-free first paint; set it here too so it holds when index
    // is reached via SPA navigation from another entry page.
    document.documentElement.classList.add('zoku-js');

    // We manage scroll ourselves on every swap (reset to top), so opt out of the
    // browser's default 'auto' history scroll restoration. Re-asserted in
    // afterEnter because Barba flips it back to 'auto'. Kept as a plain assignment
    // (NOT an Object.defineProperty lock — locking the property interferes with
    // Barba's own history handling). The real guard against the previous-page
    // offset reappearing is the transition keeping the incoming page in normal
    // flow, so the document height never collapses and there is nothing to restore.
    const forceManualScroll = () => {
        if (!('scrollRestoration' in history)) return;
        try { history.scrollRestoration = 'manual'; } catch (e) { /* no-op */ }
    };
    forceManualScroll();

    /* ── Per-page module registry ──────────────────────────────────────────── */
    const mods = [];
    const ZokuPage = {
        register(mod) { if (mod) mods.push(mod); },
        initAll(scope) {
            const root = scope || document;
            mods.forEach((m) => {
                if (typeof m.init !== 'function') return;
                try { m.init(root); } catch (e) { console.error('[zoku] init failed', e); }
            });
        },
        destroyAll() {
            mods.forEach((m) => {
                if (typeof m.destroy !== 'function') return;
                try { m.destroy(); } catch (e) { console.error('[zoku] destroy failed', e); }
            });
        },
    };
    window.ZokuPage = ZokuPage;

    /* ── Lazy halftone bundle ──────────────────────────────────────────────────
     * The WebGL halftone system (halftone-shader + scroll-scrub + trifecta-line)
     * is ~40KB and only ~5 of 11 pages use it, so it is split into its own bundle
     * and fetched on demand — the first time a loaded/swapped-in page actually
     * contains a [data-halftone] element. Its modules register with ZokuPage like
     * any other; because initAll() has already run for the current page by the time
     * the bundle arrives, we init the newly-registered modules once here, and every
     * subsequent swap goes through the normal initAll() path.
     *
     * jsDelivr auto-minifies tagged files, so we point at the .min.js build
     * (~7KB gzipped vs ~17KB for the readable source) — identical behaviour,
     * smaller payload on the pages that actually pull the halftone bundle.
     * The pinned tag below is stamped from the repo-root VERSION file by
     * build.sh (its sed rewrites only the @vX.Y.Z tag, never the filename) — do
     * NOT edit it by hand; bump VERSION and run ./build.sh. */
    const HALFTONE_URL = 'https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@v1.5.1/zoku-halftone.min.js';
    let halftoneLoaded = false;
    let halftoneLoading = false;
    const ensureHalftone = (scope) => {
        const root = scope || document;
        if (halftoneLoaded || halftoneLoading) return;
        if (!root.querySelector || !root.querySelector('[data-halftone]')) return;
        halftoneLoading = true;
        const before = mods.length;
        const s = document.createElement('script');
        s.src = HALFTONE_URL;
        s.async = false;
        s.onload = () => {
            halftoneLoaded = true;
            // Init only the modules the bundle just added, against the live <main>.
            const liveMain = document.querySelector('[data-barba="container"]') || root;
            for (let i = before; i < mods.length; i++) {
                if (typeof mods[i].init !== 'function') continue;
                try { mods[i].init(liveMain); } catch (e) { console.error('[zoku] halftone init failed', e); }
            }
            if (window.ScrollTrigger && typeof window.ScrollTrigger.refresh === 'function') {
                window.ScrollTrigger.refresh();
            }
        };
        s.onerror = () => { halftoneLoading = false; };
        document.head.appendChild(s);
    };

    /* ── Rising pixel-band overlay (single <canvas>) ───────────────────────── */
    const PIXEL = { desktop: 60, mobile: 42 }; // grid cell px
    const BAND_FRACTION = 0.75;                 // band height as a fraction of the viewport
    const DITHER_SHARP = 3.2;                   // per-pixel fade softness (lower = wider dissolve)
    const PURPLE_RATIO = 0.5;                   // ~half the pixels go brand purple
    const HUE = 272, SAT = 90;                  // brand purple (#c88dfb / #7c00e9)
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

    let canvas = null;   // the single overlay <canvas>
    let ctx = null;      // its 2D context (scaled so we draw in CSS pixels)
    let cells = [];      // { x, y, rowF, rand, fill } per grid cell
    let cellSize = 0;    // grid cell edge in CSS px (set by buildBand)
    let viewW = 0;       // build-time viewport width  (CSS px), for clearRect
    let viewH = 0;       // build-time viewport height (CSS px), for clearRect

    /**
     * (Re)build the pixel grid sized to the current viewport, re-rolling colours.
     *
     * The band is one <canvas> rather than a grid of DOM cells: buildBand sizes
     * the backing store to the viewport (devicePixelRatio capped at 2 for
     * crispness without a 4x fill cost on retina), scales the context so all
     * drawing is in CSS pixels, then rebuilds the flat `cells` array — position,
     * row fraction, per-cell dissolve threshold and a precomputed solid fill
     * string. Called once per navigation.
     */
    const buildBand = () => {
        if (!canvas) {
            canvas = document.createElement('canvas');
            // Keep the class so the existing head CSS (.zoku-band { position:fixed;
            // inset:0; z-index:10000; … }) still harmlessly applies, but ALSO set
            // every needed style inline so the module is self-sufficient if that
            // CSS block is ever removed.
            canvas.className = 'zoku-band';
            canvas.setAttribute('aria-hidden', 'true');
            const s = canvas.style;
            s.position = 'fixed';
            s.inset = '0';
            s.zIndex = '10000';
            s.pointerEvents = 'none';
            s.display = 'none';
            s.width = '100%';   // map the backing store onto the full viewport
            s.height = '100%';
            document.body.appendChild(canvas);
            ctx = canvas.getContext('2d');
        }

        viewW = window.innerWidth;
        viewH = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap backing store at 2x
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
        // Draw everything in CSS px; the dpr scale keeps edges crisp on retina.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cellSize = viewW < 480 ? PIXEL.mobile : PIXEL.desktop;
        const cols = Math.ceil(viewW / cellSize);
        const rows = Math.ceil(viewH / cellSize);

        cells = [];
        for (let r = 0; r < rows; r++) {
            const rowF = (r + 0.5) / rows;
            for (let c = 0; c < cols; c++) {
                // ~half the cells are brand purple; the rest are dark. The dark
                // #161616 previously came from the CSS `.zoku-band_px` rule — the
                // canvas paints every cell explicitly, so it must be set here now.
                let fill = '#161616';
                if (Math.random() < PURPLE_RATIO) {
                    const l = clamp(58 + (Math.random() * 40 - 20), 30, 88);
                    fill = `hsl(${HUE} ${SAT}% ${l}%)`;
                }
                // rand = this cell's personal dissolve threshold, so cells fade
                // in from transparent at different moments (no clean band edge).
                // Cells are painted `cellSize × cellSize` at (c,r)·cellSize; the
                // last column/row overruns the viewport edge (clipped by the
                // canvas bounds) — the old 1fr grid instead compressed cells to
                // fit exactly. Coverage is identical; edge geometry differs by
                // sub-cell amounts, which the dissolve hides.
                cells.push({ x: c * cellSize, y: r * cellSize, rowF, rand: Math.random(), fill });
            }
        }
    };

    /**
     * Position the band at normalised progress (0 = below the viewport, 1 = above
     * it). The incoming page sits in normal flow beneath everything; we reveal it
     * by clipping the frozen OUTGOING elements away from the bottom up, tracking
     * the rising band centre — so the new page shows through underneath the band.
     *
     * `frozen` is a list of { el, offset } — every fixed element standing in for
     * the outgoing page (the frozen <main>, plus the footer clone when the reader
     * was near the bottom). `offset` maps viewport space into that element's own
     * box: element-space y = viewport y + offset.
     *
     * Each frame clears the canvas, then paints only the currently-visible cells:
     * the density bell + per-cell dither yields the same opacity `o` as the old
     * per-span version, but cells with o <= 0 (the great majority for most of the
     * sweep) are skipped entirely rather than written with opacity 0. Visible
     * cells are drawn with ctx.globalAlpha = o and the cell's precomputed solid
     * fillStyle (no rgba string is built per frame).
     */
    const setProgress = (p, frozen) => {
        const bh = BAND_FRACTION;
        const half = bh / 2;
        const cf = (1 + half) - p * (1 + bh); // band centre fraction travels up
        ctx.clearRect(0, 0, viewW, viewH);
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const target = 1 - Math.abs(cell.rowF - cf) / half; // density bell, 1 centre -> 0 edges
            const o = (target - cell.rand) * DITHER_SHARP + 0.5; // per-cell dithered fade
            if (o <= 0) continue; // transparent — skip (most cells, most frames)
            ctx.globalAlpha = o > 1 ? 1 : o;
            ctx.fillStyle = cell.fill;
            ctx.fillRect(cell.x, cell.y, cellSize, cellSize);
        }
        ctx.globalAlpha = 1; // leave the context in a known state
        if (frozen && frozen.length) {
            // Reveal the new page by clipping every frozen outgoing element along
            // the rising band centre. The clip MUST be expressed in pixels, not
            // a percentage of the element: the frozen <main> is the full document
            // height (often many viewports tall), so a `bottom%` clip would track
            // the whole page, not the on-screen band — the reveal line would only
            // enter the viewport near the very end and the new page would "flash in".
            //
            // The band centre sits at viewport y = cf * innerHeight; adding each
            // element's `offset` converts that shared line into its own box
            // (scrollY for the <main> frozen at top:-scrollY, -footerTop for the
            // footer clone parked at top:footerTop). Keep everything above the
            // line; clip everything below it (revealing the new page).
            const vh = window.innerHeight;
            for (let i = 0; i < frozen.length; i++) {
                const revealY = frozen[i].offset + cf * vh;
                frozen[i].el.style.clipPath = `inset(0 0 calc(100% - ${revealY.toFixed(1)}px) 0)`;
            }
        }
    };

    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /** Run one bottom -> top sweep; resolves once the band has left the top. */
    const runBand = (opts) => {
        opts = opts || {};
        const duration = opts.duration || 1100;
        const frozen = opts.frozen || [];
        return new Promise((resolve) => {
            buildBand();
            canvas.style.display = 'block';

            // The band sweep drives `enter()`, which Barba awaits before firing
            // `afterEnter` — and afterEnter is what removes the outgoing <main>,
            // resets scroll, re-inits the page modules, refreshes ScrollTrigger,
            // syncs the menu AND re-runs the adaptive nav-theme flip. That whole
            // chain therefore MUST NOT be able to hang. It can: the animation is
            // requestAnimationFrame-driven, and rAF is paused/heavily throttled
            // whenever the tab is not the visible foreground (backgrounded tab,
            // another window on top, OS app switch during the ~1.1s transition).
            // If the sweep starts while hidden, the rAF loop never reaches t=1,
            // the promise never resolves, and the swap gets stuck half-done — the
            // nav keeps the previous page's light/dark state and the old <main>
            // is left in the DOM. A watchdog forces completion so the transition
            // always finishes; setTimeout (unlike rAF) still fires while hidden.
            let settled = false;
            let watchdog = null;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
                // Old page ends fully clipped — do NOT un-clip it (that would
                // flash the outgoing page back over the new one). Barba removes
                // the outgoing <main>; disposable stand-ins we created ourselves
                // (the footer clone) are removed here, already invisible.
                setProgress(1, frozen);
                for (let i = 0; i < frozen.length; i++) {
                    if (frozen[i].remove) frozen[i].el.remove();
                }
                canvas.style.display = 'none';
                resolve();
            };

            if (prefersReduced) {
                finish();
                return;
            }

            setProgress(0, frozen);
            const start = performance.now();
            const frame = (now) => {
                if (settled) return;
                let t = (now - start) / duration;
                if (t > 1) t = 1;
                setProgress(easeInOutCubic(t), frozen);
                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    finish();
                }
            };
            requestAnimationFrame(frame);
            // Belt-and-braces: if rAF is throttled/paused the loop above may never
            // reach t=1, so guarantee completion a beat after the intended sweep.
            // On a normal visible tab the rAF loop finishes first and this is a
            // no-op (finish() is idempotent).
            watchdog = setTimeout(finish, duration + 600);
        });
    };

    /* ── Container stacking helpers (sync mode keeps both pages in the DOM) ───
     *
     * Both pages coexist during the sweep. We must avoid collapsing the document
     * height (which makes the browser clamp, then *restore*, the scroll position
     * the instant a container is unpinned — that race left the new page scrolled
     * to wherever the old one was, with the nav floating over mid-page content).
     *
     * The INCOMING page stays in NORMAL FLOW the entire time, so the document
     * height never collapses — there is nothing for the browser to restore, so
     * the scroll simply stays at the top where we put it. The OUTGOING page is
     * lifted out of flow and frozen at the exact offset the reader was viewing
     * (`top: -scrollY`), stacked just under the nav, then dissolved away from the
     * bottom up to reveal the incoming page underneath the rising band. */
    const freeze = (el, z, scrollY) => {
        el.style.position = 'fixed';
        el.style.top = (-scrollY) + 'px';
        el.style.left = '0';
        el.style.right = '0';
        el.style.zIndex = String(z);
        el.style.margin = '0';
    };

    /* ── Page lifecycle ────────────────────────────────────────────────────── */
    /** Highlight the menu link for the current page (the menu persists across swaps). */
    const syncMenuCurrent = () => {
        // nav-menu.js owns the mapping (incl. resources sub-pages) and repositions
        // the tracker when the drawer is open — delegate to it when available.
        if (window.ZokuNav && typeof window.ZokuNav.syncCurrent === 'function') {
            window.ZokuNav.syncCurrent(location.pathname);
            return;
        }
        // Fallback: exact filename match.
        const here = (location.pathname.split('/').pop() || 'index.html');
        document.querySelectorAll('.zoku-menu_link').forEach((a) => {
            const href = (a.getAttribute('href') || '').split('/').pop();
            a.classList.toggle('cc-current', !!href && href === here);
        });
    };

    /**
     * Sync the persistent footer's variant to the incoming page.
     *
     * The footer is a sibling of <main>, so Barba never swaps it — it keeps the
     * markup of whichever page was first loaded. The footer's light/dark colour
     * is a Webflow component variant, emitted as a `data-wf--footer--variant`
     * attribute ("base" | "dark") on the footer component root — NOT a combo
     * class (same pattern as the testimonials rail). Left alone it stays frozen
     * on the entry page's value: a direct hit renders correctly, but on SPA
     * navigation the footer colour never changes.
     *
     * Barba hands us the destination's full HTML, so read the incoming variant
     * and write it onto the live footer. Called from the transition's enter(),
     * within the synchronous block before the band's first paint: the reader
     * either can't see the footer (tall pages, scrolled to top) or sees the
     * frozen outgoing-page clone standing in front of it — so the class flip is
     * never visible, and nav-theme / canvas-theme (which probe the footer's
     * rendered colour in afterEnter) always see the destination's variant.
     * Target the attribute DIRECTLY via
     * `[data-wf--footer--variant]` rather than assuming it sits on `.footer`:
     * Webflow may put it on the component root (a wrapper around, or a child of,
     * the `.footer` element). A combo-class fallback is kept in case a page ever
     * expresses the variant that way instead.
     */
    const FOOTER_VARIANT_ATTR = 'data-wf--footer--variant';
    const syncFooter = (nextHTML) => {
        if (!nextHTML) return;
        const nextDoc = new DOMParser().parseFromString(nextHTML, 'text/html');

        // Primary: the data-attribute variant, wherever it lives in the footer.
        const liveVariant = document.querySelector('[' + FOOTER_VARIANT_ATTR + ']');
        const nextVariant = nextDoc.querySelector('[' + FOOTER_VARIANT_ATTR + ']');
        if (liveVariant && nextVariant) {
            const value = nextVariant.getAttribute(FOOTER_VARIANT_ATTR);
            if (liveVariant.getAttribute(FOOTER_VARIANT_ATTR) !== value) {
                liveVariant.setAttribute(FOOTER_VARIANT_ATTR, value);
            }
        }

        // Fallback: a combo class on the footer root.
        const live = document.querySelector('.footer');
        const incoming = nextDoc.querySelector('.footer');
        if (live && incoming && live.className !== incoming.className) {
            live.className = incoming.className;
        }

        // The wordmark expresses its light/dark state as a Webflow variant COMBO
        // CLASS on the element itself, not via the data-attribute variant above:
        // dark carries `footer_wordmark w-variant-84b5707f-0067-1a21-5745-1a239b984f4e`,
        // light is just `footer_wordmark`. Like the footer root it lives outside
        // <main>, so Barba never swaps it and it stays frozen on the entry page's
        // classes. Copy the incoming page's class list across — this tracks both
        // directions automatically (the variant class is present or absent in the
        // destination HTML) without hard-coding which pages are dark.
        const liveWordmark = document.querySelector('.footer_wordmark');
        const nextWordmark = nextDoc.querySelector('.footer_wordmark');
        if (liveWordmark && nextWordmark && liveWordmark.className !== nextWordmark.className) {
            liveWordmark.className = nextWordmark.className;
        }

        // The footer links express light/dark the same way as the wordmark: dark
        // pages stamp the variant combo class onto every link
        // (`footer_link w-variant-84b5707f-0067-1a21-5745-1a239b984f4e`), light
        // pages emit plain `footer_link` — and like everything else out here they
        // stay frozen on the entry page's classes. Don't copy class lists
        // pairwise (links also carry per-link combos like `cc-legal`, and counts
        // could drift): mirror just the `w-variant-*` classes from the incoming
        // links onto every live link, leaving other combo classes untouched.
        const nextLink = nextDoc.querySelector('.footer_link');
        if (nextLink) {
            const nextVariants = Array.from(nextLink.classList)
                .filter((c) => c.indexOf('w-variant-') === 0);
            document.querySelectorAll('.footer_link').forEach((a) => {
                Array.from(a.classList).forEach((c) => {
                    if (c.indexOf('w-variant-') === 0 && nextVariants.indexOf(c) === -1) {
                        a.classList.remove(c);
                    }
                });
                nextVariants.forEach((c) => a.classList.add(c));
            });
        }
    };

    /** Run every module against `scope`, then refresh the global chrome. */
    const initPage = (scope) => {
        ZokuPage.initAll(scope || document);
        ensureHalftone(scope || document); // fetch the halftone bundle if this page needs it
        if (window.ZokuNavTheme && typeof window.ZokuNavTheme.refresh === 'function') {
            // Pass the incoming container so nav-theme binds to the *new* page's
            // sections, not the outgoing main that Barba hasn't removed yet.
            window.ZokuNavTheme.refresh(scope);
        }
        if (window.ScrollTrigger && typeof window.ScrollTrigger.refresh === 'function') {
            window.ScrollTrigger.refresh();
        }
        syncMenuCurrent();
    };

    const start = () => {
        // No Barba (failed to load) — initialise once; links navigate normally.
        if (!window.barba) {
            initPage(document);
            return;
        }

        // First-load init MUST run exactly once. Verified against @barba/core
        // 2.10.3 (dist/barba.umd.js): barba.init() calls `this.once(data)`
        // synchronously, whose promise chain is
        //   beforeEnter → (if a `once` transition exists) doOnce → afterEnter
        // and afterEnter runs UNCONDITIONALLY — `return i && i.then ? i.then(r) : r()`,
        // where r() invokes the afterEnter hook — even though we define no `once`
        // transition. On that initial firing Barba passes a fresh schemaPage as
        // `data.current`, so `data.current.container` is null (real navigations
        // always carry the outgoing container); `data.next` holds the real first
        // page (container + html). The once() chain is kicked off synchronously
        // inside init() but resolves on a microtask, so the ACTUAL order is:
        //   1. the explicit initPage(document) at the end of start() (synchronous)
        //   2. the afterEnter hook, one microtask later, with a null current.
        // Without a guard every module would init twice and ScrollTrigger.refresh()
        // (a full layout pass) would run back-to-back on first load. The flag makes
        // whichever path runs first the one that inits; the other no-ops. It is
        // robust to either order in case a future Barba/plugin change reverses it.
        let firstInitDone = false;

        window.barba.init({
            sync: true, // keep current + next containers in the DOM together
            transitions: [{
                name: 'pixel-band',
                leave() {},
                async enter(data) {
                    // Re-assert manual restoration at the EARLIEST point of the
                    // navigation. On back/forward the browser's automatic scroll
                    // restoration fires during popstate — before afterEnter — so
                    // asserting it here (not just in afterEnter) is what stops the
                    // page landing at the previous entry's offset.
                    forceManualScroll();
                    const current = data.current && data.current.container;
                    const scrollY = window.scrollY || window.pageYOffset || 0;
                    const frozen = []; // { el, offset, remove? } — see setProgress

                    // Stand a frozen clone in for the footer if any of it was on
                    // screen. The persistent footer is a SIBLING of <main>, so
                    // freeze() below never touches it — and the moment Barba
                    // inserted the incoming container the footer reflowed to the
                    // end of the (much taller) new document. Left alone, the
                    // viewport slice the footer occupied snaps to whatever the
                    // incoming page paints at those rows (near-black on the dark
                    // pages) for the entire sweep — the "bottom half goes black"
                    // bug when navigating from near the bottom. The clone wears
                    // the OUTGOING page's variant classes (cloned before the
                    // syncFooter call below flips the live one) and is clipped
                    // away by the rising band like the rest of the old page.
                    //
                    // Geometry: measured BEFORE the scrollTo(0,0) below, while the
                    // outgoing <main> is still in normal flow. Its rect is
                    // unaffected by the incoming container (inserted AFTER it),
                    // and .footer follows <main> with no vertical margins
                    // (padding-only), so the footer's on-screen top is exactly
                    // currentRect.bottom. Take the LAST rendered .footer (same
                    // rule as canvas-theme — components.html carries a demo one).
                    if (current && !prefersReduced) {
                        const footers = document.querySelectorAll('.footer');
                        const footer = footers.length ? footers[footers.length - 1] : null;
                        const footerTop = current.getBoundingClientRect().bottom;
                        if (footer && footerTop < window.innerHeight) {
                            const clone = footer.cloneNode(true);
                            clone.setAttribute('aria-hidden', 'true');
                            const s = clone.style;
                            s.position = 'fixed';
                            s.top = footerTop + 'px';
                            s.left = '0';
                            s.right = '0';
                            s.zIndex = '40';
                            s.margin = '0';
                            s.pointerEvents = 'none';
                            document.body.appendChild(clone);
                            frozen.push({ el: clone, offset: -footerTop, remove: true });
                        }
                    }

                    // Sync the live footer to the incoming page NOW — inside the
                    // same synchronous block, i.e. before the band's first paint.
                    // On tall pages the footer is off-screen either way; on pages
                    // short enough to show it at scroll 0 the band now reveals it
                    // already wearing the destination's variant classes instead of
                    // visibly snapping when the sync used to run in afterEnter;
                    // and when navigating from near the bottom the clone above
                    // masks the flip entirely.
                    syncFooter(data.next.html);

                    // The incoming page is already in normal flow (Barba inserted it).
                    // Reset the window to the top so it shows its hero; because it never
                    // leaves flow, the scroll stays here — no restoration race, no jump.
                    window.scrollTo(0, 0);
                    if (current) {
                        // Freeze the outgoing page over it (z below the nav at 50) and
                        // dissolve it away from the bottom up to reveal the new page.
                        // It ends fully clipped (invisible); Barba then removes it.
                        freeze(current, 40, scrollY);
                        frozen.push({ el: current, offset: scrollY });
                    }
                    await runBand({ frozen, duration: 1100 });
                },
            }],
        });

        // Barba may flip scrollRestoration back to 'auto' on init — re-assert.
        forceManualScroll();

        window.barba.hooks.beforeLeave(() => {
            ZokuPage.destroyAll();
            // The drawer lives in the persistent wrapper, so it (and its body
            // scroll lock) would survive a SPA swap when navigating via a
            // non-menu link (logo, footer, card CTA). Close it on every
            // transition — closing on menu-link clicks alone is not enough.
            if (window.ZokuNav && typeof window.ZokuNav.close === 'function') {
                window.ZokuNav.close();
            }
        });
        window.barba.hooks.afterEnter((data) => {
            // A real navigation always carries the outgoing container; the initial
            // firing during barba.init() does not (see the note above). Skip the
            // whole body on a DUPLICATE initial call — scroll reset and initPage
            // are redundant once first-load init has already run. Real navigations
            // always run the full body regardless.
            const isInitial = !(data.current && data.current.container);
            if (isInitial) {
                if (firstInitDone) return;
                firstInitDone = true;
            }
            forceManualScroll(); // before the browser's async restore can fire
            window.scrollTo(0, 0);
            // The persistent footer was already synced to this page inside
            // enter(), before the band's first paint — so by the time
            // nav-theme.refresh() / canvas-theme (inside initPage) probe the
            // footer's background, it holds the new page's variant. (On a direct
            // load the footer is the page's own — nothing to sync.)
            initPage(data.next.container);
            // Belt-and-braces: even with scrollRestoration set to 'manual', the
            // sync scrollTo(0, 0) above can be undone a beat later by (a) the
            // browser's async scroll restoration, which some engines still apply
            // on history traversal, or (b) the first post-swap reflow as the new
            // page's above-the-fold assets/pins settle — either leaves the reader
            // dropped to a lower point. Re-assert the top on the next frame, which
            // lands after both yet still within ~16ms of the swap, so it never
            // fights a reader who has started scrolling.
            requestAnimationFrame(() => {
                if ((window.scrollY || window.pageYOffset || 0) !== 0) {
                    window.scrollTo(0, 0);
                }
            });
        });

        // First page load — Barba does not run a transition for it. Run the
        // per-page init here UNLESS the initial afterEnter already beat us to it
        // (it normally does not — see the note above — but the guard keeps init
        // to exactly one run either way).
        if (!firstInitDone) {
            firstInitDone = true;
            initPage(document);
        }
    };

    // This file is loaded as a `defer` script, so when it executes the document
    // has finished parsing and readyState is already 'interactive' — but the
    // *other* deferred module scripts (testimonials-slider.js, card-deck.js, …)
    // that register with ZokuPage further down the list have NOT run yet. Calling
    // start() now would fire initPage(document) against an empty registry, so the
    // per-page modules would never initialise on a direct (non-SPA) page load.
    // Wait for DOMContentLoaded, which the spec fires only after every deferred
    // script has executed and registered. (Only run immediately if we somehow
    // attach after load has fully completed.)
    if (document.readyState === 'complete') {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})();

/* ==== nav-menu.js ==== */
/**
 * Slide-out navigation drawer + staged content entrance.
 *
 * Wires the nav MENU chip ([data-nav-toggle]) to the .zoku-menu panel
 * ([data-nav-menu]). The chip is the SINGLE open/close control: while the
 * drawer is open the nav is lifted above it (.zoku-nav gains .cc-menu-open,
 * CSS raises its z-index and collapses pointer-events to the chip) and the
 * chip's label ticks from MENU to CLOSE — per-letter spans slide horizontally
 * away, staggered, with the incoming word trailing in (pure CSS, keyed on
 * aria-expanded). Toggles the [open] attribute (CSS owns the panel/scrim
 * slide), keeps aria state in sync, locks body scroll, closes on scrim click
 * or Escape.
 *
 * On open, a GSAP timeline staggers the drawer contents in this order:
 *   1. The "// contents" eyebrow rises + fades in first (on its own).
 *   2. Overlapping the tail of (1): the rail mask (.zoku-menu_rail-mask,
 *      wrapping the dim track AND the purple progress segment) is revealed
 *      top→bottom via clip-path — the rail's children no longer animate on
 *      their own — and the menu links fade in in sync with the reveal.
 *      The links (and footer links below) fade WITHOUT moving: they are tap
 *      targets, and a y-rise meant an early tap on iOS landed on a moved
 *      element — the intermittent "needs two taps" bug.
 *   3. Once the list has finished, the footer items stagger in the same way.
 *
 * The entrance is timed to play DURING the panel's 0.8s slide-in — the
 * contents are already mid-motion when the slide uncovers them — and any
 * animated close (chip, scrim, Escape, or a followed link) REVERSES the same
 * timeline, sped up to land inside the panel's 0.5s slide-out.
 *
 * The rail spans the links only — the eyebrow sits above it. The purple
 * progress segment is shown ONLY when a menu link is the current page: it is
 * statically positioned next to the .cc-current link on open (no motion of
 * its own) and simply uncovered by the mask reveal. When no link is current
 * (e.g. the home page, which isn't a menu entry) the segment is hidden
 * entirely. This runs independent of GSAP so the placement/hiding holds under
 * prefers-reduced-motion too.
 *
 * GSAP is optional — without it (or under prefers-reduced-motion) the content
 * is simply shown with no animation (nothing is hidden in CSS).
 */
(function () {
    const toggle = document.querySelector('[data-nav-toggle]');
    const menu = document.querySelector('[data-nav-menu]');
    if (!toggle || !menu) return;

    const nav = toggle.closest('.zoku-nav');
    const panel = menu.querySelector('.zoku-menu_panel');
    const scrim = menu.querySelector('.zoku-menu_scrim');
    const closers = menu.querySelectorAll('[data-nav-close]');
    let lastFocus = null;

    // Elements whose CSS transitions must be bypassed for an instant close —
    // the drawer flow plus the chip's MENU/CLOSE letters (which would
    // otherwise visibly tick back on a bfcache-restore force-close).
    const flowEls = () => [menu, scrim, panel]
        .concat(Array.from(toggle.querySelectorAll('.zoku-nav_menu-char')))
        .filter(Boolean);
    // Drop any inline transition:none left behind by an instant close (notably
    // after a bfcache cycle cancels the clean-up rAF) so the next open animates.
    const clearInstantOverride = () => flowEls().forEach((el) => { el.style.transition = ''; });

    /* ---- Staged content entrance (GSAP) ------------------------------- */
    const gsap = window.gsap;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !!gsap && !prefersReduced;

    const eyebrow = menu.querySelector('.zoku-menu_eyebrow');
    const railMask = menu.querySelector('.zoku-menu_rail-mask');
    const progress = menu.querySelector('.zoku-menu_rail-progress');
    const listItems = menu.querySelectorAll('.zoku-menu_link');
    const footerItems = menu.querySelectorAll('.zoku-menu_footer-label, .zoku-menu_footer-link');

    let intro = null;

    // Everything the intro timeline animates. Cleared back to the resting
    // (visible) state once an entrance/exit has fully finished, so the next
    // open replays from scratch.
    const introEls = () => [eyebrow, railMask, ...listItems, ...footerItems].filter(Boolean);
    const clearIntro = () => {
        if (intro) { intro.kill(); intro = null; }
        if (gsap) gsap.set(introEls(), { clearProps: 'all' });
    };

    /**
     * Place the purple progress segment beside the current page's link.
     * Runs on every open (independent of GSAP), so the highlight lands in the
     * right spot even under prefers-reduced-motion. The segment is shown ONLY
     * when a link carries .cc-current (it sits centred on that link); when no
     * menu item is current (e.g. the home page, which isn't a menu entry) the
     * segment is hidden entirely — there is no section to mark. The segment
     * never moves on its own — the rail mask reveal simply uncovers it in
     * place. Returns the resting `top` offset within the rail, or null when
     * nothing is current.
     */
    const positionProgress = () => {
        if (!progress) return null;
        const rail = progress.parentElement;
        if (!rail) return null;
        const current = menu.querySelector('.zoku-menu_link.cc-current');
        if (!current) {
            // No active menu item — don't show the segment at all.
            progress.style.display = 'none';
            return null;
        }
        progress.style.display = '';
        const railRect = rail.getBoundingClientRect();
        const linkRect = current.getBoundingClientRect();
        // Match the segment height to the link it marks so it spans exactly one
        // list item, then align it to that link (heights match, so top-to-top).
        progress.style.height = linkRect.height + 'px';
        const restingTop = Math.max(linkRect.top - railRect.top, 0);
        progress.style.top = restingTop + 'px';
        return restingTop;
    };

    /**
     * Normalise a URL/href to a comparable path key: resolve relative to the
     * current page, then drop any `.html` extension, `index` filenames and
     * trailing slashes, and lowercase. So "growth.html", "/growth", "/growth/"
     * and an absolute URL to the same page all collapse to one key. This lets
     * the active link be matched against the live link hrefs with NO hardcoded
     * page names and no dependence on the `.html` suffix — it behaves the same
     * on the static build and on Webflow's extensionless URLs, and adapts on its
     * own when pages are added, removed or renamed.
     */
    const normalisePath = (url) => {
        if (url == null) return null;
        let path;
        try { path = new URL(url, location.href).pathname; } catch (e) { return null; }
        path = path
            .replace(/\/index\.html?$/i, '/') // /dir/index.html → /dir/
            .replace(/\.html?$/i, '')          // strip .html elsewhere
            .replace(/\/+$/, '')               // drop trailing slashes
            .toLowerCase();
        return path === '' ? '/' : path;
    };

    /**
     * Mark the menu link for `pathname` (defaults to the current URL) as current,
     * derived dynamically from the link hrefs so adding/removing/renaming pages
     * needs no JS change. A link matches when its href resolves to the current
     * page; failing that, a link may opt into "section" grouping with a
     * `data-nav-match` attribute listing extra page slugs — e.g. the resources
     * link can carry `data-nav-match="article case-study"` so those detail pages
     * still light it up. Exposed for SPA navigation (Barba): the menu lives in
     * the persistent wrapper and isn't re-rendered on a swap, so the active state
     * is re-synced per transition. Repositions the tracker when the drawer is open.
     */
    const syncCurrent = (pathname) => {
        const here = normalisePath(pathname || location.pathname);
        const hereSeg = (here || '').split('/').pop();
        const links = Array.from(listItems);
        // 1. Exact match: a link whose href resolves to the current page.
        let active = links.find((l) => {
            const target = normalisePath(l.getAttribute('href'));
            return target !== null && target === here;
        });
        // 2. Fallback: optional section grouping via data-nav-match.
        if (!active) {
            active = links.find((l) => (l.getAttribute('data-nav-match') || '')
                .split(/[\s,]+/).filter(Boolean)
                .some((tok) => tok.toLowerCase().replace(/\.html?$/, '') === hereSeg));
        }
        links.forEach((l) => l.classList.toggle('cc-current', l === active));
        if (menu.hasAttribute('open')) positionProgress();
        return active || null;
    };

    window.ZokuNav = { syncCurrent };

    // Resolve the active link on load — dynamic, independent of any hardcoded
    // cc-current in the markup and of whether Barba is present.
    syncCurrent();

    const buildIntro = () => {
        if (!animate) return null;

        // Place the progress segment beside the current link now the panel is
        // laid out — it rests there statically; the mask reveal uncovers it.
        positionProgress();

        // The panel slide is 0.8s quint-out — it LOOKS ~90% open by ~0.3s, and
        // the left-aligned contents only clear the panel edge around then. So
        // everything starts at (or a hair after) t=0 and is compressed enough
        // that the contents are already mid-motion the moment the slide
        // uncovers them, and the list settles with the panel (~0.8s) rather
        // than animating after the drawer has visibly opened.
        const t0 = 0;              // eyebrow leads, with the first frame of the slide
        const eyebrowDur = 0.35;   // "// contents" rises + fades in first
        const reveal = 0.1;        // rail mask + list begin almost immediately
        const railDraw = 0.4;      // mask reveals top → bottom
        const itemDur = 0.45;
        const listStagger = 0.06;  // tight — the whole list lands as the panel settles
        const footerOverlap = 0.3; // footer begins while the list tail is still settling
        const listEnd = reveal + listStagger * Math.max(listItems.length - 1, 0) + itemDur;

        const tl = gsap.timeline({ paused: true });

        // 1. Eyebrow rises + fades in first, on its own.
        if (eyebrow) {
            tl.fromTo(eyebrow,
                { opacity: 0, y: 28 },
                { opacity: 1, y: 0, duration: eyebrowDur, ease: 'power3.out' }, t0);
        }

        // 2. Rail mask reveals track + progress together, top → bottom, while
        //    the list items rise/fade in sync with it.
        if (railMask) {
            tl.fromTo(railMask,
                { clipPath: 'inset(0% 0% 100% 0%)' },
                { clipPath: 'inset(0% 0% 0% 0%)', duration: railDraw, ease: 'power2.out' }, reveal);
        }
        if (listItems.length) {
            // Opacity-only: the links are tap targets, and rising them 28px
            // meant an early tap on iOS landed on a moved/neighbouring link
            // (the intermittent two-tap bug). A static hit target always takes
            // the first tap; the mask reveal + stagger still carry the motion.
            tl.fromTo(listItems,
                { opacity: 0 },
                { opacity: 1, duration: itemDur, ease: 'power3.out', stagger: listStagger }, reveal);
        }

        // 3. Footer items stagger in once the list has finished.
        if (footerItems.length) {
            // Opacity-only for the same reason as the list — the footer links
            // are tap targets too (the label just keeps in step with them).
            tl.fromTo(footerItems,
                { opacity: 0 },
                { opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.1 }, listEnd - footerOverlap);
        }

        return tl;
    };

    const open = () => {
        // Clear any stale transition:none override (e.g. after a bfcache cycle)
        // so the slide-in animates normally.
        clearInstantOverride();
        lastFocus = document.activeElement;
        menu.setAttribute('open', '');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        // Lift the nav above the drawer so the chip stays clickable as CLOSE
        // (CSS: z-index raise + pointer-events collapse to the chip + blur fade).
        if (nav) nav.classList.add('cc-menu-open');
        if (panel) panel.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        if (animate) {
            if (intro) intro.kill();
            intro = buildIntro();
            if (intro) intro.play(0);
        } else {
            // No animation — still place (or hide) the highlight per the current link.
            positionProgress();
        }

        // Focus stays on the toggle — it is the close control (now reading
        // CLOSE), so there is nothing better to move focus to.
    };

    /**
     * Close the drawer. Pass { instant: true } to skip the slide animation — used
     * when force-closing on a pagehide / bfcache restore / load so a leaked [open]
     * never flashes or "animates out" on (re)load. The instant path bypasses the
     * transitions for one frame (inline transition:none + forced reflow) then
     * clears the override on the next frame, and skips focus restoration.
     */
    const close = (opts) => {
        const instant = !!(opts && opts.instant);
        if (instant) {
            flowEls().forEach((el) => { el.style.transition = 'none'; });
            void menu.offsetWidth; // commit transition:none before changing [open]
        }
        menu.removeAttribute('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        if (nav) nav.classList.remove('cc-menu-open');
        if (panel) panel.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // Wind the entrance back so the close mirrors the open. An animated
        // close REVERSES the intro timeline, sped up so it lands inside the
        // panel's 0.5s slide-out (the drawer stays visible exactly that long);
        // the inline props are cleared once the reverse completes so the next
        // open replays from a clean resting state. An instant close skips the
        // motion entirely. (The progress segment is deliberately NOT cleared —
        // its inline top/height/display come from positionProgress, not GSAP,
        // and are recomputed on every open.)
        if (intro) {
            if (instant) {
                clearIntro();
            } else {
                const tl = intro;
                tl.eventCallback('onReverseComplete', () => {
                    if (intro === tl) clearIntro();
                });
                tl.timeScale(Math.max(tl.time() / 0.45, 1)).reverse();
            }
        }

        if (instant) {
            void menu.offsetWidth; // commit the transition-less close this frame
            requestAnimationFrame(clearInstantOverride);
        } else if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
    };

    toggle.addEventListener('click', () => {
        if (menu.hasAttribute('open')) {
            close();
        } else {
            open();
        }
    });

    closers.forEach((el) => el.addEventListener('click', close));

    // Close when a navigation link inside the drawer is followed. With SPA page
    // swaps (Barba) the nav + menu live in the persistent [data-barba="wrapper"]
    // and only <main> is replaced, so the open drawer would otherwise stay open
    // after navigating. Closing on click also reads cleanly on a full reload.
    menu.querySelectorAll('.zoku-menu_link, .zoku-menu_footer-link').forEach((link) => {
        link.addEventListener('click', close);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menu.hasAttribute('open')) close();
    });

    /* ---- Never let the drawer survive a navigation / restore --------------
     * The drawer lives outside the swapped <main>, so without these guards it
     * leaks open (with the body scroll locked) across (a) Barba SPA navigations
     * triggered by a non-menu link, and (b) back/forward bfcache restores — which
     * is the "menu is visible and animates out on refresh" symptom. All three
     * close instantly (no slide): there is nothing to animate on (re)load.
     *
     *   pagehide — close before the page freezes into the bfcache, so a restore
     *              never brings it back open (prevents the flash entirely).
     *   pageshow — safety net for any restore / hard refresh that still has
     *              [open] set; also clears a stale instant-transition override.
     *   init     — pre-paint guard for a served / restored [open] attribute.
     */
    const forceClosed = () => { if (menu.hasAttribute('open')) close({ instant: true }); };
    // Exposed now that `close` is defined — Barba closes the drawer on every
    // SPA navigation (see barba-init.js beforeLeave).
    window.ZokuNav.close = close;
    window.addEventListener('pagehide', forceClosed);
    window.addEventListener('pageshow', () => {
        forceClosed();
        clearInstantOverride();
    });
    forceClosed();

    /* ---- Enable transitions only after the first paint --------------------
     * Safari replays the menu's base-state transitions on the initial paint of
     * every load/refresh, sliding/fading the closed drawer OUT from its
     * UA-default position. CSS holds all menu transitions at `none` until
     * `html.zoku-menu-ready` is set; we add it after a double rAF so the
     * resting closed state has painted transition-free first. Set once and
     * left in place (it also survives Barba SPA swaps, since the menu and this
     * script persist), so real open/close interactions animate normally. */
    const markMenuReady = () => document.documentElement.classList.add('zoku-menu-ready');
    if (!document.documentElement.classList.contains('zoku-menu-ready')) {
        // Primary: a double rAF lands just after the closed state has painted.
        requestAnimationFrame(() => requestAnimationFrame(markMenuReady));
        // Fallbacks for tabs where rAF is throttled before first paint (e.g. a
        // page opened in a background tab): `load` fires regardless, and the
        // timeout is a final backstop. classList.add is idempotent.
        window.addEventListener('load', markMenuReady, { once: true });
        setTimeout(markMenuReady, 1000);
    }
})();

/* ==== nav-theme.js ==== */
/**
 * Adaptive navigation colour.
 *
 * The sticky `.zoku-nav` floats over the page with a transparent background. As
 * the reader scrolls, surfaces of differing brightness pass beneath it; this
 * toggles a `.cc-light` modifier on the nav so its wordmark + MENU chip flip to
 * dark ink over light surfaces and back to white over dark ones.
 *
 * The nav persists across Barba navigations but the page sections behind it are
 * swapped, so the surface list is recomputed via window.ZokuNavTheme.refresh()
 * after each swap. The scroll/resize listeners are bound once.
 */
(function () {
    const nav = document.querySelector('.zoku-nav');
    if (!nav) return;

    let surfaces = [];

    const parseRGB = (str) => {
        const m = str && str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((n) => parseFloat(n));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };

    // Effective background = first sufficiently-opaque colour walking up the tree
    // (heroes are transparent → resolves to the dark page-wrapper).
    const isLightSurface = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
            const bg = parseRGB(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0.5) {
                const lum = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255;
                return lum > 0.6;
            }
            node = node.parentElement;
        }
        return false; // default: treat as dark
    };

    let frame = null;

    // Last surface the probe matched. update() runs every scrolled frame, but the
    // section under the nav only changes when the reader crosses a boundary; the
    // isLightSurface() getComputedStyle walk + classList.toggle below are pure
    // functions of that section (its background is static), so while `current`
    // stays the same element there is nothing to recompute. Reset in refresh().
    let lastSurface = null;

    const update = () => {
        frame = null;
        if (!surfaces.length) return;
        const navRect = nav.getBoundingClientRect();
        const probeY = navRect.top + navRect.height / 2;

        let current = null;
        for (const el of surfaces) {
            const r = el.getBoundingClientRect();
            if (r.top <= probeY && r.bottom > probeY) {
                current = el;
                break;
            }
        }
        // No surface under the probe (a gap between sections): leave the nav as it
        // is and, deliberately, leave the cache untouched. The class already
        // reflects the last matched surface, so re-entering that same surface stays
        // a no-op rather than forcing a needless isLightSurface() walk.
        if (!current) return;

        if (current === lastSurface) return;   // same section as last frame — nothing to recompute
        lastSurface = current;

        nav.classList.toggle('cc-light', isLightSurface(current));
    };

    const onScroll = () => {
        if (frame === null) frame = requestAnimationFrame(update);
    };

    // Resolve the *live* page main. During a Barba swap two `.main-wrapper`
    // elements briefly coexist — the outgoing one is frozen `position: fixed`
    // (and removed a beat later) while the incoming one is in normal flow. A bare
    // `querySelector('.main-wrapper')` returns the outgoing (first-in-DOM) one, so
    // the surface list would bind to the old page's sections and, once they
    // detach, their rects collapse to 0 and the nav colour can never update again.
    // Prefer the scope the orchestrator passes (the incoming container); else pick
    // the in-flow (non-fixed) main; else fall back to the last one in the DOM.
    const resolveMain = (scope) => {
        if (scope && scope.classList && scope.classList.contains('main-wrapper')) return scope;
        if (scope && typeof scope.querySelector === 'function') {
            const inScope = scope.querySelector('.main-wrapper');
            if (inScope) return inScope;
        }
        const all = Array.from(document.querySelectorAll('.main-wrapper'));
        return all.find((m) => getComputedStyle(m).position !== 'fixed') || all[all.length - 1] || null;
    };

    // Recompute the surfaces that can sit behind the nav (page sections + footer).
    const refresh = (scope) => {
        const main = resolveMain(scope);
        surfaces = [
            ...(main ? Array.from(main.children) : []),
            ...Array.from(document.querySelectorAll('.footer')),
        ].filter(Boolean);
        // The section list (and the footer variant) is rebuilt on every SPA swap, so
        // a stale element reference must not short-circuit the first post-swap probe.
        lastSurface = null;
        update();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    window.ZokuNavTheme = { refresh };
    refresh();
})();

/* ==== canvas-theme.js ==== */
/**
 * Overscroll canvas colour (iOS rubber-band / Safari bar reveal).
 *
 * The document canvas — the html element's background — is what iOS Safari
 * shows beyond the page during rubber-band overscroll and in the gap behind
 * the collapsing address/tab bar. Every page here opens dark, but most end on
 * the light cream footer, so a single dark canvas reads as a black slab
 * bleeding out of the footer when the reader bounces past the bottom.
 *
 * A hard-stop gradient on <html> cannot fix this: the canvas background image
 * is positioned to the root element's box, and beyond that box it either
 * tiles (the strip above the page shows the BOTTOM of the tile above — the
 * wrong end) or, with no-repeat, falls back to background-color. Neither
 * extends the gradient's end colours outward, so the two overscroll regions
 * are painted separately instead:
 *
 *   - html background-color = the FOOTER's rendered colour — covers the
 *     bottom overscroll and the reveal behind Safari's bottom bar near the
 *     page end;
 *   - a fixed, viewport-tall "cap" parked just above the viewport
 *     (top: -100vh), painted with the TOP section's rendered colour — a top
 *     rubber-band drags the layout viewport (fixed elements included) down
 *     with the bounce, so the cap slides exactly into the gap it opens.
 *
 * Colours are probed live from computed styles, never hardcoded: top = the
 * first rendered child of the active <main> (walking up to the first opaque
 * ancestor, as nav-theme does), bottom = the persistent .footer — barba-init
 * syncs the footer's variant BEFORE initAll() runs, so the probe always sees
 * the destination page's footer colour. Per-page overrides win over the
 * probe via data-canvas-top / data-canvas-bottom attributes on the <main>.
 *
 * Like the pixel band, the cap is built here with inline styles — no
 * authored markup, no classes, nothing for Webflow's class system to carry.
 */
(function () {
    const FALLBACK = '#161616'; // --zoku-color-bg-primary

    // First sufficiently-opaque computed background colour walking up the
    // tree (same resolution rule as nav-theme's isLightSurface).
    const effectiveBg = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            const m = bg && bg.match(/rgba?\(([^)]+)\)/);
            if (m) {
                const parts = m[1].split(',').map((n) => parseFloat(n));
                if ((parts.length > 3 ? parts[3] : 1) > 0.5) return bg;
            }
            node = node.parentElement;
        }
        return FALLBACK;
    };

    // The live page main — during a Barba swap two `.main-wrapper`s coexist
    // (the outgoing one frozen position:fixed), so prefer the scope the
    // orchestrator passes, else the in-flow main (mirrors nav-theme).
    const resolveMain = (scope) => {
        if (scope && scope.classList && scope.classList.contains('main-wrapper')) return scope;
        if (scope && typeof scope.querySelector === 'function') {
            const inScope = scope.querySelector('.main-wrapper');
            if (inScope) return inScope;
        }
        const all = Array.from(document.querySelectorAll('.main-wrapper'));
        return all.find((m) => getComputedStyle(m).position !== 'fixed') || all[all.length - 1] || null;
    };

    let cap = null;
    const ensureCap = () => {
        if (cap && cap.isConnected) return cap;
        cap = document.createElement('div');
        cap.setAttribute('data-canvas-cap', '');
        cap.setAttribute('aria-hidden', 'true');
        const s = cap.style;
        s.position = 'fixed';
        s.top = '-100vh';
        s.left = '0';
        s.right = '0';
        s.height = '100vh';
        s.zIndex = '-1';
        s.pointerEvents = 'none';
        document.body.appendChild(cap);
        return cap;
    };

    const init = (scope) => {
        const main = resolveMain(scope);

        // Top: the first rendered section of the page.
        let topEl = null;
        if (main) {
            topEl = Array.from(main.children).find((el) => el.offsetHeight > 0) || null;
        }
        const top = (main && main.getAttribute('data-canvas-top'))
            || effectiveBg(topEl || main || document.body);

        // Bottom: the persistent footer (variant already synced to the
        // incoming page by the time initAll runs). components.html carries a
        // second demo footer — take the last rendered one, i.e. document end.
        const footers = Array.from(document.querySelectorAll('.footer'))
            .filter((f) => f.offsetHeight > 0);
        const footer = footers[footers.length - 1] || null;
        const bottom = (main && main.getAttribute('data-canvas-bottom'))
            || (footer ? effectiveBg(footer) : top);

        document.documentElement.style.backgroundColor = bottom;
        ensureCap().style.backgroundColor = top;
    };

    window.ZokuCanvasTheme = { refresh: init };
    if (window.ZokuPage) window.ZokuPage.register({ init });
})();

/* ==== hero-intro.js ==== */
/**
 * Hero intro + scroll scrub — home page hero animation.
 *
 * LOAD: staggers the home hero headline lines and the "Learn more" CTA into
 * view (opacity 0 → 1, y 28 → 0, power3.out), matching the nav menu's
 * entrance feel, while the halftone branch sprite auto-plays its bloom
 * (owned by halftone-shader.js).
 *
 * SCROLL: everything in the hero scrubs simultaneously, tied to scroll
 * position across the hero's first-viewport travel (fully reversible):
 *   - "from inception" drifts 50px right and fades out
 *   - "to escape velocity" drifts 50px left and fades out
 *   - the "Learn more" CTA fades out (autoAlpha, so it also stops being
 *     clickable once invisible)
 *   - the halftone background darkens (wrapper opacity 0.8 → 0 over the
 *     near-black section surface)
 *   - the branch sprite plays frame-by-frame BACKWARDS —
 *     ZokuHalftone.setProgress(bg, 1 − scrollProgress)
 *
 * TWO ScrollTriggers, deliberately split:
 *   - The FRAMES trigger is created immediately at init. setProgress claims
 *     the sprite, but the shader renders min(intro clock, scrub) for claimed
 *     play-once sprites — so at rest (scrub = 1) the claim is a no-op and the
 *     bloom plays out; scrolling AT ANY TIME (even mid-bloom) scrubs back
 *     from wherever playback has reached, never jumping. Parked mid-scroll,
 *     the bloom keeps playing up to the scroll cap and holds; returning to
 *     the top lets it complete to the final frame, resetting the experience.
 *   - The VISUALS timeline (line drift/fades, bg darken) is built only in the
 *     intro tween's onComplete, so its start values capture the settled
 *     post-intro state (no opacity fight, no mid-fade capture). If the reader
 *     scrolled during the intro, it renders at the live progress on creation.
 *
 * Markup contract (index.html — no extra hooks needed, so the Webflow page
 * needs no attribute changes):
 *   [data-hero-intro]        — the headline wrapper
 *     [data-hero-line] ×2    — the two headline lines (staggered first)
 *     [data-hero-cta]        — the "Learn more" button (last)
 *   The hero <section> is the wrapper's closest('section'); the halftone
 *   background is that section's [data-halftone] element.
 *
 * The halftone bundle is lazy-loaded, so ZokuHalftone may not exist yet when
 * init runs on a first page load — a short bounded poll lands the initial
 * claim once the API appears (matters at rest under reduced motion, where the
 * claim is what shows the final bloomed frame instead of a frozen frame 0).
 *
 * Reduced motion: the intro reveals instantly (existing behaviour) and the
 * move/fade tweens are skipped, but the sprite still follows scroll
 * (user-driven, the same convention as the trifecta scrub) resting on its
 * final bloomed frame. Targets data attributes, never classes, and bails out
 * early when the hero or GSAP is absent.
 */
(function () {
    let introTween = null;
    let scrubTl = null;   // visuals timeline (carries its own ScrollTrigger)
    let scrubSt = null;   // frames ScrollTrigger (created at init)
    let apiPoll = 0;      // bounded wait for the lazy halftone bundle

    function destroy() {
        if (introTween) { introTween.kill(); introTween = null; }
        if (scrubTl) {
            if (scrubTl.scrollTrigger) scrubTl.scrollTrigger.kill();
            scrubTl.kill();
            scrubTl = null;
        }
        if (scrubSt) { scrubSt.kill(); scrubSt = null; }
        if (apiPoll) { clearInterval(apiPoll); apiPoll = 0; }
    }

    /** Reverse frame scrub: scroll 0 = final (bloomed) frame, hero scrolled past = first. */
    function driveFrames(bg, p) {
        const api = window.ZokuHalftone;
        if (!bg || !api || typeof api.setProgress !== 'function') return;
        api.setProgress(bg, 1 - p);
    }

    /** The scrubbed move/fade timeline — built once the intro has landed. */
    function buildVisualScrub(section, bg, lines, cta) {
        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        if (!gsap || !ScrollTrigger) return;

        scrubTl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
            },
        });
        if (lines[0]) scrubTl.to(lines[0], { x: 50, autoAlpha: 0 }, 0);
        if (lines[1]) scrubTl.to(lines[1], { x: -50, autoAlpha: 0 }, 0);
        if (cta) scrubTl.to(cta, { autoAlpha: 0 }, 0);
        if (bg) scrubTl.to(bg, { opacity: 0 }, 0);
    }

    function init(scope) {
        // Idempotent: on first page load barba-init calls initPage twice (its own
        // explicit first-load call PLUS Barba's afterEnter hook, which Barba v2
        // fires during barba.init()). Tear down any previous intro/scrub first so
        // the double call can't stack a second ScrollTrigger on the hero.
        destroy();

        const root = scope || document;
        const hero = root.querySelector('[data-hero-intro]');
        if (!hero) return;

        const section = hero.closest('section') || hero;
        const bg = section.querySelector('[data-halftone]');
        const lines = section.querySelectorAll('[data-hero-line]');
        const cta = section.querySelector('[data-hero-cta]');

        // Ordered targets: the two lines first, then the CTA.
        const targets = [...lines, ...(cta ? [cta] : [])];
        if (!targets.length) return;

        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Frames scrub — live from the first scrolled pixel (see header: the
        // shader's min(clock, scrub) cap makes the immediate claim safe).
        if (gsap && ScrollTrigger && typeof gsap.registerPlugin === 'function' && bg) {
            gsap.registerPlugin(ScrollTrigger);
            scrubSt = ScrollTrigger.create({
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
                onUpdate: (self) => driveFrames(bg, self.progress),
            });
            driveFrames(bg, scrubSt.progress);
            // Lazy halftone bundle may not have landed yet — poll briefly so the
            // initial claim (and the reduced-motion resting bloom) still applies.
            if (!window.ZokuHalftone) {
                let tries = 0;
                apiPoll = setInterval(() => {
                    tries += 1;
                    if (window.ZokuHalftone) {
                        clearInterval(apiPoll);
                        apiPoll = 0;
                        if (scrubSt) driveFrames(bg, scrubSt.progress);
                    } else if (tries >= 40) {
                        clearInterval(apiPoll);
                        apiPoll = 0;
                    }
                }, 250);
            }
        }

        // LCP fallback handoff: styles.css reveals the lines via a bounded CSS
        // animation (zoku-hero-reveal-fallback, 1.8s delay) in case this module
        // is slow to arrive. If that reveal is already painting, adopt the
        // visible state instead of replaying the intro (killing the animation
        // without inlining opacity would snap the lines back to the pre-hide
        // state and blink them off). Either way the animation must be cleared:
        // a filled CSS animation overrides GSAP's inline styles, which would
        // pin the lines visible and break the scroll-out fade.
        const fallbackPainting = targets.some(
            (el) => parseFloat(window.getComputedStyle(el).opacity) > 0.01
        );
        targets.forEach((el) => { el.style.animation = 'none'; });

        // No GSAP or reduced motion: reveal immediately, no animation. (CSS already
        // shows them under reduced-motion, but clear inline state defensively.)
        if (!gsap || prefersReduced) {
            targets.forEach((el) => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            return;
        }

        // CSS fallback got there first — adopt its end state and skip straight
        // to the scroll scrub.
        if (fallbackPainting) {
            targets.forEach((el) => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            buildVisualScrub(section, bg, lines, cta);
            return;
        }

        introTween = gsap.fromTo(
            targets,
            { opacity: 0, y: 28 },
            {
                opacity: 1,
                y: 0,
                duration: 0.7,
                ease: 'power3.out',
                stagger: 0.14,
                delay: 0.1,
                // No clearProps: the CSS pre-hide (.zoku-js [data-hero-line]) is the
                // resting state, so the final inline opacity:1 / y:0 must persist to
                // keep the lines visible after the tween.
                onComplete: () => {
                    introTween = null;
                    buildVisualScrub(section, bg, lines, cta);
                },
            }
        );
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();

/* ==== hero-parallax.js ==== */
/**
 * Hero parallax — the hero's halftone artwork gently floats upward as the
 * reader scrolls the opening viewport.
 *
 * Markup contract: [data-hero-parallax] on the hero media wrapper (growth
 * .zoku-editorial-hero_bonsai, ventures .zoku-ventures-hero_media). Optional
 * attribute value = total upward drift in px (default 50). The parallax is
 * scroll-scrubbed across the hero <section>'s first-viewport travel with a
 * lagged catch-up (scrub: 1.2s) so the artwork eases/floats behind the
 * scroll rather than tracking the scrollbar 1:1.
 *
 * Centring caveat: both hero medias are absolutely positioned and centred
 * via CSS transform: translateX(-50%). GSAP would parse that into a frozen
 * pixel x on first write, breaking the centring on resize — so when the
 * element carries a CSS transform it is re-expressed as xPercent: -50
 * (responsive) while y animates. Elements without a resting transform
 * (e.g. an inset full-bleed layer) get their y animated untouched.
 *
 * Desktop-only (≥768px): at ≤767px both medias leave the absolute layer
 * (position: static; transform: none) and an inline transform would fight
 * that — gsap.matchMedia reverts all inline state automatically when the
 * breakpoint deactivates. The reduced-motion opt-out lives in the same
 * matchMedia condition. Early-exits without GSAP/ScrollTrigger or when no
 * [data-hero-parallax] exists in scope.
 */
(function () {
    let mm = null;

    function destroy() {
        if (mm) { mm.revert(); mm = null; }
    }

    function init(scope) {
        const root = scope || document;
        const els = root.querySelectorAll('[data-hero-parallax]');
        if (!els.length) return;

        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        if (!gsap || !ScrollTrigger || typeof gsap.matchMedia !== 'function') return;
        gsap.registerPlugin(ScrollTrigger);

        mm = gsap.matchMedia();
        // matchMedia auto-reverts the tweens + their ScrollTriggers (and every
        // inline style they wrote) when the context deactivates — on resize
        // below 768px, on reduced-motion flips, and on destroy()'s mm.revert().
        mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
            els.forEach((el) => {
                const section = el.closest('section') || el.parentElement;
                if (!section) return;

                const dist = parseFloat(el.getAttribute('data-hero-parallax')) || 50;
                const centred = getComputedStyle(el).transform !== 'none';
                const from = centred ? { xPercent: -50, x: 0, y: 0 } : { y: 0 };

                gsap.fromTo(el, from, {
                    y: -dist,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: section,
                        start: 'top top',
                        end: 'bottom top',
                        scrub: 1.2,
                    },
                });
            });
        });
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();

/* ==== pillars.js ==== */
(function () {
    let mm = null;             // gsap.matchMedia() for the pinned card deck (desktop only)
    let ledeTween = null;      // the lede fade-in (fire-and-forget gsap.to)
    let ledeObserver = null;   // IntersectionObserver that fires the reveal

    function destroy() {
        if (ledeTween) { ledeTween.kill(); ledeTween = null; }
        if (ledeObserver) { ledeObserver.disconnect(); ledeObserver = null; }
        if (mm) { mm.revert(); mm = null; } // reverts tweens + ScrollTriggers + class changes
    }

    function init(scope) {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const section = (scope || document).querySelector('.zoku-home-pillars');
        if (!section) return;

        // Clear any leftovers from a prior page (defensive — destroy() runs first
        // on navigation, but a direct re-init should be idempotent too).
        destroy();

        gsap.registerPlugin(ScrollTrigger);

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lede = section.querySelector('.zoku-home-pillars_lede');
        const cards = Array.from(section.querySelectorAll('.zoku-home-pillars_card'));

        // Lede rises + fades in once on approach, across every breakpoint.
        //
        // The lede is PRE-HIDDEN in CSS (`.zoku-js .zoku-home-pillars_lede`,
        // disabled under reduced-motion) so it is never visible before its
        // reveal, and that CSS rule also carries a bounded fallback animation
        // (zoku-pillars-lede-fallback) that self-reveals it if this module
        // never runs. Mirror hero-intro's handoff: read whether the fallback is
        // already painting BEFORE touching the element, then clear `animation`
        // (a filled CSS animation overrides GSAP's inline styles and would pin
        // the lede, breaking the scroll-in reveal).
        //
        // The reveal is refresh-proof AND does not depend on ScrollTrigger's
        // scroll-crossing detection. The previous fromTo used toggleActions
        // 'play none none none': it played once on the `top 75%` cross, but a
        // later ScrollTrigger.refresh() — forced by the deck pin creation below
        // and by each Barba swap / image load — REWOUND the fromTo to its "from"
        // state, and with no boundary re-cross the play toggle never re-fired,
        // so the lede stuck at opacity:0 / y:32 in Safari (Chrome's load order
        // happened to dodge the rewind).
        //
        // Now an IntersectionObserver fires an INDEPENDENT fire-and-forget
        // gsap.to() — a standalone tween ScrollTrigger holds no handle on, so a
        // refresh cannot rewind it. IO is chosen over a ScrollTrigger callback
        // deliberately: it fires reliably on first paint if the section is
        // already in view (the deep-link / mid-page-swap case) AND on the
        // enter crossing, is immune to ScrollTrigger.refresh(), and — unlike a
        // ScrollTrigger onEnter — fires even in nested-scroller contexts.
        if (lede) {
            const fallbackPainting =
                parseFloat(window.getComputedStyle(lede).opacity) > 0.01;
            lede.style.animation = 'none';

            if (reduceMotion) {
                // CSS already shows it under reduced-motion; clear any inline
                // leftovers a prior (killed) instance left and pin it visible.
                gsap.set(lede, { clearProps: 'opacity,transform' });
                lede.style.opacity = '1';
                lede.style.transform = 'none';
            } else if (fallbackPainting) {
                // The CSS fallback already revealed it (JS arrived late) — adopt
                // the visible end state, no replay.
                lede.style.opacity = '1';
                lede.style.transform = 'none';
            } else {
                // Start from the pre-hidden state (CSS only sets opacity, so set
                // the y offset too), then reveal on approach.
                gsap.set(lede, { opacity: 0, y: 32 });

                const revealLede = () => {
                    if (ledeTween) return;
                    ledeTween = gsap.to(lede, {
                        opacity: 1,
                        y: 0,
                        duration: 0.9,
                        ease: 'power2.out',
                    });
                };

                if (typeof IntersectionObserver === 'function') {
                    // Default threshold 0, no rootMargin: reveal as soon as any
                    // part of the (tall) section enters the viewport. A negative
                    // rootMargin to mimic the old `top 75%` start proved flaky
                    // on a programmatically-scrolled iframe root in Safari; the
                    // plain form fires reliably, and revealing a below-the-fold
                    // lede the moment it enters view reads the same.
                    ledeObserver = new IntersectionObserver((entries, obs) => {
                        if (entries.some((e) => e.isIntersecting)) {
                            revealLede();
                            obs.disconnect();
                            ledeObserver = null;
                        }
                    });
                    ledeObserver.observe(section);
                } else {
                    // No IntersectionObserver (ancient engine): reveal now.
                    revealLede();
                }
            }
        }

        if (cards.length < 2) return;
        const [cardOne, cardTwo] = cards;

        // Pin live at the bottom of the sticky nav rather than flush at the viewport
        // top. Locking the pin target at y=0 tucks its top edge behind the nav,
        // swallowing the top padding so the content reads cramped/"too high".
        // Offsetting the start by the nav height lets the padding sit fully below the
        // nav. Read live (function + invalidateOnRefresh) so a resize re-measures it.
        const navHeight = () => document.querySelector('.zoku-nav')?.offsetHeight || 0;

        const hidden = { yPercent: 130, opacity: 0, scale: 1, transformOrigin: '50% 100%', willChange: 'transform, opacity' };

        // Desktop card-deck deal-in, two phases so the cards are already in motion
        // on approach rather than waiting for the pin:
        //   1. Card one deals in scrubbed across the approach — from the section top
        //      crossing three-quarters of the way down the viewport to the pin point
        //      — so it is fully landed when the pin engages.
        //   2. The section pins and card two rises over card one, pushing it back
        //      into a dimmed shade.
        // Returns a cleanup that resets the cards + stage.
        function buildDeck(pinTarget) {
            const stage = section.querySelector('.zoku-home-pillars_cards');
            if (!stage) return null;

            stage.classList.add('cc-deck');

            // Both cards start below the stage, transparent. Card two sits above card
            // one in the DOM, so it naturally stacks in front.
            gsap.set([cardOne, cardTwo], hidden);

            // Phase 1 — card one deals in on approach, landing exactly at the pin.
            //
            // Opacity is NOT ramped across the glide: the cards' frosted glass
            // (backdrop-filter in the Designer styles) composites in proportion to
            // element opacity, so a fade the length of the travel reads as the
            // BLUR animating from thin to full. Instead a short head tween snaps
            // the card solid inside the first 10% of the approach — while it is
            // still parked ~130% below the stage, effectively off-screen — and
            // the whole visible glide runs at full frost.
            const intro = gsap.timeline({
                scrollTrigger: {
                    trigger: pinTarget,
                    start: 'top 75%',
                    end: () => 'top top+=' + navHeight(),
                    scrub: 0.6,
                    invalidateOnRefresh: true,
                },
            });
            intro.to(cardOne, { opacity: 1, duration: 0.1, ease: 'none' }, 0);
            intro.to(cardOne, { yPercent: 0, duration: 1, ease: 'power3.out' }, 0);

            const tl = gsap.timeline({
                defaults: { ease: 'power3.out' },
                scrollTrigger: {
                    trigger: pinTarget,
                    start: () => 'top top+=' + navHeight(),
                    end: '+=80%',
                    scrub: 0.6,
                    pin: pinTarget,
                    pinSpacing: true,
                    // No anticipatePin: it engages the pin early in proportion to
                    // scroll velocity, so the (un-animated) lede heading visibly
                    // snaps up ~30px instead of freezing seamlessly at the exact
                    // geometric pin point. Pinning precisely at `start` keeps the
                    // heading locked in its current position with no jolt.
                    invalidateOnRefresh: true,
                },
            });

            // Phase 2 — after a short beat, card two slides up into the front while
            // card one is pushed back — lifted, scaled down and dimmed like a shade.
            // fromTo with immediateRender:false so card one's recorded start is its
            // landed state, not the hidden set() above.
            //
            // Frost stays constant here too (see the phase-1 note): card two's
            // opacity snaps solid in a 0.05 head — it only starts overlapping card
            // one from tl time ~0.21, by which point it is already opaque — and
            // card one's push-back dims via filter:brightness rather than opacity,
            // which would thin its backdrop blur as card two crosses it.
            //
            // The 0.15 beat is also load-bearing: ScrollTrigger renders a scrubbed
            // timeline at progress 0 when the trigger is created (and on refresh),
            // and immediateRender:false does not suppress THAT render. A fromTo
            // child sitting at position 0 would paint its from values (card one
            // landed, opaque) at first load, and the intro tween above would then
            // lazily record them as its start — no-oping the whole deal-in. Any
            // position > 0 keeps the creation render from touching the cards.
            tl.to(cardTwo, { opacity: 1, duration: 0.05, ease: 'none' }, 0.15);
            tl.to(cardTwo, { yPercent: 0, duration: 0.7 }, 0.15);
            tl.fromTo(cardOne,
                { yPercent: 0, scale: 1, filter: 'brightness(1)' },
                { yPercent: -8, scale: 0.94, filter: 'brightness(0.55)', duration: 0.7, immediateRender: false }, 0.15);

            return () => {
                if (intro.scrollTrigger) intro.scrollTrigger.kill();
                intro.kill();
                stage.classList.remove('cc-deck');
                gsap.set([cardOne, cardTwo], { clearProps: 'all' });
            };
        }

        // matchMedia auto-cleans on resize / breakpoint change.
        mm = gsap.matchMedia();

        // Desktop (≥992px): pin the whole section so the lede column stays in view
        // beside the dealing cards. The pin makes the lede's sticky offset redundant
        // and fights ScrollTrigger, so cc-pinned drops it back to static meanwhile.
        mm.add('(min-width: 992px) and (prefers-reduced-motion: no-preference)', () => {
            section.classList.add('cc-pinned');
            const cleanup = buildDeck(section);
            return () => {
                section.classList.remove('cc-pinned');
                if (cleanup) cleanup();
            };
        });

        // Mobile / tablet (≤991px): no deck — the cards simply stack in normal
        // flow and scroll like any other content. A two-phase scrubbed deal-in
        // (approach glide + pinned rise, mirroring the desktop deck) was tried
        // here and retired: on short viewports it read as jank, not choreography.
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();

/* ==== portfolio.js ==== */
(function () {
  function init(scope) {
    const root = scope || document;
    const found = root.querySelectorAll('.zoku-home-portfolio, [data-portfolio-scroll]');
    // Fall back to the whole scope so bare .zoku-portfolio-item rows (e.g. the
    // components showcase) are still wired when there's no wrapper section.
    const scopes = found.length ? found : [root];

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';

    // State lives on the [open] attribute, which works on any element — the
    // static build uses native <details>, but Webflow re-imports these rows as
    // <div>s (it can't represent <details>/<summary>), so we can't rely on the
    // native .open property or on native collapse. Toggling the attribute keeps
    // the CSS ([open] indicator, panel reveal, collapse) driving off one hook in
    // both environments.
    const isOpen = (item) => item.hasAttribute('open');
    const setOpen = (item, open) => {
        if (open) item.setAttribute('open', '');
        else item.removeAttribute('open');
    };

    scopes.forEach((scope) => {
        const items = Array.from(scope.querySelectorAll('.zoku-portfolio-item'))
            .filter((el) => !el.classList.contains('cc-static'));
        if (!items.length) return;

        const useMotion = !prefersReducedMotion && hasGsap;

        // Slide the panel up from below as it fades in. Hover polish (the
        // gentle artwork zoom) is pure CSS on .zoku-portfolio-item_art.
        const revealPanel = (item) => {
            const panel = item.querySelector('.zoku-portfolio-item_panel');
            if (!panel) return;

            // Take over from the CSS keyframe so GSAP owns the transform.
            panel.style.animation = 'none';

            if (!useMotion) {
                // Fall back to the resting state with no motion.
                panel.style.transform = '';
                panel.style.opacity = '';
                return;
            }

            window.gsap.fromTo(panel,
                { yPercent: 40, opacity: 0 },
                { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );
        };

        // On mobile the rows stack full-width, so opening a lower row while the
        // previously open one collapses above it can leave the tapped toggle
        // stranded mid-viewport or pushed off-screen. Scroll the toggle to the
        // top of the viewport — just below the fixed .zoku-nav so it isn't
        // covered. Desktop keeps its scroll position: the layout barely shifts
        // there and the jump would feel abrupt. Measured synchronously after
        // the [open] swap — collapse is instant CSS, and the panel reveal only
        // animates transform/opacity, so geometry is already final.
        const scrollToToggle = (toggle) => {
            if (!window.matchMedia('(max-width: 767px)').matches) return;
            const nav = document.querySelector('.zoku-nav');
            const navHeight = nav ? nav.getBoundingClientRect().height : 0;
            const top = toggle.getBoundingClientRect().top
                + (window.scrollY || window.pageYOffset || 0) - navHeight;
            window.scrollTo({
                top: Math.max(0, top),
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
            });
        };

        const setActive = (idx) => {
            items.forEach((item, i) => {
                const shouldOpen = i === idx;
                if (isOpen(item) === shouldOpen) return;
                setOpen(item, shouldOpen);
                if (shouldOpen) revealPanel(item);
            });
        };

        // Click-to-open accordion: opening a row reveals its panel and closes
        // the others. Only one row is ever open, and a row can never be closed
        // by clicking it again — clicking the open row is a no-op (setActive
        // early-returns when the target is already open). The toggle is a
        // <summary> in the static build and a
        // <div class="zoku-portfolio-item_toggle"> once imported into Webflow,
        // so accept either.
        items.forEach((item, i) => {
            const summary = item.querySelector('summary, .zoku-portfolio-item_toggle');
            if (!summary) return;
            summary.addEventListener('click', (e) => {
                e.preventDefault();
                const wasOpen = isOpen(item);
                setActive(i);
                if (!wasOpen) scrollToToggle(summary);
            });
        });

        // Open the first row by default (never collapsed to nothing), unless the
        // markup already marks one open.
        if (!items.some(isOpen)) setActive(0);
        else items.forEach((item) => { if (isOpen(item)) revealPanel(item); });
    });
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();

/* ==== filter.js ==== */
(function () {
  // Generic, data-driven list filter — powers the Portfolio ("Product") and
  // Resources ("Category") listings, and any future filtered list, from the
  // same engine. It is deliberately agnostic to WHAT the categories are: add a
  // new filter type entirely in Webflow (a new button + a new CMS category)
  // without touching this file.
  //
  // ── Markup contract ──────────────────────────────────────────────────────
  //   Menu:    the button group. Auto-detected via [data-filter-menu] OR the
  //            existing .zoku-resources-filter_menu class (so the current pages
  //            need no wrapper change).
  //   Buttons: descendants carrying data-filter="<slug>". A value of "all"
  //            (or "*", or empty) is the reset button that shows everything.
  //   Items:   the filterable cards carry data-filter-item="<value>[, <value>…]"
  //            — a COMMA- (or pipe-) separated list of the categories they
  //            belong to (multiple categories per item supported). In Webflow,
  //            bind this custom attribute's value to the item's Category /
  //            Product CMS field. The value is matched whole and case-
  //            insensitively, so either the field's name ("Zoku Ventures") or
  //            its slug ("zoku-ventures") works — as long as the button uses the
  //            same. Separate multiple categories with commas, never spaces,
  //            because category names themselves contain spaces. An item with no
  //            data-filter-item is never hidden (it opts out of filtering).
  //            On Webflow CMS lists the attribute lives on the card INSIDE the
  //            .w-dyn-item wrapper (the wrapper itself can't carry bound
  //            attributes), so hiding climbs to the closest .w-dyn-item — the
  //            whole grid cell collapses instead of leaving an empty hole.
  //   Scope:   an item belongs to a menu when it lives inside the menu's scope.
  //            Scope = the element matched by the menu's data-filter-target
  //            selector, else the menu's closest [data-filter-scope] /
  //            .zoku-resources-listing / section / main. This lets several
  //            independent filters coexist on one page.
  //   Empty:   an optional [data-filter-empty] element inside the scope is
  //            shown only when a filter matches zero items.
  //
  // The button value is matched (whole, case-insensitively) against the item
  // values, so the two must agree — a data-filter="Zoku Ventures" button shows
  // the items whose data-filter-item lists "Zoku Ventures". The strings
  // themselves carry no meaning to this code.

  var HIDDEN_CLASS = 'cc-filtered-out';

  function init(scope) {
    var root = scope || document;

    var menus = Array.prototype.slice.call(
      root.querySelectorAll('[data-filter-menu], .zoku-resources-filter_menu')
    );
    // When re-initialised inside a Barba container the menu itself may be the
    // scope root rather than a descendant of it.
    if (root.matches && root.matches('[data-filter-menu], .zoku-resources-filter_menu')) {
      menus.push(root);
    }

    menus.forEach(setupMenu);
  }

  function setupMenu(menu) {
    // Guard against double-binding when a page is re-initialised (Barba).
    if (menu.dataset.filterReady === '1') return;
    menu.dataset.filterReady = '1';

    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hasGsap = typeof window.gsap !== 'undefined';

    var buttons = Array.prototype.slice.call(menu.querySelectorAll('[data-filter]'));
    if (!buttons.length) return;

    var scopeEl = resolveScope(menu);
    var emptyEl = scopeEl.querySelector('[data-filter-empty]');

    // Split a raw attribute value into its category tokens, trimmed and
    // lowercased. Only commas and pipes separate categories — NOT whitespace,
    // because category names ("Zoku Ventures") legitimately contain spaces.
    var tokensOf = function (value) {
      return (value || '')
        .split(/[,|]/)
        .map(function (s) { return s.trim().toLowerCase(); })
        .filter(Boolean);
    };

    var itemsOf = function () {
      // Re-query each time so CMS lists rendered/paginated after init are
      // still picked up.
      return Array.prototype.slice.call(scopeEl.querySelectorAll('[data-filter-item]'));
    };

    var isAll = function (slug) {
      return !slug || slug === 'all' || slug === '*';
    };

    var apply = function (slug, opts) {
      var animate = !(opts && opts.animate === false) && !prefersReducedMotion && hasGsap;
      var all = isAll(slug);
      var shown = [];

      itemsOf().forEach(function (item) {
        var match = all || tokensOf(item.getAttribute('data-filter-item')).indexOf(slug) !== -1;
        // Hide the Webflow collection-item wrapper when there is one, so the
        // grid cell collapses; on static pages the item hides itself.
        var target = item.closest('.w-dyn-item') || item;
        var wasHidden = target.classList.contains(HIDDEN_CLASS);
        target.classList.toggle(HIDDEN_CLASS, !match);
        target.setAttribute('aria-hidden', match ? 'false' : 'true');
        if (match) {
          shown.push(item);
          // Only animate items that are newly appearing.
          if (animate && wasHidden) {
            window.gsap.fromTo(target,
              { opacity: 0, y: 16 },
              { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' }
            );
          }
        }
      });

      if (emptyEl) emptyEl.style.display = shown.length ? 'none' : '';
    };

    var setActive = function (btn, opts) {
      buttons.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('cc-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply((btn.getAttribute('data-filter') || '').trim().toLowerCase(), opts);
    };

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        setActive(btn);
      });
    });

    // Initial state: honour a button the markup pre-marks active, else the
    // first "all" button, else the first button. No entry animation on load.
    var initial = buttons.filter(function (b) {
      return b.classList.contains('cc-active') || b.getAttribute('aria-pressed') === 'true';
    })[0];
    if (!initial) {
      initial = buttons.filter(function (b) {
        return isAll((b.getAttribute('data-filter') || '').trim().toLowerCase());
      })[0] || buttons[0];
    }
    setActive(initial, { animate: false });
  }

  // Find the region a menu controls (see the Scope note in the header).
  function resolveScope(menu) {
    var target = menu.getAttribute('data-filter-target');
    if (target) {
      var el = document.querySelector(target);
      if (el) return el;
    }
    return (
      menu.closest('[data-filter-scope], .zoku-resources-listing, section, main') ||
      document
    );
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();

/* ==== card-deck.js ==== */
/**
 * Card deck — staggered slide-in entrance for a cluster of cards.
 *
 * 2026-07-15: this module replaced the old bouncy hover-repel interaction.
 * Decks no longer fan/rotate at rest and carry no hover behaviour — the cards
 * rest in a neat, straight layout (the CSS owns that) and animate IN from the
 * far right of the screen, staggered left to right, the first time the deck
 * scrolls into view.
 *
 * Markup contract (data attributes only — never classes, per project JS rules):
 *   <div data-deck>
 *     <article data-deck-card>…</article>   ← one per card
 *   </div>
 * Multiple decks per page are supported. Legacy option attributes from the
 * hover-repel era (data-deck-repel, data-deck-min-width-disabled, …) are
 * ignored, so older markup — including whatever Webflow still carries — keeps
 * working with this bundle.
 *
 * The home results deck is Webflow-owned markup that cannot be given data
 * attributes from this repo, so it is wired by its structural classes
 * (.zoku-home-results_cards / _card) — the same shim the hover-repel build used.
 *
 * Each card's start offset is measured against the viewport's right edge, so
 * every card genuinely begins beyond the screen no matter where its deck sits
 * in the layout. Host sections must clip horizontal overflow while cards are
 * parked offscreen (all current deck sections do — overflow hidden on
 * .zoku-home-results / .zoku-unique / .zoku-catalyse / .zoku-means, and
 * .section.cc-clip on the growth "things we do not do" section).
 *
 * Implementation notes:
 * - Visibility is detected with an IntersectionObserver, NOT a ScrollTrigger:
 *   deck sections sit below pinned sections (pillars/trifecta), whose
 *   pin-spacers shift trigger positions after creation, and the initial-load
 *   ScrollTrigger.refresh() interplay proved unreliable for a
 *   created-paused-then-played tween. The IO measures live geometry at fire
 *   time, so pinning never skews it. (Same pattern Smooothy uses internally.)
 * - The slide-in tween is created AT FIRE TIME (not pre-created and paused),
 *   so no earlier refresh/overwrite pass can invalidate it.
 * - init() is guarded per wrap: barba-init's afterEnter hook ALSO fires for
 *   the initial page load (Barba 2 behaviour), so init() runs twice on a
 *   direct load — a second measuring pass would see the already-parked cards
 *   and collapse every offset to ~40px.
 *
 * Early-exits under prefers-reduced-motion or missing GSAP, leaving the
 * resting layout untouched. No JS at all → cards simply rest in place.
 */
(function () {
  const DURATION = 0.9;
  const EASE = 'power3.out';
  const STAGGER = 0.12;
  // Extra px beyond the viewport edge so box-shadows/borders never peek in.
  const OVERSHOOT = 40;
  // Fire when the deck's top clears the bottom ~15% of the viewport.
  const IO_MARGIN = '0px 0px -15% 0px';

  let decks = [];
  const initialised = new WeakSet();

  function init(scope) {
    if (typeof gsap === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const root = scope || document;
    const found = [];

    root.querySelectorAll('[data-deck]').forEach((wrap) => {
        found.push({ wrap, cards: Array.from(wrap.querySelectorAll('[data-deck-card]')) });
    });

    // Home results deck — legacy class-based hook (Webflow owns this markup).
    root.querySelectorAll('.zoku-home-results_cards').forEach((wrap) => {
        if (wrap.matches('[data-deck]')) return; // already collected above
        found.push({ wrap, cards: Array.from(wrap.querySelectorAll('.zoku-home-results_card')) });
    });

    found.forEach(({ wrap, cards }) => {
        if (cards.length === 0) return;
        if (initialised.has(wrap)) return;
        initialised.add(wrap);

        // Distance each card travels: resting spot → fully beyond the
        // viewport's right edge. Measured before any transform is applied.
        const offsets = cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return Math.max(0, window.innerWidth - rect.left) + OVERSHOOT;
        });

        cards.forEach((card, i) => {
            gsap.set(card, { x: offsets[i], willChange: 'transform' });
        });

        const deck = { wrap, cards, observer: null, tween: null };

        const reveal = () => {
            if (deck.observer) { deck.observer.disconnect(); deck.observer = null; }
            deck.tween = gsap.to(cards, {
                x: 0,
                duration: DURATION,
                ease: EASE,
                stagger: STAGGER,
                // Hand the cards back to the CSS once settled — no lingering
                // transform/will-change on the resting layout.
                onComplete: () => gsap.set(cards, { clearProps: 'transform,willChange' }),
            });
        };

        deck.observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) reveal();
        }, { rootMargin: IO_MARGIN });
        deck.observer.observe(wrap);

        decks.push(deck);
    });
  }

  function destroy() {
      decks.forEach((deck) => {
          initialised.delete(deck.wrap);
          if (deck.observer) deck.observer.disconnect();
          if (deck.tween) deck.tween.kill();
          gsap.set(deck.cards, { clearProps: 'transform,willChange' });
      });
      decks = [];
  }

  if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
  else init(document);
})();

/* ==== testimonials-slider.js ==== */
/*
 * "What our clients think" carousel — powered by Smooothy.
 * https://github.com/vallafederico/smooothy (UMD global: window.Smooothy, v0.0.35)
 *
 * Each `.zoku-testimonials-rail_track` marked with [data-testimonials-slider]
 * becomes a Smooothy slider (lerped drag, momentum, free-scroll). The `//DRAG`
 * pill trails the cursor while the pointer is inside the rail.
 *
 * One shared rAF loop drives every slider + pill, but it is KICK-AND-IDLE, not
 * always-on. It runs only while something is actually moving — a rail being
 * dragged/touched, a rail whose animated `current` has not yet caught its
 * `target`, or a pill easing toward the cursor — and stops itself (cancels the
 * frame) the moment everything has settled. Any input that can create motion
 * kicks it back to life: the pill's pointer handlers, wheel/trackpad scroll,
 * window resize, and an IntersectionObserver that fires when a rail scrolls
 * into view. This keeps the main thread idle on pages where the rail sits off
 * screen or untouched.
 *
 * Why the IntersectionObserver: Smooothy's own update() no-ops while its wrapper
 * is off screen (it self-gates on an internal IntersectionObserver — root:null,
 * rootMargin 50px, threshold 0). If we treated an off-screen, mid-transit rail as
 * "unsettled" the loop would spin forever making no progress, so we mirror that
 * same observer here: rails only count toward "still moving" while visible, and a
 * rail scrolling back into view re-kicks the loop so it finishes settling.
 *
 * Re-runnable for Barba navigation: init() builds the sliders for the current
 * <main>; destroy() cancels the rAF loop, disconnects the observer and tears
 * down the Smooothy instances (which self-bind window/drag listeners) so nothing
 * leaks across page swaps.
 *
 * Conventions: targets data-attributes for JS hooks, exits early when nothing is
 * present, and respects prefers-reduced-motion (near-instant settle, no fade).
 */
(function () {
    let sliders = [];   // { s, track, visible } — s is the Smooothy instance
    let cleanups = [];  // teardown for any window/element listeners we bind
    let io = null;      // IntersectionObserver gating the loop to on-screen rails
    let rafId = 0;

    function destroy() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (io) { io.disconnect(); io = null; }
        cleanups.forEach((fn) => fn());
        cleanups = [];
        sliders.forEach((r) => { if (r.s && typeof r.s.destroy === 'function') r.s.destroy(); });
        sliders = [];
    }

    function init(scope) {
        destroy(); // drop the previous page's sliders + rAF loop

        const tracks = (scope || document).querySelectorAll('[data-testimonials-slider]');
        if (!tracks.length) return;

        // Smooothy ships as a UMD bundle exposing window.Smooothy. Bail out
        // gracefully (native overflow keeps the cards reachable) if it failed to load.
        const Smooothy = window.Smooothy;
        if (typeof Smooothy !== 'function') return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Settled threshold for the loop's idle test, in Smooothy's slide-width
        // units (current/target are multiplied by the item width to reach pixels).
        // ~5e-4 of a card is well under a pixel for any realistic card width, so we
        // stop the loop only once the motion is visually complete.
        const SETTLE_EPS = 0.0005;

        const baseConfig = {
            infinite: false,
            // Free drag (no snap): a "drag to explore" bleed-rail, not a paginated
            // carousel — snapping would round back to slide 0 and spring the row back.
            snap: false,
            scrollInput: false, // drag + touch only — never hijack page scroll
            dragSensitivity: 0.0055,
            lerpFactor: reduceMotion ? 1 : 0.085,
            speedDecay: 0.85,
            bounceLimit: 0.08,
        };

        tracks.forEach((track) => {
            if (!track.children.length) return; // a slider needs at least one slide
            const s = new Smooothy(track, Object.assign({}, baseConfig, {
                // Stop the drag when the cards' trailing edge reaches the track's
                // content-box right edge: wrapperWidth (incl. left rail-inset + right
                // padding) minus both paddings = the content-box width = the exact
                // reachable end. Read live so it tracks the responsive inset on resize.
                setOffset: ({ wrapperWidth }) => {
                    const cs = window.getComputedStyle(track);
                    return wrapperWidth
                        - (parseFloat(cs.paddingLeft) || 0)
                        - (parseFloat(cs.paddingRight) || 0);
                },
            }));
            sliders.push({ s, track, visible: false });

            // Trackpad / mouse-wheel horizontal scroll moves the slider's target via
            // Smooothy's internal virtual-scroll (even with scrollInput:false it reads
            // deltaX) but fires no pointer event, so the pointer handlers below would
            // miss it — kick the loop on wheel too. Passive: we only start the loop,
            // never preventDefault.
            const onWheel = () => kick();
            track.addEventListener('wheel', onWheel, { passive: true });
            cleanups.push(() => track.removeEventListener('wheel', onWheel));
        });

        if (!sliders.length) return;

        // Mirror Smooothy's own visibility gate (root:null, rootMargin 50px,
        // threshold 0) so our "visible" window matches the one that decides whether
        // update() does anything. We (a) exclude off-screen rails from the settled
        // test — update() can't progress them, so treating them as busy would spin
        // the loop forever — and (b) re-kick when a rail scrolls back into view so a
        // rail frozen mid-transit finishes settling.
        const byTrack = new Map();
        sliders.forEach((rec) => byTrack.set(rec.track, rec));
        io = new IntersectionObserver((entries) => {
            let entered = false;
            entries.forEach((entry) => {
                const rec = byTrack.get(entry.target);
                if (!rec) return;
                rec.visible = entry.isIntersecting;
                if (entry.isIntersecting) entered = true;
            });
            if (entered) kick();
        }, { root: null, rootMargin: '50px', threshold: 0 });
        sliders.forEach((rec) => io.observe(rec.track));

        // --- //drag pill: fluid cursor trail ----------------------------------
        // The pill eases toward the cursor each frame (a gentle lag). The rAF loop
        // lerps its position; it fades in on enter, out on leave.
        const PILL_EASE = reduceMotion ? 1 : 0.14; // per-frame; lower = more trail
        const pills = [];
        (scope || document).querySelectorAll('.zoku-testimonials-rail_viewport').forEach((viewport) => {
            const pill = viewport.querySelector('.zoku-testimonials-rail_drag');
            if (!pill) return;

            // The pill is centred and press-scaled entirely through its CSS
            // `transform: translate(-50%,-50%) scale(var(--zoku-drag-scale,1))`.
            // Writing inline `transform` from JS would clobber both, so we position
            // it with the standalone CSS `translate` property, which composes on top
            // of `transform` (and, unlike left/top, stays on the compositor — no
            // per-frame layout). Zero the CSS left/top (they default to 50%/50%) so
            // `translate: x y` is measured from the viewport's top-left corner and
            // lands the pill's centre exactly at (x, y).
            pill.style.left = '0';
            pill.style.top = '0';

            const p = { pill, viewport, tx: 0, ty: 0, x: 0, y: 0, active: false };
            const setTarget = (e) => {
                const rect = viewport.getBoundingClientRect();
                p.tx = e.clientX - rect.left;
                p.ty = e.clientY - rect.top;
            };

            const onMove = (e) => { setTarget(e); kick(); };
            const onEnter = (e) => {
                setTarget(e);
                p.x = p.tx;
                p.y = p.ty; // snap on entry — no fly-in from a stale position
                pill.style.translate = p.x + 'px ' + p.y + 'px';
                p.active = true;
                pill.classList.add('is-visible');
                kick(); // start easing the pill toward the cursor
            };
            const onLeave = () => {
                p.active = false;
                pill.classList.remove('is-visible');
            };
            // Press the pill (shrink) the moment a drag begins on this rail. The
            // kick here also covers the drag itself starting the loop.
            const onDown = () => { pill.classList.add('is-pressed'); kick(); };

            viewport.addEventListener('pointerenter', onEnter);
            viewport.addEventListener('pointermove', onMove);
            viewport.addEventListener('pointerleave', onLeave);
            viewport.addEventListener('pointerdown', onDown);
            cleanups.push(() => {
                viewport.removeEventListener('pointerenter', onEnter);
                viewport.removeEventListener('pointermove', onMove);
                viewport.removeEventListener('pointerleave', onLeave);
                viewport.removeEventListener('pointerdown', onDown);
            });

            pills.push(p);
        });

        // Release every pressed pill on pointer up/cancel — bound to the window
        // so a release outside the rail (after dragging off it) still un-shrinks.
        // No kick needed here: a drag keeps the loop alive throughout (isDragging /
        // isTouching hold the settled test open every frame), and it keeps
        // re-queuing while |target − current| > eps, so the loop is already running
        // when the release lands and carries the post-release ease-back on its own.
        const releaseAll = () => pills.forEach((p) => p.pill.classList.remove('is-pressed'));
        window.addEventListener('pointerup', releaseAll);
        window.addEventListener('pointercancel', releaseAll);
        cleanups.push(() => {
            window.removeEventListener('pointerup', releaseAll);
            window.removeEventListener('pointercancel', releaseAll);
        });

        // Smooothy re-measures on resize (its own ResizeObserver); kick so any
        // re-settle after a layout change is applied, then the loop idles again.
        const onResize = () => kick();
        window.addEventListener('resize', onResize);
        cleanups.push(() => window.removeEventListener('resize', onResize));

        // Is anything still in motion? True while a pill is easing, or a *visible*
        // slider is being dragged/touched or has not yet eased to its target. Off-
        // screen sliders are skipped: update() no-ops there, so they can't progress
        // and must not hold the loop open (the observer re-kicks them on re-entry).
        function anyActive() {
            for (let i = 0; i < pills.length; i += 1) if (pills[i].active) return true;
            for (let i = 0; i < sliders.length; i += 1) {
                const rec = sliders[i];
                if (!rec.visible) continue;
                const s = rec.s;
                if (s.isDragging || s.isTouching || Math.abs(s.target - s.current) > SETTLE_EPS) return true;
            }
            return false;
        }

        // Single shared animation loop: drives every slider, then trails the pills,
        // then re-queues only while something is still moving — otherwise it stops
        // and waits for the next kick().
        function tick() {
            for (let i = 0; i < sliders.length; i += 1) sliders[i].s.update();
            for (let i = 0; i < pills.length; i += 1) {
                const p = pills[i];
                if (!p.active) continue; // freeze in place while fading out
                p.x += (p.tx - p.x) * PILL_EASE;
                p.y += (p.ty - p.y) * PILL_EASE;
                p.pill.style.translate = p.x + 'px ' + p.y + 'px';
            }
            rafId = anyActive() ? requestAnimationFrame(tick) : 0;
        }

        // Start the loop if it is not already running (idempotent).
        function kick() {
            if (!rafId) rafId = requestAnimationFrame(tick);
        }

        kick(); // initial layout settle; idles immediately if nothing needs moving
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();

/* ==== pullquote-cranes.js ==== */
/**
 * Pull-quote cranes — fade + stagger in on scroll.
 *
 * The decorative paper cranes (.zoku-pullquote_crane) behind the ventures
 * "own capital" pull-quote rest at opacity 0.2 with carefully-tuned per-crane
 * CSS transforms (scaleX(-1)/rotate/translate). As the pull-quote scrolls into
 * view each crane fades up from transparent to its resting opacity, staggered
 * so they settle in one after another.
 *
 * Opacity-only by design: a GSAP `y`/transform tween would clobber the bespoke
 * CSS transforms (and risk flipping cc-1's scaleX(-1) under matrix
 * decomposition), so we animate opacity alone and let CSS own placement.
 *
 * We pre-hide with gsap.set(opacity:0) and animate UP to each crane's resting
 * opacity with a gsap.to — NOT a gsap.from. A from-tween leaves the cranes
 * visible at rest until the trigger fires, then snaps them to 0 and fades back
 * in (a visible "flash out, then fade"). set→to means they only ever move
 * upward from transparent. The resting opacity is read from computed CSS (0.2)
 * so the value stays sourced from the stylesheet, not hardcoded. The deferred
 * script runs before the reader can scroll to this bottom-of-page section, so
 * the pre-hide lands without an on-load flash; a played `to` also survives the
 * ScrollTrigger.refresh Barba fires per swap (unlike a reverted from-tween).
 *
 * Registers with window.ZokuPage so it re-inits per Barba page swap and tears
 * down its ScrollTriggers on leave.
 */
(function () {
    let tween = null;

    function destroy() {
        if (tween) {
            if (tween.scrollTrigger) tween.scrollTrigger.kill();
            tween.kill();
            tween = null;
        }
    }

    function init(scope) {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const section = (scope || document).querySelector('.zoku-pullquote');
        if (!section) return;

        const cranes = section.querySelectorAll('.zoku-pullquote_crane');
        if (!cranes.length) return;

        // Idempotent re-init (defensive — destroy() runs first on navigation).
        destroy();

        // Reduced motion: leave the cranes at their resting opacity, no animation.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        gsap.registerPlugin(ScrollTrigger);

        // Read each crane's resting opacity from the stylesheet BEFORE pre-hiding,
        // clearing any inline opacity a prior (killed) instance left behind so the
        // computed value is the true CSS rest (0.2), not a stale 0.
        gsap.set(cranes, { clearProps: 'opacity' });
        const rest = Array.from(cranes).map(
            (c) => parseFloat(window.getComputedStyle(c).opacity) || 0.2
        );

        // Pre-hide, then fade up to the resting opacity when scrolled into view.
        gsap.set(cranes, { opacity: 0 });
        tween = gsap.to(cranes, {
            opacity: (i) => rest[i],
            duration: 0.8,
            ease: 'power2.out',
            stagger: 0.18,
            scrollTrigger: {
                trigger: section,
                start: 'top 80%',
                toggleActions: 'play none none none',
            },
        });
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
