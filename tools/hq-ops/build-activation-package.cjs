'use strict';
// Local packaging only. No CLI execution, network, Git mutation or SQL execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const BASE_COMMIT = 'b05222a2852bd1e96d9a91804d3cd5bdd4f59d22';
const TARGET_PROJECT_REF = 'hdcufkaalxfhwmfwoiqp';
const HISTORICAL_FILE = '20260930193716_hq_referrals_ledger.sql';
const HISTORICAL_SOURCE = 'supabase/migrations/' + HISTORICAL_FILE;
const HISTORICAL_SHA256 = 'b98a9a3933b6a8fab8c0ed0d938e5ea0d6dd48cc34fcaf95d1f9164acc7957d7';
const HELP = `Prepara arquivos locais revisaveis; nao aplica SQL nem acessa a rede.

node tools/hq-ops/build-activation-package.cjs --write --ops-file <nome-CLI.sql>
  [--ledger-file <nome-CLI.sql>] [--portal-file <nome-CLI.sql>]

Sem --write, mostra esta ajuda e nao altera arquivos.
Os nomes devem ter sido criados pela CLI Supabase e os arquivos devem existir:
  OPS:    supabase/releases/hq-admin-minimal/migrations/<nome-CLI.sql>
  ledger: supabase/releases/hq-referrals-optional/migrations/<nome-CLI.sql>
  portal: supabase/releases/hq-influencer-optional/migrations/<nome-CLI.sql>

Somente templates SQL vazios ou copias identicas a fonte canonica sao aceitos.
Copias usam UTF-8/LF; hashes SHA-256 medem exatamente os bytes copiados.
Ledger/portal sao opcionais e nunca entram no pacote minimo.
O portal continua bloqueado; cada pacote exige decisao propria de ativacao.
Nao gere timestamps manualmente. Nenhum segredo ou configuracao remota e usado.
`;

function fail(message) { throw new Error(message); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes('\0') || text.startsWith('\uFEFF')) fail('Fonte SQL deve ser UTF-8 sem BOM/NUL.');
  return Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8');
}
function migrationName(value, flag) {
  if (typeof value !== 'string' || !/^\d{14}_[a-z][a-z0-9_]*\.sql$/.test(value)) {
    fail(flag + ': informe somente o basename SQL ja gerado pela CLI.');
  }
  if (value === HISTORICAL_FILE) fail(flag + ': a migration historica nao pode ser reutilizada.');
  return value;
}
function parseArgs(args) {
  const options = {};
  const names = { '--ops-file': 'opsFile', '--ledger-file': 'ledgerFile', '--portal-file': 'portalFile' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--write') { if (options.write) fail('--write duplicado.'); options.write = true; continue; }
    const key = names[arg];
    if (!key) fail('Opcao desconhecida: ' + arg);
    if (options[key] !== undefined) fail(arg + ' duplicado.');
    options[key] = migrationName(args[++i], arg);
  }
  if (options.write && !options.help && !options.opsFile) fail('--write exige --ops-file.');
  return options;
}

// Reject symlinks/junctions in every existing ancestor, and hard-linked files.
function noLinks(absolute) {
  const resolved = path.resolve(absolute), parsed = path.parse(resolved);
  let cursor = parsed.root;
  const parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) fail('Link/junction recusado: ' + cursor);
    if (index < parts.length - 1 && !stat.isDirectory()) fail('Ancestral nao e diretorio: ' + cursor);
    if (stat.isFile() && stat.nlink !== 1) fail('Arquivo com hard link recusado: ' + cursor);
  }
}
function within(root, relative) {
  const absolute = path.resolve(root, relative);
  const check = path.relative(root, absolute);
  if (!check || check === '..' || check.startsWith('..' + path.sep) || path.isAbsolute(check)) fail('Caminho fora do checkout.');
  noLinks(absolute);
  return absolute;
}
function regular(root, relative) {
  const absolute = within(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.nlink !== 1) fail('Fonte deve ser arquivo regular: ' + relative);
  return fs.readFileSync(absolute);
}
function source(root, relative) { return canonical(regular(root, relative)); }
function entry(sourcePath, file, bytes) { return { file, source: sourcePath, sha256: hash(bytes) }; }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
function baseManifest(mode) {
  return {
    schemaVersion: 1, mode, baseCommit: BASE_COMMIT, targetProjectRef: TARGET_PROJECT_REF,
    status: 'local-preparation-not-applied', approvalRequired: true,
    encoding: 'UTF-8', lineEndings: 'LF', hashAlgorithm: 'SHA-256'
  };
}
function sqlWithoutComments(bytes) {
  return bytes.toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}
