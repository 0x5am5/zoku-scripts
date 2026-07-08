(function () {
    // Scroll-driven "how it works" step reveal. As the reader scrolls, a single
    // step becomes active — its title brightens and its body is revealed (others
    // drop to a muted opacity with their bodies hidden) and the purple rail
    // segment slides to highlight it. Mirrors the anchor logic in portfolio.js.

    // Track the window listeners bound per section so they can be removed when the
    // page is swapped out (Barba navigation) — otherwise they'd accumulate and
    // keep reading detached, removed DOM.
    let handlers = [];
    // ResizeObservers watching each section's steps, so the rail re-fits the open
    // step whenever its height changes after activation (body reveal reflow,
    // late-loading images/fonts) — a scroll event isn't guaranteed for those.
    let observers = [];

    function destroy() {
        handlers.forEach((onScroll) => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        });
        handlers = [];
        observers.forEach((ro) => ro.disconnect());
        observers = [];
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
                        // The step's classes are pure state markers (the logo/list
                        // collapse keys off them via the .is-scrollspy head rules).
                        step.classList.toggle('cc-active', on);
                        step.classList.toggle('cc-muted', !on);
                        // The visible muting lives on Designer combos on the LEAF
                        // elements — index/title dim to 40% opacity, body collapses
                        // — so it stays editable in Webflow's Designer. Deliberately
                        // NOT group opacity on the step: opacity < 1 composites the
                        // whole step subtree offscreen, and iOS Safari can paint
                        // that layer stale mid-scroll (a full-opacity ghost of the
                        // title at its pre-reflow position).
                        ['_index', '_title', '_body'].forEach((leaf) => {
                            const el = step.querySelector('.zoku-process-step' + leaf);
                            if (el) el.classList.toggle('cc-muted', !on);
                        });
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

            // Re-fit the rail to the open step whenever its height changes without
            // a scroll (body reveal reflow, images/fonts loading in). Only the
            // active step's height feeds the rail, so re-position against it.
            if (typeof ResizeObserver === 'function') {
                const ro = new ResizeObserver(() => {
                    if (active !== -1) positionRail(active);
                    // A step's body reveal/collapse changes this section's height,
                    // which shifts everything below it in the document. Let scroll-
                    // scrub re-cache its track offsets so the halftone sprite stays
                    // calibrated after the reflow instead of jolting mid-scroll.
                    window.dispatchEvent(new Event('zoku:layout'));
                });
                steps.forEach((step) => ro.observe(step));
                observers.push(ro);
            }

            syncToScroll();
        });
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
