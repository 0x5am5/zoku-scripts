/**
 * Slide-out navigation drawer + staged content entrance.
 *
 * Wires the nav MENU chip ([data-nav-toggle]) to the .zoku-menu panel
 * ([data-nav-menu]). The chip is the SINGLE open/close control: while the
 * drawer is open the nav is lifted above it (.zoku-nav gains .cc-menu-open,
 * CSS raises its z-index and collapses pointer-events to the chip) and the
 * chip's label ticks from MENU to CLOSE — per-letter spans slide horizontally
 * away, staggered, with the incoming word trailing in (pure CSS, keyed on
 * aria-expanded). Toggles the [open] attribute (CSS owns the panel/scrim
 * slide), keeps aria state in sync, locks body scroll, closes on scrim click
 * or Escape.
 *
 * On open, a GSAP timeline staggers the drawer contents in this order:
 *   1. The "// contents" eyebrow rises + fades in first (on its own).
 *   2. Overlapping the tail of (1): the rail mask (.zoku-menu_rail-mask,
 *      wrapping the dim track AND the purple progress segment) is revealed
 *      top→bottom via clip-path — the rail's children no longer animate on
 *      their own — and the menu links fade in in sync with the reveal.
 *      The links (and footer links below) fade WITHOUT moving: they are tap
 *      targets, and a y-rise meant an early tap on iOS landed on a moved
 *      element — the intermittent "needs two taps" bug.
 *   3. Once the list has finished, the footer items stagger in the same way.
 *
 * The entrance is timed to play DURING the panel's 0.8s slide-in — the
 * contents are already mid-motion when the slide uncovers them — and any
 * animated close (chip, scrim, Escape, or a followed link) REVERSES the same
 * timeline, sped up to land inside the panel's 0.5s slide-out.
 *
 * The rail spans the links only — the eyebrow sits above it. The purple
 * progress segment is shown ONLY when a menu link is the current page: it is
 * statically positioned next to the .cc-current link on open (no motion of
 * its own) and simply uncovered by the mask reveal. When no link is current
 * (e.g. the home page, which isn't a menu entry) the segment is hidden
 * entirely. This runs independent of GSAP so the placement/hiding holds under
 * prefers-reduced-motion too.
 *
 * GSAP is optional — without it (or under prefers-reduced-motion) the content
 * is simply shown with no animation (nothing is hidden in CSS).
 */
