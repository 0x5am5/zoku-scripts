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
