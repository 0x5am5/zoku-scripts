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