function checkOps(bytes) {
  const sql = sqlWithoutComments(bytes);
  if (!/insert\s+into\s+torque_hq\.settings\s*\(id,\s*staff_enabled\)\s*values\s*\(true,\s*false\)/i.test(sql)) fail('OPS deve instalar staff_enabled=false.');
  if (/\b(?:hq_referrals_private|hq_influencer_private)\b/i.test(sql)) fail('OPS minimo nao pode incluir ledger/portal.');
  const publicFunctions = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_]+)\s*\(/gi)].map(x => x[1].toLowerCase()).sort();
  if (JSON.stringify(publicFunctions) !== JSON.stringify(['hq_ops_command', 'hq_ops_snapshot'])) fail('OPS minimo deve conter somente as duas RPCs publicas revisadas.');
}
function inventory(root, directory, files) {
  const absolute = within(root, directory);
  if (!fs.existsSync(absolute)) fail('Diretorio CLI ausente: ' + directory);
  const allowedFiles = new Set(files), allowedDirs = new Set();
  for (const file of files) {
    let parent = path.posix.dirname(file);
    while (parent !== '.') { allowedDirs.add(parent); parent = path.posix.dirname(parent); }
  }
  function walk(relative) {
    const full = within(root, directory + (relative ? '/' + relative : ''));
    if (!fs.lstatSync(full).isDirectory()) fail('Diretorio esperado: ' + full);
    for (const item of fs.readdirSync(full, { withFileTypes: true })) {
      const child = relative ? relative + '/' + item.name : item.name;
      const filename = within(root, directory + '/' + child);
      const stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        if (!allowedDirs.has(child)) fail('Diretorio fora da allowlist: ' + directory + '/' + child);
        walk(child);
      } else if (!stat.isFile() || !allowedFiles.has(child)) fail('Arquivo fora da allowlist: ' + directory + '/' + child);
    }
  }
  walk('');
}

