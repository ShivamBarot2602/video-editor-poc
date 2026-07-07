#!/usr/bin/env bash
# Build docs/STT-Provider-POC-Summary.{pdf,docx} from docs/STT-Provider-POC-Summary.md.
#
#   PDF  — `npx md-to-pdf` honours the md's YAML front-matter (print CSS +
#          <div class="page-break"> markers; A4 landscape for the wide tables).
#          No install; npx caches.
#   DOCX — strip the front-matter + a few HTML helper tags, then `pandoc`.
#          (No LibreOffice/LaTeX needed on this machine.)
#
# Usage: bash scripts/build-stt-docs.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
SRC="$DOCS/STT-Provider-POC-Summary.md"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▶ PDF via npx md-to-pdf …"
( cd "$DOCS" && npx --yes md-to-pdf STT-Provider-POC-Summary.md )
echo "✔ $DOCS/STT-Provider-POC-Summary.pdf  ($(du -h "$DOCS/STT-Provider-POC-Summary.pdf" | cut -f1))"

echo "▶ DOCX via pandoc …"
# Drop YAML front-matter (lines up to and including the 2nd '---'), convert the
# styled <p> helpers to plain markdown, and remove the page-break divs.
awk 'BEGIN{fm=0} /^---$/{fm++; next} fm>=2{print}' "$SRC" \
  | sed -E \
      -e 's#<p class="subtitle">(.*)</p>#*\1*#' \
      -e 's#<p class="meta">(.*)</p>#\1#' \
      -e 's#<p class="legend">(.*)</p>#\1#' \
      -e '/<div class="page-break"><\/div>/d' \
  > "$TMP/stt.md"
pandoc "$TMP/stt.md" -o "$DOCS/STT-Provider-POC-Summary.docx"
echo "✔ $DOCS/STT-Provider-POC-Summary.docx  ($(du -h "$DOCS/STT-Provider-POC-Summary.docx" | cut -f1))"
