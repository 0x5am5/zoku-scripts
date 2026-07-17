/**
 * Scroll-scrub — drives scroll-scrubbed halftone sprites.
 *
 * For every `[data-halftone-scrub]` element it computes a 0–1 progress value from
 * scroll position and forwards it to `window.ZokuHalftone.setProgress()`, so the
 * sprite-sheet "plays" forward and backward under the reader's scroll.
 *
 * Progress tracks the [data-scrub-track] element's travel THROUGH the viewport
 * (defaults to the sprite's parent): 0 as the track enters from the bottom, 1 just
 * before it leaves the top. Tunable per sprite via data-scrub-enter / data-scrub-leave,
 * with per-breakpoint overrides via the Webflow-breakpoint suffixes -tablet (≤991px),
 * -mobile (≤767px) and -mobile-portrait (≤479px) — e.g. data-scrub-enter-mobile="0.7".
 * These cascade down (an unset breakpoint inherits the next-wider value, then the base)
 * and are re-resolved on resize so crossing a breakpoint swaps the margins live.
 *
 * The scrub marker ITSELF is responsive with the same suffixes (mirroring
 * halftone-shader's responsive attributes): data-halftone-scrub-mobile="false"
 * retires scrubbing on phones (the shader releases the scroll claim so the fps
 * clock resumes), and a suffix-only marker like data-halftone-scrub-tablet
 * enables it on just that tier and below. Inactive items are tracked but not
 * driven — calling setProgress on them would claim the sprite away from its
 * auto-play clock — and the active set is re-resolved on resize.
 *
 * Geometry is cached, not read live per frame. Each item's absolute document offset
 * (docTop) and height are measured once and progress is derived from window.scrollY
 * against that cache — so content above the track changing height (an accordion
 * opening, which lengthens the page) does NOT jolt the sprite mid-scroll. The cache
 * is refreshed on resize / load and on a `zoku:layout` event (any module that
 * reflows the page can dispatch it); those refreshes land while the track is still
 * out of its scrub window (progress clamped at 0), so the sprite stays smooth AND
 * stays calibrated to the track's settled position.
 *
 * Re-runnable for Barba navigation: the window listeners are bound once and survive
 * every swap, but the tracked items are page-specific. init() rebuilds them against
 * the freshly-swapped <main>; destroy() empties the list (and cancels any in-flight
 * rAF tick) the moment the outgoing page starts tearing down. Without that, during
 * the ~1.1s transition the still-live scroll listener would keep driving update()
 * against the old page's cached items — detached, `position: fixed`-frozen nodes
 * whose rects have collapsed — until the next init() finally replaces them.
 */
