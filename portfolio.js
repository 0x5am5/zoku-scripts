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

    // The open panel gently trails the pointer, magnetically, capped at this
    // many px on each axis so the follow stays subtle.
    const MAGNET_MAX = 50;

    scopes.forEach((scope) => {
        const items = Array.from(scope.querySelectorAll('.zoku-portfolio-item'))
            .filter((el) => !el.classList.contains('cc-static'));
        if (!items.length) return;

        const useMotion = !prefersReducedMotion && hasGsap;

        // The currently open panel and its pointer-follow tweens. quickTo gives
        // us a re-triggerable eased tween per axis, which is what makes the
        // follow feel smooth/magnetic rather than snapping to the cursor.
        let activePanel = null;
        let followX = null;
        let followY = null;

        // Slide the panel up from below as it fades in, settling into its tilt.
        const revealPanel = (item) => {
            const panel = item.querySelector('.zoku-portfolio-item_panel');
            if (!panel) return;

            // Take over from the CSS keyframe so GSAP owns the transform.
            panel.style.animation = 'none';

            if (!useMotion) {
                // Fall back to the resting tilt with no motion.
                panel.style.transform = '';
                panel.style.opacity = '';
                return;
            }

            // Reveal slides on yPercent so the magnetic offset (x/y in px) owns
            // a separate transform channel and the two never fight.
            window.gsap.fromTo(panel,
                { yPercent: 40, rotation: REST_ROTATION, opacity: 0, transformOrigin: '50% 50%' },
                { yPercent: 0, rotation: REST_ROTATION, opacity: 1, duration: 0.8, ease: 'power3.out' }
            );

            // Clear any leftover offset from a previous open, then point the
            // follow tweens at this panel.
            window.gsap.set(panel, { x: 0, y: 0 });
            activePanel = panel;
            followX = window.gsap.quickTo(panel, 'x', { duration: 0.6, ease: 'power3.out' });
            followY = window.gsap.quickTo(panel, 'y', { duration: 0.6, ease: 'power3.out' });
        };

        // Magnetic pointer-follow: map the cursor's position within the section
        // to a small offset (±MAGNET_MAX) and ease the open panel toward it.
        if (useMotion) {
            const clamp = (v) => Math.max(-1, Math.min(1, v));
            const refEl = scope.getBoundingClientRect ? scope : document.documentElement;
            scope.addEventListener('mousemove', (e) => {
                if (!activePanel || !followX) return;
                const rect = refEl.getBoundingClientRect();
                const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
                const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
                followX(clamp(nx) * MAGNET_MAX);
                followY(clamp(ny) * MAGNET_MAX);
            });
            scope.addEventListener('mouseleave', () => {
                if (followX) { followX(0); followY(0); }
            });
        }

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
                setActive(i);
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
