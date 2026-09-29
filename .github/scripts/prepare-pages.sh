#!/usr/bin/env bash
# Roda somente depois de todos os testes. Nunca empacota node_modules ou saídas
# não versionadas e nunca escolhe uma main mais nova do que a efetivamente testada.
set -euo pipefail
: "${RUNNER_TEMP:?RUNNER_TEMP não definido}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT não definido}"
if ! git diff --quiet HEAD --; then
  echo 'Arquivos versionados foram modificados durante os testes. Não publicar.' >&2
  exit 1
fi
commit=$(git rev-parse HEAD)
if [[ -n "${GITHUB_SHA:-}" && "$commit" != "$GITHUB_SHA" ]]; then
  echo 'O checkout não corresponde ao commit do evento. Não publicar.' >&2
  exit 1
fi
dest=$(mktemp -d "$RUNNER_TEMP/torque-pages.XXXXXX")
git archive --format=tar HEAD | tar -xf - -C "$dest"
node tools/mapa-config/gera.js "$dest"
python3 - "$dest" "$commit" <<'PY'
import hashlib, json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
version = re.search(r'MT_VERSAO\s*=\s*"(mt-v\d+)"', (root / 'assets/versao.js').read_text())
if not version:
    raise SystemExit('Versão do artefato ausente; publicação bloqueada.')
map_config = (root / 'assets/mapa-config.js').read_bytes()
info = {'commit': sys.argv[2], 'version': version[1],
        'mapbox_configured': bool(re.search(rb'mapboxToken\s*=\s*"pk\.', map_config)),
        'mapbox_config_sha256': hashlib.sha256(map_config).hexdigest()}
(root / 'release-info.json').write_text(json.dumps(info) + '\n')
PY
printf 'path=%s\n' "$dest" >> "$GITHUB_OUTPUT"
printf 'Artefato aprovado: %s\n' "$commit"