(function () {
    const toggle = document.querySelector('[data-nav-toggle]');
    const menu = document.querySelector('[data-nav-menu]');
    if (!toggle || !menu) return;

    const nav = toggle.closest('.zoku-nav');
    const panel = menu.querySelector('.zoku-menu_panel');
    const scrim = menu.querySelector('.zoku-menu_scrim');
    const closers = menu.querySelectorAll('[data-nav-close]');
    let lastFocus = null;

    // Re-open lockout. close() removes [open] immediately, but the panel takes
    // 0.5s to slide shut (and the chip label ~0.45s to tick CLOSE→MENU) — so a
    // second click landing in that window would hit the toggle's "open" branch
    // and bring the drawer straight back. That second click is the tail of a
    // close gesture (a double-click on the chip, or scrim-then-chip), not a
    // fresh open — the "menu won't close" bug. Animated closes stamp this
    // deadline and the open branch swallows clicks inside it. Instant closes
    // (bfcache/pagehide) and reduced-motion closes skip it: the drawer is
    // already visually gone, so there is no window to protect.
    const REOPEN_LOCK_MS = 600; // 0.5s slide-out + margin
    let reopenLockUntil = 0;

    // Pending removal of the nav's .cc-menu-open class on an animated close.
    // The class carries the open-state colour overrides (logo forced to the
    // light fill, chip to the dark set) — dropping it the instant close() runs
    // flipped the logo to its resting colour while the dark scrim was still
    // fading behind it, so on a light page the logo went dark-on-dark and
    // visibly vanished until the scrim cleared. The class is instead held for
    // the drawer's 0.5s exit so the colours revert exactly when the drawer is
    // gone. (aria-expanded still flips immediately — the CLOSE→MENU label tick
    // and the :has() colour fallback key on it — so the held class is what
    // keeps the combined :is(.cc-menu-open, :has(…)) selector matching.)
    let menuOpenClassTimer = null;

    // Elements whose CSS transitions must be bypassed for an instant close —
    // the drawer flow plus the chip's MENU/CLOSE letters (which would
    // otherwise visibly tick back on a bfcache-restore force-close).
    const flowEls = () => [menu, scrim, panel]
        .concat(Array.from(toggle.querySelectorAll('.zoku-nav_menu-char')))
        .filter(Boolean);
    // Drop any inline transition:none left behind by an instant close (notably
    // after a bfcache cycle cancels the clean-up rAF) so the next open animates.
    const clearInstantOverride = () => flowEls().forEach((el) => { el.style.transition = ''; });

    /* ---- Staged content entrance (GSAP) ------------------------------- */
    const gsap = window.gsap;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !!gsap && !prefersReduced;

    const eyebrow = menu.querySelector('.zoku-menu_eyebrow');
    const railMask = menu.querySelector('.zoku-menu_rail-mask');
    const progress = menu.querySelector('.zoku-menu_rail-progress');
    const listItems = menu.querySelectorAll('.zoku-menu_link');
    const footerItems = menu.querySelectorAll('.zoku-menu_footer-label, .zoku-menu_footer-link');

    let intro = null;

    // Everything the intro timeline animates. Cleared back to the resting
    // (visible) state once an entrance/exit has fully finished, so the next
    // open replays from scratch.
    const introEls = () => [eyebrow, railMask, ...listItems, ...footerItems].filter(Boolean);
    const clearIntro = () => {
        if (intro) { intro.kill(); intro = null; }
        if (gsap) gsap.set(introEls(), { clearProps: 'all' });
    };

    /**
     * Place the purple progress segment beside the current page's link.
     * Runs on every open (independent of GSAP), so the highlight lands in the
     * right spot even under prefers-reduced-motion. The segment is shown ONLY
     * when a link carries .cc-current (it sits centred on that link); when no
     * menu item is current (e.g. the home page, which isn't a menu entry) the
     * segment is hidden entirely — there is no section to mark. The segment
     * never moves on its own — the rail mask reveal simply uncovers it in
     * place. Returns the resting `top` offset within the rail, or null when
     * nothing is current.
     */
    const positionProgress = () => {
        if (!progress) return null;
        const rail = progress.parentElement;
        if (!rail) return null;
        const current = menu.querySelector('.zoku-menu_link.cc-current');
        if (!current) {
            // No active menu item — don't show the segment at all.
            progress.style.display = 'none';
            return null;
        }
        progress.style.display = '';
        const railRect = rail.getBoundingClientRect();
        const linkRect = current.getBoundingClientRect();
        // Match the segment height to the link it marks so it spans exactly one
        // list item, then align it to that link (heights match, so top-to-top).
        progress.style.height = linkRect.height + 'px';
        const restingTop = Math.max(linkRect.top - railRect.top, 0);
        progress.style.top = restingTop + 'px';
        return restingTop;
    };

    /**
     * Normalise a URL/href to a comparable path key: resolve relative to the
     * current page, then drop any `.html` extension, `index` filenames and
     * trailing slashes, and lowercase. So "growth.html", "/growth", "/growth/"
     * and an absolute URL to the same page all collapse to one key. This lets
     * the active link be matched against the live link hrefs with NO hardcoded
     * page names and no dependence on the `.html` suffix — it behaves the same
     * on the static build and on Webflow's extensionless URLs, and adapts on its
     * own when pages are added, removed or renamed.
     */
    const normalisePath = (url) => {
        if (url == null) return null;
        let path;
        try { path = new URL(url, location.href).pathname; } catch (e) { return null; }
        path = path
            .replace(/\/index\.html?$/i, '/') // /dir/index.html → /dir/
            .replace(/\.html?$/i, '')          // strip .html elsewhere
            .replace(/\/+$/, '')               // drop trailing slashes
            .toLowerCase();
        return path === '' ? '/' : path;
    };

    /**
     * Mark the menu link for `pathname` (defaults to the current URL) as current,
     * derived dynamically from the link hrefs so adding/removing/renaming pages
     * needs no JS change. A link matches when its href resolves to the current
     * page; failing that, a link may opt into "section" grouping with a
     * `data-nav-match` attribute listing extra page slugs — e.g. the resources
     * link can carry `data-nav-match="article case-study"` so those detail pages
     * still light it up. Exposed for SPA navigation (Barba): the menu lives in
     * the persistent wrapper and isn't re-rendered on a swap, so the active state
     * is re-synced per transition. Repositions the tracker when the drawer is open.
     */
    const syncCurrent = (pathname) => {
        const here = normalisePath(pathname || location.pathname);
        const hereSeg = (here || '').split('/').pop();
        const links = Array.from(listItems);
        // 1. Exact match: a link whose href resolves to the current page.
        let active = links.find((l) => {
            const target = normalisePath(l.getAttribute('href'));
            return target !== null && target === here;
        });
        // 2. Fallback: optional section grouping via data-nav-match.
        if (!active) {
            active = links.find((l) => (l.getAttribute('data-nav-match') || '')
                .split(/[\s,]+/).filter(Boolean)
                .some((tok) => tok.toLowerCase().replace(/\.html?$/, '') === hereSeg));
        }
        links.forEach((l) => l.classList.toggle('cc-current', l === active));
        if (menu.hasAttribute('open')) positionProgress();
        return active || null;
    };

    window.ZokuNav = { syncCurrent };

    // Resolve the active link on load — dynamic, independent of any hardcoded
    // cc-current in the markup and of whether Barba is present.
    syncCurrent();

    const buildIntro = () => {
        if (!animate) return null;

        // Place the progress segment beside the current link now the panel is
        // laid out — it rests there statically; the mask reveal uncovers it.
        positionProgress();

        // The panel slide is 0.8s quint-out — it LOOKS ~90% open by ~0.3s, and
        // the left-aligned contents only clear the panel edge around then. So
        // everything starts at (or a hair after) t=0 and is compressed enough
        // that the contents are already mid-motion the moment the slide
        // uncovers them, and the list settles with the panel (~0.8s) rather
        // than animating after the drawer has visibly opened.
        const t0 = 0;              // eyebrow leads, with the first frame of the slide
        const eyebrowDur = 0.35;   // "// contents" rises + fades in first
        const reveal = 0.1;        // rail mask + list begin almost immediately
        const railDraw = 0.4;      // mask reveals top → bottom
        const itemDur = 0.45;
        const listStagger = 0.06;  // tight — the whole list lands as the panel settles
        const footerOverlap = 0.3; // footer begins while the list tail is still settling
        const listEnd = reveal + listStagger * Math.max(listItems.length - 1, 0) + itemDur;

        const tl = gsap.timeline({ paused: true });

        // 1. Eyebrow rises + fades in first, on its own.
        if (eyebrow) {
            tl.fromTo(eyebrow,
                { opacity: 0, y: 28 },
                { opacity: 1, y: 0, duration: eyebrowDur, ease: 'power3.out' }, t0);
        }

        // 2. Rail mask reveals track + progress together, top → bottom, while
        //    the list items rise/fade in sync with it.
        if (railMask) {
            tl.fromTo(railMask,
                { clipPath: 'inset(0% 0% 100% 0%)' },
                { clipPath: 'inset(0% 0% 0% 0%)', duration: railDraw, ease: 'power2.out' }, reveal);
        }
        if (listItems.length) {
            // Opacity-only: the links are tap targets, and rising them 28px
            // meant an early tap on iOS landed on a moved/neighbouring link
            // (the intermittent two-tap bug). A static hit target always takes
            // the first tap; the mask reveal + stagger still carry the motion.
            tl.fromTo(listItems,
                { opacity: 0 },
                { opacity: 1, duration: itemDur, ease: 'power3.out', stagger: listStagger }, reveal);
        }

        // 3. Footer items stagger in once the list has finished.
        if (footerItems.length) {
            // Opacity-only for the same reason as the list — the footer links
            // are tap targets too (the label just keeps in step with them).
            tl.fromTo(footerItems,
                { opacity: 0 },
                { opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.1 }, listEnd - footerOverlap);
        }

        return tl;
    };

    const open = () => {
        // Clear any stale transition:none override (e.g. after a bfcache cycle)
        // so the slide-in animates normally.
        clearInstantOverride();
        lastFocus = document.activeElement;
        menu.setAttribute('open', '');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        // Lift the nav above the drawer so the chip stays clickable as CLOSE
        // (CSS: z-index raise + pointer-events collapse to the chip + blur fade).
        // Cancel any pending post-close removal first — reopening inside the
        // previous close's 0.5s hold must not have the class yanked mid-open.
        if (menuOpenClassTimer !== null) { clearTimeout(menuOpenClassTimer); menuOpenClassTimer = null; }
        if (nav) nav.classList.add('cc-menu-open');
        if (panel) panel.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        if (animate) {
            if (intro) intro.kill();
            intro = buildIntro();
            if (intro) intro.play(0);
        } else {
            // No animation — still place (or hide) the highlight per the current link.
            positionProgress();
        }

        // Focus stays on the toggle — it is the close control (now reading
        // CLOSE), so there is nothing better to move focus to.
    };

    /**
     * Close the drawer. Pass { instant: true } to skip the slide animation — used
     * when force-closing on a pagehide / bfcache restore / load so a leaked [open]
     * never flashes or "animates out" on (re)load. The instant path bypasses the
     * transitions for one frame (inline transition:none + forced reflow) then
     * clears the override on the next frame, and skips focus restoration.
     */
    const close = (opts) => {
        const instant = !!(opts && opts.instant);
        if (!instant && !prefersReduced) {
            reopenLockUntil = performance.now() + REOPEN_LOCK_MS;
        }
        if (instant) {
            flowEls().forEach((el) => { el.style.transition = 'none'; });
            void menu.offsetWidth; // commit transition:none before changing [open]
        }
        menu.removeAttribute('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        // Hold .cc-menu-open through the animated exit (see the note at the
        // top) so the logo/chip colours revert only once the drawer is gone.
        // Instant / reduced-motion closes drop it now — nothing is animating.
        if (nav) {
            if (menuOpenClassTimer !== null) clearTimeout(menuOpenClassTimer);
            if (instant || prefersReduced) {
                menuOpenClassTimer = null;
                nav.classList.remove('cc-menu-open');
            } else {
                menuOpenClassTimer = setTimeout(() => {
                    menuOpenClassTimer = null;
                    nav.classList.remove('cc-menu-open');
                }, 500); // matches the panel/scrim 0.5s exit
            }
        }
        if (panel) panel.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // Wind the entrance back so the close mirrors the open. An animated
        // close REVERSES the intro timeline, sped up so it lands inside the
        // panel's 0.5s slide-out (the drawer stays visible exactly that long);
        // the inline props are cleared once the reverse completes so the next
        // open replays from a clean resting state. An instant close skips the
        // motion entirely. (The progress segment is deliberately NOT cleared —
        // its inline top/height/display come from positionProgress, not GSAP,
        // and are recomputed on every open.)
        if (intro) {
            if (instant) {
                clearIntro();
            } else {
                const tl = intro;
                tl.eventCallback('onReverseComplete', () => {
                    if (intro === tl) clearIntro();
                });
                tl.timeScale(Math.max(tl.time() / 0.45, 1)).reverse();
            }
        }

        if (instant) {
            void menu.offsetWidth; // commit the transition-less close this frame
            requestAnimationFrame(clearInstantOverride);
        } else if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
    };

    toggle.addEventListener('click', () => {
        if (menu.hasAttribute('open')) {
            close();
        } else {
            // Mid-close clicks must not re-open — see the lockout note above.
            if (performance.now() < reopenLockUntil) return;
            open();
        }
    });

    closers.forEach((el) => el.addEventListener('click', close));

    // Close when a navigation link inside the drawer is followed. With SPA page
    // swaps (Barba) the nav + menu live in the persistent [data-barba="wrapper"]
    // and only <main> is replaced, so the open drawer would otherwise stay open
    // after navigating. Closing on click also reads cleanly on a full reload.
    menu.querySelectorAll('.zoku-menu_link, .zoku-menu_footer-link').forEach((link) => {
        link.addEventListener('click', close);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menu.hasAttribute('open')) close();
    });

    /* ---- Never let the drawer survive a navigation / restore --------------
     * The drawer lives outside the swapped <main>, so without these guards it
     * leaks open (with the body scroll locked) across (a) Barba SPA navigations
     * triggered by a non-menu link, and (b) back/forward bfcache restores — which
     * is the "menu is visible and animates out on refresh" symptom. All three
     * close instantly (no slide): there is nothing to animate on (re)load.
     *
     *   pagehide — close before the page freezes into the bfcache, so a restore
     *              never brings it back open (prevents the flash entirely).
     *   pageshow — safety net for any restore / hard refresh that still has
     *              [open] set; also clears a stale instant-transition override.
     *   init     — pre-paint guard for a served / restored [open] attribute.
     */
    const forceClosed = () => { if (menu.hasAttribute('open')) close({ instant: true }); };
    // Exposed now that `close` is defined — Barba closes the drawer on every
    // SPA navigation (see barba-init.js beforeLeave).
    window.ZokuNav.close = close;
    window.addEventListener('pagehide', forceClosed);
    window.addEventListener('pageshow', () => {
        forceClosed();
        clearInstantOverride();
    });
    forceClosed();

    /* ---- Enable transitions only after the first paint --------------------
     * Safari replays the menu's base-state transitions on the initial paint of
     * every load/refresh, sliding/fading the closed drawer OUT from its
     * UA-default position. CSS holds all menu transitions at `none` until
     * `html.zoku-menu-ready` is set; we add it after a double rAF so the
     * resting closed state has painted transition-free first. Set once and
     * left in place (it also survives Barba SPA swaps, since the menu and this
     * script persist), so real open/close interactions animate normally. */
    const markMenuReady = () => document.documentElement.classList.add('zoku-menu-ready');
    if (!document.documentElement.classList.contains('zoku-menu-ready')) {
        // Primary: a double rAF lands just after the closed state has painted.
        requestAnimationFrame(() => requestAnimationFrame(markMenuReady));
        // Fallbacks for tabs where rAF is throttled before first paint (e.g. a
        // page opened in a background tab): `load` fires regardless, and the
        // timeout is a final backstop. classList.add is idempotent.
        window.addEventListener('load', markMenuReady, { once: true });
        setTimeout(markMenuReady, 1000);
    }
})();
