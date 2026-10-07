#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/dist/EasyTier-Magisk-v2.6.4-module-ui3.zip}"
mkdir -p "$(dirname "$OUT")"
if [[ -e "$OUT" ]]; then
  echo "refusing to overwrite existing package: $OUT" >&2
  exit 1
fi
(
  cd "$ROOT/module"
  zip -r9 "$OUT" . -x 'run/*' '*.bak' '*.new' 'log.log' 'web.log' 'update.lock' \
    'easytier-web' 'easytier_web.sh' 'disable_web' 'config/web/*' \
    'config/web_port' 'config/config_server_port' 'config/config_server_protocol'
)
echo "$OUT"
