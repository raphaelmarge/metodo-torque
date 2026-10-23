/* Interface real do gerador, estado sintético, nenhuma rede externa. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const F = require('./gerador-mensal-fixtures.js');
let playwright;
for (const name of [process.env.TORQUE_PLAYWRIGHT, 'playwright', './ci/node_modules/playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'), '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(name); break; } catch (_) {}
}
if (!playwright) throw new Error('Playwright indisponível. Configure TORQUE_PLAYWRIGHT com a instalação de testes.');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const sources = ['assets/gerador-mensal-catalogo.js', 'assets/gerador-mensal-core.js', 'assets/personal-gerador-mensal-adapter.js', 'assets/personal-gerador-mensal.js'].map(source);
const css = source('assets/personal-gerador-mensal.css');
let n = 0;
function eq(actual, expected, name) { assert.deepEqual(actual, expected, name); n++; console.log('OK ' + name); }
function ok(value, name) { assert.ok(value, name); n++; console.log('OK ' + name); }
(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 360, height: 900 }, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  const origin = 'https://gerador-torque-test.invalid';
  const blocked = [], errors = [];
  await context.route('**/*', route => {
    if (route.request().url() === origin + '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{background:#0c0d11;color:#f3f3f6;margin:0;padding:12px;font:16px Arial}.btn{padding:12px}input,textarea,select{font:inherit}section{min-width:0}</style></head><body><section id="gmSection"><label>Aluno<select id="gmAluno"><option value="gm-test-a">Aluno A</option><option value="gm-test-b">Aluno B</option></select></label><div id="gmRoot"></div></section></body></html>' });
    blocked.push(route.request().url()); return route.abort();
  });
  const p = await context.newPage(); p.on('pageerror', error => errors.push(error.message));
  try {
    await p.clock.setFixedTime(new Date('2026-11-01T12:00:00-03:00'));
    await p.goto(origin + '/');
    for (const content of sources) await p.addScriptTag({ content });
    await p.addStyleTag({ content: css });
    const seed = F.state();
    const individual = structuredClone(seed.exercicios.find(ex => ex.id === 'gm-supino-maquina'));
    Object.assign(individual, { id: 'zz-exercicio-individual', nome: 'Supino individual sintético', variation: 'teste-maquina-individual' });
    individual.metadata = { reviewed: true, author: 'Personal fictício', date: '2026-10-23', reviewType: 'professional', clinicalValidation: false };
    seed.exercicios.push(individual);
    await p.evaluate(seed => {
      window.testState = seed; window.testAccount = 'account-a'; window.testWrites = 0; window.testPublished = 0; window.testApplied = 0; window.testFailSave = false;
      window.MTStore = { todayISO: () => '2026-11-01' };
      MT_PERSONAL_GERADOR_MENSAL.init({
        load: () => structuredClone(testState), account: () => testAccount, author: () => 'Personal fictício de teste',
        write: s => { if (testFailSave) return false; testState = structuredClone(s); testWrites++; return true; },
        publish: () => { testPublished++; }, apply: () => { testApplied++; }, refresh: () => {}, openTraining: () => {}
      });
    }, seed);
    eq(await p.locator('#gmLevel').inputValue(), 'intermediario', 'perfil confirmado abre no nível registrado');
    eq(await p.locator('#gmObjective option').count(), 5, 'cinco objetivos disponíveis no formulário');
    eq(await p.evaluate(() => MT_GERADOR_MENSAL.PARAMETERS.length), 17, '17 parâmetros operacionais expostos pelo motor');
    await p.locator('#gmGenerate').click(); ok((await p.locator('#gmStatus').innerText()).includes('Valide o fechamento'), 'gerar antes da confirmação é impedido');
    await p.locator('#gmValidate').click(); ok((await p.locator('#gmStatus').innerText()).includes('Confirme a conferência'), 'validação requer conferência explícita');
    await p.locator('#gmDataConfirmed').check(); await p.locator('#gmValidate').click();
    ok(await p.evaluate(() => !!testState.alunos[0].geradorMensal.validation), 'conferência persiste snapshot datado do personal');
    await p.locator('#gmGenerate').click();
    const first = await p.evaluate(() => testState.alunos[0].geradorMensal.proposal);
    ok(first && first.fichas.length === 3, 'proposta da próxima etapa respeita os três dias');
    eq(await p.evaluate(() => testState.treinosV2['gm-test-a'].fichas.length), 0, 'gerar mantém fichas vigentes intactas');
    eq(await p.evaluate(() => testPublished), 0, 'gerar não publica no app');
    await p.locator('#gmGenerate').click(); eq(await p.evaluate(() => testState.alunos[0].geradorMensal.proposal), first, 'mesmas entradas mantêm a proposta e seus IDs');
    await p.locator('#gmApprove').click(); ok((await p.locator('#gmStatus').innerText()).includes('Confirme a revisão'), 'aprovação exige revisão explícita da proposta');
    const target = await p.evaluate(() => {
      const g = testState.alunos[0].geradorMensal.proposal, f = g.fichas[0];
      return { ficha: f.id, index: f.itens.findIndex(it => testState.exercicios.find(e => e.id === it.exId).pattern === 'push') };
    });
    const revisedRow = p.locator('[data-gm-ficha="' + target.ficha + '"][data-gm-item="' + target.index + '"]');
    await revisedRow.evaluate(el => { for (let node = el.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; });
    await revisedRow.locator('[data-gm-change="exId"]').selectOption('zz-exercicio-individual');
    await revisedRow.locator('[data-gm-change="carga"]').fill('10');
    await p.locator('#gmApprove').click(); ok((await p.locator('#gmStatus').innerText()).includes('Registre os ajustes'), 'edição de proposta não registrada impede aprovação');
    await p.locator('#gmRevise').click(); ok((await p.locator('#gmStatus').innerText()).match(/motivo|revisão|responsável/), 'ajuste manual exige justificativa profissional');
    await p.locator('#gmRevisionReason').fill('Máquina individual conferida e carga inicial avaliada.');
    await revisedRow.locator('[data-gm-change="carga"]').fill('9999'); await p.locator('#gmRevise').click();
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.proposal.contentHash), first.contentHash, 'carga inválida não altera proposta salva');
    await revisedRow.locator('[data-gm-change="carga"]').fill('10'); await p.locator('#gmRevise').click();
    const revision = await p.evaluate(({ ficha, index }) => { const proposal = testState.alunos[0].geradorMensal.proposal; return { item: proposal.fichas.find(f => f.id === ficha).itens[index], revisions: proposal.revisions }; }, target);
    eq(revision.item.exId, 'zz-exercicio-individual', 'revisão permite exercício pessoal com metadados explícitos');
    eq(revision.item.carga, 10, 'carga manual avaliada é registrada antes da aprovação');
    ok(revision.revisions[0].reason.includes('Máquina individual'), 'ajuste registra autoria e justificativa rastreáveis');
    await p.locator('#gmApproveCheck').check();
    await p.evaluate(() => { testState.alunos[0].retorno.anamnese = { lesoes: 'Novo relato de lesão' }; testState.alunos[0].retorno.anamneseEm = '2026-11-01T16:00:00Z'; });
    await p.locator('#gmApprove').click();
    ok((await p.locator('#gmStatus').innerText()).match(/mudaram|desatualizada|atuais|corresponde/), 'nova anamnese impede aprovar proposta baseada em dados antigos');
    eq(await p.evaluate(() => !!testState.alunos[0].geradorMensal.approvedProposal), false, 'proposta desatualizada continua sem aprovação');
    await p.evaluate(() => { delete testState.alunos[0].retorno.anamnese; delete testState.alunos[0].retorno.anamneseEm; });
    await p.locator('#gmApprove').click();
    ok(await p.evaluate(() => !!testState.alunos[0].geradorMensal.approvedProposal), 'proposta conferida fica aprovada antes de aplicar');
    eq(await p.evaluate(() => [testApplied, testPublished]), [0, 0], 'aprovação não aplica nem publica por conta própria');
    await p.locator('#gmMinutes').fill('42'); await p.locator('#gmGenerate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('Salve as alterações'), 'perfil alterado não permite gerar com valores ainda não salvos');
    await p.evaluate(() => { testFailSave = true; }); await p.locator('#gmSave').click();
    ok((await p.locator('#gmStatus').innerText()).includes('Não foi possível salvar'), 'falha de persistência é exibida');
    eq(await p.locator('#gmMinutes').inputValue(), '42', 'falha conserva a edição preenchida');
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.perfil.minutes), 60, 'falha não altera o perfil salvo');
    await p.evaluate(() => { testFailSave = false; testAccount = 'account-b'; }); await p.locator('#gmSave').click();
    ok((await p.locator('#gmStatus').innerText()).includes('conta ou o aluno mudou'), 'troca de conta impede gravar rascunho anterior');
    await p.evaluate(() => { testAccount = 'account-a'; }); await p.locator('#gmSave').click();
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.perfil.minutes), 42, 'nova tentativa salva o mesmo formulário após recuperar contexto');
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.validation), null, 'alterar parâmetros exige nova validação');
    eq(await p.evaluate(() => testState.treinosV2['gm-test-b'].fichas[0].titulo), 'Preservar outro aluno', 'outro aluno permanece intacto');
    await p.locator('#gmMinutes').fill('43');
    await p.locator('#gmAluno').selectOption('gm-test-b'); await p.locator('#gmAluno').selectOption('gm-test-a');
    eq(await p.locator('#gmMinutes').inputValue(), '43', 'troca de aluno preserva rascunho em seu contexto');
    await p.locator('#gmReload').click();
    eq(await p.locator('#gmMinutes').inputValue(), '42', 'recarregar descarta o rascunho e usa estado salvo');
    await p.evaluate(() => {
      testState.alunos[0].retorno.geradorMensal = { version: 1, reports: { c: { revisions: { r: { id: 'r', cycleId: 'c', kind: 'health', author: 'aluno', createdAt: '2026-11-01T12:00:00Z', data: { symptoms: 'sim', healthChanges: 'Dor nova' } } } } } };
      MT_PERSONAL_GERADOR_MENSAL.render(true);
    });
    await p.locator('#gmDataConfirmed').check(); await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).match(/saúde|sintoma|limitação|orientação|relato/), 'relato novo de saúde impede validar enquanto estiver pendente');
    await p.locator('[data-gm-health="r"]').check(); await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('Descreva a revisão'), 'resolver alerta exige motivo e confirmação das orientações');
    await p.locator('#gmReviewNotes').fill('Relato avaliado; orientação atual conferida pelo profissional responsável.');
    await p.locator('#gmClinical').check(); await p.locator('#gmValidate').click();
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.healthReviewedRevisionIds), ['r'], 'revisão reconhece apenas o ID conferido e preserva relato');
    ok(await p.evaluate(() => !!testState.alunos[0].geradorMensal.validation), 'revisão documentada permite validar os dados atuais');
    await p.locator('#gmReviewStatus').selectOption('insufficient'); await p.locator('#gmDataConfirmed').check(); await p.locator('#gmValidate').click();
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.validation), null, 'informação insuficiente retira validação e mantém pendência');
    eq(await p.evaluate(() => testPublished), 0, 'nenhum passo de revisão envia dados ao aluno');
    const legacy = F.state(); legacy.treinosV2['gm-test-a'].fichas = structuredClone(first.fichas);
    for (const ficha of legacy.treinosV2['gm-test-a'].fichas) for (const item of ficha.itens) item.carga = 80;
    await p.evaluate(s => { testState = s; MT_PERSONAL_GERADOR_MENSAL.render(true); }, legacy);
    await p.locator('#gmDataConfirmed').check(); await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('fechamento mensal'), 'fichas legadas sem relato não entram no fechamento recorrente');
    await p.locator('#gmInitialAdoption').check(); await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('motivo'), 'primeira adoção exige motivo profissional');
    await p.locator('#gmReviewNotes').fill('Revisei as fichas legadas e defini o ponto de partida para a primeira adoção.');
    await p.locator('#gmValidate').click(); await p.locator('#gmGenerate').click();
    const adoption = await p.evaluate(() => testState.alunos[0].geradorMensal.proposal);
    ok(adoption && adoption.initialAdoption && adoption.initialAdoption.author === 'Personal fictício de teste', 'adoção inicial registra responsável e motivo');
    ok(adoption.fichas.every(f => f.itens.every(it => it.carga === null && it.geradorMensal.action === 'adopt' && it.geradorMensal.evolution === null)), 'adoção não transporta carga legada nem presume evolução');
    eq(await p.evaluate(() => testState.treinosV2['gm-test-a'].fichas[0].itens[0].carga), 80, 'proposta de adoção preserva a ficha anterior');
    const extra = F.state(); extra.treinosV2['gm-test-a'].fichas = structuredClone(first.fichas);
    extra.alunos[0].geradorMensal.active = { id: 'active-test', start: '2026-10-01', end: '2026-11-30' };
    await p.evaluate(s => { testState = s; MT_PERSONAL_GERADOR_MENSAL.render(true); }, extra);
    await p.locator('#gmExtraordinaryStart').click();
    eq(await p.locator('#gmPeriodEnd').inputValue(), '2026-11-01', 'revisão extraordinária encerra a coleta na data atual');
    eq(await p.locator('#gmNextStart').inputValue(), '2026-11-01', 'revisão extraordinária prepara a nova etapa na mesma fronteira');
    eq(await p.evaluate(() => testState.alunos[0].geradorMensal.period.end), '2026-10-31', 'preparar revisão não grava datas antes da conferência');
    await p.locator('#gmSave').click();
    await p.locator('#gmExtraordinary').check(); await p.locator('#gmDataConfirmed').check(); await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('motivo'), 'exceção extraordinária exige motivo explícito');
    await p.locator('#gmReviewNotes').fill('Mudança relevante de disponibilidade conferida para reorganizar a etapa.');
    await p.locator('#gmClinical').check(); await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('fechamento mensal'), 'revisão extraordinária mantém exigência de relato do aluno');
    await p.evaluate(() => {
      testState.alunos[0].retorno.geradorMensal = { version: 1, reports: { 'active-test': { revisions: { 'extra-report': { id: 'extra-report', cycleId: 'active-test', kind: 'monthly', author: 'aluno', createdAt: '2026-11-01T12:00:00Z', data: { perception: 'manteve', symptoms: 'nao', routineChanged: 'sim', routineNotes: 'Mudou a disponibilidade.' } } } } } };
      MT_PERSONAL_GERADOR_MENSAL.render(true);
    });
    await p.locator('#gmExtraordinary').check(); await p.locator('#gmDataConfirmed').check();
    await p.locator('#gmReviewNotes').fill('Disponibilidade e orientações atuais conferidas para reorganizar a etapa.');
    await p.locator('#gmValidate').click();
    ok((await p.locator('#gmStatus').innerText()).includes('confirmação explícita'), 'exceção exige conferência explícita das orientações atuais');
    await p.locator('#gmClinical').check(); await p.locator('#gmValidate').click(); await p.locator('#gmGenerate').click();
    const extraordinary = await p.evaluate(() => testState.alunos[0].geradorMensal.proposal);
    ok(extraordinary && extraordinary.extraordinary && extraordinary.extraordinary.reason.includes('Disponibilidade'), 'proposta extraordinária registra o motivo validado');
    ok(extraordinary.fichas.every(f => f.itens.every(it => it.geradorMensal.action !== 'progress')), 'revisão extraordinária não progride automaticamente a carga');
    eq(await p.evaluate(() => [testState.alunos[0].geradorMensal.active.id, testApplied, testPublished]), ['active-test', 0, 0], 'gerar exceção preserva etapa ativa e não aplica nem publica');
    const geometry = await p.locator('#gmRoot').evaluate(el => ({ width: innerWidth, right: el.getBoundingClientRect().right, document: document.documentElement.scrollWidth }));
    ok(geometry.right <= geometry.width + 1 && geometry.document <= geometry.width + 1, 'formulário cabe em 360px sem rolagem horizontal da página');
    eq(errors, [], 'interface não apresentou exceções JavaScript');
    eq(blocked, [], 'motor e revisão não solicitam IA nem recursos remotos');
    if (process.env.ARTIFACT_DIR) { fs.mkdirSync(process.env.ARTIFACT_DIR, { recursive: true }); await p.screenshot({ path: path.join(process.env.ARTIFACT_DIR, 'gerador-mensal-ui-harness-mobile.png'), fullPage: true }); }
    console.log(n + ' verificações de interface mensal passaram.');
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
