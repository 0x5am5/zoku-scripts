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
 * Implementation notes:
 * - Visibility is detected with an IntersectionObserver, NOT a ScrollTrigger:
 *   deck sections sit below pinned sections (pillars/trifecta), whose
 *   pin-spacers shift trigger positions after creation, and the initial-load
 *   ScrollTrigger.refresh() interplay proved unreliable for a
 *   created-paused-then-played tween. The IO measures live geometry at fire
 *   time, so pinning never skews it. (Same pattern Smooothy uses internally.)
 * - The slide-in tween is created AT FIRE TIME (not pre-created and paused),
 *   so no earlier refresh/overwrite pass can invalidate it.
 * - init() is guarded per wrap: barba-init's afterEnter hook ALSO fires for
 *   the initial page load (Barba 2 behaviour), so init() runs twice on a
 *   direct load — a second measuring pass would see the already-parked cards
 *   and collapse every offset to ~40px.
 *
 * Early-exits under prefers-reduced-motion or missing GSAP, leaving the
 * resting layout untouched. No JS at all → cards simply rest in place.
 */
(function () {
  const DURATION = 0.9;
  const EASE = 'power3.out';
  const STAGGER = 0.12;
  // Extra px beyond the viewport edge so box-shadows/borders never peek in.
  const OVERSHOOT = 40;
  // Fire when the deck's top clears the bottom ~15% of the viewport.
  const IO_MARGIN = '0px 0px -15% 0px';

  let decks = [];
  const initialised = new WeakSet();

  function init(scope) {
    if (typeof gsap === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const root = scope || document;
    const found = [];

    root.querySelectorAll('[data-deck]').forEach((wrap) => {
        found.push({ wrap, cards: Array.from(wrap.querySelectorAll('[data-deck-card]')) });
    });

    // Home results deck — legacy class-based hook (Webflow owns this markup).
    root.querySelectorAll('.zoku-home-results_cards').forEach((wrap) => {
        if (wrap.matches('[data-deck]')) return; // already collected above
        found.push({ wrap, cards: Array.from(wrap.querySelectorAll('.zoku-home-results_card')) });
    });

    found.forEach(({ wrap, cards }) => {
        if (cards.length === 0) return;
        if (initialised.has(wrap)) return;
        initialised.add(wrap);

        // Distance each card travels: resting spot → fully beyond the
        // viewport's right edge. Measured before any transform is applied.
        const offsets = cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return Math.max(0, window.innerWidth - rect.left) + OVERSHOOT;
        });

        cards.forEach((card, i) => {
            gsap.set(card, { x: offsets[i], willChange: 'transform' });
        });

        const deck = { wrap, cards, observer: null, tween: null };

        const reveal = () => {
            if (deck.observer) { deck.observer.disconnect(); deck.observer = null; }
            deck.tween = gsap.to(cards, {
                x: 0,
                duration: DURATION,
                ease: EASE,
                stagger: STAGGER,
                // Hand the cards back to the CSS once settled — no lingering
                // transform/will-change on the resting layout.
                onComplete: () => gsap.set(cards, { clearProps: 'transform,willChange' }),
            });
        };

        deck.observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) reveal();
        }, { rootMargin: IO_MARGIN });
        deck.observer.observe(wrap);

        decks.push(deck);
    });
  }

  function destroy() {
      decks.forEach((deck) => {
          initialised.delete(deck.wrap);
          if (deck.observer) deck.observer.disconnect();
          if (deck.tween) deck.tween.kill();
          gsap.set(deck.cards, { clearProps: 'transform,willChange' });
      });
      decks = [];
  }

  if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
  else init(document);
})();
