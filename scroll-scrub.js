/**
 * Scroll-scrub — drives scroll-scrubbed halftone sprites.
 *
 * For every `[data-halftone-scrub]` element it computes a 0–1 progress value from
 * scroll position and forwards it to `window.ZokuHalftone.setProgress()`, so the
 * sprite-sheet "plays" forward and backward under the reader's scroll.
 *
 * Progress tracks the [data-scrub-track] element's travel THROUGH the viewport
 * (defaults to the sprite's parent): 0 as the track enters from the bottom, 1 just
 * before it leaves the top. Tunable per sprite via data-scrub-enter / data-scrub-leave.
 *
 * Re-runnable for Barba navigation: the window listeners are bound once, but the
 * tracked items are recomputed by init() against the freshly-swapped <main>.
 */
(function () {
    'use strict';

    const clamp01 = (n) => Math.max(0, Math.min(1, n));

    // Default margins (fractions of the viewport) that hold the first/last frame
    // briefly as the track enters/leaves.
    const ENTER_MARGIN = 0.9;   // track.top (fraction of vh) where progress = 0
    const LEAVE_MARGIN = 0.1;   // viewport line the track's BOTTOM meets where progress = 1

    function marginAttr(el, name, fallback) {
        const v = parseFloat(el.getAttribute(name));
        return Number.isFinite(v) ? clamp01(v) : fallback;
    }

    let items = [];   // refreshed per page
    let ticking = false;

    function update() {
        ticking = false;
        const api = window.ZokuHalftone;
        if (!api || typeof api.setProgress !== 'function') return;

        const vh = window.innerHeight || document.documentElement.clientHeight;

        items.forEach(({ el, track, enter, leave }) => {
            const c = track.getBoundingClientRect();
            const startLine = vh * enter;            // track.top where p = 0
            const endLine = vh * leave - c.height;   // track.top where p = 1
            const span = startLine - endLine;
            const p = span > 0 ? (startLine - c.top) / span : 0;
            api.setProgress(el, clamp01(p));
        });
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    }

    function init(scope) {
        const els = (scope || document).querySelectorAll('[data-halftone-scrub]');
        items = Array.from(els).map((el) => ({
            el,
            track: el.closest('[data-scrub-track]') || el.parentElement || el,
            enter: marginAttr(el, 'data-scrub-enter', ENTER_MARGIN),
            leave: marginAttr(el, 'data-scrub-leave', LEAVE_MARGIN),
        }));
        update();
    }

    // Bind the scroll/resize listeners exactly once; they read the live `items`.
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('load', update);

    if (window.ZokuPage) window.ZokuPage.register({ init });
    else init(document);
})();
