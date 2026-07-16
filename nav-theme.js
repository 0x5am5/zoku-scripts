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
