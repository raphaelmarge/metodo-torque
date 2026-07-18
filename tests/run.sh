#!/usr/bin/env bash
# Roda todas as suítes contra um servidor local do site.
set -e
cd "$(dirname "$0")/.."
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap "kill $SRV 2>/dev/null" EXIT
sleep 1
FALHAS=0
for t in tests/test-*.js; do
  echo "===== $t ====="
  node "$t" || FALHAS=$((FALHAS+1))
done
echo "===== suites com falha: $FALHAS ====="
exit $FALHAS
