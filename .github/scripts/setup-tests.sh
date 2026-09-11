#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npm ci --prefix tests/runtime --ignore-scripts --no-audit --no-fund
npm ci --prefix tests/sql --ignore-scripts --no-audit --no-fund
# Versões e integridades no lock revisado e versionado. Não atualiza dependências.
npm ci --prefix tests/ci --ignore-scripts --no-audit --no-fund
bash .github/scripts/prepara-playwright-ci.sh
node tests/ci/node_modules/playwright/cli.js install --with-deps chromium
sudo mkdir -p /opt/node22/lib/node_modules /opt/pw-browsers
sudo ln -sfn "$PWD/tests/ci/node_modules/playwright" /opt/node22/lib/node_modules/playwright
CHROME=$(node -e "console.log(require('./tests/ci/node_modules/playwright').chromium.executablePath())")
sudo ln -sfn "$CHROME" /opt/pw-browsers/chromium
