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

# O mirror regional Azure pode entregar os pacotes Ubuntu muito lentamente.
# Usa o arquivo oficial, mantendo suites, componentes, chaves e verificações.
# Inclui as listas de mirrors usadas pelas imagens recentes do runner.
for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources /etc/apt/apt-mirrors*.txt; do
  if [[ -f "$source" ]] && grep -Eq 'https?://azure\.archive\.ubuntu\.com(/|[[:space:]]|$)' "$source"; then
    backup="$RUNNER_TEMP/torque-apt-backup/${source#/etc/apt/}"
    sudo mkdir -p -- "$(dirname "$backup")"
    sudo cp -p -- "$source" "$backup"
    sudo sed -E -i 's#https?://azure\.archive\.ubuntu\.com(/|[[:space:]]|$)#https://archive.ubuntu.com\1#g' "$source"
  fi
done
