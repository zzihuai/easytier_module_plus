#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/dist/EasyTier-Magisk-v2.6.4-webui1.zip}"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
(
  cd "$ROOT/module"
  zip -r9 "$OUT" .     -x 'run/*' '*.bak' '*.new' 'log.log' 'web.log' 'update.lock'
)
echo "$OUT"
