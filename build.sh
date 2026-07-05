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

# --check verifies the committed bundles are fresh WITHOUT touching the working
# tree (used by the pre-commit hook); no arg does the normal in-place build.
check=0
[[ "${1:-}" == "--check" ]] && check=1

version="$(cat VERSION)"

# ── Version stamp ──────────────────────────────────────────────────────────
# VERSION (repo root) is the SINGLE place to bump the shipped release tag. The
# stamp below rewrites the pinned @vX.Y.Z tag in-place into the two hand-pinned
# sources so barba-init's lazy halftone URL and the webflow-snippet core pin
# stay in lock-step — never edit those tags by hand. After tagging vX.Y.Z the
# git tag MUST match VERSION. (macOS/BSD sed needs the empty -i '' argument.)
if [[ "$check" == 1 ]]; then
  # --check must not modify the tree: assert the stamp is already applied.
  for f in barba-init.js webflow-snippet.html; do
    grep -q "zoku-scripts@v${version}" "$f" \
      || { echo "STALE: $f is not stamped with zoku-scripts@v${version} — run ./build.sh"; exit 1; }
  done
else
  sed -i '' "s|zoku-scripts@v[0-9][0-9.]*|zoku-scripts@v${version}|g" barba-init.js
  sed -i '' "s|zoku-scripts@v[0-9][0-9.]*|zoku-scripts@v${version}|g" webflow-snippet.html
fi

core=(barba-init nav-menu nav-theme hero-intro pillars portfolio card-deck testimonials-slider process-scroll pullquote-cranes)
half=(halftone-shader scroll-scrub trifecta-line)

# build <outfile> <name> <module…> — <name> is the committed bundle basename
# stamped into the header, so a --check build into .build-check/ produces bytes
# identical to the committed bundle (the header must not encode the temp path).
build() {
  local out="$1" name="$2"; shift 2
  : > "$out"
  printf '/* %s — generated bundle from: %s. Do not edit directly; edit the source modules and run ./build.sh. */\n' "$name" "$*" >> "$out"
  for m in "$@"; do
    printf '\n/* ==== %s.js ==== */\n' "$m" >> "$out"
    cat "$m.js" >> "$out"
  done
  node --check "$out"
  echo "built $out ($(wc -c < "$out") bytes)"
}

if [[ "$check" == 1 ]]; then
  # Build into a temp dir and diff against the committed bundles; the tree is
  # never modified. rm always runs (success or failure) via the EXIT trap.
  tmp=".build-check"
  rm -rf "$tmp"; mkdir -p "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  build "$tmp/zoku-core.js" zoku-core.js "${core[@]}"
  build "$tmp/zoku-halftone.js" zoku-halftone.js "${half[@]}"
  stale=0
  for b in zoku-core.js zoku-halftone.js; do
    diff -q "$b" "$tmp/$b" >/dev/null 2>&1 \
      || { echo "STALE: $b differs from a fresh build — run ./build.sh"; stale=1; }
  done
  [[ "$stale" == 0 ]] && echo "bundles are fresh"
  exit "$stale"
fi

build zoku-core.js zoku-core.js "${core[@]}"
build zoku-halftone.js zoku-halftone.js "${half[@]}"
