/**
 * Trifecta line draw-in — animates the first connector line of the Holy Trifecta
 * section (`.zoku-trifecta_connector.cc-xl`) from top to bottom, once the section
 * reaches the centre of the viewport. One-shot.
 *
 * No-JS or `prefers-reduced-motion`: the line is never armed and stays fully visible.
 * Re-runnable for Barba navigation (init re-arms the new section's line; destroy
 * disconnects the observer).
 */
(function () {
    'use strict';

    let observer = null;

    function destroy() {
        if (observer) { observer.disconnect(); observer = null; }
    }

    function init(scope) {
        destroy();

        const root = scope || document;
        const section = root.querySelector('.zoku-trifecta[data-scrub-track], .zoku-trifecta');
        if (!section) return;

        const connector = section.querySelector('.zoku-trifecta_connector.cc-xl');
        if (!connector) return;

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!('IntersectionObserver' in window)) return;

        // Hide the line ready to draw in.
        connector.classList.add('is-armed');

        // rootMargin -50% top & bottom shrinks the root to a zero-height line at the
        // viewport's vertical centre, so the section "intersects" the moment its top
        // edge reaches mid-screen.
        observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    connector.classList.add('is-drawn');
                    if (observer) observer.disconnect();
                });
            },
            { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
        );

        observer.observe(section);
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
