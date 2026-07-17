(function () {
  function init(scope) {
    const root = scope || document;
    const found = root.querySelectorAll('.zoku-home-portfolio, [data-portfolio-scroll]');
    // Fall back to the whole scope so bare .zoku-portfolio-item rows (e.g. the
    // components showcase) are still wired when there's no wrapper section.
    const scopes = found.length ? found : [root];

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasGsap = typeof window.gsap !== 'undefined';

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

        const useMotion = !prefersReducedMotion && hasGsap;

        // Slide the panel up from below as it fades in. Hover polish (the
        // gentle artwork zoom) is pure CSS on .zoku-portfolio-item_art.
        const revealPanel = (item) => {
            const panel = item.querySelector('.zoku-portfolio-item_panel');
            if (!panel) return;

            // Take over from the CSS keyframe so GSAP owns the transform.
            panel.style.animation = 'none';

            if (!useMotion) {
                // Fall back to the resting state with no motion.
                panel.style.transform = '';
                panel.style.opacity = '';
                return;
            }

            window.gsap.fromTo(panel,
                { yPercent: 40, opacity: 0 },
                { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );
        };

        // On mobile the rows stack full-width, so opening a lower row while the
        // previously open one collapses above it can leave the tapped toggle
        // stranded mid-viewport or pushed off-screen. Scroll the toggle to the
        // top of the viewport — just below the fixed .zoku-nav so it isn't
        // covered. Desktop keeps its scroll position: the layout barely shifts
        // there and the jump would feel abrupt. Measured synchronously after
        // the [open] swap — collapse is instant CSS, and the panel reveal only
        // animates transform/opacity, so geometry is already final.
        const scrollToToggle = (toggle) => {
            if (!window.matchMedia('(max-width: 767px)').matches) return;
            const nav = document.querySelector('.zoku-nav');
            const navHeight = nav ? nav.getBoundingClientRect().height : 0;
            const top = toggle.getBoundingClientRect().top
                + (window.scrollY || window.pageYOffset || 0) - navHeight;
            window.scrollTo({
                top: Math.max(0, top),
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
            });
        };

        const setActive = (idx) => {
            items.forEach((item, i) => {
                const shouldOpen = i === idx;
                if (isOpen(item) === shouldOpen) return;
                setOpen(item, shouldOpen);
                if (shouldOpen) revealPanel(item);
            });
        };

        // Click-to-open accordion: opening a row reveals its panel and closes
        // the others. Only one row is ever open, and a row can never be closed
        // by clicking it again — clicking the open row is a no-op (setActive
        // early-returns when the target is already open). The toggle is a
        // <summary> in the static build and a
        // <div class="zoku-portfolio-item_toggle"> once imported into Webflow,
        // so accept either.
        items.forEach((item, i) => {
            const summary = item.querySelector('summary, .zoku-portfolio-item_toggle');
            if (!summary) return;
            summary.addEventListener('click', (e) => {
                e.preventDefault();
                const wasOpen = isOpen(item);
                setActive(i);
                if (!wasOpen) scrollToToggle(summary);
            });
        });

        // Open the first row by default (never collapsed to nothing), unless the
        // markup already marks one open.
        if (!items.some(isOpen)) setActive(0);
        else items.forEach((item) => { if (isOpen(item)) revealPanel(item); });
    });
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();
