#!/usr/bin/env bash
set -euo pipefail

# O Chromium vem do Playwright. O repositório APT do Chrome pré-instalado
# no runner não participa dos testes e pode impedir a atualização do Ubuntu
# quando o índice externo está no meio de uma publicação (Hash Sum mismatch).
# Preserva os arquivos no diretório temporário; não desativa validação de hashes.
if [[ "${GITHUB_ACTIONS:-}" != "true" || -z "${RUNNER_TEMP:-}" ]]; then
  echo "Preparação restrita ao runner temporário do GitHub Actions."
  exit 0
fi

for source in /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  if [[ -f "$source" ]] && grep -q 'dl.google.com/linux/chrome' "$source"; then
    sudo mv -- "$source" "$RUNNER_TEMP/$(basename "$source").disabled"
  fi
done
