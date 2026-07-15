/**
 * Card deck — staggered slide-in entrance for a cluster of cards.
 *
 * 2026-07-15: this module replaced the old bouncy hover-repel interaction.
 * Decks no longer fan/rotate at rest and carry no hover behaviour — the cards
 * rest in a neat, straight layout (the CSS owns that) and animate IN from the
 * far right of the screen, staggered left to right, the first time the deck
 * scrolls into view.
 *
 * Markup contract (data attributes only — never classes, per project JS rules):
 *   <div data-deck>
 *     <article data-deck-card>…</article>   ← one per card
 *   </div>
 * Multiple decks per page are supported. Legacy option attributes from the
 * hover-repel era (data-deck-repel, data-deck-min-width-disabled, …) are
 * ignored, so older markup — including whatever Webflow still carries — keeps
 * working with this bundle.
 *
 * The home results deck is Webflow-owned markup that cannot be given data
 * attributes from this repo, so it is wired by its structural classes
 * (.zoku-home-results_cards / _card) — the same shim the hover-repel build used.
 *
 * Each card's start offset is measured against the viewport's right edge, so
 * every card genuinely begins beyond the screen no matter where its deck sits
 * in the layout. Host sections must clip horizontal overflow while cards are
 * parked offscreen (all current deck sections do — overflow hidden on
 * .zoku-home-results / .zoku-unique / .zoku-catalyse / .zoku-means, and
 * .section.cc-clip on the growth "things we do not do" section).
 *
 * Powered by GSAP + ScrollTrigger (global on every page). Early-exits under
 * prefers-reduced-motion or missing GSAP, leaving the resting layout untouched.
 */
(function () {
  const DURATION = 0.9;
  const EASE = 'power3.out';
  const STAGGER = 0.12;
  // Extra px beyond the viewport edge so box-shadows/borders never peek in.
  const OVERSHOOT = 40;

  let decks = [];

  function init(scope) {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const root = scope || document;
    const found = [];

    root.querySelectorAll('[data-deck]').forEach((wrap) => {
        found.push(Array.from(wrap.querySelectorAll('[data-deck-card]')));
    });

    // Home results deck — legacy class-based hook (Webflow owns this markup).
    root.querySelectorAll('.zoku-home-results_cards').forEach((wrap) => {
        if (wrap.matches('[data-deck]')) return; // already collected above
        found.push(Array.from(wrap.querySelectorAll('.zoku-home-results_card')));
    });

    found.forEach((cards) => {
        if (cards.length === 0) return;

        // Distance each card travels: resting spot → fully beyond the
        // viewport's right edge. Measured before any transform is applied.
        const offsets = cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return Math.max(0, window.innerWidth - rect.left) + OVERSHOOT;
        });

        cards.forEach((card, i) => {
            gsap.set(card, { x: offsets[i], willChange: 'transform' });
        });

        const tween = gsap.to(cards, {
            x: 0,
            duration: DURATION,
            ease: EASE,
            stagger: STAGGER,
            paused: true,
            // Hand the cards back to the CSS once settled — no lingering
            // transform/will-change on the resting layout.
            onComplete: () => gsap.set(cards, { clearProps: 'transform,willChange' }),
        });

        const trigger = ScrollTrigger.create({
            trigger: cards[0].parentElement || cards[0],
            start: 'top 80%',
            once: true,
            onEnter: () => tween.play(),
        });

        decks.push({ trigger, tween, cards });
    });
  }

  function destroy() {
      decks.forEach(({ trigger, tween, cards }) => {
          trigger.kill();
          tween.kill();
          gsap.set(cards, { clearProps: 'transform,willChange' });
      });
      decks = [];
  }

  if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
  else init(document);
})();
