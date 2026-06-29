#!/usr/bin/env bash
# Build docs/FFmpeg-Commands.pdf from docs/FFmpeg-Commands.md.
#
#   PDF — `npx md-to-pdf` honours the md's YAML front-matter (print CSS +
#         <div class="page-break"> markers). No install; npx caches.
#
# Usage: bash scripts/build-ffmpeg-docs.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"

echo "▶ PDF via npx md-to-pdf …"
( cd "$DOCS" && npx --yes md-to-pdf FFmpeg-Commands.md )
echo "✔ $DOCS/FFmpeg-Commands.pdf  ($(du -h "$DOCS/FFmpeg-Commands.pdf" | cut -f1))"
