/* Prescrição por série: editor real → armazenamento/modelo → pacote → player.
 * Alunos sintéticos, nuvem interceptada e navegador isolado. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert/strict');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, total = 0;
function ok(value, label) { assert.ok(value, label); console.log('  ✅ ' + label); total++; }
function igual(actual, expected, label) { assert.deepEqual(actual, expected, label); console.log('  ✅ ' + label); total++; }
const prescricao = [
  { reps: '5', carga: 20, descanso: 90 },
  { reps: '8', carga: 25, descanso: 75 },
  { reps: '10', carga: 30, descanso: 0 }
];

(async () => {
  global.self = global;
  global.MT_CLOUD = { url: 'https://torque-series.invalid', anonKey: 'teste' };
  require('../app/aluno-skin.js');
  require('../app/aluno-builder.js');
  const normaliza = global.MT_APP_ALUNO.normalizaSeries;
  ok(typeof normaliza === 'function', 'normalizador compartilhado está disponível');
  igual(normaliza({ series: 3, reps: '10', descanso: 60 }), Array.from({ length: 3 }, () => ({ reps: '10', descanso: 60, carga: null })),
    'ficha antiga 3×10 continua com três séries iguais e carga não informada');
  igual(normaliza({ s: 2, r: '8–12', d: 0, carga: 0 }), Array.from({ length: 2 }, () => ({ reps: '8–12', descanso: 0, carga: 0 })),
    'pacote compacto preserva faixa de repetições, descanso zero e peso do corpo');
  const fonte = { series: 99, reps: '99', descanso: 999, seriesDetalhadas: prescricao };
  const normalizadas = normaliza(fonte);
  igual(normalizadas, prescricao, 'séries individuais prevalecem sobre os campos antigos');
  normalizadas[0].reps = '100';
  ok(fonte.seriesDetalhadas[0].reps === '5', 'normalização não modifica a prescrição original');

  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const config = { viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' };
  const ctx = await browser.newContext(config);
  await ctx.route('**://*.supabase.co/**', r => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/demo-personal.html');
  await p.click('#btnDemo');
  await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__vaiMontarTreino && window.__tplMeu && window.__dadosApp);
  const ids = await p.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {});
    const a = st.alunos[0], outro = st.alunos[1];
    st.exercicios.push({ id: 'sp-supino', nome: 'Supino integração séries', grupo: 'Peito' }, { id: 'sp-remada', nome: 'Remada integração séries', grupo: 'Costas' });
    st.treinosV2[a.id] = { fichas: [{ id: 'sp-ficha', titulo: 'A — Séries independentes', itens: [
      { exId: 'sp-supino', series: 3, reps: '10', descanso: 60 },
      { exId: 'sp-remada', series: 2, reps: '12', descanso: 45 }
    ] }] };
    S.write('ptStudio', st);
    window.__vaiMontarTreino(a.id);
    return { aluno: a.id, outro: outro.id, ficha: 'sp-ficha' };
  });
  const chave = ids.ficha + ':0';
  const item = () => p.evaluate(id => window.MTStore.read('ptStudio', {}).treinosV2[id].fichas[0].itens[0], ids.aluno);
  const abrir = async (index = 0) => {
    const ficha = p.locator('details[data-fdet="' + ids.ficha + '"]');
    if (!await ficha.evaluate(el => el.open)) await ficha.locator(':scope > summary').click();
    const seletor = '[data-exab="' + ids.ficha + ':' + index + '"]';
    if (await p.getAttribute(seletor, 'aria-expanded') !== 'true') await p.click(seletor);
  };
  // Change é o evento público dos campos; o editor atualiza o resumo sem substituir o campo.
  const campo = (attr, valor) => p.evaluate(([sel, v]) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('Campo de prescrição ausente: ' + sel);
    el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [attr, valor]);
  const serie = (n, campoNome, valor) => campo('[data-serfld="' + chave + ':' + n + ':' + campoNome + '"]', valor);

  const bloqueia = async (seletor, label) => {
    ok(await p.getAttribute(seletor, 'aria-invalid') === 'true', label + ' recebe indicação acessível de erro');
    await p.click('[data-serpreview="' + chave + '"]');
    ok(await p.locator('#spPrevia').count() === 0, label + ' impede abrir a prévia do exercício');
    await p.click('#tdPublica');
    ok(await p.locator('#acDialog').count() === 0 && await p.locator('#acPublicar').count() === 0,
      label + ' impede avançar para publicação');
  };
  const corrige = async (seletor, valor, label) => {
    await p.fill(seletor, valor);
    ok(await p.getAttribute(seletor, 'aria-invalid') === 'false' && await p.locator(seletor).evaluate(el => document.activeElement === el),
      label + ' aceita a correção sem perder o foco');
  };
  await abrir();
  ok(await p.locator('details[data-serextras="' + chave + '"]').count() === 1 && await p.locator('[data-serextras="' + chave + '"][open]').count() === 0,
    'orientações extras começam recolhidas para manter o editor limpo');
  const qtd = '[data-tfld="' + chave + ':series"]';
  await p.fill(qtd, '31');
  ok((await item()).series === 3, 'quantidade acima de 30 não substitui as três séries salvas');
  await bloqueia(qtd, 'Quantidade inválida de séries');
  await corrige(qtd, '3', 'Quantidade de séries');
  ok((await item()).series === 3, 'quantidade válida volta a salvar normalmente');
  await p.click('[data-sermode="' + chave + '"][data-mode="individual"]');
  ok((await item()).seriesDetalhadas.length === 3, 'mudar para por série expande as três séries existentes');
  for (let i = 0; i < prescricao.length; i++) {
    for (const c of ['reps', 'carga', 'descanso']) await serie(i, c, String(prescricao[i][c]));
  }
  igual((await item()).seriesDetalhadas, prescricao, 'personal prescreve 5/8/10 com cargas e descansos independentes');
  const repsPrimeira = '[data-serfld="' + chave + ':0:reps"]';
  await p.fill(repsPrimeira, '');
  igual((await item()).seriesDetalhadas, prescricao, 'repetições vazias não apagam a prescrição salva');
  await bloqueia(repsPrimeira, 'Repetições vazias');
  await corrige(repsPrimeira, '5', 'Repetições');
  const descansoPrimeira = '[data-serfld="' + chave + ':0:descanso"]';
  await p.fill(descansoPrimeira, '-1');
  igual((await item()).seriesDetalhadas, prescricao, 'descanso negativo não substitui os 90 segundos salvos');
  await bloqueia(descansoPrimeira, 'Descanso negativo');
  await corrige(descansoPrimeira, '90', 'Descanso');
  igual((await item()).seriesDetalhadas, prescricao, 'correções restauram o salvamento sem modificar as outras séries');
  await serie(2, 'carga', '');
  ok((await item()).seriesDetalhadas[2].carga === null, 'carga opcional vazia fica não informada, sem virar peso zero');
  await serie(2, 'carga', '30');
  await p.click('[data-serpreview="' + chave + '"]');
  for (let i = 0; i < prescricao.length; i++) {
    if (i) await p.click('#spPrevia [data-sp-prox]');
    const previa = await p.textContent('#spPrevia .sp-preview');
    ok(previa.includes('Série ' + (i + 1) + ' de 3') && previa.includes(prescricao[i].reps + ' repetições') &&
      previa.includes(prescricao[i].carga + ' kg') && previa.includes(prescricao[i].descanso + ' s'),
    'prévia do aluno mostra repetições, carga e descanso da série ' + (i + 1));
  }
  ok(await p.isDisabled('#spPrevia [data-sp-prox]'), 'prévia impede avançar para uma série inexistente');
  await p.click('#spPrevia [data-sp-fechar]');
  await p.click('[data-seradd="' + chave + '"]');
  ok((await item()).seriesDetalhadas.length === 4, 'adicionar série preserva as três anteriores');
  await p.fill('[data-serfld="' + chave + ':3:reps"]', '');
  ok(await p.getAttribute('[data-serfld="' + chave + ':3:reps"]', 'aria-invalid') === 'true', 'quarta série com repetições vazias fica inválida');
  await p.click('[data-serremove="' + chave + ':3"]');
  igual((await item()).seriesDetalhadas, prescricao, 'remover a própria série inválida funciona e não altera as demais');
  await abrir(1);
  ok(await p.locator('.tdex.aberto').count() === 1 && await p.getAttribute('[data-exab="' + chave + '"]', 'aria-expanded') === 'false',
    'editar outro exercício recolhe o primeiro');
  await p.reload();
  await p.waitForFunction(() => window.__vaiMontarTreino);
  await p.evaluate(id => window.__vaiMontarTreino(id), ids.aluno);
  igual((await item()).seriesDetalhadas, prescricao, 'séries individuais sobrevivem ao recarregamento');
  await abrir();
  await p.click('[data-sermode="' + chave + '"][data-mode="uniform"]');
  await p.waitForSelector('#spUniformiza', { state: 'visible' });
  await p.click('#spCancelarPadrao');
  igual((await item()).seriesDetalhadas, prescricao, 'cancelar todas iguais conserva a prescrição individual');

  const mod = await p.evaluate(() => window.__tplMeu.salva('Séries 5/8/10 — integração'));
  ok(mod.ok, 'prescrição pode ser salva como modelo');
  await serie(0, 'reps', '6');
  igual(await p.evaluate(mid => window.MTStore.read('ptStudio', {}).modelosPT.find(m => m.id === mid).fichas[0].itens[0].seriesDetalhadas, mod.id), prescricao,
    'modelo mantém cópia independente das séries');
  await serie(0, 'reps', '5');
  const aplicado = await p.evaluate(({ id, mid }) => {
    const S = window.MTStore;
    const n = ((S.read('ptStudio', {}).treinosV2[id] || {}).fichas || []).length;
    window.confirm = () => true;
    const r = window.__tplMeu.aplica(id, 'meu:' + mid);
    return { ok: r.ok, item: S.read('ptStudio', {}).treinosV2[id].fichas[n].itens[0] };
  }, { id: ids.outro, mid: mod.id });
  ok(aplicado.ok && aplicado.item.exId === 'sp-supino', 'aplicar modelo liga o exercício à biblioteca do personal');
  igual(aplicado.item.seriesDetalhadas, prescricao, 'aplicar modelo em outro aluno preserva todas as séries');
  await p.evaluate(id => window.__vaiMontarTreino(id), ids.aluno);
  await p.evaluate(fid => window.__acompPT.lote(fid), ids.ficha);
  ok(await p.isDisabled('[data-ac-index="0"]') && await p.isChecked('[data-ac-index="1"]'),
    'edição em lote preserva o exercício individual e seleciona o uniforme');
  await p.fill('#acSeries', '4'); await p.fill('#acReps', '15'); await p.fill('#acDescanso', '120');
  await p.click('#acAplicar');
  const lote = await p.evaluate(id => window.MTStore.read('ptStudio', {}).treinosV2[id].fichas[0].itens, ids.aluno);
  igual(lote[0].seriesDetalhadas, prescricao, 'edição em lote mantém todas as séries personalizadas');
  ok(lote[1].series === 4 && lote[1].reps === '15' && lote[1].descanso === 120,
    'edição em lote altera apenas o exercício com séries iguais');
  await abrir(1);
  await campo('[data-tfld="' + ids.ficha + ':1:series"]', '2');
  await campo('[data-tfld="' + ids.ficha + ':1:reps"]', '12');
  await campo('[data-tfld="' + ids.ficha + ':1:descanso"]', '45');
  const recordes = await p.evaluate(() => window.__recordesDe({ cargas: {
    'Só anotado': [{ d: '2026-07-01', kg: 20 }, { d: '2026-08-10', kg: 100, g: 2, feito: false }],
    'Série concluída': [{ d: '2026-07-01', kg: 20 }, { d: '2026-08-10', kg: 30, g: 2, feito: true }, { d: '2026-08-11', kg: 100, g: 2, feito: false }]
  } }, '2026-08-01', '2026-08-31'));
  igual(recordes, [{ ex: 'Série concluída', de: 20, pra: 30 }],
    'recordes do Personal ignoram séries anotadas sem conclusão e reconhecem somente a carga realizada');
  let D = await p.evaluate(id => {
    const st = window.MTStore.read('ptStudio', {});
    return window.__dadosApp(st.alunos.find(a => a.id === id), new Date().toISOString());
  }, ids.aluno);
  igual(D.fichasApp[0].itens[0].seriesDetalhadas, prescricao, 'pacote da ficha publicada inclui a prescrição por série');
  igual(D.guiaFichasP[0].it[0].seriesDetalhadas, prescricao, 'pacote do treino guiado inclui a mesma prescrição');
  ok(D.fichasApp[0].itens[1].series === 2 && D.fichasApp[0].itens[1].reps === '12' && D.guiaFichasP[0].it[1].s === 2 && D.guiaFichasP[0].it[1].r === '12',
    'exercício legado da mesma ficha mantém os campos tradicionais');

  // Reduzir séries diferentes exige definir e confirmar explicitamente o padrão.
  await p.evaluate(id => window.__vaiMontarTreino(id), ids.aluno);
  await abrir();
  await p.click('[data-sermode="' + chave + '"][data-mode="uniform"]');
  await p.fill('#spQtd', '2'); await p.fill('#spReps', '8–12');
  await p.fill('#spCarga', '0'); await p.fill('#spDesc', '0');
  await p.click('#spConfirmarPadrao');
  const uniforme = await item();
  ok(!uniforme.seriesDetalhadas && uniforme.series === 2 && uniforme.reps === '8–12' && uniforme.carga === 0 && uniforme.descanso === 0,
    'confirmação troca para duas séries iguais com peso do corpo e descanso zero');
  const pacoteUniforme = await p.evaluate(id => {
    const st = window.MTStore.read('ptStudio', {});
    return window.__dadosApp(st.alunos.find(a => a.id === id), new Date().toISOString());
  }, ids.aluno);
  ok(pacoteUniforme.fichasApp[0].itens[0].carga === 0 && pacoteUniforme.guiaFichasP[0].it[0].carga === 0,
    'carga uniforme explícita também chega aos dois formatos do aluno');
  await ctx.close();

  // O mesmo pacote real do Personal é a entrada do app; somente identidade e nuvem são sintéticas.
  D = JSON.parse(JSON.stringify(D));
  Object.assign(D, { a: { id: 'sp-aluno', nome: 'Aluno integração séries', appTokenP: 'token-series-teste' }, atualizador: '', botApp: null,
    qa: null, avs: [], planoApp: null, wodsApp: [], cardiosApp: [] });
  D.fichasApp = [D.fichasApp[0]]; D.fichasApp[0].itens = [D.fichasApp[0].itens[0]];
  D.guiaFichasP = [D.guiaFichasP[0]]; D.guiaFichasP[0].it = [D.guiaFichasP[0].it[0]];
  D.fexs = [{ n: D.fichasApp[0].itens[0].nome, s: 3 }];
  const html = global.MT_APP_ALUNO.monta(D);
  const ca = await browser.newContext(config);
  await ca.route('**://*.supabase.co/**', r => r.abort());
  const devolvidos = [];
  await ca.route('https://torque-series.invalid/**', r => {
    if (r.request().url().endsWith('/app_aluno_devolve')) {
      devolvidos.push(r.request().postDataJSON());
      return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    return r.fulfill({ contentType: 'application/json', body: 'null' });
  });
  await ca.route(BASE + '/series-integracao.html', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ca.addInitScript(() => {
    localStorage.setItem('pttour', JSON.stringify({ como: 'teste' }));
    localStorage.setItem('ptonb', JSON.stringify({ feito: true }));
  });
  const pa = await ca.newPage();
  pa.on('pageerror', e => errors.push(e.message));
  await pa.goto(BASE + '/series-integracao.html');
  await pa.waitForFunction(() => window.__acSessao && window.__seriesAluno);
  await pa.evaluate(() => document.querySelector('.guiabtn').click());
  await pa.waitForSelector('#gSerie', { state: 'visible' });
  const repsTela = () => pa.locator('.gtile').first().textContent();
  ok(/5/.test(await repsTela()) && /1/.test(await pa.textContent('#gGrupo')), 'player começa com o alvo da primeira série');
  const salvaAnotacao = async page => {
    const detalhes = page.locator('#gSalvar').locator('xpath=ancestor::details');
    for (let i = 0; i < await detalhes.count(); i++) {
      if (!await detalhes.nth(i).evaluate(e => e.open)) await detalhes.nth(i).locator(':scope > summary').click();
    }
    await page.click('#gSalvar');
  };
  const realizado = async (kg, reps) => {
    await pa.fill('#gKg', String(kg)); await pa.fill('#gReps', String(reps));
    await salvaAnotacao(pa);
  };
  const volume = () => pa.evaluate(() => {
    const d = new Date(), dia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return window.__seriesAluno.volume(0, dia);
  });
  await realizado(20, 5);
  ok(await volume() === 0, 'anotar uma série ainda não concluída não fabrica volume realizado');
  ok(await pa.evaluate(() => window.__maxPorExercicio().length === 0), 'anotação ainda não concluída fica fora dos recordes do aluno');
  await pa.click('#gSerie');
  const checkpoint = await pa.evaluate(() => window.__acSessao.ler());
  ok(checkpoint.s === 1 && checkpoint.desc - Date.now() > 85000 && checkpoint.desc - Date.now() <= 90000,
    'primeira série salva checkpoint e usa seus 90 segundos de descanso');
  ok(await volume() === 100, 'primeira série concluída contabiliza 20 kg × 5 reps');
  await pa.reload();
  await pa.click('#navApp [data-msec="treino"]');
  await pa.waitForSelector('#acRetomar button');
  await pa.click('#acRetomar button');
  ok(await pa.evaluate(() => window.__gvDe().s === 1 && window.__gvDe().timer !== null), 'retomada restaura a segunda série e o descanso em andamento');
  await pa.evaluate(() => window.__zeraDescanso());
  ok(/8/.test(await repsTela()), 'após descanso o alvo passa para oito repetições');
  await realizado(25, 7); await pa.click('#gSerie');
  const segundo = await pa.evaluate(() => window.__acSessao.ler());
  ok(segundo.s === 2 && segundo.desc - Date.now() > 70000 && segundo.desc - Date.now() <= 75000,
    'segunda série usa 75 segundos, sem herdar os 90 da primeira');
  ok(await volume() === 275, 'volume soma as sete repetições realizadas, sem substituir pelas oito prescritas');
  await pa.evaluate(() => window.__zeraDescanso());
  ok(/10/.test(await repsTela()), 'terceira série mostra dez repetições');
  await realizado(30, 9); await pa.click('#gSerie');
  const historico = await pa.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ptdc') || '{}')).flat().filter(x => x.g === 2 && x.feito));
  igual(historico.map(x => ({ serie: x.serie, kg: x.kg, r: x.r })).sort((a, b) => a.serie - b.serie),
    [{ serie: 1, kg: 20, r: 5 }, { serie: 2, kg: 25, r: 7 }, { serie: 3, kg: 30, r: 9 }], 'histórico conserva cada carga e repetição realmente executada');
  ok(await volume() === 545, 'volume final soma 20×5 + 25×7 + 30×9');
  await pa.waitForSelector('#gFecharTreino', { state: 'visible' });
  await pa.click('#gFecharTreino');
  ok(await pa.evaluate(() => !window.__acSessao.ler()), 'finalizar o treino limpa a retomada');
  await pa.waitForFunction(() => window.__acSync && !window.__acSync.pendente(), null, { timeout: 10000 });
  ok(devolvidos.some(x => Object.values(x.p_dados.cargas || {}).flat().filter(y => y.g === 2 && y.feito).length === 3),
    'sincronização envia as três execuções separadas para o personal');
  ok(errors.length === 0, 'editor e player não geram erros de JavaScript: ' + errors.join('; '));
  await ca.close();
  // O mesmo exercício pode aparecer duas vezes: execução e contagem pertencem ao slot.
  const duplicado = JSON.parse(JSON.stringify(D));
  duplicado.fichasApp[0].itens.push(JSON.parse(JSON.stringify(duplicado.fichasApp[0].itens[0])));
  duplicado.guiaFichasP[0].it.push(JSON.parse(JSON.stringify(duplicado.guiaFichasP[0].it[0])));
  const cb = await browser.newContext(config);
  await cb.route('**/*', r => r.request().url() === BASE + '/series-duplicadas.html'
    ? r.fulfill({ contentType: 'text/html', body: global.MT_APP_ALUNO.monta(duplicado) }) : r.abort());
  await cb.addInitScript(() => { localStorage.setItem('pttour', '{}'); localStorage.setItem('ptonb', '{"feito":true}'); });
  const pb = await cb.newPage(); pb.on('pageerror', e => errors.push(e.message));
  await pb.goto(BASE + '/series-duplicadas.html');
  await pb.evaluate(() => document.querySelector('.guiabtn').click());
  await pb.fill('#gKg', '20'); await pb.fill('#gReps', '5'); await salvaAnotacao(pb); await pb.click('#gSerie');
  igual(await pb.locator('.setbtn').allTextContents(), ['1/3 séries ✓', '0/3 séries ✓'], 'nomes repetidos têm contadores independentes');
  await pb.evaluate(() => window.__zeraDescanso()); await pb.click('#gSemRegistro'); await pb.evaluate(() => window.__pintaUlt());
  ok(!(await pb.locator('.exult,.exkg').allTextContents()).join(' ').includes('null'), 'concluir sem anotar carga não mostra null kg');
  await pb.evaluate(() => window.__zeraDescanso()); await pb.fill('#gKg', 'abc'); await pb.fill('#gReps', '9'); await salvaAnotacao(pb);
  ok(await pb.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('ptdc'))).flat().some(x => x.i === '0:0:2')), 'carga inválida não é convertida silenciosamente em ausência ou zero');
  await pb.click('#gFechar');
  ok(await pb.isVisible('#guiaBox') && await pb.inputValue('#gKg') === 'abc', 'fechar com valores inválidos mantém o formulário para correção');
  await pb.click('#gPulaEx2');
  ok(await pb.evaluate(() => window.__gvDe().e === 0) && await pb.inputValue('#gReps') === '9', 'avançar com valores inválidos preserva as repetições preenchidas');
  await pb.fill('#gKg', ''); await pb.fill('#gReps', ''); await pb.click('#gFechar');
  ok(!await pb.isVisible('#guiaBox'), 'limpar os campos opcionais permite sair');
  await pb.click('#navApp [data-msec="treino"]');await pb.click('#acRetomar button'); await pb.click('#gSemRegistro'); await pb.evaluate(() => window.__zeraDescanso());
  igual(await pb.locator('.setbtn').allTextContents(), ['3/3 séries ✓', '0/3 séries ✓'], 'concluir o primeiro slot não completa a segunda ocorrência');
  ok(await pb.evaluate(() => !Object.keys(JSON.parse(localStorage.getItem('ptfeitos') || '{}')).length), 'ficha incompleta não ganha conclusão por nomes repetidos');
  await pb.fill('#gKg', '30'); await pb.fill('#gReps', '6'); await salvaAnotacao(pb); await pb.click('#gSerie');
  igual(await pb.locator('.setbtn').allTextContents(), ['3/3 séries ✓', '1/3 séries ✓'], 'segunda ocorrência avança apenas no seu slot');
  ok(await pb.evaluate(() => { const d = new Date(); const dia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return window.__seriesAluno.volume(0, dia) === 280; }), 'volume dos dois slots soma 20×5 e 30×6 sem duplicar');
  ok(errors.length === 0, 'nenhum erro de JavaScript nos casos adicionais');
  await cb.close();
  console.log(total + ' verificações passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
