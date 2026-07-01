#!/usr/bin/env bash
# Regenerate the shipped bundles from the source modules.
# Usage: ./build.sh   (then commit zoku-core.js + zoku-halftone.js)
#
#  zoku-core.js      loaded on every page (Barba superset). barba-init MUST be
#                    first (it defines window.ZokuPage before modules register).
#  zoku-halftone.js  lazy-loaded by barba-init only when a page has [data-halftone].
#                    halftone-shader MUST precede scroll-scrub (defines ZokuHalftone).
set -euo pipefail
cd "$(dirname "$0")"

core=(barba-init nav-menu nav-theme hero-intro results pillars portfolio card-deck testimonials-slider process-scroll pullquote-cranes)
half=(halftone-shader scroll-scrub trifecta-line)

build() {
  local out="$1"; shift
  : > "$out"
  printf '/* %s — generated bundle from: %s. Do not edit directly; edit the source modules and run ./build.sh. */\n' "$out" "$*" >> "$out"
  for m in "$@"; do
    printf '\n/* ==== %s.js ==== */\n' "$m" >> "$out"
    cat "$m.js" >> "$out"
  done
  node --check "$out"
  echo "built $out ($(wc -c < "$out") bytes)"
}

build zoku-core.js "${core[@]}"
build zoku-halftone.js "${half[@]}"
