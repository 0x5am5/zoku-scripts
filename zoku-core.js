/* zoku-core.js — generated bundle from: barba-init nav-menu nav-theme canvas-theme hero-intro pillars portfolio filter card-deck testimonials-slider process-scroll pullquote-cranes. Do not edit directly; edit the source modules and run ./build.sh. */

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
    const HALFTONE_URL = 'https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@v1.3.13/zoku-halftone.js';
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
 *      their own — and the menu links rise + fade in sync with the reveal.
 *   3. Once the list has finished, the footer items stagger in the same way.
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

        // Everything kicks off right as the panel starts sliding in (the slide
        // is ~0.8s) — the eyebrow leads by a hair, then the rail/list follow,
        // overlapping it. Keep these small so the motion plays DURING the slide,
        // not after it settles.
        const t0 = 0;             // eyebrow leads, as the panel slides out
        const eyebrowDur = 0.35;  // "// contents" rises + fades in first
        const reveal = 0.37;      // rail mask + list begin — unchanged from when
                                  // the rail track started its draw (0.15 + 0.4 − 0.18)
        const railDraw = 0.4;     // mask reveals top → bottom (fast — fits inside the panel slide-in)
        const itemDur = 0.5;
        const listStagger = 0.08; // halved with railDraw so the list stays in sync with the rail
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
            tl.fromTo(listItems,
                { opacity: 0, y: 28 },
                { opacity: 1, y: 0, duration: itemDur, ease: 'power3.out', stagger: listStagger }, reveal);
        }

        // 3. Footer items stagger in once the list has finished.
        if (footerItems.length) {
            tl.fromTo(footerItems,
                { opacity: 0, y: 28 },
                { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.1 }, listEnd - footerOverlap);
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

        // Reset the entrance so the next open replays from the start. Clearing
        // the inline props GSAP wrote restores the resting (visible) state once
        // the panel has slid away. (The progress segment is deliberately NOT
        // cleared — its inline top/height/display come from positionProgress,
        // not GSAP, and are recomputed on every open.)
        if (intro) {
            intro.kill();
            intro = null;
            if (gsap) gsap.set([eyebrow, railMask, ...listItems, ...footerItems].filter(Boolean), { clearProps: 'all' });
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
        if (!current) return;

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
 * Hero intro — home page load animation.
 *
 * Staggers the home hero headline lines and the "Learn more" CTA into view on
 * page load: each rises on the Y axis while fading in, matching the nav menu's
 * entrance feel (opacity 0 → 1, y 28 → 0, power3.out).
 *
 * Markup contract (index.html):
 *   [data-hero-intro]               — the headline wrapper
 *     [data-hero-line]  ×2          — the two headline lines (staggered first)
 *     [data-hero-cta]               — the "Learn more" button (last)
 *
 * The lines/CTA are pre-hidden in CSS (gated on .zoku-js, see styles.css) to
 * avoid a flash before this script runs. Targets data attributes, never
 * classes, and bails out early when the hero or GSAP is absent.
 */
(function () {
    function init(scope) {
        const root = scope || document;
        const hero = root.querySelector('[data-hero-intro]');
        if (!hero) return;

        // Ordered targets: the two lines first, then the CTA.
        const targets = [
            ...hero.querySelectorAll('[data-hero-line]'),
            ...hero.querySelectorAll('[data-hero-cta]'),
        ];
        if (!targets.length) return;

        const gsap = window.gsap;
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // No GSAP or reduced motion: reveal immediately, no animation. (CSS already
        // shows them under reduced-motion, but clear inline state defensively.)
        if (!gsap || prefersReduced) {
            targets.forEach((el) => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            return;
        }

        gsap.fromTo(
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
            }
        );
    }

    if (window.ZokuPage) window.ZokuPage.register({ init });
    else init(document);
})();

/* ==== pillars.js ==== */
(function () {
    let mm = null;          // gsap.matchMedia() for the pinned card deck (desktop + mobile)
    let ledeTween = null;   // the lede fade-in (carries its own ScrollTrigger)

    function destroy() {
        if (ledeTween) {
            if (ledeTween.scrollTrigger) ledeTween.scrollTrigger.kill();
            ledeTween.kill();
            ledeTween = null;
        }
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
        // reveal. Previously a from-tween with immediateRender:false left it at
        // its natural opacity:1 until the `top 75%` trigger fired — so it was
        // seen plainly as it scrolled up into view, then snapped to 0 and faded
        // back in (a visible flash). A CSS pre-hide removes that window, exactly
        // like the hero intro.
        //
        // With the pre-hide in place we must drive it with a fromTo to an
        // EXPLICIT opacity:1 end (a from-tween would animate 0 → 0 against the
        // CSS-hidden natural state). immediateRender:false keeps GSAP from
        // writing the "from" values at creation, so the CSS hidden state holds
        // until the tween actually plays; toggleActions (no `once`) lets
        // ScrollTrigger re-sync on every refresh — including the refresh the
        // deck pin below and each Barba swap force — so it self-heals.
        //
        // Clear any inline opacity/transform a prior (killed) instance left on
        // the lede so it falls back to the CSS pre-hide, not a stale inline 0.
        if (lede && !reduceMotion) {
            gsap.set(lede, { clearProps: 'opacity,transform' });
            ledeTween = gsap.fromTo(lede,
                { opacity: 0, y: 32 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.9,
                    ease: 'power2.out',
                    immediateRender: false,
                    scrollTrigger: {
                        trigger: section,
                        start: 'top 75%',
                        toggleActions: 'play none none none',
                    },
                });
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
            const intro = gsap.to(cardOne, {
                yPercent: 0,
                opacity: 1,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: pinTarget,
                    start: 'top 75%',
                    end: () => 'top top+=' + navHeight(),
                    scrub: 0.6,
                    invalidateOnRefresh: true,
                },
            });

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
            tl.to(cardTwo, { yPercent: 0, opacity: 1, duration: 0.7 }, 0.15);
            tl.fromTo(cardOne,
                { yPercent: 0, scale: 1, opacity: 1 },
                { yPercent: -8, scale: 0.94, opacity: 0.5, duration: 0.7, immediateRender: false }, 0.15);

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

        // Mobile / tablet (≤991px): the layout is stacked, so the lede scrolls away
        // normally and only the cards container is pinned (not the whole section).
        // Two phases so card one animates IN without leaving a tall empty box to
        // scroll past:
        //   1. As the cards box scrolls up into view (bottom → top), card one deals
        //      in — landing by the HALFWAY point of that travel, so it is visibly
        //      gliding while the box crosses the lower quarter of the screen (a
        //      full-travel scrub kept it below the fold / transparent until the box
        //      was nearly at the top). Card two then starts rising behind it, its
        //      frosted glass already overlapping card one before the pin engages.
        //   2. The box pins at the top and card two finishes its rise over card one,
        //      pushing it back into the dimmed shade.
        mm.add('(max-width: 991px) and (prefers-reduced-motion: no-preference)', () => {
            const stage = section.querySelector('.zoku-home-pillars_cards');
            if (!stage) return;

            stage.classList.add('cc-deck');
            gsap.set([cardOne, cardTwo], hidden);

            // Phase 1 — card one lands by 50% of the approach; card two rises to
            // yPercent 60 (frost over card one's lower band) across the second half.
            const intro = gsap.timeline({
                defaults: { ease: 'power3.out' },
                scrollTrigger: {
                    trigger: stage,
                    start: 'top bottom',
                    end: () => 'top top+=' + navHeight(),
                    scrub: 0.6,
                    invalidateOnRefresh: true,
                },
            });
            intro.to(cardOne, { yPercent: 0, opacity: 1, duration: 0.5 }, 0);
            intro.to(cardTwo, { yPercent: 60, opacity: 1, duration: 0.5 }, 0.5);

            // Phase 2 — pin the cards at the top; card two completes its deal-in
            // over card one, which is pushed back. fromTos with immediateRender:false
            // and explicit starts matching phase 1's end values, so the handoff at
            // the pin point is seamless in both scroll directions.
            const deck = gsap.timeline({
                defaults: { ease: 'power3.out' },
                scrollTrigger: {
                    trigger: stage,
                    start: () => 'top top+=' + navHeight(),
                    end: '+=50%',
                    scrub: 0.6,
                    pin: stage,
                    pinSpacing: true,
                    // No anticipatePin — see the desktop deck above: it pins early
                    // by scroll velocity and jolts the content up rather than
                    // freezing it in place.
                    invalidateOnRefresh: true,
                },
            });
            deck.fromTo(cardTwo,
                { yPercent: 60, opacity: 1 },
                { yPercent: 0, duration: 0.5, immediateRender: false }, 0);
            deck.fromTo(cardOne,
                { yPercent: 0, scale: 1, opacity: 1 },
                { yPercent: -8, scale: 0.94, opacity: 0.5, duration: 0.5, immediateRender: false }, 0);

            return () => {
                if (intro.scrollTrigger) intro.scrollTrigger.kill();
                intro.kill();
                stage.classList.remove('cc-deck');
                gsap.set([cardOne, cardTwo], { clearProps: 'all' });
            };
        });
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

    // Resting rotation of the open panel — the card sits straight.
    const REST_ROTATION = 0;

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

    // The open panel gently trails the pointer, magnetically, capped at this
    // many px on each axis so the follow stays subtle.
    const MAGNET_MAX = 50;

    // On top of the follow, the panel rotates a touch counter-clockwise as the
    // pointer moves right across the section — capped so the nudge stays subtle.
    const ROTATE_MAX = 5;

    scopes.forEach((scope) => {
        const items = Array.from(scope.querySelectorAll('.zoku-portfolio-item'))
            .filter((el) => !el.classList.contains('cc-static'));
        if (!items.length) return;

        const useMotion = !prefersReducedMotion && hasGsap;

        // The currently open panel and its pointer-follow tweens. quickTo gives
        // us a re-triggerable eased tween per axis, which is what makes the
        // follow feel smooth/magnetic rather than snapping to the cursor.
        let activePanel = null;
        let followX = null;
        let followY = null;
        let followRot = null;

        // Slide the panel up from below as it fades in, settling flat.
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

            // Reveal slides on yPercent so the magnetic offset (x/y in px) owns
            // a separate transform channel and the two never fight.
            window.gsap.fromTo(panel,
                { yPercent: 40, rotation: REST_ROTATION, opacity: 0, transformOrigin: '50% 50%' },
                { yPercent: 0, rotation: REST_ROTATION, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );

            // Clear any leftover offset from a previous open, then point the
            // follow tweens at this panel.
            window.gsap.set(panel, { x: 0, y: 0, rotation: REST_ROTATION });
            activePanel = panel;
            followX = window.gsap.quickTo(panel, 'x', { duration: 0.6, ease: 'power3.out' });
            followY = window.gsap.quickTo(panel, 'y', { duration: 0.6, ease: 'power3.out' });
            followRot = window.gsap.quickTo(panel, 'rotation', { duration: 0.6, ease: 'power3.out' });
        };

        // Magnetic pointer-follow: map the cursor's position within the section
        // to a small offset (±MAGNET_MAX) and ease the open panel toward it.
        if (useMotion) {
            const clamp = (v) => Math.max(-1, Math.min(1, v));
            const refEl = scope.getBoundingClientRect ? scope : document.documentElement;
            scope.addEventListener('mousemove', (e) => {
                if (!activePanel || !followX) return;
                const rect = refEl.getBoundingClientRect();
                const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
                const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
                followX(clamp(nx) * MAGNET_MAX);
                followY(clamp(ny) * MAGNET_MAX);
                // Pointer right of centre (nx > 0) winds the panel
                // counter-clockwise off its resting angle; left of centre eases it back.
                if (followRot) followRot(REST_ROTATION - clamp(nx) * ROTATE_MAX);
            });
            scope.addEventListener('mouseleave', () => {
                if (followX) { followX(0); followY(0); }
                if (followRot) followRot(REST_ROTATION);
            });
        }

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
                setActive(i);
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
 * Card deck — bouncy hover-repel interaction for a cluster of cards.
 *
 * On hovering a card the others spring away from it along their radial vector
 * while the hovered card lifts forward (scales up, straightens, raised z-index).
 * Everything eases with a soft overshoot for a fluid, bouncy feel. Ported from
 * the home "results" deck and reused across the site.
 *
 * This single module now drives BOTH the generic data-attribute decks AND the
 * home results deck (via a legacy class-based shim — see init() below), so the
 * two never drift apart. Each deck can carry its own feel (repel distance,
 * spread/reset easing, disable breakpoint) via a per-deck options object.
 *
 * Markup contract (data attributes only — never classes, per project JS rules):
 *   <div data-deck>
 *     <article data-deck-card>…</article>   ← one per card
 *   </div>
 * Multiple decks per page are supported. Each card's *resting* transform
 * (rotation + translate from CSS — e.g. the fanned catalyse cards) is read from
 * computed style at init, so no per-card config is needed; GSAP animates
 * relative to that base and returns to it on reset.
 *
 * Optional per-deck overrides via data attributes on the [data-deck] wrapper:
 *   data-deck-repel, data-deck-spread-duration, data-deck-spread-ease,
 *   data-deck-reset-duration, data-deck-reset-ease, data-deck-min-width-disabled.
 * Numeric ones fall back to the default if not a finite number.
 *
 * Early-exits globally on reduced-motion; the mobile disable breakpoint is now
 * per-deck (default ≤767px, results ≤991px) so it is checked inside each deck.
 */
(function () {
  // Default deck feel — matches the original generic card-deck behaviour.
  const DEFAULTS = {
    repel: 64,                      // px — how far siblings ease away from the hovered card
    spreadDuration: 0.4,
    spreadEase: 'back.out(1.7)',
    resetDuration: 0.4,
    resetEase: 'power3.out',
    minWidthDisabled: 767,          // px — decks flatten at/below this width
  };

  // Shared across every deck — never varied per deck.
  const LIFT = -16;                 // px — how far the hovered card rises (added to its base y)
  const HOVER_SCALE = 1.05;
  const SIBLING_SCALE = 0.97;

  function init(scope) {
    if (typeof gsap === 'undefined') return;
    // Reduced-motion is a global opt-out — no deck animates. (The mobile
    // breakpoint is now per-deck, so it is checked inside initDeck.)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = scope || document;

    // Generic data-attribute decks. Options are read leniently off the wrapper,
    // falling back to DEFAULTS (see readOptions).
    root.querySelectorAll('[data-deck]').forEach((wrap) => {
        initDeck(wrap, '[data-deck-card]', readOptions(wrap));
    });

    // Home results deck — legacy class-based hook. This markup lives in Webflow,
    // which owns it and CANNOT be given data attributes from this repo, so we
    // wire it by its own structural classes instead. Any results cards wrap not
    // already promoted to a [data-deck] is initialised with the results preset.
    // (The old results.js hardcoded a rotation table `[-4.59, 0, 3.88, 0, 0]`;
    // that was dropped in favour of readBase() reading each card's resting
    // rotation from computed style — the CSS owns the fan tilt, so it yields the
    // same values and stays correct if the fan ever changes.)
    root.querySelectorAll('.zoku-home-results_cards').forEach((wrap) => {
        if (wrap.matches('[data-deck]')) return; // already handled above
        initDeck(wrap, '.zoku-home-results_card', {
            repel: 56,
            spreadDuration: 0.7,
            spreadEase: 'back.out(1.7)',
            resetDuration: 0.85,
            resetEase: 'elastic.out(1, 0.65)',
            minWidthDisabled: 991,
        });
    });
  }

  // Read per-deck overrides from data attributes, falling back to DEFAULTS.
  // Numeric values are validated with Number.isFinite (house pattern — see
  // scroll-scrub.js `marginAttr`); missing/blank string easing keeps the default.
  function readOptions(wrap) {
    const num = (attr, fallback) => {
        const v = parseFloat(wrap.getAttribute(attr));
        return Number.isFinite(v) ? v : fallback;
    };
    const str = (attr, fallback) => {
        const v = wrap.getAttribute(attr);
        return v && v.trim() ? v.trim() : fallback;
    };
    return {
        repel: num('data-deck-repel', DEFAULTS.repel),
        spreadDuration: num('data-deck-spread-duration', DEFAULTS.spreadDuration),
        spreadEase: str('data-deck-spread-ease', DEFAULTS.spreadEase),
        resetDuration: num('data-deck-reset-duration', DEFAULTS.resetDuration),
        resetEase: str('data-deck-reset-ease', DEFAULTS.resetEase),
        minWidthDisabled: num('data-deck-min-width-disabled', DEFAULTS.minWidthDisabled),
    };
  }

  // Decompose a computed `transform` matrix into the resting rotation/offset so
  // GSAP can animate relative to whatever tilt/translate the CSS gave the card.
  function readBase(el) {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return { x: 0, y: 0, rotation: 0 };
      const m = t.match(/matrix\(([^)]+)\)/);
      if (!m) return { x: 0, y: 0, rotation: 0 };
      const [a, b, , , tx, ty] = m[1].split(',').map(parseFloat);
      return {
          x: tx,
          y: ty,
          rotation: Math.round(Math.atan2(b, a) * (180 / Math.PI) * 100) / 100,
      };
  }

  function initDeck(wrap, cardSelector, opts) {
      const options = { ...DEFAULTS, ...opts };

      // Hover-repel is desktop + tablet only — disabled below this deck's
      // breakpoint where the grid stacks/scrolls with no resting fan to repel.
      if (window.matchMedia(`(max-width: ${options.minWidthDisabled}px)`).matches) return;

      const cards = Array.from(wrap.querySelectorAll(cardSelector));
      if (cards.length === 0) return;

      // Capture resting transform + untransformed layout centre per card before
      // GSAP touches anything (transforms don't affect offsetLeft/Top, so the
      // repel vector stays stable regardless of the live transform).
      const bases = cards.map((card) => {
          const base = readBase(card);
          base.cx = card.offsetLeft + card.offsetWidth / 2;
          base.cy = card.offsetTop + card.offsetHeight / 2;
          return base;
      });

      cards.forEach((card, i) => {
          gsap.set(card, {
              x: bases[i].x,
              y: bases[i].y,
              rotation: bases[i].rotation,
              transformOrigin: '50% 50%',
              willChange: 'transform',
              zIndex: i + 1,
          });
      });

      const spreadTo = (card, vars) =>
          gsap.to(card, { duration: options.spreadDuration, ease: options.spreadEase, overwrite: 'auto', ...vars });

      function focus(activeIndex) {
          const active = bases[activeIndex];

          cards.forEach((card, i) => {
              const base = bases[i];

              if (i === activeIndex) {
                  gsap.set(card, { zIndex: 50 });
                  spreadTo(card, { x: base.x, y: base.y + LIFT, rotation: 0, scale: HOVER_SCALE });
                  return;
              }

              // Push this sibling away along the vector from the hovered card.
              let dx = base.cx - active.cx;
              let dy = base.cy - active.cy;
              const dist = Math.hypot(dx, dy) || 1;
              dx /= dist;
              dy /= dist;

              gsap.set(card, { zIndex: i + 1 });
              spreadTo(card, {
                  x: base.x + dx * options.repel,
                  y: base.y + dy * options.repel * 0.55,
                  rotation: base.rotation + dx * 2,
                  scale: SIBLING_SCALE,
              });
          });
      }

      function reset() {
          // Note: z-index is intentionally left untouched here — the last-hovered
          // card keeps its raised stacking at rest (otherwise it would snap back
          // behind overlapping siblings and "jump"). focus() reassigns every
          // card's z-index on the next hover, so this stays consistent.
          cards.forEach((card, i) => {
              gsap.to(card, {
                  x: bases[i].x,
                  y: bases[i].y,
                  rotation: bases[i].rotation,
                  scale: 1,
                  duration: options.resetDuration,
                  ease: options.resetEase,
                  overwrite: 'auto',
              });
          });
      }

      cards.forEach((card, i) => {
          card.addEventListener('mouseenter', () => focus(i));
      });

      // Reset when the cursor leaves the whole cluster (lets the pointer glide
      // between overlapping cards without snapping back mid-move).
      wrap.addEventListener('mouseleave', reset);
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();

/* ==== testimonials-slider.js ==== */
/*
 * "What our clients think" carousel — powered by Smooothy.
 * https://github.com/vallafederico/smooothy (UMD global: window.Smooothy)
 *
 * Each `.zoku-testimonials-rail_track` marked with [data-testimonials-slider]
 * becomes a Smooothy slider (lerped drag, momentum, free-scroll). The `//DRAG`
 * pill trails the cursor while the pointer is inside the rail. One shared rAF
 * loop drives every slider + pill.
 *
 * Re-runnable for Barba navigation: init() builds the sliders for the current
 * <main>; destroy() cancels the rAF loop and tears down the Smooothy instances
 * (which self-bind window/drag listeners) so nothing leaks across page swaps.
 *
 * Conventions: targets data-attributes for JS hooks, exits early when nothing is
 * present, and respects prefers-reduced-motion (near-instant settle, no fade).
 */
(function () {
    let sliders = [];
    let cleanups = []; // teardown for any window/element listeners we bind
    let rafId = 0;

    function destroy() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        cleanups.forEach((fn) => fn());
        cleanups = [];
        sliders.forEach((s) => { if (s && typeof s.destroy === 'function') s.destroy(); });
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
            sliders.push(new Smooothy(track, Object.assign({}, baseConfig, {
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
            })));
        });

        if (!sliders.length) return;

        // --- //drag pill: fluid cursor trail ----------------------------------
        // The pill eases toward the cursor each frame (a gentle lag). left/top carry
        // no CSS transition; the rAF loop lerps them. Fades in on enter, out on leave.
        const PILL_EASE = reduceMotion ? 1 : 0.14; // per-frame; lower = more trail
        const pills = [];
        (scope || document).querySelectorAll('.zoku-testimonials-rail_viewport').forEach((viewport) => {
            const pill = viewport.querySelector('.zoku-testimonials-rail_drag');
            if (!pill) return;

            const s = { pill, viewport, tx: 0, ty: 0, x: 0, y: 0, active: false };
            const setTarget = (e) => {
                const rect = viewport.getBoundingClientRect();
                s.tx = e.clientX - rect.left;
                s.ty = e.clientY - rect.top;
            };

            const onEnter = (e) => {
                setTarget(e);
                s.x = s.tx;
                s.y = s.ty; // snap on entry — no fly-in from a stale position
                pill.style.left = s.x + 'px';
                pill.style.top = s.y + 'px';
                s.active = true;
                pill.classList.add('is-visible');
            };
            const onLeave = () => {
                s.active = false;
                pill.classList.remove('is-visible');
            };
            // Press the pill (shrink) the moment a drag begins on this rail.
            const onDown = () => pill.classList.add('is-pressed');

            viewport.addEventListener('pointerenter', onEnter);
            viewport.addEventListener('pointermove', setTarget);
            viewport.addEventListener('pointerleave', onLeave);
            viewport.addEventListener('pointerdown', onDown);
            cleanups.push(() => {
                viewport.removeEventListener('pointerenter', onEnter);
                viewport.removeEventListener('pointermove', setTarget);
                viewport.removeEventListener('pointerleave', onLeave);
                viewport.removeEventListener('pointerdown', onDown);
            });

            pills.push(s);
        });

        // Release every pressed pill on pointer up/cancel — bound to the window
        // so a release outside the rail (after dragging off it) still un-shrinks.
        const releaseAll = () => pills.forEach((s) => s.pill.classList.remove('is-pressed'));
        window.addEventListener('pointerup', releaseAll);
        window.addEventListener('pointercancel', releaseAll);
        cleanups.push(() => {
            window.removeEventListener('pointerup', releaseAll);
            window.removeEventListener('pointercancel', releaseAll);
        });

        // Single shared animation loop: drives every slider, then trails the pills.
        function tick() {
            for (let i = 0; i < sliders.length; i += 1) sliders[i].update();
            for (let i = 0; i < pills.length; i += 1) {
                const s = pills[i];
                if (!s.active) continue; // freeze in place while fading out
                s.x += (s.tx - s.x) * PILL_EASE;
                s.y += (s.ty - s.y) * PILL_EASE;
                s.pill.style.left = s.x + 'px';
                s.pill.style.top = s.y + 'px';
            }
            rafId = requestAnimationFrame(tick);
        }
        rafId = requestAnimationFrame(tick);
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();

/* ==== process-scroll.js ==== */
(function () {
    // Scroll-driven "how it works" step reveal. As the reader scrolls, a single
    // step becomes active — its title brightens and its body is revealed (others
    // drop to a muted opacity with their bodies hidden) and the purple rail
    // segment slides to highlight it. Mirrors the anchor logic in portfolio.js.

    // Track the window listeners bound per section so they can be removed when the
    // page is swapped out (Barba navigation) — otherwise they'd accumulate and
    // keep reading detached, removed DOM.
    let handlers = [];
    // ResizeObservers watching each section's steps, so the rail re-fits the open
    // step whenever its height changes after activation (body reveal reflow,
    // late-loading images/fonts) — a scroll event isn't guaranteed for those.
    let observers = [];

    function destroy() {
        handlers.forEach((onScroll) => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        });
        handlers = [];
        observers.forEach((ro) => ro.disconnect());
        observers = [];
    }

    function init(scope) {
        destroy(); // drop any listeners from the previous page

        const sections = (scope || document).querySelectorAll('[data-component="process-scroll"]');
        if (!sections.length) return;

        // The global nav is sticky, so the usable reading area starts below it.
        const nav = document.querySelector('.zoku-nav');
        const getNavHeight = () => (nav ? nav.getBoundingClientRect().height : 0);

        sections.forEach((section) => {
            const steps = Array.from(section.querySelectorAll('[data-process-step]'));
            if (!steps.length) return;

            const rail = section.querySelector('[data-process-rail]');
            const progress = section.querySelector('[data-process-rail-progress]');

            // Flag the root so the muted body/logos hide only when JS is driving it,
            // keeping all content visible as a no-JS fallback.
            section.classList.add('is-scrollspy');

            let active = -1;

            const positionRail = (idx) => {
                if (!rail || !progress) return;
                const railRect = rail.getBoundingClientRect();
                const stepRect = steps[idx].getBoundingClientRect();
                // Divided steps carry padding-top (it centres their divider in the
                // list gap) and that padding is INSIDE the measured rect — without
                // trimming it the purple segment reaches up past the gap to the
                // divider instead of hugging the step's visible content.
                const style = getComputedStyle(steps[idx]);
                const padTop = parseFloat(style.paddingTop) || 0;
                const padBottom = parseFloat(style.paddingBottom) || 0;
                progress.style.setProperty('--zoku-process-progress-offset', (stepRect.top + padTop - railRect.top) + 'px');
                progress.style.setProperty('--zoku-process-progress-height', (stepRect.height - padTop - padBottom) + 'px');
            };

            const setActive = (idx) => {
                if (idx !== active) {
                    active = idx;
                    // cc-active on the open step is the single source of truth; the
                    // whole reveal (index/title dim, body + logos/list collapse on the
                    // others) cascades from it in CSS via `.is-scrollspy [data-process-
                    // step]:not(.cc-active)` descendant rules. The dimming lands on the
                    // leaves, never on the step: opacity < 1 on the step would composite
                    // its subtree offscreen and iOS Safari can paint that layer stale
                    // mid-scroll (a ghost of the title at its pre-reflow position).
                    steps.forEach((step, i) => step.classList.toggle('cc-active', i === idx));
                }
                positionRail(idx);
            };

            let ticking = false;
            const syncToScroll = () => {
                ticking = false;
                // Anchor sits 45% of the way down the area beneath the nav, so a step
                // activates once it clears the nav and reaches the reading line.
                const navHeight = getNavHeight();
                const anchor = navHeight + (window.innerHeight - navHeight) * 0.45;
                let next = 0;
                for (let i = 0; i < steps.length; i++) {
                    if (steps[i].getBoundingClientRect().top <= anchor) next = i;
                }
                setActive(next);
            };

            const onScroll = () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(syncToScroll);
            };

            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll);
            handlers.push(onScroll);

            // Re-fit the rail to the open step whenever its height changes without
            // a scroll (body reveal reflow, images/fonts loading in). Only the
            // active step's height feeds the rail, so re-position against it.
            if (typeof ResizeObserver === 'function') {
                const ro = new ResizeObserver(() => {
                    if (active !== -1) positionRail(active);
                    // A step's body reveal/collapse changes this section's height,
                    // which shifts everything below it in the document. Let scroll-
                    // scrub re-cache its track offsets so the halftone sprite stays
                    // calibrated after the reflow instead of jolting mid-scroll.
                    window.dispatchEvent(new Event('zoku:layout'));
                });
                steps.forEach((step) => ro.observe(step));
                observers.push(ro);
            }

            syncToScroll();
        });
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
