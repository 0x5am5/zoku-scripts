/*
 * "What our clients think" carousel — powered by Smooothy.
 * https://github.com/vallafederico/smooothy (UMD global: window.Smooothy, v0.0.35)
 *
 * Each `.zoku-testimonials-rail_track` marked with [data-testimonials-slider]
 * becomes a Smooothy slider (lerped drag, momentum, free-scroll). The `//DRAG`
 * pill trails the cursor while the pointer is inside the rail.
 *
 * One shared rAF loop drives every slider + pill, but it is KICK-AND-IDLE, not
 * always-on. It runs only while something is actually moving — a rail being
 * dragged/touched, a rail whose animated `current` has not yet caught its
 * `target`, or a pill easing toward the cursor — and stops itself (cancels the
 * frame) the moment everything has settled. Any input that can create motion
 * kicks it back to life: the pill's pointer handlers, wheel/trackpad scroll,
 * window resize, and an IntersectionObserver that fires when a rail scrolls
 * into view. This keeps the main thread idle on pages where the rail sits off
 * screen or untouched.
 *
 * Why the IntersectionObserver: Smooothy's own update() no-ops while its wrapper
 * is off screen (it self-gates on an internal IntersectionObserver — root:null,
 * rootMargin 50px, threshold 0). If we treated an off-screen, mid-transit rail as
 * "unsettled" the loop would spin forever making no progress, so we mirror that
 * same observer here: rails only count toward "still moving" while visible, and a
 * rail scrolling back into view re-kicks the loop so it finishes settling.
 *
 * Re-runnable for Barba navigation: init() builds the sliders for the current
 * <main>; destroy() cancels the rAF loop, disconnects the observer and tears
 * down the Smooothy instances (which self-bind window/drag listeners) so nothing
 * leaks across page swaps.
 *
 * Conventions: targets data-attributes for JS hooks, exits early when nothing is
 * present, and respects prefers-reduced-motion (near-instant settle, no fade).
 */
