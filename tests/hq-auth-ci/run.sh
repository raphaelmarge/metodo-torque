#!/usr/bin/env bash
# Disposable GitHub Ubuntu runner only. Never source production configuration.
set +x
set -Eeuo pipefail

if [[ "${CI:-}" != true || "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != Linux ]]; then
  printf '%s\n' 'Refusing: this stack runs only in the authorized disposable GitHub Linux CI.' >&2
  exit 2
fi
if [[ ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ || ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]; then
  printf '%s\n' 'Refusing: missing GitHub run identity.' >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
repo="$PWD"
infra="$repo/tests/hq-auth-ci"
project="hq-auth-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
export HQ_AUTH_CI_ARTIFACT_DIR="$repo/artifacts/hq-auth-ci"
export HQ_AUTH_CI_DISPOSABLE=1
export HQ_AUTH_CI_PG_URL='postgresql://postgres:hq_auth_ci_postgres_test_only@127.0.0.1:55433/hq_auth_ci'
export HQ_AUTH_CI_AUTH_URL='http://127.0.0.1:59999'
export HQ_AUTH_CI_REST_URL='http://127.0.0.1:53000'
export HQ_AUTH_CI_JWT_SECRET='hq-auth-ci-only-hs256-secret-never-use-in-production-20260930'
export PGTESTURL='postgresql://postgres:hq_auth_ci_postgres_test_only@127.0.0.1:55433/postgres'
# Do not inherit a remote Docker context, Compose override, database service file,
# password file or production connection settings from a developer workstation.
unset DOCKER_CONTEXT DOCKER_HOST DOCKER_TLS_VERIFY DOCKER_CERT_PATH
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES
unset PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS DATABASE_URL
docker_local=(docker --host unix:///var/run/docker.sock)
compose=("${docker_local[@]}" compose --env-file /dev/null --project-name "$project" --file "$infra/compose.yml")
mkdir -p "$HQ_AUTH_CI_ARTIFACT_DIR"

if [[ -n "$("${docker_local[@]}" ps -aq --filter "label=com.docker.compose.project=$project")" ||
      -n "$("${docker_local[@]}" volume ls -q --filter "label=com.docker.compose.project=$project")" ||
      -n "$("${docker_local[@]}" network ls -q --filter "label=com.docker.compose.project=$project")" ]]; then
  printf '%s\n' 'Refusing: the disposable project name already has resources.' >&2
  exit 2
fi

collect_metadata() {
  HQ_AUTH_CI_PROJECT="$project" HQ_AUTH_CI_COMPOSE="$infra/compose.yml" node <<'NODE'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const output = process.env.HQ_AUTH_CI_ARTIFACT_DIR;
const docker = args => execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim();
const compose = ['compose', '--env-file', '/dev/null', '--project-name', process.env.HQ_AUTH_CI_PROJECT, '--file', process.env.HQ_AUTH_CI_COMPOSE];
const metadata = { scope: 'disposable-github-ci', commit: null, generatedAt: new Date().toISOString(), services: {}, images: {}, cleanup: 'pending' };
try { metadata.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
for (const name of ['db', 'auth', 'rest']) {
  try {
    const id = docker([...compose, 'ps', '--all', '--quiet', name]);
    metadata.services[name] = id ? JSON.parse(docker(['inspect', '--format', '{"status":{{json .State.Status}},"exitCode":{{.State.ExitCode}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}', id])) : { status: 'not_created' };
  } catch { metadata.services[name] = { status: 'metadata_unavailable' }; }
}
for (const image of ['postgres:17.11-bookworm', 'supabase/gotrue:v2.196.0', 'postgrest/postgrest:v14.17']) {
  try { metadata.images[image] = JSON.parse(docker(['image', 'inspect', '--format', '{"id":{{json .Id}},"repoDigests":{{json .RepoDigests}}}', image])); }
  catch { metadata.images[image] = { status: 'metadata_unavailable' }; }
}
fs.writeFileSync(path.join(output, 'infra.json'), JSON.stringify(metadata, null, 2) + '\n');
for (const [name, state] of Object.entries(metadata.services)) console.log('CI service ' + name + ': ' + state.status + (state.health ? '/' + state.health : ''));
NODE
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  collect_metadata || code=1
  local cleanup_status=completed
  if ! "${compose[@]}" down --volumes --remove-orphans --timeout 10; then
    cleanup_status=failed
    code=1
  fi
  HQ_AUTH_CI_CLEANUP="$cleanup_status" HQ_AUTH_CI_EXIT_CODE="$code" node <<'NODE'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(process.env.HQ_AUTH_CI_ARTIFACT_DIR, 'infra.json');
const summary = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { scope: 'disposable-github-ci' };
summary.cleanup = process.env.HQ_AUTH_CI_CLEANUP;
summary.exitCode = Number(process.env.HQ_AUTH_CI_EXIT_CODE);
fs.writeFileSync(file, JSON.stringify(summary, null, 2) + '\n');
// Publish a fresh allowlist projection, never the full JSON or raw diagnostics.
if (process.env.GITHUB_STEP_SUMMARY) {
  const states = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead', 'not_created', 'metadata_unavailable'];
  const health = ['starting', 'healthy', 'unhealthy'];
  const exitCode = value => Number.isInteger(value) && value >= 0 && value <= 255 ? String(value) : 'unavailable';
  const lines = ['\n### Infraestrutura descartavel HQ', '', '| Servico | Estado | Saude | Exit code |', '| --- | --- | --- | --- |'];
  for (const name of ['db', 'auth', 'rest']) {
    const state = summary.services?.[name] || {};
    lines.push('| ' + name + ' | ' + (states.includes(state.status) ? state.status : 'unavailable') + ' | ' + (health.includes(state.health) ? state.health : 'unavailable') + ' | ' + exitCode(state.exitCode) + ' |');
  }
  lines.push('', 'Limpeza: ' + (['completed', 'failed'].includes(summary.cleanup) ? summary.cleanup : 'unavailable') + '. Exit code final: ' + exitCode(summary.exitCode) + '.', '', '| Imagem fixada | Image ID | Repo digest resolvido |', '| --- | --- | --- |');
  for (const image of ['postgres:17.11-bookworm', 'supabase/gotrue:v2.196.0', 'postgrest/postgrest:v14.17']) {
    const resolved = summary.images?.[image] || {};
    const id = typeof resolved.id === 'string' && /^sha256:[a-f0-9]{64}$/.test(resolved.id) ? resolved.id : 'unavailable';
    const digests = Array.isArray(resolved.repoDigests) ? resolved.repoDigests.map(value => typeof value === 'string' ? value.match(/@(sha256:[a-f0-9]{64})$/)?.[1] : null).filter(Boolean) : [];
    lines.push('| ' + image + ' | ' + id + ' | ' + (digests.length ? [...new Set(digests)].join(', ') : 'unavailable') + ' |');
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
NODE
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '%s\n' 'Pulling the three pinned official test images.'
"${compose[@]}" pull --quiet
printf '%s\n' 'Starting disposable PostgreSQL, real Auth and PostgREST.'
"${compose[@]}" up --detach --pull never --wait --wait-timeout 180
test "$("${docker_local[@]}" network inspect "${project}_default" --format '{{.Internal}}')" = true
printf '%s\n' 'All services healthy; container network is internal.'

# Existing concurrency tests make and drop their own random database. Their Auth
# stubs never touch hq_auth_ci, whose auth schema belongs to real GoTrue.
node tests/test-hq-concurrency-pg.js
"${compose[@]}" exec -T db psql -X -q -U postgres -d hq_auth_ci -v ON_ERROR_STOP=1 < "$infra/public-fixtures.sql"
printf '%s\n' 'Minimal public fixtures installed after real Auth migrations.'
node tests/hq-auth-ci/test-auth-http.cjs
printf '%s\n' 'Auth/PostgREST checks completed; discarding the entire stack.'
