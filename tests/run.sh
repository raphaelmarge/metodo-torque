#!/usr/bin/env bash
# Roda todas as suítes contra um servidor local do site.
set -e
cd "$(dirname "$0")/.."
# v747: PORT=8790 bash tests/run.sh roda numa porta própria (dois worktrees
# testando ao mesmo tempo disputavam a 8765 e cada um lia os arquivos do outro)
PORT="${PORT:-8765}"
export BASE_URL="http://127.0.0.1:$PORT" MT_BASE="http://127.0.0.1:$PORT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
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
