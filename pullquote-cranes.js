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
