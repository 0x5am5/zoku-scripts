/* zoku-core.js — generated bundle from: barba-init nav-menu nav-theme hero-intro results pillars portfolio card-deck testimonials-slider process-scroll pullquote-cranes. Do not edit directly; edit the source modules and run ./build.sh. */

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
     * subsequent swap goes through the normal initAll() path. */
    const HALFTONE_URL = 'https://cdn.jsdelivr.net/gh/0x5am5/zoku-scripts@v1.1.1/zoku-halftone.js';
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
            initPage(data.next.container);
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
 * ([data-nav-menu]). Toggles the [open] attribute (CSS owns the panel/scrim
 * slide), keeps aria state in sync, locks body scroll, closes on scrim/close
 * button click or Escape, and restores focus to the trigger on close.
 *
 * On open, a GSAP timeline staggers the drawer contents in this order:
 *   1. The "// contents" eyebrow rises + fades in first (on its own).
 *   2. Overlapping the tail of (1): the purple rail-progress segment rises from
 *      the bottom of the rail to rest beside the current page's link, the dim
 *      rail-track draws downward (top→bottom), and the menu links rise + fade in
 *      so each appears as the rail passes its position.
 *   3. Once the list has finished, the footer items stagger in the same way.
 *
 * The rail spans the links only — the eyebrow sits above it. The purple
 * progress segment is shown ONLY when a menu link is the current page: it is
 * positioned next to the .cc-current link on open and animates in beside it.
 * When no link is current (e.g. the home page, which isn't a menu entry) the
 * segment is hidden entirely and never animates. This runs independent of GSAP
 * so the placement/hiding holds under prefers-reduced-motion too.
 *
 * GSAP is optional — without it (or under prefers-reduced-motion) the content
 * is simply shown with no animation (nothing is hidden in CSS).
 */
(function () {
    const toggle = document.querySelector('[data-nav-toggle]');
    const menu = document.querySelector('[data-nav-menu]');
    if (!toggle || !menu) return;

    const panel = menu.querySelector('.zoku-menu_panel');
    const scrim = menu.querySelector('.zoku-menu_scrim');
    const closers = menu.querySelectorAll('[data-nav-close]');
    let lastFocus = null;

    // Elements whose CSS transitions must be bypassed for an instant close.
    const flowEls = () => [menu, scrim, panel].filter(Boolean);
    // Drop any inline transition:none left behind by an instant close (notably
    // after a bfcache cycle cancels the clean-up rAF) so the next open animates.
    const clearInstantOverride = () => flowEls().forEach((el) => { el.style.transition = ''; });

    /* ---- Staged content entrance (GSAP) ------------------------------- */
    const gsap = window.gsap;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !!gsap && !prefersReduced;

    const eyebrow = menu.querySelector('.zoku-menu_eyebrow');
    const railTrack = menu.querySelector('.zoku-menu_rail-track');
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
     * segment is hidden entirely — there is no section to mark. Returns the
     * resting `top` offset within the rail, or null when nothing is current
     * (which the intro reads as "no progress to animate in").
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

        // Measure the rail now the panel is laid out, and place the progress
        // segment so it rises to rest beside the current link.
        const restingTop = positionProgress();
        const railH = progress && progress.parentElement
            ? progress.parentElement.getBoundingClientRect().height
            : 0;
        const progH = progress ? progress.getBoundingClientRect().height : 0;

        // Everything kicks off right as the panel starts sliding in (the slide
        // is ~0.8s) — the eyebrow leads by a hair, then the rail/list follow,
        // overlapping it. Keep these small so the motion plays DURING the slide,
        // not after it settles.
        const t0 = 0;             // eyebrow leads, as the panel slides out
        const eyebrowDur = 0.35;  // "// contents" rises + fades in first
        const lead = 0.15;        // the rail/progress begin just after the eyebrow
        const bStart = lead;
        const riseDur = 0.4;      // progress: bottom → resting spot
        const stageOverlap = 0.18; // each stage starts a touch before the prior ends
        const reveal = bStart + riseDur - stageOverlap; // rail/list begin (~0.37s in)
        const railDraw = 0.4;     // track draws top → bottom (fast — fits inside the panel slide-in)
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

        // 2. Progress rises from the bottom of the rail to rest beside the link.
        if (progress && restingTop !== null) {
            tl.fromTo(progress,
                { y: Math.max(railH - progH - restingTop, 0) },
                { y: 0, duration: riseDur, ease: 'power3.out' }, bStart);
        }

        // 2b. Rail draws downward + list items rise/fade in sync with it.
        if (railTrack) {
            tl.fromTo(railTrack,
                { scaleY: 0 },
                { scaleY: 1, duration: railDraw, ease: 'power2.out' }, reveal);
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

        const target = menu.querySelector('[data-nav-close], a, button');
        if (target) target.focus();
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
        if (panel) panel.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // Reset the entrance so the next open replays from the start. Clearing
        // the inline props GSAP wrote restores the resting (visible) state once
        // the panel has slid away.
        if (intro) {
            intro.kill();
            intro = null;
            if (gsap) gsap.set([eyebrow, progress, railTrack, ...listItems, ...footerItems].filter(Boolean), { clearProps: 'all' });
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

/* ==== results.js ==== */
/**
 * Results cards — scattered "deck" with a bouncy hover-repel interaction.
 *
 * The five stat cards sit pre-scattered on screen (layout owned by CSS). On
 * hovering a card the rest spring away from it along their radial vector while
 * the hovered card lifts forward (scales up, straightens, raised z-index).
 * Everything eases with a soft overshoot for a fluid, bouncy feel.
 *
 * Targets the section/card elements directly (no class-based JS hooks beyond the
 * component's own structural classes). Early-exits on missing nodes, mobile
 * (cards become a scroll row ≤991px) and reduced-motion.
 */
(function () {
  function init(scope) {
    if (typeof gsap === 'undefined') return;

    const section = (scope || document).querySelector('.zoku-home-results');
    if (!section) return;

    const wrap = section.querySelector('.zoku-home-results_cards');
    const cards = wrap ? Array.from(wrap.querySelectorAll('.zoku-home-results_card')) : [];
    if (!wrap || cards.length === 0) return;

    if (window.matchMedia('(max-width: 991px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Resting rotations mirror the CSS fan tilt so GSAP and CSS agree.
    const restingRotation = [-4.59, 0, 3.88, 0, 0];

    // Tunables
    const REPEL = 56;        // px — how far siblings ease away from the hovered card
    const LIFT = -16;        // px — how far the hovered card rises
    const HOVER_SCALE = 1.05;
    const SIBLING_SCALE = 0.97;

    // Capture each card's resting centre from the untransformed layout box so the
    // repel vector is stable regardless of the live (animated) transform.
    const bases = cards.map((card, i) => ({
        cx: card.offsetLeft + card.offsetWidth / 2,
        cy: card.offsetTop + card.offsetHeight / 2,
        rotation: restingRotation[i] ?? 0,
    }));

    cards.forEach((card, i) => {
        gsap.set(card, {
            rotation: bases[i].rotation,
            transformOrigin: '50% 50%',
            willChange: 'transform',
            zIndex: i + 1,
        });
    });

    const spreadTo = (card, vars) =>
        gsap.to(card, { duration: 0.7, ease: 'back.out(1.7)', overwrite: 'auto', ...vars });

    function focus(activeIndex) {
        const active = bases[activeIndex];

        cards.forEach((card, i) => {
            if (i === activeIndex) {
                gsap.set(card, { zIndex: 50 });
                spreadTo(card, { x: 0, y: LIFT, rotation: 0, scale: HOVER_SCALE });
                return;
            }

            // Push this sibling away along the vector from the hovered card.
            let dx = bases[i].cx - active.cx;
            let dy = bases[i].cy - active.cy;
            const dist = Math.hypot(dx, dy) || 1;
            dx /= dist;
            dy /= dist;

            gsap.set(card, { zIndex: i + 1 });
            spreadTo(card, {
                x: dx * REPEL,
                y: dy * REPEL * 0.55,
                rotation: bases[i].rotation + dx * 2,
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
                x: 0,
                y: 0,
                rotation: bases[i].rotation,
                scale: 1,
                duration: 0.85,
                ease: 'elastic.out(1, 0.65)',
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

        // Desktop card-deck deal-in: pin the whole section, then deal both cards in as
        // the reader scrolls — card one lands by ~50%, then card two rises over it and
        // pushes card one back into a dimmed shade. The section pin hides the brief
        // empty stage. Returns a cleanup that resets the cards + stage.
        function buildDeck(pinTarget) {
            const stage = section.querySelector('.zoku-home-pillars_cards');
            if (!stage) return null;

            stage.classList.add('cc-deck');

            // Both cards start below the stage, transparent. Card two sits above card
            // one in the DOM, so it naturally stacks in front.
            gsap.set([cardOne, cardTwo], hidden);

            const tl = gsap.timeline({
                defaults: { ease: 'power3.out' },
                scrollTrigger: {
                    trigger: pinTarget,
                    start: () => 'top top+=' + navHeight(),
                    end: '+=140%',
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

            // 0 → 50%: card one deals into the resting front position.
            tl.to(cardOne, { yPercent: 0, opacity: 1, duration: 0.5 }, 0);
            // 50% → 90%: card two slides up into the front while card one is pushed
            // back — lifted, scaled down and dimmed like a shade.
            tl.to(cardTwo, { yPercent: 0, opacity: 1, duration: 0.4 }, 0.5);
            tl.to(cardOne, { yPercent: -8, scale: 0.94, opacity: 0.5, duration: 0.4 }, 0.5);

            return () => {
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
        //      in — the box fills as it rises, so there is no empty gap and the first
        //      card is seen animating rather than sitting static.
        //   2. The box then pins at the top and card two deals in over card one,
        //      pushing it back into the dimmed shade.
        mm.add('(max-width: 991px) and (prefers-reduced-motion: no-preference)', () => {
            const stage = section.querySelector('.zoku-home-pillars_cards');
            if (!stage) return;

            stage.classList.add('cc-deck');
            gsap.set([cardOne, cardTwo], hidden);

            // Phase 1 — card one deals in across the box's travel from entering the
            // viewport to reaching the top, so it is fully landed by the time the pin
            // engages.
            const intro = gsap.to(cardOne, {
                yPercent: 0,
                opacity: 1,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: stage,
                    start: 'top bottom',
                    end: () => 'top top+=' + navHeight(),
                    scrub: 0.6,
                    invalidateOnRefresh: true,
                },
            });

            // Phase 2 — pin the cards at the top; card two deals in over card one,
            // which is pushed back. fromTo with immediateRender:false so this does
            // not snap card one's start values before the pin scrubs in.
            const deck = gsap.timeline({
                defaults: { ease: 'power3.out' },
                scrollTrigger: {
                    trigger: stage,
                    start: () => 'top top+=' + navHeight(),
                    end: '+=70%',
                    scrub: 0.6,
                    pin: stage,
                    pinSpacing: true,
                    // No anticipatePin — see the desktop deck above: it pins early
                    // by scroll velocity and jolts the content up rather than
                    // freezing it in place.
                    invalidateOnRefresh: true,
                },
            });
            deck.to(cardTwo, { yPercent: 0, opacity: 1, duration: 0.5 }, 0);
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

    // Resting tilt of the open panel — matches Figma 4340:26452.
    const REST_ROTATION = -4;

    // The global nav is sticky at the top, so scroll targets must clear it.
    const nav = document.querySelector('.zoku-nav');
    const getNavHeight = () => (nav ? nav.getBoundingClientRect().height : 0);

    // Smoothly bring the opened row's summary just below the sticky nav.
    const scrollToItem = (item) => {
        const top = item.getBoundingClientRect().top + window.scrollY
            - getNavHeight() - 24;
        window.scrollTo({
            top,
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
    };

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

        // Slide the panel up from below as it fades in, settling into its tilt.
        const revealPanel = (item) => {
            const panel = item.querySelector('.zoku-portfolio-item_panel');
            if (!panel) return;

            // Take over from the CSS keyframe so GSAP owns the transform.
            panel.style.animation = 'none';

            if (prefersReducedMotion || !hasGsap) {
                // Fall back to the resting tilt with no motion.
                panel.style.transform = '';
                panel.style.opacity = '';
                return;
            }

            window.gsap.fromTo(panel,
                { y: '40%', rotation: REST_ROTATION, opacity: 0, transformOrigin: '50% 50%' },
                { y: '0%', rotation: REST_ROTATION, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );
        };

        const setActive = (idx, opts) => {
            const scroll = !opts || opts.scroll !== false;
            items.forEach((item, i) => {
                const shouldOpen = i === idx;
                if (isOpen(item) === shouldOpen) return;
                setOpen(item, shouldOpen);
                if (shouldOpen) revealPanel(item);
            });
            // Once the open/close reflow has settled, glide the newly opened
            // row up beneath the sticky nav.
            if (scroll && idx >= 0) scrollToItem(items[idx]);
        };

        // Click-to-open accordion: opening a row reveals its panel and closes
        // the others. Only one row is ever open, and a row can never be closed
        // by clicking it again — clicking the open row is a no-op (setActive
        // early-returns when the target is already open). No scroll-driven
        // auto-open. The toggle is a <summary> in the static build and a
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
        // markup already marks one open. Don't scroll on load.
        if (!items.some(isOpen)) setActive(0, { scroll: false });
        else items.forEach((item) => { if (isOpen(item)) revealPanel(item); });
    });
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
 * Markup contract (data attributes only — never classes, per project JS rules):
 *   <div data-deck>
 *     <article data-deck-card>…</article>   ← one per card
 *   </div>
 * Multiple decks per page are supported. Each card's *resting* transform
 * (rotation + translate from CSS — e.g. the fanned catalyse cards) is read from
 * computed style at init, so no per-card config is needed; GSAP animates
 * relative to that base and returns to it on reset.
 *
 * Early-exits on missing nodes, mobile (decks flatten ≤991px) and reduced-motion.
 */
(function () {
  function init(scope) {
    if (typeof gsap === 'undefined') return;
    // Hover-repel is desktop + tablet only — disabled on mobile (≤767px) where
    // the grid stacks into a touch-driven 2×2 with no resting fan to repel.
    if (window.matchMedia('(max-width: 767px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Tunables
    const REPEL = 64;        // px — how far siblings ease away from the hovered card
    const LIFT = -16;        // px — how far the hovered card rises (added to its base y)
    const HOVER_SCALE = 1.05;
    const SIBLING_SCALE = 0.97;

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

    function initDeck(wrap) {
        const cards = Array.from(wrap.querySelectorAll('[data-deck-card]'));
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
            gsap.to(card, { duration: 0.4, ease: 'back.out(1.7)', overwrite: 'auto', ...vars });

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
                    x: base.x + dx * REPEL,
                    y: base.y + dy * REPEL * 0.55,
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
                    duration: 0.4,
                    ease: 'power3.out',
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

    (scope || document).querySelectorAll('[data-deck]').forEach(initDeck);
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

    function destroy() {
        handlers.forEach((onScroll) => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        });
        handlers = [];
    }

    function init(scope) {
        destroy(); // drop any listeners from the previous page

        const sections = (scope || document).querySelectorAll('[data-component="process-scroll"]');
        if (!sections.length) return;

        // The global nav is sticky, so the usable reading area starts below it.
        const nav = document.querySelector('.zoku-nav');
        const getNavHeight = () => (nav ? nav.getBoundingClientRect().height : 0);

        sections.forEach((section) => {
            const steps = Array.from(section.querySelectorAll('.zoku-process-step'));
            if (!steps.length) return;

            const rail = section.querySelector('.zoku-process_rail');
            const progress = section.querySelector('.zoku-process_rail-progress');

            // Flag the root so the muted body/logos hide only when JS is driving it,
            // keeping all content visible as a no-JS fallback.
            section.classList.add('is-scrollspy');

            let active = -1;

            const positionRail = (idx) => {
                if (!rail || !progress) return;
                const railRect = rail.getBoundingClientRect();
                const stepRect = steps[idx].getBoundingClientRect();
                progress.style.setProperty('--zoku-process-progress-offset', (stepRect.top - railRect.top) + 'px');
                progress.style.setProperty('--zoku-process-progress-height', stepRect.height + 'px');
            };

            const setActive = (idx) => {
                if (idx !== active) {
                    active = idx;
                    steps.forEach((step, i) => {
                        const on = i === idx;
                        step.classList.toggle('cc-active', on);
                        step.classList.toggle('cc-muted', !on);
                        // Reveal the active step's body / dropdown copy and hide the
                        // rest. The body's own cc-muted class is what drives its
                        // display (.zoku-process-step_body.cc-muted { display:none }),
                        // and the static markup only marks the initially-active step's
                        // body visible — so it must be toggled in lock-step here or
                        // only the first step ever shows its description as you scroll.
                        const body = step.querySelector('.zoku-process-step_body');
                        if (body) body.classList.toggle('cc-muted', !on);
                    });
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
