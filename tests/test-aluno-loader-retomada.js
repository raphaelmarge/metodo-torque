/* Loader real /app/?t=: troca de aluno, retomada e corte do acesso.
 * Todos os dados/RPCs são fictícios em localhost; rede externa é bloqueada. */
'use strict';
const assert = require('node:assert/strict');
let chromium; try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const CLOUD = BASE + '/__loader_mock';
const tokens = { a: 'loader-retomada-aluno-a', b: 'loader-retomada-aluno-b' };
function pacote(aluno) {
  return { html: '', stamp: '2026-09-29T13:00:00Z', dados: {
    a: { id: 'sintetico-' + aluno, nome: 'Aluno Sintético ' + aluno.toUpperCase(), appTokenP: tokens[aluno] },
    studio: 'Teste isolado do loader', cfg: {},
    COR: '#7c3aed', COR2: '#5925ba', CORC: '#b395ff', CORE: '#33155c', CORCL1: '#d6c4ff', CORCL2: '#e8ddff',
    cardiosApp: [{ id: 'corrida-' + aluno, nome: 'Corrida de ' + aluno, mod: 'corrida', tipo: 'continuo', blocos: [{ tipo: 'ativo', alvo: { acao: 'correr', valor: 600, unidade: 's' } }] }],
    wodsApp: [{ id: 'circuito-' + aluno, nome: 'Circuito de ' + aluno, tipo: 'amrap', min: 12, movs: [{ q: '10', n: 'Movimento sintético um' }, { q: '8', n: 'Movimento sintético dois' }] }]
  } };
}
let browser, total = 0;
function eq(value, expected, message) { assert.deepEqual(value, expected, message); total++; console.log('OK ' + message); }
function ok(value, message) { assert.ok(value, message); total++; console.log('OK ' + message); }
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' });
  const calls = [], errors = [], externalBackend = [];
  let denied = '';
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(BASE).origin) return route.continue();
    if (/supabase|\/rest\/v1\//.test(url.href)) externalBackend.push(url.href);
    return route.abort();
  });
  await ctx.route('**/assets/cloud-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'self.MT_CLOUD=' + JSON.stringify({ url: CLOUD, anonKey: 'somente-teste-local' }) + ';' }));
  await ctx.route(CLOUD + '/rest/v1/rpc/**', async route => {
    const fn = new URL(route.request().url()).pathname.split('/').pop();
    const body = route.request().postDataJSON() || {};
    calls.push({ fn, body });
    let data = [];
    if (fn === 'app_aluno_estado' || fn === 'app_aluno_busca') {
      const aluno = Object.keys(tokens).find(k => tokens[k] === body.t);
      data = denied ? { ok: false, motivo: denied } : aluno ? { ok: true, dados: pacote(aluno) } : { ok: false, motivo: 'sem_registro' };
    } else if (fn === 'app_aluno_devolve') data = { ok: true };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: () => 1, clearWatch: () => {} } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: () => Promise.resolve({ state: 'granted' }) } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.clock.setFixedTime(new Date('2026-09-29T10:00:00-03:00'));
  async function abrir(aluno) {
    await page.goto(BASE + '/app/?t=' + tokens[aluno]);
    // Os players dependem da concessão assíncrona de escrita antes da largada.
    await page.waitForFunction(() => window.__crSessao && window.__wodSessao && window.__treinoHistorico.ready());
  }
  async function iniciar(aluno, segundos, km, circuito) {
    await page.evaluate(({ aluno, segundos, km, circuito }) => {
      localStorage.setItem('ptcrCfg', JSON.stringify({ cd: 0, fb: 'off', ap: 0, bl: 0 }));
      document.querySelector('[data-cbstart]').click();
      document.getElementById('crGo').click();
      __cr.t0 = Date.now() - segundos * 1000;
      document.getElementById('crKm').value = String(km);
      __pintaCr(); __crSessao.salva(true);
      document.querySelector('[data-wodstart="circuito-' + aluno + '"]').click();
      document.getElementById('wodGo').click();
      __wod.t0 = Date.now() - circuito * 1000; __wod.gi = 1; __wod.voltas = 2;
      __wodSessao.salva(true);
    }, { aluno, segundos, km, circuito });
  }
  async function estado() {
    return page.evaluate(() => ({
      token: localStorage.getItem('tq_app_token'), crKey: __crSessao.chave, wodKey: __wodSessao.key,
      corrida: __crSessao.le(), circuito: __wodSessao.ler(),
      cr: { sid: __cr.sid || null, run: __cr.run, tempo: __cr.acum, km: __crKmAtual() },
      wod: { sid: __wod.sid || null, run: __wod.run, tempo: __wodSessao.tempo(), gi: __wod.gi, voltas: __wod.voltas },
      cardio: JSON.parse(localStorage.getItem('ptcardio') || '[]'), placares: JSON.parse(localStorage.getItem('ptwodres') || '{}'),
      shared: ['ptpeso', 'ptcorridaSessao', 'ptwodSessao', 'ptcorridaSessao:', 'ptwodSessaoSemDono:a'].map(k => localStorage.getItem(k))
    }));
  }
  async function marcarCompartilhados(aluno) {
    await page.evaluate(aluno => {
      localStorage.setItem('ptpeso', JSON.stringify({ origem: aluno }));
      localStorage.setItem('ptcardio', JSON.stringify([{ id: 'historico-exclusivo-' + aluno, d: '2026-09-28', n: 'Sintética', m: 'corrida', s: 60, k: .1 }]));
      localStorage.setItem('ptwodres', JSON.stringify({ ['exclusivo-' + aluno]: [{ sid: 'placar-' + aluno, d: '2026-09-28', n: 'Sintético', r: 'Teste', tp: 'amrap', v: 1 }] }));
      ['ptcorridaSessao', 'ptwodSessao', 'ptcorridaSessao:', 'ptwodSessaoSemDono:a'].forEach(k => localStorage.setItem(k, 'sem dono verificável'));
    }, aluno);
  }

  await abrir('a'); await iniciar('a', 45, .42, 83); await marcarCompartilhados('a');
  const a = await estado();
  ok(a.corrida && a.circuito && a.cr.run && a.wod.run, 'o loader real monta os dois executores e guarda sessões em andamento de A');
  await abrir('b');
  let s = await estado();
  eq(s.token, tokens.b, 'troca real de URL seleciona a identidade B');
  eq([s.corrida, s.circuito, s.cr.sid, s.wod.sid], [null, null, null, null], 'B não recebe checkpoints nem sessões de A');
  eq([s.cardio, s.placares, s.shared], [[], {}, [null, null, null, null, null]], 'históricos compartilhados e chaves sem dono continuam sendo limpos');
  ok(await page.evaluate(a => !!localStorage.getItem(a.crKey) && !!localStorage.getItem(a.wodKey), a), 'trocar para B preserva somente os checkpoints isolados de A');
  await iniciar('b', 17, .11, 33); await marcarCompartilhados('b');
  const b = await estado();
  ok(a.crKey !== b.crKey && a.wodKey !== b.wodKey, 'corrida e circuito usam chaves distintas para cada aluno');
  // Sair antes de avançar a hora evita atribuir a lacuna ao evento pagehide.
  await page.goto('about:blank');
  await page.clock.setFixedTime(new Date('2026-09-29T11:30:00-03:00'));
  await abrir('a');
  eq(await page.locator('#crRetoma').getAttribute('hidden'), null, 'A recebe a oferta de retomar sua corrida após passar por B');
  await page.evaluate(() => document.getElementById('crRetomar').click());
  s = await estado();
  eq([s.cr.sid, s.cr.run, s.cr.tempo, s.cr.km], [a.corrida.sid, false, 45, .42], 'corrida de A retorna pausada com o tempo e km anteriores à lacuna');
  eq([s.wod.sid, s.wod.run, s.wod.tempo, s.wod.gi, s.wod.voltas], [a.circuito.sid, false, 83, 1, 2], 'circuito de A retorna pausado com progresso e duração próprios');
  eq([s.cardio, s.placares, s.shared], [[], {}, [null, null, null, null, null]], 'voltar a A não carrega históricos nem campos compartilhados de B');
  ok(await page.evaluate(b => !!localStorage.getItem(b.crKey) && !!localStorage.getItem(b.wodKey), b), 'os checkpoints isolados de B também sobrevivem ao retorno para A');
  const exportPendente = await page.evaluate(() => window.__exportaDados());
  eq(Object.keys(exportPendente.tudo_no_aparelho).filter(k => /^pt(?:corrida|wod)Sessao:/.test(k)), [], 'exportação exclui checkpoints internos tanto do aluno atual quanto do outro aluno');
  ok(!JSON.stringify(exportPendente).includes(tokens.a) && !JSON.stringify(exportPendente).includes(tokens.b) && !JSON.stringify(exportPendente).includes(b.corrida.sid) && !JSON.stringify(exportPendente).includes(b.circuito.sid), 'exportação com sessões pendentes não inclui tokens nem dados de B');
  const devolvido = page.waitForResponse(r => r.url().endsWith('/rpc/app_aluno_devolve') && r.request().postDataJSON().t === tokens.a);
  await page.evaluate(() => { document.getElementById('crFim').click(); document.getElementById('wodTermina').click(); document.getElementById('wpSalvar').click(); });
  await devolvido;
  s = await estado();
  eq(s.cardio.map(x => x.id), [a.corrida.sid], 'conclusão restaurada registra apenas a corrida da identidade A');
  eq(Object.values(s.placares).flat().map(x => x.sid), [a.circuito.sid], 'conclusão restaurada registra apenas o circuito da identidade A');
  const envio = calls.filter(x => x.fn === 'app_aluno_devolve' && x.body.t === tokens.a).at(-1);
  ok(envio && JSON.stringify(envio.body).includes(a.corrida.sid) && JSON.stringify(envio.body).includes(a.circuito.sid) && !JSON.stringify(envio.body).includes('exclusivo-b') && !JSON.stringify(envio.body).includes(b.corrida.sid), 'devolução simulada de A contém seus resultados e nenhum registro de B');
  const exportFinal = await page.evaluate(() => window.__exportaDados());
  eq([exportFinal.corridas, exportFinal.circuitos], [s.cardio, s.placares], 'exportação conserva os resultados finalizados de corrida e circuito de A');
  eq([exportFinal.tudo_no_aparelho.ptcardio, exportFinal.tudo_no_aparelho.ptwodres], [s.cardio, s.placares], 'coleções finalizadas atuais também permanecem no formato completo de exportação');
  ok(!JSON.stringify(exportFinal).includes(tokens.a) && !JSON.stringify(exportFinal).includes(tokens.b) && !JSON.stringify(exportFinal).includes(b.corrida.sid) && !JSON.stringify(exportFinal).includes(b.circuito.sid) && !JSON.stringify(exportFinal).includes('exclusivo-b'), 'exportação após concluir A continua sem tokens ou dados de B');

  // A palavra do servidor continua invalidando inclusive os checkpoints isolados.
  for (const motivo of ['revogado', 'sem_registro']) {
    denied = '';
    await abrir('b');
    if (!(await estado()).circuito) await iniciar('b', 12, .1, 20);
    ok(await page.evaluate(() => Object.keys(localStorage).some(k => /^pt(?:corrida|wod)Sessao:/.test(k))), 'há checkpoint antes do corte ' + motivo);
    denied = motivo;
    await page.goto(BASE + '/app/?t=' + tokens.b);
    await page.waitForFunction(() => /acesso foi encerrado|não existe mais/.test(document.body.textContent));
    eq(await page.evaluate(() => ({ token: localStorage.getItem('tq_app_token'), pacote: localStorage.getItem('tq_app_pacote'), treino: Object.keys(localStorage).filter(k => /^(pt|nt)[a-z]/.test(k)) })), { token: null, pacote: null, treino: [] }, 'corte ' + motivo + ' continua limpando token, cópia e todos os registros/checkpoints');
  }
  eq(externalBackend, [], 'nenhuma RPC aponta para backend externo ao mock local');
  eq(errors, [], 'fluxo real do loader sem erros de JavaScript');
  await ctx.close();
  console.log(total + ' verificações do loader e retomada passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
