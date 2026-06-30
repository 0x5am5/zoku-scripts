/**
 * Results cards — scattered "deck" with a bouncy hover-repel interaction.
 *
 * The five stat cards sit pre-scattered on screen (layout owned by CSS). On
 * hovering a card the rest spring away from it along their radial vector while
 * the hovered card lifts forward (scales up, straightens, raised z-index).
 * Everything eases with a soft overshoot for a fluid, bouncy feel.
 *
 * Targets the section/card elements directly (no class-based JS hooks beyond the
 * component's own structural classes). Early-exits on missing nodes, mobile
 * (cards become a scroll row ≤991px) and reduced-motion.
 */
(function () {
  function init(scope) {
    if (typeof gsap === 'undefined') return;

    const section = (scope || document).querySelector('.zoku-home-results');
    if (!section) return;

    const wrap = section.querySelector('.zoku-home-results_cards');
    const cards = wrap ? Array.from(wrap.querySelectorAll('.zoku-home-results_card')) : [];
    if (!wrap || cards.length === 0) return;

    if (window.matchMedia('(max-width: 991px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Resting rotations mirror the CSS fan tilt so GSAP and CSS agree.
    const restingRotation = [-4.59, 0, 3.88, 0, 0];

    // Tunables
    const REPEL = 56;        // px — how far siblings ease away from the hovered card
    const LIFT = -16;        // px — how far the hovered card rises
    const HOVER_SCALE = 1.05;
    const SIBLING_SCALE = 0.97;

    // Capture each card's resting centre from the untransformed layout box so the
    // repel vector is stable regardless of the live (animated) transform.
    const bases = cards.map((card, i) => ({
        cx: card.offsetLeft + card.offsetWidth / 2,
        cy: card.offsetTop + card.offsetHeight / 2,
        rotation: restingRotation[i] ?? 0,
    }));

    cards.forEach((card, i) => {
        gsap.set(card, {
            rotation: bases[i].rotation,
            transformOrigin: '50% 50%',
            willChange: 'transform',
            zIndex: i + 1,
        });
    });

    const spreadTo = (card, vars) =>
        gsap.to(card, { duration: 0.7, ease: 'back.out(1.7)', overwrite: 'auto', ...vars });

    function focus(activeIndex) {
        const active = bases[activeIndex];

        cards.forEach((card, i) => {
            if (i === activeIndex) {
                gsap.set(card, { zIndex: 50 });
                spreadTo(card, { x: 0, y: LIFT, rotation: 0, scale: HOVER_SCALE });
                return;
            }

            // Push this sibling away along the vector from the hovered card.
            let dx = bases[i].cx - active.cx;
            let dy = bases[i].cy - active.cy;
            const dist = Math.hypot(dx, dy) || 1;
            dx /= dist;
            dy /= dist;

            gsap.set(card, { zIndex: i + 1 });
            spreadTo(card, {
                x: dx * REPEL,
                y: dy * REPEL * 0.55,
                rotation: bases[i].rotation + dx * 2,
                scale: SIBLING_SCALE,
            });
        });
    }

    function reset() {
        // Note: z-index is intentionally left untouched here — the last-hovered
        // card keeps its raised stacking at rest (otherwise it would snap back
        // behind overlapping siblings and "jump"). focus() reassigns every
        // card's z-index on the next hover, so this stays consistent.
        cards.forEach((card, i) => {
            gsap.to(card, {
                x: 0,
                y: 0,
                rotation: bases[i].rotation,
                scale: 1,
                duration: 0.85,
                ease: 'elastic.out(1, 0.65)',
                overwrite: 'auto',
            });
        });
    }

    cards.forEach((card, i) => {
        card.addEventListener('mouseenter', () => focus(i));
    });

    // Reset when the cursor leaves the whole cluster (lets the pointer glide
    // between overlapping cards without snapping back mid-move).
    wrap.addEventListener('mouseleave', reset);
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();
