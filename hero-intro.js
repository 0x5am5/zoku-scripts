/**
 * Hero intro + scroll scrub — home page hero animation.
 *
 * LOAD: staggers the home hero headline lines and the "Learn more" CTA into
 * view (opacity 0 → 1, y 28 → 0, power3.out), matching the nav menu's
 * entrance feel, while the halftone branch sprite auto-plays its bloom
 * (owned by halftone-shader.js).
 *
 * SCROLL: everything in the hero scrubs simultaneously, tied to scroll
 * position across the hero's first-viewport travel (fully reversible):
 *   - "from inception" drifts 50px right and fades out
 *   - "to escape velocity" drifts 50px left and fades out
 *   - the "Learn more" CTA fades out (autoAlpha, so it also stops being
 *     clickable once invisible)
 *   - the halftone background darkens (wrapper opacity 0.8 → 0 over the
 *     near-black section surface)
 *   - the branch sprite plays frame-by-frame BACKWARDS —
 *     ZokuHalftone.setProgress(bg, 1 − scrollProgress)
 *
 * TWO ScrollTriggers, deliberately split:
 *   - The FRAMES trigger is created immediately at init. setProgress claims
 *     the sprite, but the shader renders min(intro clock, scrub) for claimed
 *     play-once sprites — so at rest (scrub = 1) the claim is a no-op and the
 *     bloom plays out; scrolling AT ANY TIME (even mid-bloom) scrubs back
 *     from wherever playback has reached, never jumping. Parked mid-scroll,
 *     the bloom keeps playing up to the scroll cap and holds; returning to
 *     the top lets it complete to the final frame, resetting the experience.
 *   - The VISUALS timeline (line drift/fades, bg darken) is built only in the
 *     intro tween's onComplete, so its start values capture the settled
 *     post-intro state (no opacity fight, no mid-fade capture). If the reader
 *     scrolled during the intro, it renders at the live progress on creation.
 *
 * Markup contract (index.html — no extra hooks needed, so the Webflow page
 * needs no attribute changes):
 *   [data-hero-intro]        — the headline wrapper
 *     [data-hero-line] ×2    — the two headline lines (staggered first)
 *     [data-hero-cta]        — the "Learn more" button (last)
 *   The hero <section> is the wrapper's closest('section'); the halftone
 *   background is that section's [data-halftone] element.
 *
 * The halftone bundle is lazy-loaded, so ZokuHalftone may not exist yet when
 * init runs on a first page load — a short bounded poll lands the initial
 * claim once the API appears (matters at rest under reduced motion, where the
 * claim is what shows the final bloomed frame instead of a frozen frame 0).
 *
 * Reduced motion: the intro reveals instantly (existing behaviour) and the
 * move/fade tweens are skipped, but the sprite still follows scroll
 * (user-driven, the same convention as the trifecta scrub) resting on its
 * final bloomed frame. Targets data attributes, never classes, and bails out
 * early when the hero or GSAP is absent.
 */
