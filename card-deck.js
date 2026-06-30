/**
 * Card deck — bouncy hover-repel interaction for a cluster of cards.
 *
 * On hovering a card the others spring away from it along their radial vector
 * while the hovered card lifts forward (scales up, straightens, raised z-index).
 * Everything eases with a soft overshoot for a fluid, bouncy feel. Ported from
 * the home "results" deck and reused across the site.
 *
 * Markup contract (data attributes only — never classes, per project JS rules):
 *   <div data-deck>
 *     <article data-deck-card>…</article>   ← one per card
 *   </div>
 * Multiple decks per page are supported. Each card's *resting* transform
 * (rotation + translate from CSS — e.g. the fanned catalyse cards) is read from
 * computed style at init, so no per-card config is needed; GSAP animates
 * relative to that base and returns to it on reset.
 *
 * Early-exits on missing nodes, mobile (decks flatten ≤991px) and reduced-motion.
 */
(function () {
  function init(scope) {
    if (typeof gsap === 'undefined') return;
    // Hover-repel is desktop + tablet only — disabled on mobile (≤767px) where
    // the grid stacks into a touch-driven 2×2 with no resting fan to repel.
    if (window.matchMedia('(max-width: 767px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Tunables
    const REPEL = 64;        // px — how far siblings ease away from the hovered card
    const LIFT = -16;        // px — how far the hovered card rises (added to its base y)
    const HOVER_SCALE = 1.05;
    const SIBLING_SCALE = 0.97;

    // Decompose a computed `transform` matrix into the resting rotation/offset so
    // GSAP can animate relative to whatever tilt/translate the CSS gave the card.
    function readBase(el) {
        const t = getComputedStyle(el).transform;
        if (!t || t === 'none') return { x: 0, y: 0, rotation: 0 };
        const m = t.match(/matrix\(([^)]+)\)/);
        if (!m) return { x: 0, y: 0, rotation: 0 };
        const [a, b, , , tx, ty] = m[1].split(',').map(parseFloat);
        return {
            x: tx,
            y: ty,
            rotation: Math.round(Math.atan2(b, a) * (180 / Math.PI) * 100) / 100,
        };
    }

    function initDeck(wrap) {
        const cards = Array.from(wrap.querySelectorAll('[data-deck-card]'));
        if (cards.length === 0) return;

        // Capture resting transform + untransformed layout centre per card before
        // GSAP touches anything (transforms don't affect offsetLeft/Top, so the
        // repel vector stays stable regardless of the live transform).
        const bases = cards.map((card) => {
            const base = readBase(card);
            base.cx = card.offsetLeft + card.offsetWidth / 2;
            base.cy = card.offsetTop + card.offsetHeight / 2;
            return base;
        });

        cards.forEach((card, i) => {
            gsap.set(card, {
                x: bases[i].x,
                y: bases[i].y,
                rotation: bases[i].rotation,
                transformOrigin: '50% 50%',
                willChange: 'transform',
                zIndex: i + 1,
            });
        });

        const spreadTo = (card, vars) =>
            gsap.to(card, { duration: 0.4, ease: 'back.out(1.7)', overwrite: 'auto', ...vars });

        function focus(activeIndex) {
            const active = bases[activeIndex];

            cards.forEach((card, i) => {
                const base = bases[i];

                if (i === activeIndex) {
                    gsap.set(card, { zIndex: 50 });
                    spreadTo(card, { x: base.x, y: base.y + LIFT, rotation: 0, scale: HOVER_SCALE });
                    return;
                }

                // Push this sibling away along the vector from the hovered card.
                let dx = base.cx - active.cx;
                let dy = base.cy - active.cy;
                const dist = Math.hypot(dx, dy) || 1;
                dx /= dist;
                dy /= dist;

                gsap.set(card, { zIndex: i + 1 });
                spreadTo(card, {
                    x: base.x + dx * REPEL,
                    y: base.y + dy * REPEL * 0.55,
                    rotation: base.rotation + dx * 2,
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
                    x: bases[i].x,
                    y: bases[i].y,
                    rotation: bases[i].rotation,
                    scale: 1,
                    duration: 0.4,
                    ease: 'power3.out',
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

    (scope || document).querySelectorAll('[data-deck]').forEach(initDeck);
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();
