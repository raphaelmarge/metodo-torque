/* Inclusão contínua e substituição na ficha real; somente dados fictícios. */
const assert = require('assert/strict');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('OK: ' + label); };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; console.log('OK: ' + label); };
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
    await ctx.route('**://*.supabase.co/**', r => r.abort());
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/demo-personal.html'); await p.click('#btnDemo'); await p.waitForURL(/personal\.html/);
    await p.waitForFunction(() => window.__vaiMontarTreino && window.MT_PRESCRICAO);
    await p.evaluate(() => {
      const S = window.MTStore, st = S.read('ptStudio', {});
      st.alunos = [{ id: 'seq-a', nome: 'Aluno fictício A', ativo: true }, { id: 'seq-b', nome: 'Aluno fictício B', ativo: true }];
      st.exercicios = ['Ágata', 'Bê', 'Cê', 'Dê'].map((n, i) => ({ id: 'seq-ex-' + i, nome: 'Supino sintético ' + n, grupo: 'Peito' }));
      st.treinosV2 = { 'seq-a': { fichas: [{ id: 'seq-f', titulo: 'A — Sequência fictícia', itens: [
        { exId: 'seq-ex-0', series: 2, reps: '10', carga: null, descanso: 60 },
        { exId: 'seq-ex-1', series: 2, reps: '8', carga: null, descanso: 0, seriesDetalhadas: [{ reps: '8', carga: null, descanso: 0 }, { reps: '6', carga: 0, descanso: 75 }], obs: 'Controlar execução.', tec: 'drop', video: 'https://example.invalid/antigo.mp4', alternativas: ['Anterior'] }
      ] }] }, 'seq-b': { fichas: [{ id: 'seq-f', titulo: 'A — Outra pessoa', itens: [] }] } };
      st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true });
      S.write('ptStudio', st); window.__ptStudio.render(); window.__vaiMontarTreino('seq-a');
    });
    const sheet = p.locator('[data-fdet="seq-f"]');
    const open = async () => { if (!await sheet.evaluate(el => el.open)) await sheet.locator(':scope > summary').click(); };
    const picker = p.locator('[data-esq="seq-f"]');
    const select = async name => { await picker.locator('[data-exbusca]').fill(name); await picker.locator('[data-exchip]').filter({ hasText: name }).first().click(); };
    const items = () => p.evaluate(() => window.MTStore.read('ptStudio', {}).treinosV2['seq-a'].fichas[0].itens);
    const writeFailure = value => p.evaluate(fail => { const S = window.MTStore; if (fail) { window.__seqWrite = S.write; S.write = () => false; } else { S.write = window.__seqWrite; delete window.__seqWrite; } }, value);
    const troca = async () => {
      await open();
      if (await p.getAttribute('[data-exab="seq-f:1"]', 'aria-expanded') !== 'true') await p.click('[data-exab="seq-f:1"]');
      await p.click('[data-trocaitem="seq-f:1"]');
    };
    await open();
    if (width < 800) await p.click('[data-exadd="seq-f"]');
    await picker.locator('[data-exmov]').selectOption('Empurrar');
    await picker.locator('[data-exzona]').selectOption('Peito');
    await picker.locator('[data-exbusca]').fill('sintetico');
    eq(await picker.locator('[data-exchip]').count(), 4, width + ': busca sem acento encontra os exercícios');
    await picker.locator('[data-exbusca]').fill('sintético');
    eq(await picker.locator('[data-exchip]').count(), 4, width + ': busca com acento mantém os mesmos resultados');
    await picker.locator('[data-exchip]').filter({ hasText: 'Cê' }).click();
    ok(await p.evaluate(() => document.activeElement.getAttribute('data-nome') === 'Supino sintético Cê'), width + ': escolher chip mantém foco no botão selecionado');
    await p.keyboard.press('Space');
    eq(await picker.locator('[data-exsel]').inputValue(), '', width + ': teclado desmarca o exercício sem perder foco');
    await p.keyboard.press('Space');
    eq(await picker.locator('[data-exsel]').inputValue(), 'Supino sintético Cê', width + ': teclado volta a selecionar o exercício');
    await picker.locator('[data-exser]').fill('2');
    await picker.locator('[data-excarga]').fill('0');
    await picker.locator('[data-exdes]').fill('0');
    await picker.locator('[data-exmode="individual"]').click();
    await picker.locator('[data-exseriesfld="0:carga"]').fill('');
    await picker.locator('[data-exseriesfld="1:reps"]').fill('8');
    await picker.locator('[data-exobs]').fill('Observação mantida.');
    await picker.locator('[data-extec]').selectOption('drop');
    await p.evaluate(() => { window.__seqPicker = document.querySelector('[data-esq="seq-f"]'); });
    await writeFailure(true); await picker.locator('[data-additem]').click();
    eq((await items()).length, 2, width + ': falha de gravação não inclui exercício');
    ok((await picker.locator('[data-exstatus]').textContent()).includes('Não foi possível'), width + ': falha é anunciada no seletor');
    await writeFailure(false); await picker.locator('[data-additem]').click();
    eq((await items()).length, 3, width + ': primeira inclusão salva após tentar novamente');
    ok(await p.evaluate(() => window.__seqPicker === document.querySelector('[data-esq="seq-f"]')), width + ': formulário continua sendo o mesmo nó');
    eq(await picker.locator('[data-exbusca]').inputValue(), 'sintético', width + ': busca permanece após incluir');
    eq(await picker.locator('[data-exmov]').inputValue(), 'Empurrar', width + ': movimento permanece após incluir');
    eq(await picker.locator('[data-exzona]').inputValue(), 'Peito', width + ': grupo permanece após incluir');
    eq(await picker.locator('[data-extec]').inputValue(), 'drop', width + ': técnica permanece após incluir');
    eq(await picker.locator('[data-exobs]').inputValue(), 'Observação mantida.', width + ': observação permanece após incluir');
    eq(await picker.locator('[data-exseriesfld="0:carga"]').inputValue(), '', width + ': carga vazia permanece no compositor');
    eq(await picker.locator('[data-exseriesfld="1:carga"]').inputValue(), '0', width + ': carga zero permanece no compositor');
    if (width < 800) ok(await picker.evaluate(el => el.classList.contains('abrir')), 'Celular: inclusão mantém a busca aberta');
    if (process.env.TORQUE_QA_SHOTS) { fs.mkdirSync(process.env.TORQUE_QA_SHOTS, { recursive: true }); await picker.locator('[data-exbusca]').scrollIntoViewIfNeeded(); await p.screenshot({ path: process.env.TORQUE_QA_SHOTS + '/seletor-sequencia-' + width + '.png', animations: 'disabled' }); }
    await picker.locator('[data-additem]').click();
    eq((await items()).length, 3, width + ': repetir o clique não duplica sem nova seleção');
    await picker.locator('[data-exchip]').filter({ hasText: 'Dê' }).click(); await picker.locator('[data-additem]').press('Enter');
    ok(await picker.locator('[data-exbusca]').evaluate(el => el === document.activeElement), width + ': inclusão pelo teclado devolve foco à busca do próximo');
    const adicionados = await items();
    eq(adicionados[3].seriesDetalhadas, adicionados[2].seriesDetalhadas, width + ': segundo exercício herda parâmetros individuais');
    eq(adicionados[3].seriesDetalhadas, [{ reps: '12', carga: null, descanso: 0 }, { reps: '8', carga: 0, descanso: 0 }], width + ': vazio e zero permanecem distintos');
    await picker.locator('.td-pick-done').click();
    ok(!await p.evaluate(() => document.body.classList.contains('tela-escolher')), width + ': Concluir volta à ficha');
    const original = (await items())[1];
    await troca(); await select('Supino sintético Cê');
    eq((await items())[1], original, width + ': selecionar substituto não grava antes de confirmar');
    await picker.locator('[data-extrocacancelar]').click();
    eq((await items())[1], original, width + ': cancelar preserva o exercício original');
    await troca(); await select('Supino sintético Cê');
    await writeFailure(true); await picker.locator('[data-additem]').click();
    eq((await items())[1], original, width + ': falha ao trocar preserva o exercício original');
    await writeFailure(false); await picker.locator('[data-additem]').click();
    const trocados = await items(), expected = { ...original, exId: 'seq-ex-2' }; delete expected.video; delete expected.alternativas;
    eq(trocados[1], expected, width + ': troca preserva prescrição e remove apenas mídia/alternativas antigas');
    eq(trocados.length, 4, width + ': troca mantém tamanho e posição');
    eq(trocados[0], adicionados[0], width + ': exercício anterior permanece intocado');
    eq(trocados[2], adicionados[2], width + ': exercício seguinte permanece intocado');
    if (process.env.TORQUE_QA_SHOTS) { fs.mkdirSync(process.env.TORQUE_QA_SHOTS, { recursive: true }); await p.screenshot({ path: process.env.TORQUE_QA_SHOTS + '/seletor-troca-' + width + '.png', fullPage: true }); }
    await p.click('[data-exdesfazertroca]');
    eq((await items())[1], original, width + ': desfazer restaura o item inteiro incluindo mídia');
    await troca(); await select('Supino sintético Dê'); await picker.locator('[data-additem]').click();
    await p.fill('[data-serfld="seq-f:1:0:reps"]', '11');
    await p.click('[data-exdesfazertroca]');
    eq((await items())[1].seriesDetalhadas[0].reps, '11', width + ': desfazer não sobrescreve edição posterior');
    ok((await p.locator('[data-extrocaretorno]').textContent()).includes('A ficha mudou'), width + ': desfazer indisponível explica o conflito');
    await troca(); await select('Supino sintético Cê');
    await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.treinosV2['seq-a'].fichas[0].itens[0].reps = '13'; S.write('ptStudio', st); });
    await picker.locator('[data-additem]').click();
    eq((await items())[1].exId, 'seq-ex-3', width + ': mudança na ficha durante seleção bloqueia troca obsoleta');
    ok((await picker.locator('[data-exstatus]').textContent()).includes('A ficha mudou'), width + ': conflito ao trocar explica como retomar');
    await picker.locator('[data-extrocacancelar]').click();
    await troca(); await select('Supino sintético Cê');
    await p.evaluate(() => window.__vaiMontarTreino('seq-b'));
    ok(!await p.evaluate(() => document.body.classList.contains('tela-escolher')), width + ': trocar aluno fecha o seletor anterior');
    eq(await picker.locator('[data-exbusca]').inputValue(), '', width + ': outro aluno não herda a busca mesmo com ficha de mesmo ID');
    eq(await picker.locator('[data-additem]').textContent(), '+ Adicionar', width + ': outro aluno não herda a troca pendente');
    eq(await p.evaluate(() => window.MTStore.read('ptStudio', {}).treinosV2['seq-b'].fichas[0].itens), [], width + ': trocar aluno não altera sua ficha');
    await p.reload(); await p.waitForFunction(() => window.__vaiMontarTreino);
    await p.evaluate(() => window.__vaiMontarTreino('seq-a'));
    eq((await items()).length, 4, width + ': recarregar recupera as inclusões salvas');
    eq((await items())[1].exId, 'seq-ex-3', width + ': troca confirmada persiste; troca pendente não foi aplicada');
    await troca(); await select('Supino sintético Cê'); await picker.locator('[data-additem]').click();
    await p.evaluate(() => { const S = window.MTStore, st = S.read('ptStudio', {}); st.exercicios = st.exercicios.filter(x => x.id !== 'seq-ex-3'); S.write('ptStudio', st); });
    await p.click('[data-exdesfazertroca]');
    eq((await items())[1].exId, 'seq-ex-2', width + ': desfazer não restaura referência removida da biblioteca');
    ok((await p.locator('[data-extrocaretorno]').textContent()).includes('removido da biblioteca'), width + ': exercício anterior ausente tem explicação acessível');
    eq(errors, [], width + ': nenhum erro JavaScript no fluxo');
    await ctx.close();
  }
  await browser.close(); console.log(checks + ' verificações do seletor/troca passaram.');
})().catch(async e => { console.error(e); if (browser) await browser.close(); process.exitCode = 1; });
