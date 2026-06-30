/*
 * "What our clients think" carousel — powered by Smooothy.
 * https://github.com/vallafederico/smooothy (UMD global: window.Smooothy)
 *
 * Each `.zoku-testimonials-rail_track` marked with [data-testimonials-slider]
 * becomes a Smooothy slider (lerped drag, momentum, free-scroll). The `//DRAG`
 * pill trails the cursor while the pointer is inside the rail. One shared rAF
 * loop drives every slider + pill.
 *
 * Re-runnable for Barba navigation: init() builds the sliders for the current
 * <main>; destroy() cancels the rAF loop and tears down the Smooothy instances
 * (which self-bind window/drag listeners) so nothing leaks across page swaps.
 *
 * Conventions: targets data-attributes for JS hooks, exits early when nothing is
 * present, and respects prefers-reduced-motion (near-instant settle, no fade).
 */
(function () {
    let sliders = [];
    let cleanups = []; // teardown for any window/element listeners we bind
    let rafId = 0;

    function destroy() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        cleanups.forEach((fn) => fn());
        cleanups = [];
        sliders.forEach((s) => { if (s && typeof s.destroy === 'function') s.destroy(); });
        sliders = [];
    }

    function init(scope) {
        destroy(); // drop the previous page's sliders + rAF loop

        const tracks = (scope || document).querySelectorAll('[data-testimonials-slider]');
        if (!tracks.length) return;

        // Smooothy ships as a UMD bundle exposing window.Smooothy. Bail out
        // gracefully (native overflow keeps the cards reachable) if it failed to load.
        const Smooothy = window.Smooothy;
        if (typeof Smooothy !== 'function') return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const baseConfig = {
            infinite: false,
            // Free drag (no snap): a "drag to explore" bleed-rail, not a paginated
            // carousel — snapping would round back to slide 0 and spring the row back.
            snap: false,
            scrollInput: false, // drag + touch only — never hijack page scroll
            dragSensitivity: 0.0055,
            lerpFactor: reduceMotion ? 1 : 0.085,
            speedDecay: 0.85,
            bounceLimit: 0.08,
        };

        tracks.forEach((track) => {
            if (!track.children.length) return; // a slider needs at least one slide
            sliders.push(new Smooothy(track, Object.assign({}, baseConfig, {
                // Stop the drag when the cards' trailing edge reaches the track's
                // content-box right edge: wrapperWidth (incl. left rail-inset + right
                // padding) minus both paddings = the content-box width = the exact
                // reachable end. Read live so it tracks the responsive inset on resize.
                setOffset: ({ wrapperWidth }) => {
                    const cs = window.getComputedStyle(track);
                    return wrapperWidth
                        - (parseFloat(cs.paddingLeft) || 0)
                        - (parseFloat(cs.paddingRight) || 0);
                },
            })));
        });

        if (!sliders.length) return;

        // --- //drag pill: fluid cursor trail ----------------------------------
        // The pill eases toward the cursor each frame (a gentle lag). left/top carry
        // no CSS transition; the rAF loop lerps them. Fades in on enter, out on leave.
        const PILL_EASE = reduceMotion ? 1 : 0.14; // per-frame; lower = more trail
        const pills = [];
        (scope || document).querySelectorAll('.zoku-testimonials-rail_viewport').forEach((viewport) => {
            const pill = viewport.querySelector('.zoku-testimonials-rail_drag');
            if (!pill) return;

            const s = { pill, viewport, tx: 0, ty: 0, x: 0, y: 0, active: false };
            const setTarget = (e) => {
                const rect = viewport.getBoundingClientRect();
                s.tx = e.clientX - rect.left;
                s.ty = e.clientY - rect.top;
            };

            const onEnter = (e) => {
                setTarget(e);
                s.x = s.tx;
                s.y = s.ty; // snap on entry — no fly-in from a stale position
                pill.style.left = s.x + 'px';
                pill.style.top = s.y + 'px';
                s.active = true;
                pill.classList.add('is-visible');
            };
            const onLeave = () => {
                s.active = false;
                pill.classList.remove('is-visible');
            };
            // Press the pill (shrink) the moment a drag begins on this rail.
            const onDown = () => pill.classList.add('is-pressed');

            viewport.addEventListener('pointerenter', onEnter);
            viewport.addEventListener('pointermove', setTarget);
            viewport.addEventListener('pointerleave', onLeave);
            viewport.addEventListener('pointerdown', onDown);
            cleanups.push(() => {
                viewport.removeEventListener('pointerenter', onEnter);
                viewport.removeEventListener('pointermove', setTarget);
                viewport.removeEventListener('pointerleave', onLeave);
                viewport.removeEventListener('pointerdown', onDown);
            });

            pills.push(s);
        });

        // Release every pressed pill on pointer up/cancel — bound to the window
        // so a release outside the rail (after dragging off it) still un-shrinks.
        const releaseAll = () => pills.forEach((s) => s.pill.classList.remove('is-pressed'));
        window.addEventListener('pointerup', releaseAll);
        window.addEventListener('pointercancel', releaseAll);
        cleanups.push(() => {
            window.removeEventListener('pointerup', releaseAll);
            window.removeEventListener('pointercancel', releaseAll);
        });

        // Single shared animation loop: drives every slider, then trails the pills.
        function tick() {
            for (let i = 0; i < sliders.length; i += 1) sliders[i].update();
            for (let i = 0; i < pills.length; i += 1) {
                const s = pills[i];
                if (!s.active) continue; // freeze in place while fading out
                s.x += (s.tx - s.x) * PILL_EASE;
                s.y += (s.ty - s.y) * PILL_EASE;
                s.pill.style.left = s.x + 'px';
                s.pill.style.top = s.y + 'px';
            }
            rafId = requestAnimationFrame(tick);
        }
        rafId = requestAnimationFrame(tick);
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
