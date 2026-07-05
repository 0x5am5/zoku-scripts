/**
 * Card deck — bouncy hover-repel interaction for a cluster of cards.
 *
 * On hovering a card the others spring away from it along their radial vector
 * while the hovered card lifts forward (scales up, straightens, raised z-index).
 * Everything eases with a soft overshoot for a fluid, bouncy feel. Ported from
 * the home "results" deck and reused across the site.
 *
 * This single module now drives BOTH the generic data-attribute decks AND the
 * home results deck (via a legacy class-based shim — see init() below), so the
 * two never drift apart. Each deck can carry its own feel (repel distance,
 * spread/reset easing, disable breakpoint) via a per-deck options object.
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
 * Optional per-deck overrides via data attributes on the [data-deck] wrapper:
 *   data-deck-repel, data-deck-spread-duration, data-deck-spread-ease,
 *   data-deck-reset-duration, data-deck-reset-ease, data-deck-min-width-disabled.
 * Numeric ones fall back to the default if not a finite number.
 *
 * Early-exits globally on reduced-motion; the mobile disable breakpoint is now
 * per-deck (default ≤767px, results ≤991px) so it is checked inside each deck.
 */
(function () {
  // Default deck feel — matches the original generic card-deck behaviour.
  const DEFAULTS = {
    repel: 64,                      // px — how far siblings ease away from the hovered card
    spreadDuration: 0.4,
    spreadEase: 'back.out(1.7)',
    resetDuration: 0.4,
    resetEase: 'power3.out',
    minWidthDisabled: 767,          // px — decks flatten at/below this width
  };

  // Shared across every deck — never varied per deck.
  const LIFT = -16;                 // px — how far the hovered card rises (added to its base y)
  const HOVER_SCALE = 1.05;
  const SIBLING_SCALE = 0.97;

  function init(scope) {
    if (typeof gsap === 'undefined') return;
    // Reduced-motion is a global opt-out — no deck animates. (The mobile
    // breakpoint is now per-deck, so it is checked inside initDeck.)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = scope || document;

    // Generic data-attribute decks. Options are read leniently off the wrapper,
    // falling back to DEFAULTS (see readOptions).
    root.querySelectorAll('[data-deck]').forEach((wrap) => {
        initDeck(wrap, '[data-deck-card]', readOptions(wrap));
    });

    // Home results deck — legacy class-based hook. This markup lives in Webflow,
    // which owns it and CANNOT be given data attributes from this repo, so we
    // wire it by its own structural classes instead. Any results cards wrap not
    // already promoted to a [data-deck] is initialised with the results preset.
    // (The old results.js hardcoded a rotation table `[-4.59, 0, 3.88, 0, 0]`;
    // that was dropped in favour of readBase() reading each card's resting
    // rotation from computed style — the CSS owns the fan tilt, so it yields the
    // same values and stays correct if the fan ever changes.)
    root.querySelectorAll('.zoku-home-results_cards').forEach((wrap) => {
        if (wrap.matches('[data-deck]')) return; // already handled above
        initDeck(wrap, '.zoku-home-results_card', {
            repel: 56,
            spreadDuration: 0.7,
            spreadEase: 'back.out(1.7)',
            resetDuration: 0.85,
            resetEase: 'elastic.out(1, 0.65)',
            minWidthDisabled: 991,
        });
    });
  }

  // Read per-deck overrides from data attributes, falling back to DEFAULTS.
  // Numeric values are validated with Number.isFinite (house pattern — see
  // scroll-scrub.js `marginAttr`); missing/blank string easing keeps the default.
  function readOptions(wrap) {
    const num = (attr, fallback) => {
        const v = parseFloat(wrap.getAttribute(attr));
        return Number.isFinite(v) ? v : fallback;
    };
    const str = (attr, fallback) => {
        const v = wrap.getAttribute(attr);
        return v && v.trim() ? v.trim() : fallback;
    };
    return {
        repel: num('data-deck-repel', DEFAULTS.repel),
        spreadDuration: num('data-deck-spread-duration', DEFAULTS.spreadDuration),
        spreadEase: str('data-deck-spread-ease', DEFAULTS.spreadEase),
        resetDuration: num('data-deck-reset-duration', DEFAULTS.resetDuration),
        resetEase: str('data-deck-reset-ease', DEFAULTS.resetEase),
        minWidthDisabled: num('data-deck-min-width-disabled', DEFAULTS.minWidthDisabled),
    };
  }

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

  function initDeck(wrap, cardSelector, opts) {
      const options = { ...DEFAULTS, ...opts };

      // Hover-repel is desktop + tablet only — disabled below this deck's
      // breakpoint where the grid stacks/scrolls with no resting fan to repel.
      if (window.matchMedia(`(max-width: ${options.minWidthDisabled}px)`).matches) return;

      const cards = Array.from(wrap.querySelectorAll(cardSelector));
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
          gsap.to(card, { duration: options.spreadDuration, ease: options.spreadEase, overwrite: 'auto', ...vars });

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
                  x: base.x + dx * options.repel,
                  y: base.y + dy * options.repel * 0.55,
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
                  duration: options.resetDuration,
                  ease: options.resetEase,
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
