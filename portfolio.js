(function () {
  function init(scope) {
    const root = scope || document;
    const found = root.querySelectorAll('.zoku-home-portfolio, [data-portfolio-scroll]');
    // Fall back to the whole scope so bare .zoku-portfolio-item rows (e.g. the
    // components showcase) are still wired when there's no wrapper section.
    const scopes = found.length ? found : [root];

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';

    // Resting tilt of the open panel — matches Figma 4340:26452.
    const REST_ROTATION = -4;

    // The global nav is sticky at the top, so scroll targets must clear it.
    const nav = document.querySelector('.zoku-nav');
    const getNavHeight = () => (nav ? nav.getBoundingClientRect().height : 0);

    // Smoothly bring the opened row's summary just below the sticky nav.
    const scrollToItem = (item) => {
        const top = item.getBoundingClientRect().top + window.scrollY
            - getNavHeight() - 24;
        window.scrollTo({
            top,
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
    };

    // State lives on the [open] attribute, which works on any element — the
    // static build uses native <details>, but Webflow re-imports these rows as
    // <div>s (it can't represent <details>/<summary>), so we can't rely on the
    // native .open property or on native collapse. Toggling the attribute keeps
    // the CSS ([open] indicator, panel reveal, collapse) driving off one hook in
    // both environments.
    const isOpen = (item) => item.hasAttribute('open');
    const setOpen = (item, open) => {
        if (open) item.setAttribute('open', '');
        else item.removeAttribute('open');
    };

    scopes.forEach((scope) => {
        const items = Array.from(scope.querySelectorAll('.zoku-portfolio-item'))
            .filter((el) => !el.classList.contains('cc-static'));
        if (!items.length) return;

        // Slide the panel up from below as it fades in, settling into its tilt.
        const revealPanel = (item) => {
            const panel = item.querySelector('.zoku-portfolio-item_panel');
            if (!panel) return;

            // Take over from the CSS keyframe so GSAP owns the transform.
            panel.style.animation = 'none';

            if (prefersReducedMotion || !hasGsap) {
                // Fall back to the resting tilt with no motion.
                panel.style.transform = '';
                panel.style.opacity = '';
                return;
            }

            window.gsap.fromTo(panel,
                { y: '40%', rotation: REST_ROTATION, opacity: 0, transformOrigin: '50% 50%' },
                { y: '0%', rotation: REST_ROTATION, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );
        };

        const setActive = (idx, opts) => {
            const scroll = !opts || opts.scroll !== false;
            items.forEach((item, i) => {
                const shouldOpen = i === idx;
                if (isOpen(item) === shouldOpen) return;
                setOpen(item, shouldOpen);
                if (shouldOpen) revealPanel(item);
            });
            // Once the open/close reflow has settled, glide the newly opened
            // row up beneath the sticky nav.
            if (scroll && idx >= 0) scrollToItem(items[idx]);
        };

        // Click-to-open accordion: opening a row reveals its panel and closes
        // the others. Only one row is ever open, and a row can never be closed
        // by clicking it again — clicking the open row is a no-op (setActive
        // early-returns when the target is already open). No scroll-driven
        // auto-open. The toggle is a <summary> in the static build and a
        // <div class="zoku-portfolio-item_toggle"> once imported into Webflow,
        // so accept either.
        items.forEach((item, i) => {
            const summary = item.querySelector('summary, .zoku-portfolio-item_toggle');
            if (!summary) return;
            summary.addEventListener('click', (e) => {
                e.preventDefault();
                setActive(i);
            });
        });

        // Open the first row by default (never collapsed to nothing), unless the
        // markup already marks one open. Don't scroll on load.
        if (!items.some(isOpen)) setActive(0, { scroll: false });
        else items.forEach((item) => { if (isOpen(item)) revealPanel(item); });
    });
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();
