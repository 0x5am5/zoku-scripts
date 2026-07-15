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
