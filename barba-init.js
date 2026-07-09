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
 * The transition itself is the rising "pixel band": a ~3/4-viewport-tall cloud of
 * dark + brand-purple pixels that dissolves in from transparent and sweeps
 * bottom -> top while the next page is revealed underneath it (Barba `sync` keeps
 * both pages in the DOM at once). Honours prefers-reduced-motion (instant swap)
 * and degrades to ordinary navigation with no JS / no Barba.
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
     * The pinned tag below is stamped from the repo-root VERSION file by
     * build.sh — do NOT edit it by hand; bump VERSION and run ./build.sh. */
    const HALFTONE_URL = 'https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@v1.3.8/zoku-halftone.js';
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

    /* ── Rising pixel-band overlay ─────────────────────────────────────────── */
    const PIXEL = { desktop: 60, mobile: 42 }; // grid cell px
    const BAND_FRACTION = 0.75;                 // band height as a fraction of the viewport
    const DITHER_SHARP = 3.2;                   // per-pixel fade softness (lower = wider dissolve)
    const PURPLE_RATIO = 0.5;                   // ~half the pixels go brand purple
    const HUE = 272, SAT = 90;                  // brand purple (#c88dfb / #7c00e9)
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

    let overlay = null;
    let pixels = [];

    /** (Re)build the pixel grid sized to the current viewport, re-rolling colours. */
    const buildBand = () => {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'zoku-band';
            overlay.setAttribute('aria-hidden', 'true');
            document.body.appendChild(overlay);
        }
        const size = window.innerWidth < 480 ? PIXEL.mobile : PIXEL.desktop;
        const cols = Math.ceil(window.innerWidth / size);
        const rows = Math.ceil(window.innerHeight / size);
        overlay.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        overlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        overlay.textContent = '';

        pixels = [];
        const frag = document.createDocumentFragment();
        for (let r = 0; r < rows; r++) {
            const rowF = (r + 0.5) / rows;
            for (let c = 0; c < cols; c++) {
                const el = document.createElement('span');
                el.className = 'zoku-band_px';
                if (Math.random() < PURPLE_RATIO) {
                    const l = clamp(58 + (Math.random() * 40 - 20), 30, 88);
                    el.style.background = `hsl(${HUE} ${SAT}% ${l}%)`;
                }
                el.style.opacity = '0';
                frag.appendChild(el);
                // rand = this pixel's personal dissolve threshold, so pixels fade
                // in from transparent at different moments (no clean band edge).
                pixels.push({ el, rowF, rand: Math.random() });
            }
        }
        overlay.appendChild(frag);
    };

    /**
     * Position the band at normalised progress (0 = below the viewport, 1 = above
     * it). The incoming page sits in normal flow beneath everything; we reveal it
     * by clipping the frozen OUTGOING page away from the bottom up, tracking the
     * rising band centre — so the new page shows through underneath the band.
     */
    const setProgress = (p, oldEl, scrollY) => {
        const bh = BAND_FRACTION;
        const half = bh / 2;
        const cf = (1 + half) - p * (1 + bh); // band centre fraction travels up
        for (let i = 0; i < pixels.length; i++) {
            const px = pixels[i];
            const target = 1 - Math.abs(px.rowF - cf) / half; // density bell, 1 centre -> 0 edges
            const o = (target - px.rand) * DITHER_SHARP + 0.5; // per-pixel dithered fade
            px.el.style.opacity = (o < 0 ? 0 : o > 1 ? 1 : o).toFixed(3);
        }
        if (oldEl) {
            // Reveal the new page by clipping the frozen outgoing page along the
            // rising band centre. The clip MUST be expressed in viewport pixels, not
            // a percentage of the element: the frozen <main> is the full document
            // height (often many viewports tall), so a `bottom%` clip would track
            // the whole page, not the on-screen band — the reveal line would only
            // enter the viewport near the very end and the new page would "flash in".
            //
            // The element is `position:fixed; top:-scrollY`, so element-space y =
            // viewport y + scrollY. The band centre sits at viewport fraction `cf`,
            // i.e. element-space y = scrollY + cf * innerHeight. Keep everything
            // above that line; clip everything below it (revealing the new page).
            const vh = window.innerHeight;
            const revealY = (scrollY || 0) + cf * vh;
            oldEl.style.clipPath = `inset(0 0 calc(100% - ${revealY.toFixed(1)}px) 0)`;
        }
    };

    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    /** Run one bottom -> top sweep; resolves once the band has left the top. */
    const runBand = (opts) => {
        opts = opts || {};
        const duration = opts.duration || 1100;
        const oldEl = opts.oldEl || null;
        const scrollY = opts.scrollY || 0;
        return new Promise((resolve) => {
            buildBand();
            overlay.style.display = 'grid';

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
                // flash the outgoing page back over the new one). Barba removes it.
                setProgress(1, oldEl, scrollY);
                overlay.style.display = 'none';
                resolve();
            };

            if (prefersReduced) {
                finish();
                return;
            }

            setProgress(0, oldEl, scrollY);
            const start = performance.now();
            const frame = (now) => {
                if (settled) return;
                let t = (now - start) / duration;
                if (t > 1) t = 1;
                setProgress(easeInOutCubic(t), oldEl, scrollY);
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
     * and write it onto the live footer. Target the attribute DIRECTLY via
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
                    // The incoming page is already in normal flow (Barba inserted it).
                    // Reset the window to the top so it shows its hero; because it never
                    // leaves flow, the scroll stays here — no restoration race, no jump.
                    window.scrollTo(0, 0);
                    if (current) {
                        // Freeze the outgoing page over it (z below the nav at 50) and
                        // dissolve it away from the bottom up to reveal the new page.
                        // It ends fully clipped (invisible); Barba then removes it.
                        freeze(current, 40, scrollY);
                        await runBand({ oldEl: current, duration: 1100, scrollY });
                    } else {
                        await runBand({ duration: 1100 });
                    }
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
            forceManualScroll(); // before the browser's async restore can fire
            window.scrollTo(0, 0);
            // Update the persistent footer BEFORE initPage: nav-theme.refresh()
            // (inside initPage) probes the footer's background to colour the nav,
            // so the footer must already hold the new page's variant.
            syncFooter(data.next.html);
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

        // First page load — Barba does not run a transition for it.
        initPage(document);
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