(function () {
    let introTween = null;
    let scrubTl = null;   // visuals timeline (carries its own ScrollTrigger)
    let scrubSt = null;   // frames ScrollTrigger (created at init)
    let apiPoll = 0;      // bounded wait for the lazy halftone bundle

    function destroy() {
        if (introTween) { introTween.kill(); introTween = null; }
        if (scrubTl) {
            if (scrubTl.scrollTrigger) scrubTl.scrollTrigger.kill();
            scrubTl.kill();
            scrubTl = null;
        }
        if (scrubSt) { scrubSt.kill(); scrubSt = null; }
        if (apiPoll) { clearInterval(apiPoll); apiPoll = 0; }
    }

    /** Reverse frame scrub: scroll 0 = final (bloomed) frame, hero scrolled past = first. */
    function driveFrames(bg, p) {
        const api = window.ZokuHalftone;
        if (!bg || !api || typeof api.setProgress !== 'function') return;
        api.setProgress(bg, 1 - p);
    }

    /** The scrubbed move/fade timeline — built once the intro has landed. */
    function buildVisualScrub(section, bg, lines, cta) {
        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        if (!gsap || !ScrollTrigger) return;

        scrubTl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
            },
        });
        if (lines[0]) scrubTl.to(lines[0], { x: 50, autoAlpha: 0 }, 0);
        if (lines[1]) scrubTl.to(lines[1], { x: -50, autoAlpha: 0 }, 0);
        if (cta) scrubTl.to(cta, { autoAlpha: 0 }, 0);
        if (bg) scrubTl.to(bg, { opacity: 0 }, 0);
    }

    function init(scope) {
        // Idempotent: on first page load barba-init calls initPage twice (its own
        // explicit first-load call PLUS Barba's afterEnter hook, which Barba v2
        // fires during barba.init()). Tear down any previous intro/scrub first so
        // the double call can't stack a second ScrollTrigger on the hero.
        destroy();

        const root = scope || document;
        const hero = root.querySelector('[data-hero-intro]');
        if (!hero) return;

        const section = hero.closest('section') || hero;
        const bg = section.querySelector('[data-halftone]');
        const lines = section.querySelectorAll('[data-hero-line]');
        const cta = section.querySelector('[data-hero-cta]');

        // Ordered targets: the two lines first, then the CTA.
        const targets = [...lines, ...(cta ? [cta] : [])];
        if (!targets.length) return;

        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Frames scrub — live from the first scrolled pixel (see header: the
        // shader's min(clock, scrub) cap makes the immediate claim safe).
        if (gsap && ScrollTrigger && typeof gsap.registerPlugin === 'function' && bg) {
            gsap.registerPlugin(ScrollTrigger);
            scrubSt = ScrollTrigger.create({
                trigger: section,
                start: 'top top',
                end: 'bottom top',
                scrub: true,
                onUpdate: (self) => driveFrames(bg, self.progress),
            });
            driveFrames(bg, scrubSt.progress);
            // Lazy halftone bundle may not have landed yet — poll briefly so the
            // initial claim (and the reduced-motion resting bloom) still applies.
            if (!window.ZokuHalftone) {
                let tries = 0;
                apiPoll = setInterval(() => {
                    tries += 1;
                    if (window.ZokuHalftone) {
                        clearInterval(apiPoll);
                        apiPoll = 0;
                        if (scrubSt) driveFrames(bg, scrubSt.progress);
                    } else if (tries >= 40) {
                        clearInterval(apiPoll);
                        apiPoll = 0;
                    }
                }, 250);
            }
        }

        // LCP fallback handoff: styles.css reveals the lines via a bounded CSS
        // animation (zoku-hero-reveal-fallback, 1.8s delay) in case this module
        // is slow to arrive. If that reveal is already painting, adopt the
        // visible state instead of replaying the intro (killing the animation
        // without inlining opacity would snap the lines back to the pre-hide
        // state and blink them off). Either way the animation must be cleared:
        // a filled CSS animation overrides GSAP's inline styles, which would
        // pin the lines visible and break the scroll-out fade.
        const fallbackPainting = targets.some(
            (el) => parseFloat(window.getComputedStyle(el).opacity) > 0.01
        );
        targets.forEach((el) => { el.style.animation = 'none'; });

        // No GSAP or reduced motion: reveal immediately, no animation. (CSS already
        // shows them under reduced-motion, but clear inline state defensively.)
        if (!gsap || prefersReduced) {
            targets.forEach((el) => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            return;
        }

        // CSS fallback got there first — adopt its end state and skip straight
        // to the scroll scrub.
        if (fallbackPainting) {
            targets.forEach((el) => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
            buildVisualScrub(section, bg, lines, cta);
            return;
        }

        introTween = gsap.fromTo(
            targets,
            { opacity: 0, y: 28 },
            {
                opacity: 1,
                y: 0,
                duration: 0.7,
                ease: 'power3.out',
                stagger: 0.14,
                delay: 0.1,
                // No clearProps: the CSS pre-hide (.zoku-js [data-hero-line]) is the
                // resting state, so the final inline opacity:1 / y:0 must persist to
                // keep the lines visible after the tween.
                onComplete: () => {
                    introTween = null;
                    buildVisualScrub(section, bg, lines, cta);
                },
            }
        );
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
