/* Corrida real gerada pelo builder, dados fictícios e nenhuma rede de produção. */
'use strict';
const assert = require('node:assert/strict');
let chromium; try { chromium = require('playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const { comMockNuvem } = require('./_nuvem.js');
global.self = global; require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const token = 'corrida-token-sintetico-a';
const D = { a: { id: 'corredor-a', nome: 'Corredor Sintético', appTokenP: token }, studio: 'Teste isolado', COR: '#7c3aed', COR2: '#5925ba', CORC: '#b395ff', CORE: '#33155c', CORCL1: '#d6c4ff', CORCL2: '#e8ddff', cfg: {}, cardiosApp: [{ id: 'intervalos-ficticios', nome: 'Correr e caminhar', mod: 'corrida', tipo: 'continuo', blocos: [{ tipo: 'ativo', alvo: { acao: 'correr', valor: 60, unidade: 's' } }, { tipo: 'recuperacao', alvo: { acao: 'caminhar', valor: 30, unidade: 's' } }] }] };
let html = MT_APP_ALUNO.monta(D), browser, n = 0;
function ok(v, text) { assert.ok(v, text); n++; console.log('OK ' + text); }
function eq(v, want, text) { assert.deepEqual(v, want, text); n++; console.log('OK ' + text); }
(async () => {
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' });
  await ctx.route('**/*', r => new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort());
  await ctx.route(BASE + '/corrida-retomada-sintetica.html', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.addInitScript(() => {
    if (location.origin === 'null') return;
    localStorage.setItem('ptcrCfg', JSON.stringify({ cd: 0, fb: 'off', ap: 0, bl: 0 }));
    window.__gpsWatchId = 0; window.__gpsCallbacks = {};
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: cb => { const id = ++window.__gpsWatchId; window.__gpsCallbacks[id] = cb; return id; },
      clearWatch: id => { delete window.__gpsCallbacks[id]; }
    } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: () => Promise.resolve({ state: 'granted' }) } });
  });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  const at = new Date('2026-09-29T23:58:00-03:00');
  await p.clock.setFixedTime(at);
  async function load() { await p.goto(BASE + '/corrida-retomada-sintetica.html'); await p.waitForFunction(() => window.__crSessao && window.__cr); }
  async function start() { await p.evaluate(() => { document.getElementById('crZera').click(); document.querySelector('[data-cbstart]').click(); document.getElementById('crGo').click(); }); }
  async function advance(seconds, km) { await p.evaluate(({ seconds, km }) => { __cr.t0 = Date.now() - seconds * 1000; document.getElementById('crKm').value = String(km); __pintaCr(); }, { seconds, km }); }
  async function state() { return p.evaluate(() => ({ run: __cr.run, tempo: __cr.acum, km: __crKmAtual(), bi: __cr.bi, sid: __cr.sid, snapshot: __crSessao.le(), registros: JSON.parse(localStorage.getItem('ptcardio') || '[]'), dias: JSON.parse(localStorage.getItem('ptfeitos') || '{}'), resumo: __cr.resumo })); }
  await load(); await start(); await advance(45, .42);
  await p.evaluate(() => { __cr.rota = [{ lat: -20, lng: -44 }, { lat: -20.001, lng: -44.001 }]; __crSessao.salva(true); });
  let before = await state();
  ok(before.snapshot && before.snapshot.tempo === 45 && before.snapshot.km === .42, 'checkpoint contém somente tempo e distância observados');
  eq(await p.locator('#crGigaV').textContent(), '0:15', 'etapa restante é a métrica principal da corrida guiada');
  await p.goto('about:blank'); await p.clock.setFixedTime(new Date('2026-09-30T01:30:00-03:00')); await load();
  eq(await p.locator('#crRetoma').getAttribute('hidden'), null, 'reabertura oferece a corrida salva na área de corrida');
  await p.evaluate(() => __crSessao.restaura());
  let s = await state();
  eq([s.run, s.tempo, s.km, s.bi, s.sid], [false, 45, .42, 0, before.sid], 'retomada após mais de uma hora fica pausada sem inventar tempo ou km');
  eq(await p.evaluate(() => __cr.rota.length), 2, 'trajeto anterior permanece na retomada');
  await p.evaluate(() => document.getElementById('crGo').click()); await advance(60, .55);
  eq((await state()).bi, 1, 'retomada avança a etapa no tempo original');
  await advance(90, .7); s = await state();
  eq(s.registros.length, 1, 'concluir a sequência grava uma única atividade');
  eq(s.registros[0].tempoBase, 'ativo', 'registro nativo identifica a base do cronômetro para comparações futuras');
  eq([s.registros[0].status, s.registros[0].d, s.registros[0].etapas.map(e => e.status)], ['completo', '2026-09-29', ['completo', 'completo']], 'resultado guarda etapas e data original ao atravessar meia-noite');
  eq(s.dias, { '2026-09-29': 1 }, 'a conclusão registra o dia original sem exigir um segundo botão');
  ok(!s.snapshot && s.resumo, 'checkpoint só é liberado depois do registro confirmado');
  const faseConcluida = await p.locator('#crFase').textContent();
  await p.evaluate(() => __pintaCr());
  eq(await p.locator('#crFase').textContent(), faseConcluida, 'repintura tardia não troca conclusão por uma etapa ativa enquanto o resumo está aberto');
  await p.evaluate(() => { document.getElementById('crFim').click(); document.getElementById('crFim').click(); });
  eq((await state()).registros.length, 1, 'duplo toque no fim não duplica atividade');

  await start(); await advance(20, .15);
  await p.evaluate(() => { document.getElementById('crPulaF').click(); __cr.t0 = Date.now() - 50 * 1000; document.getElementById('crKm').value = '.3'; __pintaCr(); });
  s = await state();
  eq(s.registros.at(-1).status, 'parcial', 'pular uma etapa não declara treino completo');
  eq(s.registros.at(-1).etapas.map(e => e.status), ['pulado', 'completo'], 'resumo distingue etapa pulada da concluída');
  ok(!/COMPLETO/.test(await p.locator('#crFase').textContent()), 'mensagem final respeita execução parcial');

  await start(); await advance(35, .25);
  await p.evaluate(() => { window.__storageSet = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'ptcardio') throw new DOMException('quota fictícia', 'QuotaExceededError'); return __storageSet.call(this, key, value); }; document.getElementById('crFimF').click(); });
  s = await state();
  ok(!s.run && !s.resumo && s.snapshot && s.tempo === 35, 'falta de espaço preserva corrida pausada e checkpoint');
  ok(await p.locator('#crSalvarErro').isVisible(), 'falha de gravação tem mensagem e tentativa de salvar');
  ok(await p.locator('#crFull').isVisible(), 'finalizar pela tela cheia mantém erro e retry acessíveis');
  const failedId = s.sid, countBefore = s.registros.length;
  await p.evaluate(() => { Storage.prototype.setItem = __storageSet; document.getElementById('crSalvarRetry').click(); });
  s = await state(); eq(s.registros.length, countBefore + 1, 'tentar novamente grava exatamente uma atividade');
  eq(s.registros.at(-1).id, failedId, 'nova tentativa mantém identidade da mesma corrida');
  eq(s.registros.at(-1).status, 'parcial', 'encerramento antecipado conserva status parcial');

  await start(); await advance(25, .2);
  await p.evaluate(() => { window.__conclusaoReal = window.__acRegistraConclusao; window.__acRegistraConclusao = () => false; document.getElementById('crFim').click(); });
  s = await state(); const savedCount = s.registros.length;
  ok(s.snapshot && !s.resumo, 'falha no registro do dia conserva recuperação mesmo após salvar a corrida');
  await load(); await p.evaluate(() => { __crSessao.restaura(); document.getElementById('crSalvarRetry').click(); });
  s = await state(); eq(s.registros.length, savedCount, 'reabrir e concluir registro pendente não duplica corrida');
  ok(s.resumo && !s.snapshot, 'registro pendente é concluído após reabertura');

  await start(); await advance(24, .12);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await state(); eq([s.run, s.tempo, s.km], [false, 24, .12], 'sair do app pausa e protege o trecho medido');
  await p.clock.setFixedTime(new Date('2026-09-30T02:30:00-03:00'));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await state(); eq([s.run, s.tempo, s.km], [false, 24, .12], 'voltar ao app não adiciona a lacuna nem reinicia sozinho');
  await p.evaluate(() => document.getElementById('crGo').click());
  async function gps(lat, accuracy) {
    // Pontos distintos levam tempo real de percurso; não simulamos 55m em0s.
    await p.clock.setFixedTime(new Date(await p.evaluate(() => Date.now() + 5000)));
    await p.evaluate(({ lat, accuracy }) => { const cb = __gpsCallbacks[__cr.watch]; if (!cb) throw new Error('GPS não iniciou'); cb({ coords: { latitude: lat, longitude: -44, accuracy, speed: 2, heading: 0 }, timestamp: Date.now() }); }, { lat, accuracy });
  }
  await gps(-20, 50);
  eq(await p.locator('#crSinalF').getAttribute('data-estado'), 'fraco', 'precisão de50m é fraca, de acordo com o filtro de40m');
  eq((await state()).km, .12, 'leitura fraca não altera a distância');
  await gps(-20, 20); await gps(-20.0005, 20);
  ok((await state()).km > .12, 'GPS bom volta a somar apenas novos deslocamentos');
  eq(await p.locator('#crSinalF').getAttribute('data-estado'), 'bom', 'estado do sinal permanece visível na tela cheia');
  const measured = (await state()).km;
  await p.evaluate(() => { __cr.gpsFix -= 20000; __pintaCr(); });
  eq(await p.locator('#crSinalF').getAttribute('data-estado'), 'fraco', 'ausência de pontos novos é sinalizada');
  await gps(-20.001, 20);
  eq((await state()).km, measured, 'primeiro ponto após lacuna não inventa um trajeto em linha reta');
  await gps(-20.0015, 20);
  eq(await p.evaluate(() => __cr.rota.filter(p => p.quebra).length), 1, 'trajeto marca uma interrupção após perder o sinal');
  await p.evaluate(() => document.getElementById('crFimF').click());
  s = await state(); eq(s.registros.at(-1).rpartes.length, 2, 'salvamento mantém dois trechos separados e uma polyline compatível');
  await p.evaluate(() => {
    window.maplibregl = { Map: function () { this.on = (name, cb) => { if (name === 'style.load') cb(); }; this.addSource = (_, data) => { window.__geoTeste = data.data.geometry; }; this.addLayer = () => {}; this.fitBounds = () => {}; this.easeTo = () => {}; this.remove = () => {}; } };
    document.getElementById('crRs3D').click();
  });
  await p.waitForFunction(() => window.__geoTeste);
  eq(await p.evaluate(() => [__geoTeste.type, __geoTeste.coordinates.length]), ['MultiLineString', 2], 'mapa3D não desenha ligação entre trechos sem sinal');
  await p.evaluate(() => document.getElementById('cr3Dx').click());
  await start(); await advance(24, .2);

  await p.evaluate(() => __crSessao.salva(true)); const keyA = await p.evaluate(() => __crSessao.chave);
  const antesDaMarca = (await state()).snapshot;
  const renomeado = { ...D, studio: 'Marca atualizada do mesmo personal', a: { ...D.a, nome: 'Nome atualizado do mesmo aluno' } };
  html = MT_APP_ALUNO.monta(renomeado); await load();
  eq(await p.evaluate(() => __crSessao.chave), keyA, 'renomear studio e aluno não muda o escopo do token publicado');
  await p.evaluate(() => document.getElementById('crRetomar').click()); s = await state();
  eq([s.sid, s.run, s.tempo, s.km], [antesDaMarca.sid, false, antesDaMarca.tempo, antesDaMarca.km], 'sessão publicada sobrevive à mudança de marca e retoma pausada');
  html = MT_APP_ALUNO.monta({ ...renomeado, a: { ...renomeado.a, appTokenP: 'corrida-token-sintetico-b' } }); await load();
  ok(!(await state()).snapshot && !await p.locator('#crRetoma').isVisible(), 'outro aluno/token não recebe a sessão anterior');
  ok(await p.evaluate(key => !!localStorage.getItem(key), keyA), 'trocar de aluno não apaga a sessão original');
  html = MT_APP_ALUNO.monta(D); await load(); await p.evaluate(() => __crSessao.restaura());
  await p.evaluate(() => localStorage.setItem('tq_app_token', 'outro-acesso-sintetico'));
  const recordsBeforeStale = (await state()).registros.length;
  await p.evaluate(() => document.getElementById('crFim').click());
  eq((await state()).registros.length, recordsBeforeStale, 'aba antiga não escreve histórico depois de trocar de identidade');
  await p.evaluate(() => localStorage.removeItem('tq_app_token'));

  // A32ª corrida não deve apagar a primeira nem seus recordes.
  await p.evaluate(() => { document.getElementById('crZera').click(); localStorage.setItem('ptcardio', JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ id: 'historico-' + i, d: '2026-09-01', n: 'Sintética', m: 'corrida', s: 600, k: 1 })))); });
  await start(); await advance(20, .2); await p.evaluate(() => document.getElementById('crFim').click());
  s = await state(); eq(s.registros.length, 32, 'histórico preserva atividades além das últimas30');
  eq(s.registros[0].id, 'historico-0', 'atividade mais antiga continua disponível');
  eq(s.registros[0].tempoBase, undefined, 'histórico antigo não recebe base de tempo presumida');
  await start(); await advance(15, .1);
  eq(await p.evaluate(() => {
    __crSessao.salva(true); const key = __crSessao.chave, original = localStorage.getItem(key), good = JSON.parse(original), result = [];
    for (const change of [{ km: '10' }, { rota: [{ lat: 1234, lng: -44 }] }, { blocos: [null], bi: 0 }, { escopo: 'outro-aluno' }, { dia: '2099-01-01' }]) {
      localStorage.setItem(key, JSON.stringify({ ...good, ...change })); result.push(__crSessao.restaura());
    }
    localStorage.setItem(key, original); return result;
  }), [false, false, false, false, false], 'checkpoint corrompido ou de outra identidade não é restaurado');
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await p.setViewportSize({ width, height });
    const geo = await p.evaluate(() => {
      const r = id => { const a = document.getElementById(id).getBoundingClientRect(); return { top: a.top, bottom: a.bottom, left: a.left, right: a.right }; };
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, topo: r('crTopoF'), valor: r('crGigaV'), alvo: r('crEtapaF'), acao: r('crGoF') };
    });
    ok(!geo.overflow && geo.acao.bottom <= height && geo.acao.left >= 0 && geo.acao.right <= width, 'controle principal cabe na tela de' + width + '×' + height);
    ok(geo.topo.bottom <= geo.valor.top && geo.alvo.bottom <= geo.acao.top, 'etapa e alvo não sobrepõem avisos nem controles em' + width + '×' + height + ' ' + JSON.stringify(geo));
  }
  const local = { ...D, a: { ...D.a, appTokenP: '', id: 'aluno-local-estavel' } };
  html = MT_APP_ALUNO.monta(local); await load(); await start(); await advance(18, .14);
  await p.evaluate(() => __crSessao.salva(true)); const localAntes = (await state()).snapshot;
  html = MT_APP_ALUNO.monta({ ...local, a: { ...local.a, nome: 'Outro nome do mesmo aluno local' } }); await load();
  await p.evaluate(() => document.getElementById('crRetomar').click()); s = await state();
  eq([s.sid, s.run, s.tempo, s.km], [localAntes.sid, false, localAntes.tempo, localAntes.km], 'sem token, o ID do aluno prevalece sobre seu nome na retomada');
  html = MT_APP_ALUNO.monta({ ...local, a: { ...local.a, id: 'outro-aluno-local' } }); await load();
  ok(!(await state()).snapshot, 'fallback local isola IDs de alunos mesmo com nome e studio iguais');
  html = MT_APP_ALUNO.monta({ ...local, studio: 'Outro studio local' }); await load();
  ok(!(await state()).snapshot, 'fallback local isola studios quando não existe token publicado');

  // O editor conserva a distância de uma rodagem ao trocar o formato para tiros.
  // A duração dos tiros é seu alvo; campos ocultos do contínuo não os tornam parciais.
  const tiros = { id: 'tiros-residuo', nome: 'Tiros de quinta', mod: 'corrida', tipo: 'intervalado', dist: 5, tempo: 30, pace: '6:30', reps: 2, tiro: 1, desc: 1 };
  html = MT_APP_ALUNO.monta({ ...D, cardiosApp: [tiros] }); await load(); await start(); await advance(6, 0);
  s = await state();
  eq([s.run, s.resumo, s.registros.at(-1).status, s.registros.at(-1).n, s.registros.at(-1).s], [false, true, 'completo', 'Tiros de quinta', 6], 'tiros completam automaticamente pelo tempo mesmo com distância e tempo contínuo residuais');
  const tirosCount = s.registros.length;
  await p.evaluate(() => __pintaCr());
  eq([await p.locator('#crFase').textContent(), (await state()).registros.length], ['TIROS COMPLETOS — 2×!', tirosCount], 'nova repintura mantém a conclusão dos tiros sem duplicar o resultado');
  html = MT_APP_ALUNO.monta({ ...D, cardiosApp: [{ ...tiros, tiro: 10, desc: 10 }] }); await load(); await start(); await advance(6, 5);
  await p.evaluate(() => document.getElementById('crFim').click()); s = await state();
  eq([s.registros.at(-1).status, s.registros.at(-1).s], ['parcial', 6], 'encerrar tiros antes da duração prescrita é parcial mesmo atingindo distância residual');
  html = MT_APP_ALUNO.monta({ ...D, cardiosApp: [{ ...tiros, tipo: 'continuo', tempo: 0 }] }); await load(); await start(); await advance(10, 4);
  await p.evaluate(() => document.getElementById('crFim').click());
  eq((await state()).registros.at(-1).status, 'parcial', 'contínuo de 5 km continua parcial quando termina com 4 km');
  await start(); await advance(10, 5); await p.evaluate(() => document.getElementById('crFim').click());
  eq((await state()).registros.at(-1).status, 'completo', 'nova seleção e novo treino continuam disponíveis e contínuo conclui ao atingir seus 5 km');
  eq(errors, [], 'retomada, GPS, falhas e finalização sem erros deJavaScript');
  await ctx.close(); console.log(n + ' verificações de retomada da corrida passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
