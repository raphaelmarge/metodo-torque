/* Editor real dos módulos com estado sintético e toda rede bloqueada. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require(process.env.TORQUE_PLAYWRIGHT || 'playwright')); }
catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const source = fs.readFileSync(path.join(__dirname, '../assets/personal-treino-evolucao.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../assets/personal-treino-evolucao.css'), 'utf8');
const studentSource = fs.readFileSync(path.join(__dirname, '../app/treino-evolucao.js'), 'utf8');
const studentCss = fs.readFileSync(path.join(__dirname, '../app/treino-evolucao.css'), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 }, serviceWorkers: 'block' });
    const url = 'https://torque-test.invalid/treino-evolucao';
    await context.route('**/*', r => r.request().url() === url ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0c0d11;color:#f3f3f6;font:16px Arial}.btn{padding:8px}button{cursor:pointer}*{box-sizing:border-box}</style></head><body><button data-te-variants="f">Versões</button><button data-te-progression="f">Evoluir</button></body></html>' }) : r.abort());
    const p = await context.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(url); await p.addScriptTag({ content: source }); await p.addStyleTag({ content: css });
    await p.evaluate(() => {
      window.allowed = 'conta-a'; window.writes = 0; window.failSave = false;
      window.state = { alunos: [{ id: 'a', retorno: { cargas: { 'Movimento fictício': [
        { d: '2026-10-10', g: 2, i: '0:0:0', serie: 1, exercicioId: 'ex', kg: 20, r: 10, rpe: 7, feito: true },
        { d: '2026-10-15', g: 2, i: '0:0:0', serie: 1, exercicioId: 'ex', kg: 20, r: 10, rpe: 7, feito: true }
      ] } } }], exercicios: [{ id: 'ex', nome: 'Movimento fictício' }], treinosV2: { a: { fichas: [{ id: 'f', titulo: 'Ficha A', itens: [{ exId: 'ex', series: 1, reps: '10', carga: 20, descanso: 0 }] }] } } };
      let seq = 0; window.ui = MT_TREINO_EVOLUCAO.install({ load: () => structuredClone(state), student: () => 'a', identity: () => allowed, uid: () => 'v-' + (++seq), today: () => '2026-10-17', write: s => { if (failSave) return false; state = s; writes++; return true; }, markChanged: s => { s.alunos[0].appEditEm = 'pendente'; }, render: () => {} });
    });
    await p.getByRole('button', { name: 'Versões', exact: true }).click(); await p.getByRole('button', { name: '+ Versão curta', exact: true }).click();
    await p.getByLabel('Nome da versão').fill('Curto <img src=x onerror=alert(1)>');
    await p.getByLabel('Duração estimada (min)').fill('20'); await p.getByRole('button', { name: '+ Série', exact: true }).click();
    await p.locator('.te-series').first().getByLabel('Repetições / tempo').fill('8'); await p.locator('.te-series').first().getByLabel('Carga (kg)').fill('12,5');
    await p.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    assert.equal(await p.evaluate(() => MT_TREINO_EVOLUCAO.exporta(state, 'a').length), 0);
    assert.equal(await p.evaluate(() => state.treinosV2.a.fichas[0].itens[0].series), 1);
    assert.equal(await p.locator('.te-dialog img').count(), 0);
    console.log('OK rascunho real preserva original, fica fora do pacote e escapa conteúdo');
    await p.getByRole('button', { name: 'Editar e revisar', exact: true }).click();
    await p.getByRole('button', { name: 'Aprovar esta versão', exact: true }).click();
    assert.equal(await p.evaluate(() => MT_TREINO_EVOLUCAO.exporta(state, 'a')[0].variantes[0].guia.it[0].carga), 12.5);
    assert.equal(await p.evaluate(() => MT_TREINO_EVOLUCAO.exporta(state, 'a')[0].variantes[0].guia.it[0].s), 2);
    console.log('OK aprovação publica somente snapshot revisado (carga decimal, descanso zero, duas séries)');
    await p.getByRole('button', { name: 'Editar e revisar', exact: true }).click(); await p.getByLabel('Nome da versão').fill('Nova revisão');
    await p.evaluate(() => { failSave = true; }); await p.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    assert.match(await p.locator('.te-status').textContent(), /Não foi possível salvar/); assert.equal(await p.getByLabel('Nome da versão').inputValue(), 'Nova revisão');
    await p.evaluate(() => { failSave = false; allowed = 'conta-b'; }); await p.getByRole('button', { name: 'Aprovar esta versão', exact: true }).click();
    assert.match(await p.locator('.te-status').textContent(), /conta mudou/); assert.equal(await p.evaluate(() => state.treinosV2.a.fichas[0].variantes[0].aprovada.versao), 1);
    console.log('OK falha de gravação mantém formulário e troca de conta bloqueia confirmação obsoleta');
    const geometry = await p.locator('.te-dialog').evaluate(el => ({ viewport: innerWidth, right: el.getBoundingClientRect().right, overflow: el.scrollWidth - el.clientWidth }));
    assert.ok(geometry.right <= geometry.viewport && geometry.overflow <= 1, JSON.stringify(geometry));
    await p.keyboard.press('Escape'); assert.equal(await p.locator('.te-dialog').count(), 0);
    assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Versões');
    console.log('OK editor móvel 320px sem transbordo, Escape e foco devolvido');
    await p.evaluate(() => { allowed = 'conta-a'; }); await p.getByRole('button', { name: 'Evoluir', exact: true }).click();
    await p.getByLabel('Aprovar alteração desta série').check(); await p.getByRole('button', { name: 'Salvar alterações aprovadas', exact: true }).click();
    assert.equal(await p.evaluate(() => state.treinosV2.a.fichas[0].itens[0].seriesDetalhadas[0].carga), 20.5);
    assert.equal(await p.evaluate(() => state.treinosV2.a.fichas[0].evolucoes.length), 1);
    assert.equal(await p.evaluate(() => state.alunos[0].retorno.cargas['Movimento fictício'][0].kg), 20);
    assert.equal(await p.evaluate(() => MT_TREINO_EVOLUCAO.exporta(state, 'a').length), 0);
    console.log('OK revisão aprovada salva histórico e exige revisar variante após original mudar');
    await p.keyboard.press('Escape'); await p.addScriptTag({ content: studentSource }); await p.addStyleTag({ content: studentCss });
    await p.evaluate(() => {
      const f = state.treinosV2.a.fichas[0]; const v = f.variantes[0];
      const next = MT_TREINO_EVOLUCAO.saveDraft(f, v.aprovada, state.exercicios, '2026-10-17T16:00:00Z', v.id); state.treinosV2.a.fichas[0] = MT_TREINO_EVOLUCAO.approve(next, v.id, '2026-10-17T16:00:00Z');
      window.guia = [{ fichaId: 'f', n: 'A', it: [{ e: 'Movimento fictício', s: 1, k: 'original' }] }]; window.session = null; window.starts = 0;
      window.student = MT_TREINO_VARIANTES.runtime(MT_TREINO_EVOLUCAO.exporta(state, 'a'), { guia, identity: () => true, current: () => session, start: (fi, g) => { session = { prescribed: structuredClone(g), finished: false }; starts++; return true; }, changed: () => {}, closed: () => {} });
      student.beforeOpen(0, null, () => {});
    });
    assert.equal(await p.getByRole('dialog', { name: 'Qual versão cabe no seu dia?' }).count(), 1);
    await p.locator('.te-aluno-option').nth(1).click(); assert.equal(await p.evaluate(() => starts), 1); assert.ok(await p.evaluate(() => guia[0].varianteId));
    assert.equal(await p.locator('.te-aluno-dialog').count(), 0);
    await p.evaluate(() => { student.beforeOpen(0, null, () => {}); }); assert.equal(await p.locator('.te-aluno-dialog').count(), 0); assert.equal(await p.evaluate(() => starts), 1);
    console.log('OK seletor aluno usa versão aprovada uma vez e retoma sem criar outra sessão');
    assert.deepEqual(errors, []); await context.close(); console.log('8 cenários de interface passaram.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