function buildPlan(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '../..'));
  noLinks(root);
  const opsFile = migrationName(options.opsFile, '--ops-file');
  const selectedNames = [opsFile, HISTORICAL_FILE];
  if (options.ledgerFile) selectedNames.push(migrationName(options.ledgerFile, '--ledger-file'));
  if (options.portalFile) selectedNames.push(migrationName(options.portalFile, '--portal-file'));
  const versions = selectedNames.map(name => name.slice(0, 14));
  if (new Set(versions).size !== versions.length) fail('Versoes de migration repetidas; gere nomes distintos pela CLI.');
  if (options.ledgerFile && options.portalFile && options.portalFile.slice(0, 14) <= options.ledgerFile.slice(0, 14)) fail('Migration do portal deve suceder o patch ledger selecionado.');
  const historical = source(root, HISTORICAL_SOURCE);
  if (hash(historical) !== HISTORICAL_SHA256) fail('Migration historica divergiu dos bytes canonicos de b052; nenhuma escrita permitida.');
  const packages = [];
  function add(directory, manifest, artifacts, cliFile) {
    const targets = artifacts.map(artifact => ({ ...artifact, requireExisting: artifact.file === 'migrations/' + cliFile }))
      .concat({ file: 'manifest.json', bytes: jsonBytes(manifest), allowEmpty: false });
    inventory(root, directory, targets.map(x => x.file));
    // The CLI owns migration naming/creation. Packaging cannot create this template.
    regular(root, directory + '/migrations/' + cliFile);
    for (const artifact of targets) {
      const destination = within(root, directory + '/' + artifact.file);
      if (fs.existsSync(destination)) {
        const before = regular(root, directory + '/' + artifact.file);
        if (!before.equals(artifact.bytes) && !(artifact.allowEmpty && before.length === 0)) fail('Conteudo divergente; nao sobrescrever: ' + directory + '/' + artifact.file);
      }
    }
    packages.push({ directory, manifest, artifacts: targets });
  }
  const opsSource = 'supabase/hq-ops-proposal.sql', ops = source(root, opsSource);
  checkOps(ops);
  function rollbackFor(prefix) {
    const rollback = {}, artifacts = [];
    for (const action of ['suspend', 'resume']) {
      const filename = prefix + '-' + action + '.sql', sourcePath = 'supabase/rollback/' + filename, bytes = source(root, sourcePath);
      rollback[action] = entry(sourcePath, 'rollback/' + filename, bytes);
      artifacts.push({ file: rollback[action].file, bytes, allowEmpty: false });
    }
    return { rollback, artifacts };
  }
  const migration = entry(opsSource, 'migrations/' + opsFile, ops), opsRollback = rollbackFor('hq-ops');
  const artifacts = [{ file: migration.file, bytes: ops, allowEmpty: true }, ...opsRollback.artifacts];
  add('supabase/releases/hq-admin-minimal', {
    ...baseManifest('existing-admin-only'), migration, rollback: opsRollback.rollback,
    migrationAllowlist: [migration.file], staffEnabled: false,
    effects: ['Instala o schema privado torque_hq e suas tabelas de operacao/auditoria.', 'Disponibiliza somente hq_ops_snapshot e hq_ops_command para administradores existentes autorizados pelo servidor.', 'Registros financeiros sao manuais; respostas ao cliente sao rascunhos e cancelamentos sao pedidos.'],
    dependencies: ['Supabase Auth e auth.uid()', 'public.saas_admins', 'public.academias', 'public.saas_clientes', 'Papeis PostgreSQL anon, authenticated e service_role'],
    blocked: ['Aplicacao remota nao autorizada por este pacote.', 'Nenhum cadastro de administrador/staff nem habilitacao de staff.', 'Sem ledger, portal influencer, campanha, convite Auth, envio externo ou gateway.', 'JWT/sessao/MFA e revogacao HTTP requerem homologacao separada.', 'Historico de suporte legado e integracoes financeiras continuam pendentes.']
  }, artifacts, opsFile);

  if (options.ledgerFile) {
    const ledgerFile = migrationName(options.ledgerFile, '--ledger-file');
    if (ledgerFile.slice(0, 14) <= HISTORICAL_FILE.slice(0, 14)) fail('Patch ledger deve suceder a migration historica.');
    const patchSource = 'supabase/hq-referrals-payment-contract-proposal.sql', patch = source(root, patchSource);
    if (/\bhq_influencer_private\b/i.test(sqlWithoutComments(patch))) fail('Patch ledger nao pode incluir portal.');
    const original = entry(HISTORICAL_SOURCE, 'migrations/' + HISTORICAL_FILE, historical);
    const correction = entry(patchSource, 'migrations/' + ledgerFile, patch);
    const ledgerRollback = rollbackFor('hq-referrals');
    add('supabase/releases/hq-referrals-optional', {
      ...baseManifest('referrals-optional-separate-approval'), approvalSeparate: true, activationBlocked: true, frontendReleaseRequired: true, campaignEnabled: false,
      migrations: [original, correction], rollback: ledgerRollback.rollback, migrationAllowlist: [original.file, correction.file],
      rollbackOrder: { suspend: ['influencer-if-installed', 'referrals'], resume: ['referrals', 'influencer-if-approved'] },
      effects: ['Empacota a migration historica imutavel e a correcao aditiva do contrato de primeiro pagamento.', 'Mantem a campanha desligada; nao gera pagamento nem transferencia.'],
      dependencies: ['Revisao do historico real de migrations antes de qualquer aplicacao.', 'Supabase Auth, public.saas_admins e public.academias conforme fontes canonicas.'],
      blocked: ['Nao faz parte da ativacao minima.', 'Nao reaplicar a migration historica onde ja estiver instalada.', 'Contrato novo exige publicacao futura dos consumidores frontend corrigidos e homologacao HTTP/Auth.', 'Gateway, atribuicao confiavel, compra antes do fim do trial e ativacao comercial exigem decisoes separadas.', 'Portal influencer e convites nao estao incluidos.']
    }, [{ file: original.file, bytes: historical, allowEmpty: false }, { file: correction.file, bytes: patch, allowEmpty: true }, ...ledgerRollback.artifacts], ledgerFile);
  }
  if (options.portalFile) {
    const portalFile = migrationName(options.portalFile, '--portal-file');
    const portalSource = 'supabase/hq-influencer-portal-proposal.sql', portal = source(root, portalSource);
    const migration = entry(portalSource, 'migrations/' + portalFile, portal);
    const portalRollback = rollbackFor('hq-influencer');
    add('supabase/releases/hq-influencer-optional', {
      ...baseManifest('influencer-optional-blocked'), approvalSeparate: true, activationBlocked: true,
      externalPrereqsAuth: true, frontendReleaseRequired: true, uiEnabled: false, campaignEnabled: false,
      migration, rollback: portalRollback.rollback, migrationAllowlist: [migration.file],
      rollbackOrder: { suspend: ['influencer', 'referrals-if-requested'], resume: ['referrals', 'influencer-if-approved'] },
      effects: ['Empacota a proposta do portal sem instalar suas dependencias nem conectar a UI.'],
      dependencies: ['Ledger historico ' + HISTORICAL_FILE, 'Correcao canonica supabase/hq-referrals-payment-contract-proposal.sql; pacote/aprovacao separados.'],
      blocked: ['Nao faz parte da ativacao minima nem do pacote ledger.', 'Contrato novo exige publicacao futura dos consumidores frontend corrigidos.', 'Auth real, sessao, e-mail confirmado, aceite/revogacao e isolamento A/B precisam de homologacao HTTP.', 'Criacao de usuarios, envio de convites, servico de e-mail e conexao da UI nao sao executados.', 'Nenhuma dependencia e copiada/aplicada automaticamente; nenhuma campanha e ativada.']
    }, [{ file: migration.file, bytes: portal, allowEmpty: true }, ...portalRollback.artifacts], portalFile);
  }
  return { root, packages };
}

