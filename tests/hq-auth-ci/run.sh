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
proxy_pid=''
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
  if [[ -n "$proxy_pid" ]]; then
    kill "$proxy_pid" 2>/dev/null || true
    wait "$proxy_pid" 2>/dev/null || true
  fi
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

# Docker does not reliably publish host ports on an exclusively internal bridge
# (moby/moby#36174). The Linux host can reach that bridge directly. Keep it
# internal and forward only the three fixed test ports through this child process.
# No arbitrary target, hostname, environment endpoint or traffic log is accepted.
HQ_AUTH_CI_PROJECT="$project" HQ_AUTH_CI_COMPOSE="$infra/compose.yml" node <<'NODE' &
'use strict';
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const project = process.env.HQ_AUTH_CI_PROJECT;
const file = path.join(process.env.HQ_AUTH_CI_ARTIFACT_DIR, 'transport.json');
const ports = [['db', 55433, 5432], ['auth', 59999, 9999], ['rest', 53000, 3000]];
const servers = [], sockets = new Set();
let stopping = false;
let checking = 'internal network identity';
const write = status => fs.writeFileSync(file, JSON.stringify({ status, host: '127.0.0.1', ports: ports.map(x => x[1]) }) + '\n');
const stop = code => {
  if (stopping) return;
  stopping = true;
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
  process.exit(code);
};
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
const docker = args => execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim();
const check = (condition, label) => { if (!condition) throw new Error(label); };
const ipv4 = value => value.split('.').reduce((sum, part) => sum * 256 + Number(part), 0) >>> 0;
const inSubnet = (ip, cidr) => {
  if (typeof cidr !== 'string') return false;
  const [base, prefix] = cidr.split('/');
  if (!net.isIPv4(base) || !/^\d+$/.test(prefix || '') || Number(prefix) < 8 || Number(prefix) > 30) return false;
  const mask = (0xffffffff << (32 - Number(prefix))) >>> 0;
  return (ipv4(ip) & mask) === (ipv4(base) & mask);
};
const probe = (host, port) => new Promise((resolve, reject) => {
  const socket = net.connect({ host, port });
  socket.setTimeout(3000);
  socket.once('connect', () => { socket.destroy(); resolve(); });
  socket.once('timeout', () => { socket.destroy(); reject(new Error('tcp_timeout')); });
  socket.once('error', () => { socket.destroy(); reject(new Error('tcp_unavailable')); });
});
(async () => {
  write('starting');
  check(/^hq-auth-ci-\d+-\d+$/.test(project), 'project_identity');
  const networkName = project + '_default';
  const network = JSON.parse(docker(['network', 'inspect', networkName, '--format', '{"id":{{json .Id}},"internal":{{.Internal}},"driver":{{json .Driver}},"project":{{json (index .Labels "com.docker.compose.project")}},"ipam":{{json .IPAM.Config}}}']));
  check(network.internal === true && network.driver === 'bridge' && network.project === project && /^[a-f0-9]{64}$/.test(network.id), 'internal_network_identity');
  const compose = ['compose', '--env-file', '/dev/null', '--project-name', project, '--file', process.env.HQ_AUTH_CI_COMPOSE];
  for (const [service, localPort, targetPort] of ports) {
    checking = service + ' 127.0.0.1:' + localPort;
    const id = docker([...compose, 'ps', '--quiet', service]);
    check(/^[a-f0-9]{12,64}$/.test(id), 'container_identity');
    const container = JSON.parse(docker(['inspect', '--format', '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"networks":{{json .NetworkSettings.Networks}}}', id]));
    check(container.project === project && container.service === service, 'container_scope');
    check(Object.keys(container.networks).length === 1 && container.networks[networkName]?.NetworkID === network.id, 'exclusive_internal_network');
    const target = container.networks[networkName].IPAddress;
    check(net.isIPv4(target) && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(target), 'private_ipv4');
    check(Array.isArray(network.ipam) && network.ipam.some(x => inSubnet(target, x.Subnet)), 'network_subnet');
    await probe(target, targetPort);
    const server = net.createServer(client => {
      const upstream = net.connect({ host: target, port: targetPort });
      sockets.add(client); sockets.add(upstream);
      client.on('close', () => { sockets.delete(client); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.pipe(upstream); upstream.pipe(client);
    });
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(localPort, '127.0.0.1', resolve);
    });
    check(server.address().address === '127.0.0.1' && server.address().port === localPort, 'loopback_binding');
    await probe('127.0.0.1', localPort);
    console.log('CI transport ' + service + ': 127.0.0.1:' + localPort + ' ready');
  }
  write('ready');
})().catch(() => { write('failed'); console.error('CI loopback transport failed: ' + checking); stop(1); });
NODE
proxy_pid=$!
transport_ready=false
for attempt in {1..30}; do
  if ! kill -0 "$proxy_pid" 2>/dev/null; then
    printf '%s\n' 'Loopback transport exited before readiness.' >&2
    exit 1
  fi
  if node -e 'const fs=require("node:fs"),path=require("node:path");const p=path.join(process.env.HQ_AUTH_CI_ARTIFACT_DIR,"transport.json");process.exit(fs.existsSync(p)&&JSON.parse(fs.readFileSync(p,"utf8")).status==="ready"?0:1)' >/dev/null 2>&1; then
    transport_ready=true
    break
  fi
  sleep 1
done
test "$transport_ready" = true

# Existing concurrency tests make and drop their own random database. Their Auth
# stubs never touch hq_auth_ci, whose auth schema belongs to real GoTrue.
node tests/test-hq-concurrency-pg.js
"${compose[@]}" exec -T db psql -X -q -U postgres -d hq_auth_ci -v ON_ERROR_STOP=1 < "$infra/public-fixtures.sql"
printf '%s\n' 'Minimal public fixtures installed after real Auth migrations.'
node tests/hq-auth-ci/test-auth-http.cjs
printf '%s\n' 'Auth/PostgREST checks completed; discarding the entire stack.'
