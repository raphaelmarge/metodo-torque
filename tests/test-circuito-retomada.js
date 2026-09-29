/* Circuitos: execução sintética, rede externa bloqueada e falhas de armazenamento reais. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
let chromium; try { chromium = require(process.env.TORQUE_PLAYWRIGHT || 'playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
global.self = global; global.MT_CLOUD = null;
require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const wods = [
  { id: 'amrap-teste', nome: 'Voltas sintéticas', tipo: 'amrap', min: 12, aq: 'Aquecimento prescrito de teste.', obs: 'Orientação sintética do personal.', movs: [{ q: '10', n: 'Movimento um' }, { q: '12', n: 'Movimento dois' }] },
  { id: 'tempo-teste', nome: 'Tempo sintético', tipo: 'fortime', cap: 15, movs: [{ q: '8', n: 'Movimento três' }] },
  { id: 'emom-teste', nome: 'Minutos sintéticos', tipo: 'emom', min: 6, movs: [{ q: '8', n: 'Movimento um' }, { q: '6', n: 'Movimento dois' }] },
  { id: 'tabata-teste', nome: 'Intervalos sintéticos', tipo: 'tabata', rounds: 4, work: 20, rest: 10, movs: [{ q: '6', n: 'Movimento um' }, { q: '8', n: 'Movimento dois' }] }
];
function make(token, id = token) {
  return MT_APP_ALUNO.monta({ a: { id, nome: 'Aluno Sintético', appTokenP: token }, studio: 'Teste isolado', cfg: {}, wodsApp: wods, cardiosApp: [] });
}
const html = make('aluno-circuito-a');
for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(s[1]);
let total = 0;
function ok(v, m) { assert.ok(v, m); total++; console.log('OK ' + m); }
function eq(v, w, m) { assert.deepEqual(v, w, m); total++; console.log('OK ' + m); }
async function ambiente(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  await ctx.route('**/*', r => new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort());
  await ctx.route(BASE + '/circuito-' + name + '.html', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.addInitScript(() => { localStorage.setItem('pttour', JSON.stringify({ como: 'teste' })); localStorage.setItem('ptonb', JSON.stringify({ feito: true })); });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.clock.install({ time: new Date('2026-09-29T10:00:00-03:00') });
  await p.goto(BASE + '/circuito-' + name + '.html');
  await p.waitForFunction(() => window.__wodSessao);
  await p.evaluate(() => { window.__trocaSec('treino'); window.__trSub('wod'); });
  return { ctx, p, errors };
}
async function clicar(p, id) { await p.evaluate(id => document.getElementById(id).click(), id); }
async function iniciar(p, id) {
  await p.evaluate(id => document.querySelector('[data-wodstart="' + id + '"]').click(), id);
  await clicar(p, 'wodGo'); await p.clock.runFor(1200);
}
async function estado(p) { return p.evaluate(() => ({ run: __wod.run, gi: __wod.gi, voltas: __wod.voltas, elapsed: __wodSessao.tempo(), sid: __wod.sid, receita: __wod.wodId, checkpoint: __wodSessao.ler() })); }
async function registros(p, id) { return p.evaluate(id => (JSON.parse(localStorage.getItem('ptwodres') || '{}')[id] || []), id); }
async function finalizar(p) { await clicar(p, 'wfFim'); await p.waitForSelector('#wodPlacar'); }
async function falharStorage(p, keys) {
  await p.evaluate(keys => { window.__storageOriginal = window.__storageOriginal || Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (keys.includes(k)) throw new DOMException('Synthetic storage full', 'QuotaExceededError'); return window.__storageOriginal.call(this, k, v); }; }, keys);
}
async function restaurarStorage(p) { await p.evaluate(() => { if (window.__storageOriginal) Storage.prototype.setItem = window.__storageOriginal; }); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const a = await ambiente(browser, 'retomada'), p = a.p;
    await iniciar(p, 'amrap-teste');
    ok((await p.textContent('#wodPreparo')).includes('Aquecimento prescrito de teste.') && (await p.textContent('#wodPreparo')).includes('Orientação sintética'), 'preparo conserva aquecimento e orientação da prescrição');
    await clicar(p, 'wfFeito'); await clicar(p, 'wfFeito');
    eq((await estado(p)).voltas, 1, 'último movimento conclui uma única volta');
    await clicar(p, 'wfDesfazer');
    eq([(await estado(p)).gi, (await estado(p)).voltas], [1, 0], 'desfazer restaura movimento anterior, volta e splits');
    await clicar(p, 'wfFeito'); await clicar(p, 'wfPausa');
    const pausado = await estado(p);
    await p.evaluate(() => __wodGuia.avanca()); await p.clock.runFor(10000);
    eq([(await estado(p)).gi, (await estado(p)).voltas, (await estado(p)).elapsed], [pausado.gi, pausado.voltas, pausado.elapsed], 'pausa impede avanço e não acumula tempo');
    await p.evaluate(() => document.querySelector('[data-wodstart="tempo-teste"]').click());
    eq((await estado(p)).sid, pausado.sid, 'começar outra prescrição não substitui silenciosamente uma sessão pausada');
    await p.reload(); await p.waitForFunction(() => window.__wodSessao);
    const retomado = await estado(p);
    eq([retomado.run, retomado.gi, retomado.voltas, retomado.elapsed, retomado.sid], [false, pausado.gi, pausado.voltas, pausado.elapsed, pausado.sid], 'recarregar restaura a mesma sessão pausada sem somar a lacuna');
    await p.evaluate(() => document.querySelector('#wodRetomar button').click());
    ok((await p.textContent('#wfEstado')).includes('Pausado'), 'retomada abre a execução pausada de forma explícita');
    await clicar(p, 'wfPausa'); await p.clock.runFor(1400); await clicar(p, 'wfMin');
    ok((await estado(p)).run && (await p.textContent('#wodRetomar')).includes('continua contando'), 'minimizar mantém o cronômetro e informa isso no card');
    await p.evaluate(() => document.querySelector('#wodRetomar button').click()); await finalizar(p);
    ok((await p.textContent('#wodPlacar')).includes('Encerrado antes'), 'AMRAP interrompido fica explicitamente parcial');
    await clicar(p, 'wpMais'); await p.reload(); await p.waitForFunction(() => window.__wodSessao);
    await p.evaluate(() => document.querySelector('#wodRetomar button').click());
    ok((await p.textContent('#wodPlacar')).includes('Quantas voltas'), 'revisão é recuperada após recarregar');
    eq((await estado(p)).checkpoint.draft.v, 2, 'ajuste do placar também fica no checkpoint');
    await falharStorage(p, ['ptwodres']); await clicar(p, 'wpSalvar');
    eq((await registros(p, 'amrap-teste')).length, 0, 'falha de escrita não cria resultado');
    ok(await p.isVisible('#wodPlacar') && (await p.textContent('#wpErro')).includes('Não foi possível salvar'), 'falha de escrita mantém revisão e informa erro em vez de sucesso');
    await restaurarStorage(p); await falharStorage(p, ['ptfeitos']); await clicar(p, 'wpSalvar');
    eq((await registros(p, 'amrap-teste')).length, 1, 'resultado pode ser preservado mesmo quando falha o registro do dia');
    ok(await p.isVisible('#wodPlacar') && (await p.textContent('#wpErro')).includes('falta registrar o dia'), 'falha parcial exige nova confirmação e conserva checkpoint');
    await clicar(p, 'wpVoltar');
    ok(await p.isVisible('#wodPlacar') && !!(await estado(p)).checkpoint, 'resultado já gravado não é apresentado como descartado quando falta registrar o dia');
    await restaurarStorage(p); await clicar(p, 'wpSalvar');
    const amrap = await registros(p, 'amrap-teste');
    eq(amrap.length, 1, 'repetir finalização não duplica o resultado já salvo');
    ok(amrap[0].parcial && amrap[0].du < 720 && amrap[0].v === 2, 'resultado mantém duração real, parcial e ajuste de voltas');
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ptfeitos'))['2026-09-29'] === 1 && !__wodSessao.ler()), 'dia registrado idempotentemente e checkpoint removido apenas após sucesso');
    await p.evaluate(() => window.__wodPlacarEl.querySelector('#wpSalvar').click());
    eq((await registros(p, 'amrap-teste')).length, 1, 'clique atrasado no botão antigo não duplica o placar');
    eq(a.errors, [], 'retomada e falhas de storage sem erro JavaScript'); await a.ctx.close();

    const b = await ambiente(browser, 'formatos');
    await iniciar(b.p, 'tempo-teste'); await b.p.clock.runFor(4200); await clicar(b.p, 'wfPausa');
    const tempo = (await estado(b.p)).elapsed; await finalizar(b.p);
    ok((await b.p.textContent('#wpT')).includes('0:05'), 'For Time termina mesmo pausado, usando o tempo efetivamente acumulado');
    await clicar(b.p, 'wpSalvar'); const ft = (await registros(b.p, 'tempo-teste'))[0];
    eq(ft.v, Math.round(tempo), 'placar For Time pausado conserva duração');
    await iniciar(b.p, 'emom-teste'); await b.p.clock.runFor(65000);
    ok((await b.p.textContent('#wfAgora')).includes('Depois:'), 'EMOM mostra próximo movimento');
    await clicar(b.p, 'wfPausa'); await finalizar(b.p); await clicar(b.p, 'wpSalvar');
    const emom = (await registros(b.p, 'emom-teste'))[0];
    ok(emom.parcial && emom.rodadas === 1 && emom.du < 360 && !emom.r.includes('circuito completo'), 'EMOM encerrado antes preserva rodada realizada e não afirma conclusão total');
    await iniciar(b.p, 'tabata-teste'); await b.p.clock.runFor(23000);
    ok((await b.p.textContent('#wfAgora')).includes('Depois:') && (await b.p.textContent('#wfFase')).includes('Descansa'), 'Tabata prepara o próximo movimento durante a recuperação');
    await finalizar(b.p); await clicar(b.p, 'wpSalvar');
    const tabata = (await registros(b.p, 'tabata-teste'))[0];
    ok(tabata.parcial && tabata.rodadas === 0 && tabata.du < 120 && !tabata.r.includes('circuito completo'), 'Tabata parcial não inventa rodadas completas');
    eq(b.errors, [], 'fluxos dos quatro formatos sem erro JavaScript'); await b.ctx.close();

    const c = await ambiente(browser, 'isolamento'); await iniciar(c.p, 'amrap-teste'); await clicar(c.p, 'wfPausa');
    const sessA = (await estado(c.p)).checkpoint;
    await c.ctx.route(BASE + '/circuito-outro.html', r => r.fulfill({ contentType: 'text/html', body: make('aluno-circuito-b') }));
    await c.p.goto(BASE + '/circuito-outro.html'); await c.p.waitForFunction(() => window.__wodSessao);
    ok(!(await estado(c.p)).checkpoint && !(await estado(c.p)).sid, 'outro token não recupera sessão do aluno anterior');
    await iniciar(c.p, 'tempo-teste'); await clicar(c.p, 'wfPausa');
    await c.p.evaluate(() => { localStorage.setItem('tq_app_token', 'outro-acesso'); });
    await clicar(c.p, 'wodGo');
    ok(!(await estado(c.p)).run && (await c.p.textContent('#wodAviso')).includes('acesso mudou'), 'troca de identidade interrompe ações da aba antiga');
    const preservouA = await c.p.evaluate(() => JSON.parse(localStorage.getItem('ptwodSessao:aluno-circuito-a')));
    eq(preservouA.sid, sessA.sid, 'checkpoint do primeiro aluno permanece separado e intacto');
    eq(c.errors, [], 'isolamento sem erro JavaScript'); await c.ctx.close();

    const d = await ambiente(browser, 'meia-noite');
    await d.p.clock.setSystemTime(new Date('2026-09-29T23:59:58-03:00'));
    await iniciar(d.p, 'tempo-teste'); await d.p.clock.runFor(6000);
    const durante = await estado(d.p); await d.p.reload(); await d.p.waitForFunction(() => window.__wodSessao);
    const apos = await estado(d.p);
    ok(!apos.run && apos.elapsed >= durante.elapsed && apos.elapsed - durante.elapsed < 1, 'recarregar durante execução recupera o último ponto e volta pausado');
    await d.p.evaluate(() => document.querySelector('#wodRetomar button').click()); await finalizar(d.p);
    await clicar(d.p, 'wpT');
    await d.p.locator('[data-wped="t"]').fill('0:09');
    await d.p.reload(); await d.p.waitForFunction(() => window.__wodSessao); await d.p.evaluate(() => document.querySelector('#wodRetomar button').click());
    eq(await d.p.textContent('#wpT'), '0:09', 'edição do tempo é preservada mesmo recarregando antes de sair do campo');
    await clicar(d.p, 'wpSalvar');
    const virada = (await registros(d.p, 'tempo-teste'))[0];
    eq(virada.d, '2026-09-29', 'sessão atravessando meia-noite mantém o dia em que começou');
    eq(await d.p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ptfeitos') || '{}'))), ['2026-09-29'], 'constância não atribui sessão da véspera ao dia novo');
    const rpe = await d.p.evaluate(() => { const b = document.querySelector('#wodFimBox [data-rpe]'); b.click(); return JSON.parse(localStorage.getItem('ptrpe') || '{}'); });
    eq(Object.keys(rpe), ['2026-09-29'], 'esforço do circuito usa também o dia original');
    eq(d.errors, [], 'virada de dia sem erro JavaScript'); await d.ctx.close();

    const e = await ambiente(browser, 'automatico');
    await e.p.evaluate(() => { document.querySelector('[data-wodstart="tempo-teste"]').click(); document.getElementById('wodCap').value = '1'; document.getElementById('wodGo').click(); });
    await e.p.clock.runFor(61000);
    ok(await e.p.isVisible('#wodPlacar') && await e.p.getAttribute('#wpNf', 'aria-pressed') === 'true', 'limite do For Time abre revisão como não concluído');
    await clicar(e.p, 'wpSalvar'); await e.p.clock.runFor(1500);
    const limite = await registros(e.p, 'tempo-teste');
    ok(limite.length === 1 && limite[0].nf === 1 && limite[0].parcial && limite[0].v === 60, 'fim automático é idempotente e não vira resultado completo');
    await e.p.evaluate(() => { document.querySelector('[data-wodt="tabata"]').click(); document.getElementById('wodRounds').value = '1'; document.getElementById('wodWork').value = '1'; document.getElementById('wodRest').value = '1'; document.getElementById('wodGo').click(); });
    await e.p.clock.runFor(2500);
    const livre = await registros(e.p, 'livre');
    ok(livre.length === 1 && !livre[0].parcial && (await e.p.textContent('#wodFimBox')).includes('Tabata completo'), 'timer livre finaliza e guarda uma única execução real');
    await clicar(e.p, 'wodGo'); await e.p.clock.runFor(2500);
    eq((await registros(e.p, 'livre')).length, 2, 'iniciar outra sessão depois de salvar gera identidade nova');
    eq(e.errors, [], 'limite e conclusão automática sem erro JavaScript'); await e.ctx.close();
    console.log('\n' + total + ' verificações de circuito aprovadas.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