function ensureDirectory(root, relative) {
  const absolute = within(root, relative);
  if (fs.existsSync(absolute)) {
    if (!fs.lstatSync(absolute).isDirectory()) fail('Diretorio esperado: ' + relative);
    return;
  }
  const parent = path.dirname(relative);
  if (parent !== '.') ensureDirectory(root, parent);
  fs.mkdirSync(absolute);
}
function writePlan(plan) {
  for (const pkg of plan.packages) {
    for (const artifact of pkg.artifacts) {
      if (artifact.requireExisting) regular(plan.root, pkg.directory + '/' + artifact.file);
    }
  }
  for (const pkg of plan.packages) {
    for (const artifact of pkg.artifacts) {
      const relative = pkg.directory + '/' + artifact.file;
      ensureDirectory(plan.root, path.dirname(relative));
      const destination = within(plan.root, relative);
      if (fs.existsSync(destination)) {
        const current = regular(plan.root, relative);
        if (current.equals(artifact.bytes)) continue;
        if (!artifact.allowEmpty || current.length !== 0) fail('Arquivo mudou depois da validacao: ' + relative);
        // No truncation: only the empty, regular CLI template can be filled.
        const fd = fs.openSync(destination, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
        try {
          const stat = fs.fstatSync(fd);
          if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 0) fail('Template CLI deixou de estar vazio: ' + relative);
          fs.writeFileSync(fd, artifact.bytes);
        } finally { fs.closeSync(fd); }
      } else {
        if (artifact.requireExisting) fail('Template CLI removido depois da validacao: ' + relative);
        fs.writeFileSync(destination, artifact.bytes, { flag: 'wx' });
      }
      if (!regular(plan.root, relative).equals(artifact.bytes)) fail('Verificacao dos bytes gravados falhou: ' + relative);
    }
  }
  return plan.packages.map(pkg => ({ directory: pkg.directory, manifest: pkg.directory + '/manifest.json', migrations: pkg.manifest.migrationAllowlist }));
}
function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (!options.write || options.help) { process.stdout.write(HELP); return; }
  const plan = buildPlan(options);
  console.log(JSON.stringify({ status: 'prepared-locally-not-applied', packages: writePlan(plan) }, null, 2));
}
module.exports = { buildPlan, writePlan, parseArgs, canonical, BASE_COMMIT, HISTORICAL_SHA256 };
if (require.main === module) {
  try { main(); } catch (error) { console.error('Pacote nao preparado: ' + error.message); process.exitCode = 1; }
}