(function () {
    let sliders = [];   // { s, track, visible } — s is the Smooothy instance
    let cleanups = [];  // teardown for any window/element listeners we bind
    let io = null;      // IntersectionObserver gating the loop to on-screen rails
    let rafId = 0;

    function destroy() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (io) { io.disconnect(); io = null; }
        cleanups.forEach((fn) => fn());
        cleanups = [];
        sliders.forEach((r) => { if (r.s && typeof r.s.destroy === 'function') r.s.destroy(); });
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

        // Settled threshold for the loop's idle test, in Smooothy's slide-width
        // units (current/target are multiplied by the item width to reach pixels).
        // ~5e-4 of a card is well under a pixel for any realistic card width, so we
        // stop the loop only once the motion is visually complete.
        const SETTLE_EPS = 0.0005;

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
            const s = new Smooothy(track, Object.assign({}, baseConfig, {
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
            }));
            sliders.push({ s, track, visible: false });

            // Trackpad / mouse-wheel horizontal scroll moves the slider's target via
            // Smooothy's internal virtual-scroll (even with scrollInput:false it reads
            // deltaX) but fires no pointer event, so the pointer handlers below would
            // miss it — kick the loop on wheel too. Passive: we only start the loop,
            // never preventDefault.
            const onWheel = () => kick();
            track.addEventListener('wheel', onWheel, { passive: true });
            cleanups.push(() => track.removeEventListener('wheel', onWheel));
        });

        if (!sliders.length) return;

        // Mirror Smooothy's own visibility gate (root:null, rootMargin 50px,
        // threshold 0) so our "visible" window matches the one that decides whether
        // update() does anything. We (a) exclude off-screen rails from the settled
        // test — update() can't progress them, so treating them as busy would spin
        // the loop forever — and (b) re-kick when a rail scrolls back into view so a
        // rail frozen mid-transit finishes settling.
        const byTrack = new Map();
        sliders.forEach((rec) => byTrack.set(rec.track, rec));
        io = new IntersectionObserver((entries) => {
            let entered = false;
            entries.forEach((entry) => {
                const rec = byTrack.get(entry.target);
                if (!rec) return;
                rec.visible = entry.isIntersecting;
                if (entry.isIntersecting) entered = true;
            });
            if (entered) kick();
        }, { root: null, rootMargin: '50px', threshold: 0 });
        sliders.forEach((rec) => io.observe(rec.track));

        // --- //drag pill: fluid cursor trail ----------------------------------
        // The pill eases toward the cursor each frame (a gentle lag). The rAF loop
        // lerps its position; it fades in on enter, out on leave.
        const PILL_EASE = reduceMotion ? 1 : 0.14; // per-frame; lower = more trail
        const pills = [];
        (scope || document).querySelectorAll('.zoku-testimonials-rail_viewport').forEach((viewport) => {
            const pill = viewport.querySelector('.zoku-testimonials-rail_drag');
            if (!pill) return;

            // The pill is centred and press-scaled entirely through its CSS
            // `transform: translate(-50%,-50%) scale(var(--zoku-drag-scale,1))`.
            // Writing inline `transform` from JS would clobber both, so we position
            // it with the standalone CSS `translate` property, which composes on top
            // of `transform` (and, unlike left/top, stays on the compositor — no
            // per-frame layout). Zero the CSS left/top (they default to 50%/50%) so
            // `translate: x y` is measured from the viewport's top-left corner and
            // lands the pill's centre exactly at (x, y).
            pill.style.left = '0';
            pill.style.top = '0';

            const p = { pill, viewport, tx: 0, ty: 0, x: 0, y: 0, active: false };
            const setTarget = (e) => {
                const rect = viewport.getBoundingClientRect();
                p.tx = e.clientX - rect.left;
                p.ty = e.clientY - rect.top;
            };

            const onMove = (e) => { setTarget(e); kick(); };
            const onEnter = (e) => {
                setTarget(e);
                p.x = p.tx;
                p.y = p.ty; // snap on entry — no fly-in from a stale position
                pill.style.translate = p.x + 'px ' + p.y + 'px';
                p.active = true;
                pill.classList.add('is-visible');
                kick(); // start easing the pill toward the cursor
            };
            const onLeave = () => {
                p.active = false;
                pill.classList.remove('is-visible');
            };
            // Press the pill (shrink) the moment a drag begins on this rail. The
            // kick here also covers the drag itself starting the loop.
            const onDown = () => { pill.classList.add('is-pressed'); kick(); };

            viewport.addEventListener('pointerenter', onEnter);
            viewport.addEventListener('pointermove', onMove);
            viewport.addEventListener('pointerleave', onLeave);
            viewport.addEventListener('pointerdown', onDown);
            cleanups.push(() => {
                viewport.removeEventListener('pointerenter', onEnter);
                viewport.removeEventListener('pointermove', onMove);
                viewport.removeEventListener('pointerleave', onLeave);
                viewport.removeEventListener('pointerdown', onDown);
            });

            pills.push(p);
        });

        // Release every pressed pill on pointer up/cancel — bound to the window
        // so a release outside the rail (after dragging off it) still un-shrinks.
        // No kick needed here: a drag keeps the loop alive throughout (isDragging /
        // isTouching hold the settled test open every frame), and it keeps
        // re-queuing while |target − current| > eps, so the loop is already running
        // when the release lands and carries the post-release ease-back on its own.
        const releaseAll = () => pills.forEach((p) => p.pill.classList.remove('is-pressed'));
        window.addEventListener('pointerup', releaseAll);
        window.addEventListener('pointercancel', releaseAll);
        cleanups.push(() => {
            window.removeEventListener('pointerup', releaseAll);
            window.removeEventListener('pointercancel', releaseAll);
        });

        // Smooothy re-measures on resize (its own ResizeObserver); kick so any
        // re-settle after a layout change is applied, then the loop idles again.
        const onResize = () => kick();
        window.addEventListener('resize', onResize);
        cleanups.push(() => window.removeEventListener('resize', onResize));

        // Is anything still in motion? True while a pill is easing, or a *visible*
        // slider is being dragged/touched or has not yet eased to its target. Off-
        // screen sliders are skipped: update() no-ops there, so they can't progress
        // and must not hold the loop open (the observer re-kicks them on re-entry).
        function anyActive() {
            for (let i = 0; i < pills.length; i += 1) if (pills[i].active) return true;
            for (let i = 0; i < sliders.length; i += 1) {
                const rec = sliders[i];
                if (!rec.visible) continue;
                const s = rec.s;
                if (s.isDragging || s.isTouching || Math.abs(s.target - s.current) > SETTLE_EPS) return true;
            }
            return false;
        }

        // Single shared animation loop: drives every slider, then trails the pills,
        // then re-queues only while something is still moving — otherwise it stops
        // and waits for the next kick().
        function tick() {
            for (let i = 0; i < sliders.length; i += 1) sliders[i].s.update();
            for (let i = 0; i < pills.length; i += 1) {
                const p = pills[i];
                if (!p.active) continue; // freeze in place while fading out
                p.x += (p.tx - p.x) * PILL_EASE;
                p.y += (p.ty - p.y) * PILL_EASE;
                p.pill.style.translate = p.x + 'px ' + p.y + 'px';
            }
            rafId = anyActive() ? requestAnimationFrame(tick) : 0;
        }

        // Start the loop if it is not already running (idempotent).
        function kick() {
            if (!rafId) rafId = requestAnimationFrame(tick);
        }

        kick(); // initial layout settle; idles immediately if nothing needs moving
    }

    if (window.ZokuPage) window.ZokuPage.register({ init, destroy });
    else init(document);
})();
