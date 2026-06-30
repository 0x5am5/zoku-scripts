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