(function () {
    'use strict';

    const clamp01 = (n) => Math.max(0, Math.min(1, n));

    // Default margins (fractions of the viewport) that hold the first/last frame
    // briefly as the track enters/leaves.
    const ENTER_MARGIN = 0.9;   // track.top (fraction of vh) where progress = 0
    const LEAVE_MARGIN = 0.1;   // viewport line the track's BOTTOM meets where progress = 1

    // Responsive overrides, mirroring the Webflow breakpoints in styles.css. Each
    // tier reads data-scrub-enter/-leave with the suffix appended (e.g.
    // data-scrub-enter-mobile). Ordered narrowest-first so resolution cascades DOWN:
    // at a given width we take the most specific tier that is both active AND set,
    // falling back through the wider tiers to the un-suffixed base value. The base
    // tier (suffix '', max Infinity) is always active, so it is the final fallback.
    const TIERS = [
        { suffix: '-mobile-portrait', max: 479 },  // Webflow mobile portrait
        { suffix: '-mobile', max: 767 },           // Webflow mobile landscape
        { suffix: '-tablet', max: 991 },           // Webflow tablet
        { suffix: '', max: Infinity },             // base / desktop
    ];

    const viewportWidth = () =>
        window.innerWidth || document.documentElement.clientWidth || 0;

    // Candidates carry the scrub marker at ANY tier; whether each is ACTIVE at the
    // current width is resolved separately (see scrubActive), so a marker can be
    // enabled or retired per breakpoint.
    const SCRUB_SELECTOR = TIERS.map((t) => '[data-halftone-scrub' + t.suffix + ']').join(',');

    // Resolve one margin attribute for the current viewport width. Walks the tiers
    // narrowest-first, returning the first active tier that carries a finite value;
    // otherwise the caller's fallback.
    function marginAttr(el, name, fallback, width) {
        for (let i = 0; i < TIERS.length; i++) {
            const tier = TIERS[i];
            if (width > tier.max) continue;         // tier not active at this width
            const v = parseFloat(el.getAttribute(name + tier.suffix));
            if (Number.isFinite(v)) return clamp01(v);
        }
        return fallback;
    }

    // Resolve the scrub marker itself for the current width — same cascade, boolean
    // semantics matching halftone-shader's flagAttr: the first active tier carrying
    // the attribute wins, "false" = off, anything else = on.
    function scrubActive(el, width) {
        for (let i = 0; i < TIERS.length; i++) {
            const tier = TIERS[i];
            if (width > tier.max) continue;         // tier not active at this width
            const v = el.getAttribute('data-halftone-scrub' + tier.suffix);
            if (v !== null) return v !== 'false';
        }
        return false;
    }

    // (Re)resolve every item's active state and enter/leave margins against the
    // current viewport width, so a resize across a breakpoint swaps them live.
    function resolveMargins() {
        const width = viewportWidth();
        items.forEach((item) => {
            item.active = scrubActive(item.el, width);
            item.enter = marginAttr(item.el, 'data-scrub-enter', ENTER_MARGIN, width);
            item.leave = marginAttr(item.el, 'data-scrub-leave', LEAVE_MARGIN, width);
        });
    }

    let items = [];   // refreshed per page
    let ticking = false;
    let measuring = false;
    // rAF handles for the two coalesced ticks, so destroy() can cancel a frame that
    // the outgoing page queued before it can fire against a torn-down / rebuilt list.
    let tickRAF = 0;
    let measureRAF = 0;

    const scrollTop = () => window.scrollY || window.pageYOffset || 0;

    // Cache each track's absolute document position + height. Measured against the
    // current layout, so it must be refreshed whenever anything that could move or
    // resize a track has settled (see remeasure()).
    function measure() {
        const y = scrollTop();
        items.forEach((item) => {
            const c = item.track.getBoundingClientRect();
            item.docTop = c.top + y;   // absolute top in the document
            item.height = c.height;
        });
    }

    function update() {
        ticking = false;
        const api = window.ZokuHalftone;
        if (!api || typeof api.setProgress !== 'function') return;

        const vh = window.innerHeight || document.documentElement.clientHeight;
        const y = scrollTop();

        items.forEach(({ el, docTop, height, enter, leave, active }) => {
            if (!active) return;                     // scrub retired at this breakpoint tier
            const top = docTop - y;                  // track.top in the viewport, from cache
            const startLine = vh * enter;            // track.top where p = 0
            const endLine = vh * leave - height;     // track.top where p = 1
            const span = startLine - endLine;
            const p = span > 0 ? (startLine - top) / span : 0;
            api.setProgress(el, clamp01(p));
        });
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        tickRAF = requestAnimationFrame(update);
    }

    // Geometry may have changed (viewport resize, or a late reflow above a track).
    // Re-cache offsets, then repaint. rAF-
    // coalesced so a burst of ResizeObserver / resize events costs one layout read.
    // A resize may also cross a breakpoint, so re-resolve the responsive margins too.
    function remeasure() {
        if (measuring) return;
        measuring = true;
        measureRAF = requestAnimationFrame(() => {
            measuring = false;
            resolveMargins();
            measure();
            update();
        });
    }

    function init(scope) {
        const els = (scope || document).querySelectorAll(SCRUB_SELECTOR);
        items = Array.from(els).map((el) => ({
            el,
            track: el.closest('[data-scrub-track]') || el.parentElement || el,
            active: false,   // resolved per-width in resolveMargins()
            enter: ENTER_MARGIN,
            leave: LEAVE_MARGIN,
            docTop: 0,
            height: 0,
        }));
        resolveMargins();
        measure();
        update();
    }

    // Called by the registry before each Barba navigation. The window listeners stay
    // bound (they're designed to survive swaps), so the only thing to do is starve
    // them: empty `items` — which turns update()/measure() into no-ops — then cancel
    // any tick the outgoing page has already queued and reset the guards. Emptying
    // `items` alone would make a stale frame harmless; cancelling it outright plus
    // clearing ticking/measuring leaves the module in a known-idle state so the next
    // page's first onScroll/remeasure schedules cleanly, without depending on a
    // leftover frame firing to clear the guards for it.
    function destroy() {
        items = [];
        if (tickRAF) cancelAnimationFrame(tickRAF);
        if (measureRAF) cancelAnimationFrame(measureRAF);
        tickRAF = 0;
        measureRAF = 0;
        ticking = false;
        measuring = false;
    }

    // Bind listeners exactly once; they read the live `items`. Scroll repaints from
    // the cache (no layout read); resize/load/layout events re-cache first.
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    window.addEventListener('load', remeasure);
    // Fired by anything that reflows the page once its content has settled, so
    // the cached track offsets stay calibrated.
    window.addEventListener('zoku:layout', remeasure);

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
