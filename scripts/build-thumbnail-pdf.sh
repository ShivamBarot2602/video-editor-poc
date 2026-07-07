#!/usr/bin/env bash
# Build docs/Thumbnail-POC-Summary.{pdf,docx} from docs/Thumbnail-POC-Summary.md.
#
#   PDF  — `npx md-to-pdf` honours the md's YAML front-matter (print CSS +
#          <div class="page-break"> markers). No install; npx caches.
#   DOCX — strip the front-matter + a few HTML helper tags, then `pandoc`.
#          (No LibreOffice/LaTeX needed on this machine.)
#
# (Mirrors build-clips-docs.sh / build-stt-docs.sh — builds the deck from its
# own Summary.md, not from the comparison sheets.)
#
# Usage: bash scripts/build-thumbnail-pdf.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
SRC="$DOCS/Thumbnail-POC-Summary.md"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▶ PDF via npx md-to-pdf …"
( cd "$DOCS" && npx --yes md-to-pdf Thumbnail-POC-Summary.md )
echo "✔ $DOCS/Thumbnail-POC-Summary.pdf  ($(du -h "$DOCS/Thumbnail-POC-Summary.pdf" | cut -f1))"

echo "▶ DOCX via pandoc …"
awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$SRC" \
  | sed -E \
      -e 's#<p class="subtitle">(.*)</p>#*\1*#' \
      -e 's#<p class="meta">(.*)</p>#\1#' \
      -e 's#<p class="legend">(.*)</p>#\1#' \
      -e '/<div class="page-break"><\/div>/d' \
  > "$TMP/thumb.md"
pandoc "$TMP/thumb.md" -o "$DOCS/Thumbnail-POC-Summary.docx"
echo "✔ $DOCS/Thumbnail-POC-Summary.docx  ($(du -h "$DOCS/Thumbnail-POC-Summary.docx" | cut -f1))"
