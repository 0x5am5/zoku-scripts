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
