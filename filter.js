(function () {
  // Generic, data-driven list filter — powers the Portfolio ("Product") and
  // Resources ("Category") listings, and any future filtered list, from the
  // same engine. It is deliberately agnostic to WHAT the categories are: add a
  // new filter type entirely in Webflow (a new button + a new CMS category)
  // without touching this file.
  //
  // ── Markup contract ──────────────────────────────────────────────────────
  //   Menu:    the button group. Auto-detected via [data-filter-menu] OR the
  //            existing .zoku-resources-filter_menu class (so the current pages
  //            need no wrapper change).
  //   Buttons: descendants carrying data-filter="<slug>". A value of "all"
  //            (or "*", or empty) is the reset button that shows everything.
  //   Items:   the filterable cards carry data-filter-item="<slug> [<slug>…]"
  //            — a space/comma-separated list of the category slugs they belong
  //            to (multiple categories per item supported). In Webflow, bind
  //            this custom attribute's value to the item's Category / Product
  //            CMS field (its slug). An item with no data-filter-item is never
  //            hidden (it opts out of filtering).
  //   Scope:   an item belongs to a menu when it lives inside the menu's scope.
  //            Scope = the element matched by the menu's data-filter-target
  //            selector, else the menu's closest [data-filter-scope] /
  //            .zoku-resources-listing / section / main. This lets several
  //            independent filters coexist on one page.
  //   Empty:   an optional [data-filter-empty] element inside the scope is
  //            shown only when a filter matches zero items.
  //
  // The button slug is matched verbatim against the item slugs, so the two must
  // agree — e.g. a "Zoku Ventures" button is data-filter="zoku-ventures" and
  // its items are data-filter-item="zoku-ventures". The slug strings themselves
  // carry no meaning to this code.

  var HIDDEN_CLASS = 'cc-filtered-out';

  function init(scope) {
    var root = scope || document;

    var menus = Array.prototype.slice.call(
      root.querySelectorAll('[data-filter-menu], .zoku-resources-filter_menu')
    );
    // When re-initialised inside a Barba container the menu itself may be the
    // scope root rather than a descendant of it.
    if (root.matches && root.matches('[data-filter-menu], .zoku-resources-filter_menu')) {
      menus.push(root);
    }

    menus.forEach(setupMenu);
  }

  function setupMenu(menu) {
    // Guard against double-binding when a page is re-initialised (Barba).
    if (menu.dataset.filterReady === '1') return;
    menu.dataset.filterReady = '1';

    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hasGsap = typeof window.gsap !== 'undefined';

    var buttons = Array.prototype.slice.call(menu.querySelectorAll('[data-filter]'));
    if (!buttons.length) return;

    var scopeEl = resolveScope(menu);
    var emptyEl = scopeEl.querySelector('[data-filter-empty]');

    // Normalise a raw attribute value into lowercase slug tokens.
    var tokensOf = function (value) {
      return (value || '')
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean);
    };

    var itemsOf = function () {
      // Re-query each time so CMS lists rendered/paginated after init are
      // still picked up.
      return Array.prototype.slice.call(scopeEl.querySelectorAll('[data-filter-item]'));
    };

    var isAll = function (slug) {
      return !slug || slug === 'all' || slug === '*';
    };

    var apply = function (slug, opts) {
      var animate = !(opts && opts.animate === false) && !prefersReducedMotion && hasGsap;
      var all = isAll(slug);
      var shown = [];

      itemsOf().forEach(function (item) {
        var match = all || tokensOf(item.getAttribute('data-filter-item')).indexOf(slug) !== -1;
        var wasHidden = item.classList.contains(HIDDEN_CLASS);
        item.classList.toggle(HIDDEN_CLASS, !match);
        item.setAttribute('aria-hidden', match ? 'false' : 'true');
        if (match) {
          shown.push(item);
          // Only animate items that are newly appearing.
          if (animate && wasHidden) {
            window.gsap.fromTo(item,
              { opacity: 0, y: 16 },
              { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' }
            );
          }
        }
      });

      if (emptyEl) emptyEl.style.display = shown.length ? 'none' : '';
    };

    var setActive = function (btn, opts) {
      buttons.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('cc-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply((btn.getAttribute('data-filter') || '').toLowerCase(), opts);
    };

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        setActive(btn);
      });
    });

    // Initial state: honour a button the markup pre-marks active, else the
    // first "all" button, else the first button. No entry animation on load.
    var initial = buttons.filter(function (b) {
      return b.classList.contains('cc-active') || b.getAttribute('aria-pressed') === 'true';
    })[0];
    if (!initial) {
      initial = buttons.filter(function (b) {
        return isAll((b.getAttribute('data-filter') || '').toLowerCase());
      })[0] || buttons[0];
    }
    setActive(initial, { animate: false });
  }

  // Find the region a menu controls (see the Scope note in the header).
  function resolveScope(menu) {
    var target = menu.getAttribute('data-filter-target');
    if (target) {
      var el = document.querySelector(target);
      if (el) return el;
    }
    return (
      menu.closest('[data-filter-scope], .zoku-resources-listing, section, main') ||
      document
    );
  }

  if (window.ZokuPage) window.ZokuPage.register({ init });
  else init(document);
})();
