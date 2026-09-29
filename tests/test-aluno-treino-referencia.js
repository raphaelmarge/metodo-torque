/* Referência visual do treino, aplicada ao executor real com dados fictícios.
 * Mídia local sintética: nenhuma chamada à conta ou a alunos de produção. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const { open, fixture } = require('./test-aluno-template-player');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const OUT = process.env.TORQUE_SCREENSHOTS || null;
let browser, n = 0;
function ok(value, label) { assert.ok(value, label); n++; console.log('OK ' + label); }
function eq(value, expected, label) { assert.deepEqual(value, expected); n++; console.log('OK ' + label); }
function mediaFixture() { const d = fixture(); d.gif = { b: BASE + '/__reference-fixture/', p: 'traco', e: 'gif', a: false }; return d; }
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); }
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [320, 390, 768, 1440]) for (const theme of ['', 'claro']) {
    const label = width + ' ' + (theme || 'escuro');
    const store = { ptdc: JSON.stringify({ 'Supino teste': [{ d: yesterday(), g: 2, i: '0:0:0', serie: 1, feito: true, kg: 50, r: 6 }] }) };
    const t = await open(browser, width, theme, mediaFixture(), store, { media: true, height: 844 }), p = t.p;
    p.setDefaultTimeout(8000);
    await p.waitForFunction(() => { const img = document.querySelector('#gGif img'); return img && img.naturalWidth === 640; });
    eq((await p.locator('#gTemplateTitle').innerText()).trim(), 'Studio Teste', label + ': cabeçalho conserva a marca publicada pelo personal');
    ok((await p.locator('#gEx').innerText()).includes('Supino teste') && (await p.locator('#gTemplateWorkout').innerText()).includes('Teste'), label + ': exercício e ficha têm contexto próprio');
    const media = await p.locator('#gGif').evaluate(box => {
      const r = box.getBoundingClientRect(), img = box.querySelector('img');
      return { width: r.width, height: r.height, fit: getComputedStyle(img).objectFit, natural: [img.naturalWidth, img.naturalHeight] };
    });
    ok(Math.abs(media.width / media.height - 16 / 9) < .03 && media.height >= 140, label + ': demonstração ampla preserva o quadro 16:9');
    eq(media.fit, 'contain', label + ': a imagem completa cabe no quadro sem cortar o movimento');
    eq(media.natural, [640, 640], label + ': teste usa proporção de origem diferente para detectar distorção');
    const series = await p.locator('#gMiolo [data-gserie]').evaluateAll(items => items.map(item => { const r = item.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; }));
    ok(series.length === 3 && series.every(item => Math.abs(item.top - series[0].top) < 2) && series[1].left > series[0].left && series[2].left > series[1].left, label + ': três séries usam seleção horizontal');
    ok(series.every(item => item.width >= 44 && item.height >= 44), label + ': seleção de séries mantém alvos de toque acessíveis');
    ok(await p.locator('.gserie-referencias').isVisible(), label + ': prescrito e anterior acompanham os campos de registro');
    eq(await p.locator('[data-gref="prescrito"]').innerText(), '5 reps · 60 kg', label + ': prescrição permanece distinta do resultado');
    eq(await p.locator('[data-gref="anterior"]').innerText(), '6 reps · 50 kg', label + ': comparação usa o registro real da mesma série');
    const inputs = await p.evaluate(() => {
      const r = document.getElementById('gReps').getBoundingClientRect(), k = document.getElementById('gKg').getBoundingClientRect();
      return { reps: { top: r.top, left: r.left, right: r.right }, kg: { top: k.top, left: k.left, right: k.right } };
    });
    ok(Math.abs(inputs.reps.top - inputs.kg.top) < 2 && inputs.reps.right <= inputs.kg.left, label + ': repetições e carga usam duas colunas, nessa ordem');
    ok(!await p.locator('#gRpe').isVisible() && await p.locator('#gRpe').inputValue() === '', label + ': esforço opcional começa recolhido e sem valor realizado inventado');
    ok(await p.locator('#gTemplateGuidance').evaluate(node => !node.open) && await p.locator('#gTemplateRecords').evaluate(node => !node.open), label + ': detalhes e registros ficam disponíveis sem dominar a execução');
    ok((await p.locator('#gTemplateRestPrescription').innerText()).includes('90'), label + ': descanso prescrito fica junto da confirmação');
    ok(await p.locator('#gSerie').evaluate(button => { const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height >= 44; }), label + ': registrar série permanece alcançável');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('guiaBox').scrollWidth <= document.getElementById('guiaBox').clientWidth + 1), label + ': composição não cria rolagem horizontal');
    const original = await p.evaluate(() => localStorage.getItem('ptdc'));
    await t.fill('#gKg', '42'); await t.fill('#gReps', '4');
    eq(await p.evaluate(() => localStorage.getItem('ptdc')), original, label + ': preencher campos continua sendo somente rascunho');
    await t.click('#gSerie');
    const record = await p.evaluate(() => (L('ptdc', {})['Supino teste'] || []).find(r => r.d === isoHj()));
    ok(record && record.feito && record.kg === 42 && record.r === 4 && !Object.hasOwn(record, 'rpe'), label + ': confirmar sem esforço grava exatamente os valores informados');
    ok(await p.locator('#gTemplateSuccess').isVisible() && await p.locator('#gMiolo2').isVisible() && await p.locator('#gResta').isVisible(), label + ': feedback, campos e descanso continuam disponíveis após registrar');
    ok((await p.locator('#gTemplateRestNext').innerText()).includes('série 2 de 3'), label + ': descanso indica a próxima série pendente');
    ok(t.errors.length === 0, label + ': executor sem erros de JavaScript');
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, 'treino-referencia-' + width + '-' + (theme || 'escuro') + '.png') }); }
    await t.ctx.close();
  }
  const keyboard = await open(browser, 390, '', mediaFixture(), undefined, { media: true, height: 844 }), p = keyboard.p;
  p.setDefaultTimeout(8000);
  const more = p.locator('#gRpe').locator('xpath=ancestor::details').first().locator(':scope > summary');
  await more.focus(); await p.keyboard.press('Enter');
  ok(await p.locator('#gRpe').isVisible(), 'teclado abre o esforço opcional pelo controle visível');
  await keyboard.fill('#gRpe', '7,5');
  for (const [width,height] of [[390,420],[320,500],[844,390]]) {
    await p.setViewportSize({width,height});
    await keyboard.fill('#gKg', '55');
    ok(await p.locator('#gKg').evaluate(input => { const r = input.getBoundingClientRect(), action = document.getElementById('gSerie').getBoundingClientRect(); return r.top >= 0 && r.bottom <= action.top && action.bottom <= innerHeight; }), width+'×'+height+': altura reduzida mantém campo em edição e confirmação acessíveis');
  }
  await keyboard.click('#gSerie');
  ok(await p.evaluate(() => (L('ptdc', {})['Supino teste'] || []).some(r => r.kg === 55 && r.rpe === 7.5 && r.feito)), 'confirmar com teclado aberto preserva esforço e carga');
  ok(keyboard.errors.length === 0, 'edição com teclado não produz erros de JavaScript');
  await keyboard.ctx.close();
  const empty = await open(browser, 320);
  ok(await empty.p.locator('#gTemplateMediaEmpty').isVisible() && /não disponível/i.test(await empty.p.locator('#gTemplateMediaEmpty').innerText()), 'exercício sem mídia mantém um estado vazio honesto');
  ok(await empty.p.locator('#gSerie').isVisible(), 'ausência de mídia não impede o registro');
  await empty.ctx.close();
  console.log(n + ' verificações da referência de treino passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
