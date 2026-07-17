(function () {
    let mm = null;          // gsap.matchMedia() for the pinned card deck (desktop only)
    let ledeTween = null;   // the lede fade-in (carries its own ScrollTrigger)

    function destroy() {
        if (ledeTween) {
            if (ledeTween.scrollTrigger) ledeTween.scrollTrigger.kill();
            ledeTween.kill();
            ledeTween = null;
        }
        if (mm) { mm.revert(); mm = null; } // reverts tweens + ScrollTriggers + class changes
    }

    function init(scope) {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const section = (scope || document).querySelector('.zoku-home-pillars');
        if (!section) return;

        // Clear any leftovers from a prior page (defensive — destroy() runs first
        // on navigation, but a direct re-init should be idempotent too).
        destroy();

        gsap.registerPlugin(ScrollTrigger);

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lede = section.querySelector('.zoku-home-pillars_lede');
        const cards = Array.from(section.querySelectorAll('.zoku-home-pillars_card'));

        // Lede rises + fades in once on approach, across every breakpoint.
        //
        // The lede is PRE-HIDDEN in CSS (`.zoku-js .zoku-home-pillars_lede`,
        // disabled under reduced-motion) so it is never visible before its
        // reveal. Previously a from-tween with immediateRender:false left it at
        // its natural opacity:1 until the `top 75%` trigger fired — so it was
        // seen plainly as it scrolled up into view, then snapped to 0 and faded
        // back in (a visible flash). A CSS pre-hide removes that window, exactly
        // like the hero intro.
        //
        // With the pre-hide in place we must drive it with a fromTo to an
        // EXPLICIT opacity:1 end (a from-tween would animate 0 → 0 against the
        // CSS-hidden natural state). immediateRender:false keeps GSAP from
        // writing the "from" values at creation, so the CSS hidden state holds
        // until the tween actually plays; toggleActions (no `once`) lets
        // ScrollTrigger re-sync on every refresh — including the refresh the
        // deck pin below and each Barba swap force — so it self-heals.
        //
        // Clear any inline opacity/transform a prior (killed) instance left on
        // the lede so it falls back to the CSS pre-hide, not a stale inline 0.
        if (lede && !reduceMotion) {
            gsap.set(lede, { clearProps: 'opacity,transform' });
            ledeTween = gsap.fromTo(lede,
                { opacity: 0, y: 32 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.9,
                    ease: 'power2.out',
                    immediateRender: false,
                    scrollTrigger: {
                        trigger: section,
                        start: 'top 75%',
                        toggleActions: 'play none none none',
                    },
                });
        }

        if (cards.length < 2) return;
        const [cardOne, cardTwo] = cards;

        // Pin live at the bottom of the sticky nav rather than flush at the viewport
        // top. Locking the pin target at y=0 tucks its top edge behind the nav,
        // swallowing the top padding so the content reads cramped/"too high".
        // Offsetting the start by the nav height lets the padding sit fully below the
        // nav. Read live (function + invalidateOnRefresh) so a resize re-measures it.
        const navHeight = () => document.querySelector('.zoku-nav')?.offsetHeight || 0;

        const hidden = { yPercent: 130, opacity: 0, scale: 1, transformOrigin: '50% 100%', willChange: 'transform, opacity' };

        // Desktop card-deck deal-in, two phases so the cards are already in motion
        // on approach rather than waiting for the pin:
        //   1. Card one deals in scrubbed across the approach — from the section top
        //      crossing three-quarters of the way down the viewport to the pin point
        //      — so it is fully landed when the pin engages.
        //   2. The section pins and card two rises over card one, pushing it back
        //      into a dimmed shade.
        // Returns a cleanup that resets the cards + stage.
        function buildDeck(pinTarget) {
            const stage = section.querySelector('.zoku-home-pillars_cards');
            if (!stage) return null;

            stage.classList.add('cc-deck');

            // Both cards start below the stage, transparent. Card two sits above card
            // one in the DOM, so it naturally stacks in front.
            gsap.set([cardOne, cardTwo], hidden);

            // Phase 1 — card one deals in on approach, landing exactly at the pin.
            //
            // Opacity is NOT ramped across the glide: the cards' frosted glass
            // (backdrop-filter in the Designer styles) composites in proportion to
            // element opacity, so a fade the length of the travel reads as the
            // BLUR animating from thin to full. Instead a short head tween snaps
            // the card solid inside the first 10% of the approach — while it is
            // still parked ~130% below the stage, effectively off-screen — and
            // the whole visible glide runs at full frost.
            const intro = gsap.timeline({
                scrollTrigger: {
                    trigger: pinTarget,
                    start: 'top 75%',
                    end: () => 'top top+=' + navHeight(),
                    scrub: 0.6,
                    invalidateOnRefresh: true,
                },
            });
            intro.to(cardOne, { opacity: 1, duration: 0.1, ease: 'none' }, 0);
            intro.to(cardOne, { yPercent: 0, duration: 1, ease: 'power3.out' }, 0);

            const tl = gsap.timeline({
                defaults: { ease: 'power3.out' },
                scrollTrigger: {
                    trigger: pinTarget,
                    start: () => 'top top+=' + navHeight(),
                    end: '+=80%',
                    scrub: 0.6,
                    pin: pinTarget,
                    pinSpacing: true,
                    // No anticipatePin: it engages the pin early in proportion to
                    // scroll velocity, so the (un-animated) lede heading visibly
                    // snaps up ~30px instead of freezing seamlessly at the exact
                    // geometric pin point. Pinning precisely at `start` keeps the
                    // heading locked in its current position with no jolt.
                    invalidateOnRefresh: true,
                },
            });

            // Phase 2 — after a short beat, card two slides up into the front while
            // card one is pushed back — lifted, scaled down and dimmed like a shade.
            // fromTo with immediateRender:false so card one's recorded start is its
            // landed state, not the hidden set() above.
            //
            // Frost stays constant here too (see the phase-1 note): card two's
            // opacity snaps solid in a 0.05 head — it only starts overlapping card
            // one from tl time ~0.21, by which point it is already opaque — and
            // card one's push-back dims via filter:brightness rather than opacity,
            // which would thin its backdrop blur as card two crosses it.
            //
            // The 0.15 beat is also load-bearing: ScrollTrigger renders a scrubbed
            // timeline at progress 0 when the trigger is created (and on refresh),
            // and immediateRender:false does not suppress THAT render. A fromTo
            // child sitting at position 0 would paint its from values (card one
            // landed, opaque) at first load, and the intro tween above would then
            // lazily record them as its start — no-oping the whole deal-in. Any
            // position > 0 keeps the creation render from touching the cards.
            tl.to(cardTwo, { opacity: 1, duration: 0.05, ease: 'none' }, 0.15);
            tl.to(cardTwo, { yPercent: 0, duration: 0.7 }, 0.15);
            tl.fromTo(cardOne,
                { yPercent: 0, scale: 1, filter: 'brightness(1)' },
                { yPercent: -8, scale: 0.94, filter: 'brightness(0.55)', duration: 0.7, immediateRender: false }, 0.15);

            return () => {
                if (intro.scrollTrigger) intro.scrollTrigger.kill();
                intro.kill();
                stage.classList.remove('cc-deck');
                gsap.set([cardOne, cardTwo], { clearProps: 'all' });
            };
        }

        // matchMedia auto-cleans on resize / breakpoint change.
        mm = gsap.matchMedia();

        // Desktop (≥992px): pin the whole section so the lede column stays in view
        // beside the dealing cards. The pin makes the lede's sticky offset redundant
        // and fights ScrollTrigger, so cc-pinned drops it back to static meanwhile.
        mm.add('(min-width: 992px) and (prefers-reduced-motion: no-preference)', () => {
            section.classList.add('cc-pinned');
            const cleanup = buildDeck(section);
            return () => {
                section.classList.remove('cc-pinned');
                if (cleanup) cleanup();
            };
        });

        // Mobile / tablet (≤991px): no deck — the cards simply stack in normal
        // flow and scroll like any other content. A two-phase scrubbed deal-in
        // (approach glide + pinned rise, mirroring the desktop deck) was tried
        // here and retired: on short viewports it read as jank, not choreography.
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
