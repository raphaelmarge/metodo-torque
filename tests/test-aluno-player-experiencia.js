/* Player v793: fixture sintética, HTML canônico e nuvem bloqueada. */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert/strict');
const fs = require('fs');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8805';
function dados() {
  const itens = [
    { nome: 'Supino teste', series: 3, reps: '10', descanso: 90, seriesDetalhadas: [{ reps: '5', carga: 60, descanso: 90 }, { reps: '8', carga: 70, descanso: 75 }, { reps: '10', carga: null, descanso: 0 }], alts: ['Flexão aprovada'], altsAprovadas: true, tec: 'drop' },
    { nome: 'Remada teste', series: 1, reps: '12', descanso: 0 }
  ];
  return { a: { id: 'player-teste', nome: 'Aluno Sintético', appTokenP: 'token-player' }, studio: 'Studio Teste', PAL: ['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'], COR: '#7651ce', COR2: '#53319c', CORC: '#956fe5', CORE: '#372155', CORCL1: '#e9e0fa', CORCL2: '#f5f0ff', fichasApp: [{ titulo: 'A — Teste', itens }], fexs: itens.map(i => ({ n: i.nome, s: i.series })), guiaFichasP: [{ n: 'A — Teste', it: itens.map(i => ({ e: i.nome, s: i.series, r: i.reps, d: i.descanso, seriesDetalhadas: i.seriesDetalhadas })) }], avs: [], wodsApp: [], cardiosApp: [] };
}
async function abrir(browser, { width = 390, height = 844, tema = '', D = dados(), init } = {}) {
  global.self = global; global.MT_CLOUD = { url: 'https://player.invalid', anonKey: 'teste' };
  require('../app/aluno-skin.js'); require('../app/aluno-builder.js');
  const html = global.MT_APP_ALUNO.monta(D);
  for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(s[1]);
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await ctx.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await ctx.route(BASE + '/player-experiencia-test.html', r => r.fulfill({ contentType: 'text/html', body: html }));
  await ctx.addInitScript(() => { localStorage.setItem('pttour', JSON.stringify({ como: 'teste' })); localStorage.setItem('ptonb', JSON.stringify({ feito: true })); });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/player-experiencia-test.html');
  await p.waitForFunction(() => window.__seriesAluno && window.__acSessao);
  if (tema) await p.evaluate(tema => { document.documentElement.classList.remove('claro', 'dim'); document.documentElement.classList.add(tema); }, tema);
  await p.evaluate(() => document.querySelector('.guiabtn').click());
  await p.waitForSelector('#gKg', { state: 'visible' });
  return { ctx, p, errors };
}
async function main() {
  let total = 0;
  const ok = (v, t) => { assert.ok(v, t); total++; console.log('  ✅ ' + t); };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const { p, ctx, errors } = await abrir(browser);
    const series = () => p.evaluate(() => JSON.parse(localStorage.getItem('ptdc') || '{}')['Supino teste'] || []);
    const state = () => p.evaluate(() => window.__acSessao.ler());
    const vol = () => p.evaluate(() => window.__seriesAluno.volume(0, new Date().toLocaleDateString('en-CA')));
    ok((await p.locator('[data-gserie]').allTextContents()).join('|').includes('1ª5 reps|2ª8 reps|3ª10 reps'), 'seletor apresenta a prescrição de cada série');
    ok(await p.inputValue('#gKg') === '' && await p.inputValue('#gReps') === '', 'metas não preenchem execução');
    ok((await p.locator('.gserie-context').innerText()).includes('Prescrito: 60 kg · 90 s de descanso'), 'carga e descanso prescritos continuam visíveis');
    ok(!await p.isVisible('.gtiles') && !await p.isVisible('#gGrupo'), 'meta e posição redundantes deixam de ocupar o player');
    await p.fill('#gKg', '42,5'); await p.fill('#gReps', '4');
    await p.click('[data-gserie="1"]');
    ok((await p.locator('.gserie-context').innerText()).includes('Prescrito: 70 kg · 75 s de descanso'), 'mudar série atualiza carga e descanso prescritos no contexto visível');
    ok(await p.inputValue('#gKg') === '' && await p.inputValue('#gReps') === '', 'trocar série não leva o preenchimento para outro registro');
    await p.fill('#gKg', '70'); await p.fill('#gReps', '7');
    await p.click('[data-gserie="0"]');
    ok(await p.inputValue('#gKg') === '42,5' && await p.inputValue('#gReps') === '4', 'rascunho volta intacto à série original');
    ok((await state()).rascunhos['0:0:1'].kg === '70', 'rascunho da outra série fica no checkpoint');
    await p.click('#gSerie');
    ok((await series()).find(r => r.serie === 1).feito && await vol() === 170, 'Salvar e concluir grava somente execução informada');
    ok((await state()).s === 1 && (await state()).desc > Date.now(), 'progresso e descanso da série concluída são preservados');
    await p.reload(); await p.waitForFunction(() => window.__acSessao);
    await p.evaluate(() => document.querySelector('#acRetomar button').click());
    ok(await p.inputValue('#gKg') === '70' && await p.inputValue('#gReps') === '7', 'retomar durante descanso mantém rascunho da série seguinte');
    await p.click('[data-gserie="0"]');
    ok(/Salvar alteração/.test(await p.textContent('#gSerie')), 'série concluída oferece edição, sem nova conclusão');
    await p.fill('#gKg', '40'); await p.click('#gSerie');
    ok((await series()).filter(r => r.feito).length === 1 && (await series()).find(r => r.serie === 1).kg === 40 && await vol() === 160, 'editar primeira série não conclui a segunda nem duplica volume');
    ok(await p.evaluate(() => window.__zeraDescanso()) === 'segurou', 'descanso não navega enquanto uma série está em revisão');
    await p.click('#gDesfazSerie');
    ok(!(await series())[0].feito && await vol() === 0 && (await state()).s === 0, 'desfazer remove conclusão e volume, preservando anotação');
    await p.click('[data-gserie="1"]'); await p.click('#gSerie');
    ok((await series()).some(r => r.serie === 2 && r.feito) && !(await series()).find(r => r.serie === 1).feito, 'concluir fora de ordem marca apenas a série escolhida');
    ok((await state()).s === 0 && (await state()).feitas[0] === 1, 'próxima pendente e contagem não se confundem');
    await p.evaluate(() => window.__zeraDescanso());
    await p.click('#gSerie'); await p.evaluate(() => window.__zeraDescanso());
    ok((await state()).s === 2, 'avanço ignora a segunda série já concluída');
    ok((await p.locator('.gserie-context').innerText()).includes('0 s de descanso') && !(await p.locator('.gserie-context').innerText()).includes('Prescrito:'), 'descanso zero e ausência de carga prescrita são apresentados sem inventar valores');
    await p.click('#gSemRegistro');
    const r3 = (await series()).find(r => r.serie === 3);
    ok(r3.feito && r3.kg === null && !r3.r, 'concluir sem anotar não fabrica carga nem repetições');
    await p.evaluate(() => window.__zeraDescanso());
    await p.click('#gSemRegistro'); await p.click('#gFecharTreino');
    ok((await p.textContent('#gRevisaoSeries summary')).includes('4 séries concluídas · 2 com carga e repetições'), 'recibo distingue séries concluídas de registros completos');
    await p.click('#gRevisaoSeries summary'); await p.click('[data-grever="2"][data-ge="0"]');
    await p.fill('#gKg', '50'); await p.fill('#gReps', '9'); await p.click('#gSalvar'); await p.click('#gVoltaFim');
    ok((await p.textContent('#gRevisaoSeries summary')).includes('3 com carga e repetições') && (await series()).find(r => r.serie === 3).r === 9, 'revisão final corrige a série exata e atualiza a completude');
    ok(errors.length === 0, 'fluxo inteiro sem erro JavaScript: ' + errors.join('; '));
    await ctx.close();

    const novo = await abrir(browser, { width: 360, height: 800 });
    await novo.p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); localStorage.setItem('ptdc', JSON.stringify({ 'Supino teste': [{ d: d.toLocaleDateString('en-CA'), g: 2, i: '0:0:0', serie: 1, feito: true, kg: 55, r: 5 }] })); });
    await novo.p.click('[data-gserie="1"]'); await novo.p.click('[data-gserie="0"]');
    ok(await novo.p.inputValue('#gKg') === '', 'carga anterior não entra automaticamente');
    await novo.p.click('#gUsarUltima');
    ok(await novo.p.inputValue('#gKg') === '55' && await novo.p.inputValue('#gReps') === '', 'Usar última carga é explícito e não copia repetições');
    await novo.p.fill('#gKg', 'inválido'); await novo.p.fill('#gReps', '9');
    await novo.p.click('[data-gserie="1"]'); await novo.p.click('[data-gserie="0"]');
    ok(await novo.p.inputValue('#gKg') === 'inválido', 'navegação entre séries preserva até preenchimento inválido');
    await novo.p.click('#gSerie');
    ok(!(await novo.p.evaluate(() => window.__acSessao.ler())).feitas[0], 'entrada inválida impede conclusão');
    await novo.p.click('#gFechar');
    ok(await novo.p.isVisible('#guiaBox') && await novo.p.inputValue('#gReps') === '9', 'fechar com erro mantém formulário para correção');
    ok(novo.errors.length === 0, 'validação sem erro JavaScript');
    await novo.ctx.close();

    const erro = await abrir(browser);
    await erro.p.evaluate(() => { const original = Storage.prototype.setItem; window.__restauraStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function(k,v) { if(k.startsWith('ptsets_')) throw new DOMException('Teste de armazenamento cheio','QuotaExceededError'); return original.call(this,k,v); }; });
    await erro.p.fill('#gKg', '10'); await erro.p.fill('#gReps', '3'); await erro.p.click('#gSerie');
    ok(await erro.p.evaluate(() => { const s=window.__acSessao.ler(),r=JSON.parse(localStorage.getItem('ptdc'))['Supino teste'][0];return s.s===0&&!s.feitas[0]&&!r.feito&&r.kg===10; }), 'falha no contador reverte conclusão sem avançar ou apagar anotação');
    await erro.p.evaluate(() => window.__restauraStorage()); await erro.p.click('#gSerie');
    ok(await erro.p.evaluate(() => window.__acSessao.ler().feitas[0]===1), 'tentar novamente após erro conclui uma única série');
    await erro.p.evaluate(() => { const d=new Date().toLocaleDateString('en-CA'); localStorage.setItem('ptvol',JSON.stringify({[d]:999})); });
    await erro.p.click('[data-gserie="0"]'); await erro.p.click('#gDesfazSerie');
    ok(await erro.p.evaluate(() => JSON.parse(localStorage.getItem('ptvol'))[new Date().toLocaleDateString('en-CA')]===0), 'desfazer corrige volume diário previamente guardado, inclusive zero');
    await erro.p.fill('#gKg', 'inválido'); await erro.p.click('[data-gserie="1"]'); await erro.p.click('#gPulaEx2'); await erro.p.click('#gSemRegistro'); await erro.p.click('#gFecharTreino');
    ok(await erro.p.inputValue('#gKg')==='inválido' && await erro.p.evaluate(() => !window.__gvDe().fim && window.__gvDe().e===0), 'terminar localiza rascunho inválido de outra série e mantém a sessão');
    ok(erro.errors.length === 0, 'recuperação de armazenamento e rascunho sem erro JavaScript');
    await erro.ctx.close();
    const Dsem = dados(); Dsem.ve = { cardio: false };
    const semCardio = await abrir(browser, { D: Dsem, init: () => {
      window.__falas = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => window.__falas.push({ text: u.text, lang: u.lang }), cancel: () => {} } });
      window.SpeechSynthesisUtterance = function(text) { this.text = text; };
      const d = new Date().toLocaleDateString('en-CA');
      localStorage.setItem('ptidade', JSON.stringify(40));
      localStorage.setItem('ptfc', JSON.stringify({ [d]: { m: 126, x: 150 } }));
      localStorage.setItem('ptcardio', JSON.stringify([{ d, km: 5, min: 30, mod: 'corrida', fc: 126, fcx: 150 }]));
    } });
    ok((await semCardio.p.textContent('#esfBox')).includes('máxima estimada 180 bpm') && (await semCardio.p.textContent('#esfBox')).includes('Z3 moderado'), 'histórico de FC mantém estimativa e zona sem habilitar corrida');
    await semCardio.p.click('#gVoz'); await semCardio.p.click('[data-gserie="1"]');
    ok(await semCardio.p.evaluate(() => window.__falas.some(f => f.lang==='pt-BR' && f.text.includes('Série 2 de 3. 8 repetições'))), 'voz compartilhada narra a série selecionada com corrida desativada');
    ok(await semCardio.p.evaluate(() => !window.__fc && !document.getElementById('cardCardio')), 'helpers compartilhados não inicializam corrida nem conexão de FC');
    await semCardio.p.click('#gVoz'); await semCardio.p.click('[data-gserie="0"]');
    for (let i=0;i<3;i++) { await semCardio.p.click('#gSerie'); await semCardio.p.evaluate(() => window.__zeraDescanso()); }
    await semCardio.p.click('#gSerie'); await semCardio.p.click('#gFecharTreino');
    ok(await semCardio.p.isVisible('#gRevisaoSeries') && semCardio.errors.length===0, 'musculação abre e finaliza sem depender do módulo opcional de corrida/FC');
    await semCardio.ctx.close();
    const Dduas = dados(), itemB = { nome:'Agachamento teste',series:1,reps:'10',descanso:0 };
    Dduas.fichasApp.push({titulo:'B — Teste',itens:[itemB]}); Dduas.fexs.push({n:itemB.nome,s:1});
    Dduas.guiaFichasP.push({n:'B — Teste',it:[{e:itemB.nome,s:1,r:'10',d:0}]});
    const duas = await abrir(browser,{D:Dduas});
    await duas.p.fill('#gKg','42');await duas.p.fill('#gReps','8');await duas.p.click('[data-gserie="1"]');await duas.p.click('#gFechar');
    await duas.p.evaluate(()=>document.querySelector('.guiabtn[data-g="1"]').click());await duas.p.click('#gFechar');
    await duas.p.evaluate(()=>document.querySelector('.guiabtn[data-g="0"]').click());
    ok(await duas.p.inputValue('#gKg')==='42'&&await duas.p.inputValue('#gReps')==='8', 'fechar e abrir outra ficha preserva rascunho da série que ficou fora de foco');
    await duas.p.fill('#gKg','43');await duas.p.click('[data-gserie="1"]');await duas.p.reload();await duas.p.waitForFunction(()=>window.__acSessao);
    await duas.p.evaluate(()=>document.querySelector('.guiabtn[data-g="1"]').click());
    ok(await duas.p.evaluate(()=>JSON.parse(localStorage.getItem('ptdc'))['Supino teste'].some(r=>r.kg===43&&r.r===8&&!r.feito)&&window.__gvDe().f===1), 'após reload, trocar ficha salva rascunho anterior antes de substituir checkpoint');
    await duas.p.click('#gFechar');await duas.p.evaluate(()=>document.querySelector('.guiabtn[data-g="0"]').click());
    await duas.p.fill('#gKg','inválido');await duas.p.click('[data-gserie="1"]');await duas.p.reload();await duas.p.waitForFunction(()=>window.__acSessao);
    await duas.p.evaluate(()=>document.querySelector('.guiabtn[data-g="1"]').click());
    ok(await duas.p.inputValue('#gKg')==='inválido'&&await duas.p.evaluate(()=>window.__gvDe().f===0&&window.__gvDe().sel===0)&&(await duas.p.textContent('#gCgLab')).includes('antes de trocar'), 'troca de ficha com rascunho inválido retorna à edição original com aviso');
    ok(duas.errors.length===0,'troca de ficha e reload não produzem erro JavaScript');
    await duas.ctx.close();
    console.log('\n' + total + ' verificações passaram.');
  } finally { await browser.close(); }
}
module.exports = { dados, abrir };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
