#!/usr/bin/env bash
# Roda todas as suítes contra um servidor local do site.
set -e
cd "$(dirname "$0")/.."
# v747: PORT=8790 bash tests/run.sh roda numa porta própria (dois worktrees
# testando ao mesmo tempo disputavam a 8765 e cada um lia os arquivos do outro)
PORT="${PORT:-8765}"
export BASE_URL="http://127.0.0.1:$PORT" MT_BASE="http://127.0.0.1:$PORT"
# v756: o fuso é cravado aqui também, pra o node E o chromium concordarem com o
# painel (que decide "hoje" em hora local). Sem isso, rodar às 22h no Brasil
# fazia a semente dizer "amanhã" e a suíte ficava vermelha "do nada".
export TZ="${TZ:-America/Sao_Paulo}"

# v756: a porta era ocupada às cegas. `python3 -m http.server` que não consegue
# fazer bind morre em silêncio (a saída ia pro /dev/null) e as suítes rodavam
# contra QUALQUER coisa que respondesse ali — inclusive outro worktree. Isso é
# "testei o repositório errado" sem nenhum aviso na tela.
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/assets/versao.js"; then
  echo "!! a porta $PORT já está ocupada."
  echo "   Rode com PORT=8790 bash tests/run.sh (ou derrube o servidor antigo)."
  echo "   Sem isso as suítes testariam os arquivos de OUTRA pasta."
  exit 2
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$(pwd)" >/dev/null 2>&1 &
SRV=$!
trap "kill $SRV 2>/dev/null" EXIT

# espera ativa: `sleep 1` chutava o tempo de subida
PRONTO=0
for _ in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/assets/versao.js"; then PRONTO=1; break; fi
  sleep 0.25
done
if [ "$PRONTO" != "1" ]; then
  echo "!! o servidor de teste não subiu na porta $PORT"
  exit 2
fi

FALHAS=0
TOTAL=0
for t in tests/test-*.js; do
  echo "===== $t ====="
  TOTAL=$((TOTAL+1))
  # v756: teto por suíte. Sem ele, uma suíte pendurada segurava o lote até os
  # 30 min do job do CI, sem dizer qual travou.
  timeout 600 node "$t" || FALHAS=$((FALHAS+1))
done
# v756: o número de suítes sai daqui, medido — a doc dizia 20 e o workflow 21
# quando já eram 26, e quem comparava não sabia se tinha faltado alguma
echo "===== $TOTAL suítes · suites com falha: $FALHAS ====="
exit $FALHAS
