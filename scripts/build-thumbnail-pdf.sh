#!/usr/bin/env bash
# Build docs/Thumbnail-POC-Summary.pdf from the comparison markdowns.
#
# Concatenates source mds with page-break markers, runs `npx md-to-pdf`,
# moves the result into docs/. No npm install — npx downloads on first run
# and caches afterward.
#
# Usage: bash scripts/build-thumbnail-pdf.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Page-break div is honored by md-to-pdf's default Marked HTML pipeline when
# rendered with print CSS — the wkhtmltopdf-like Chrome backend respects
# `page-break-after: always` on `<div class="page-break">`. The default
# md-to-pdf stylesheet already includes that rule.
{
  cat "$DOCS/thumbnail-pricing.md"
  printf '\n\n<div class="page-break"></div>\n\n'
  cat "$DOCS/thumbnail-features-comparison.md"
} > "$TMP/combined.md"

echo "▶ Generating PDF via npx md-to-pdf …"
( cd "$TMP" && npx --yes md-to-pdf combined.md )

mv "$TMP/combined.pdf" "$DOCS/Thumbnail-POC-Summary.pdf"
echo "✔ $DOCS/Thumbnail-POC-Summary.pdf  ($(du -h "$DOCS/Thumbnail-POC-Summary.pdf" | cut -f1))"
