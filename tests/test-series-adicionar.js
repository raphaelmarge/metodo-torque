/* Adicionar exercício: o rascunho por série só entra na ficha após confirmação.
 * UI real, dados sintéticos, armazenamento isolado e nuvem interceptada. */
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
const linhas = [
  { reps: '5', carga: 20, descanso: 90 },
  { reps: '8', carga: 0, descanso: 0 },
  { reps: '10', carga: 30, descanso: 75 }
];

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await ctx.route('**://*.supabase.co/**', r => r.abort());
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE + '/demo-personal.html');
  await p.click('#btnDemo');
  await p.waitForURL(/personal\.html/);
  await p.waitForFunction(() => window.__vaiMontarTreino && window.__dadosApp);
  const ids = await p.evaluate(() => {
    const S = window.MTStore, st = S.read('ptStudio', {}), a = st.alunos[0];
    st.exercicios.push({ id: 'ad-supino', nome: 'Supino teste adicionar séries', grupo: 'Peito' }, { id: 'ad-remada', nome: 'Remada teste adicionar séries', grupo: 'Costas' });
    st.treinosV2[a.id] = { fichas: [{ id: 'ad-ficha', titulo: 'A — Adicionar séries', itens: [] }] };
    S.write('ptStudio', st); window.__vaiMontarTreino(a.id);
    return { aluno: a.id, ficha: 'ad-ficha' };
  });
  const fid = ids.ficha, prefixo = '[data-exprescricao="' + fid + '"]';
  const form = p.locator(prefixo);
  const itens = () => p.evaluate(id => window.MTStore.read('ptStudio', {}).treinosV2[id].fichas[0].itens, ids.aluno);
  const abrirFicha = async () => {
    const f = p.locator('details[data-fdet="' + fid + '"]');
    if (!await f.evaluate(el => el.open)) await f.locator(':scope > summary').click();
  };
  const abrirAdicao = async () => {
    await abrirFicha();
    if (!await form.isVisible()) await p.click('[data-exadd="' + fid + '"]');
    await form.waitFor({ state: 'visible' });
  };
  const escolhe = async nome => {
    await p.fill('[data-exbusca="' + fid + '"]', nome);
    await p.click('[data-exchip="' + fid + '"][data-nome="' + nome + '"]');
  };
  const modo = mode => form.locator('[data-exmode="' + mode + '"]').click();
  const serie = (i, c) => form.locator('[data-exseriesfld="' + i + ':' + c + '"]');
  const draft = () => form.evaluate(el => Array.from(el.querySelectorAll('[data-exseriesfld$=":reps"]')).map((r, i) => {
    const carga = el.querySelector('[data-exseriesfld="' + i + ':carga"]').value;
    return { reps: r.value, carga: carga.trim() === '' ? null : Number(carga), descanso: Number(el.querySelector('[data-exseriesfld="' + i + ':descanso"]').value) };
  }));
  const adicionar = () => p.click('[data-additem="' + fid + '"]');
  const uniforme = nome => p.locator('[data-ex' + nome + '="' + fid + '"]');

  await abrirAdicao();
  ok(await form.locator('[data-exmode="uniform"]').getAttribute('aria-pressed') === 'true', 'adicionar começa no cadastro rápido de séries iguais');
  await escolhe('Supino teste adicionar séries');
  await modo('individual');
  ok(await serie(2, 'reps').count() === 1, 'por série começa com as três linhas do padrão');
  for (let i = 0; i < linhas.length; i++) for (const c of ['reps', 'carga', 'descanso']) await serie(i, c).fill(String(linhas[i][c]));
  await p.fill('[data-exobs="' + fid + '"]', 'Descer com controle.');
  await p.selectOption('[data-extec="' + fid + '"]', 'drop');
  igual(await draft(), linhas, 'rascunho permite 5/8/10 com cargas diferentes, peso zero e descanso zero');
  igual(await itens(), [], 'preencher séries, observação e técnica ainda não adiciona nem grava um exercício');
  for (const visual of [{ width: 390, tema: '', nome: 'composer-390-dark' }, { width: 360, tema: 'claro', nome: 'composer-360-light' }]) {
    await p.setViewportSize({ width: visual.width, height: 844 });
    await p.evaluate(tema => { document.documentElement.dataset.tema = tema; }, visual.tema);
    await form.locator('[data-exmode="individual"]').scrollIntoViewIfNeeded();
    const layout = await form.evaluate(el => {
      const campos = Array.from(el.querySelectorAll('input,button')).filter(x => x.getClientRects().length && x.getBoundingClientRect().width > 0);
      return { horizontal: window.scrollX, rolagem: el.closest('[data-esq]').scrollLeft,
        fora: campos.map(x => ({ campo: x.getAttribute('data-exseriesfld') || x.textContent, left: x.getBoundingClientRect().left, right: x.getBoundingClientRect().right }))
          .filter(x => x.left < -1 || x.right > window.innerWidth + 1) };
    });
    ok(layout.horizontal === 0 && layout.rolagem === 0 && layout.fora.length === 0,
      'campos e botões cabem sem rolagem horizontal em ' + visual.width + ' px/' + (visual.tema || 'escuro') + ': ' + JSON.stringify(layout.fora));
    if (process.env.TORQUE_QA_SHOTS) {
      fs.mkdirSync(process.env.TORQUE_QA_SHOTS, { recursive: true });
      await p.screenshot({ path: process.env.TORQUE_QA_SHOTS + '/' + visual.nome + '.png', animations: 'disabled' });
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => { document.documentElement.dataset.tema = ''; });
  await p.click('[data-exfechar="' + fid + '"]');
  await abrirAdicao();
  ok((await itens()).length === 0 && JSON.stringify(await draft()) === JSON.stringify(linhas),
    'voltar e reabrir Adicionar conserva 5/8/10 sem criar o exercício antes da confirmação');

  await modo('uniform');
  await uniforme('ser').fill('4'); await uniforme('rep').fill('15');
  await uniforme('carga').fill('55'); await uniforme('des').fill('120');
  await modo('individual');
  igual(await draft(), linhas, 'voltar para por série recupera as três linhas preenchidas');
  await modo('uniform');
  igual(await Promise.all(['ser', 'rep', 'carga', 'des'].map(c => uniforme(c).inputValue())), ['4', '15', '55', '120'],
    'o modo todas iguais também conserva seu próprio rascunho');
  await modo('individual');

  // A própria linha inválida pode ser descartada; as outras continuam intactas.
  await form.locator('[data-exseriesadd]').click();
  await serie(3, 'reps').fill('');
  await form.locator('[data-exseriesremove="3"]').click();
  igual(await draft(), linhas, 'remover uma linha incompleta não perde as outras séries');
  for (let i = 3; i < 30; i++) await form.locator('[data-exseriesadd]').click();
  ok(await form.locator('[data-exseriesfld$=":reps"]').count() === 30 && await form.locator('[data-exseriesadd]').isDisabled(),
    'rascunho limita a prescrição a 30 séries');
  for (let i = 29; i >= 3; i--) await form.locator('[data-exseriesremove="' + i + '"]').click();
  igual(await draft(), linhas, 'adicionar e remover até o limite preserva a ordem e os valores originais');

  for (const caso of [{ c: 'reps', v: '', original: '5' }, { c: 'descanso', v: '-1', original: '90' }, { c: 'carga', v: '-1', original: '20' }]) {
    await serie(0, caso.c).fill(caso.v);
    await adicionar();
    ok((await itens()).length === 0 && await form.isVisible(), 'campo ' + caso.c + ' inválido bloqueia adicionar e mantém o formulário');
    ok(await serie(0, caso.c).inputValue() === caso.v, 'valor inválido de ' + caso.c + ' permanece disponível para corrigir');
    await serie(0, caso.c).fill(caso.original);
  }
  igual(await draft(), linhas, 'corrigir os campos recupera o rascunho completo');

  // A falha de armazenamento acontece depois da validação; não pode consumir o rascunho.
  await p.evaluate(() => {
    window.__adWriteOriginal = window.MTStore.write;
    window.MTStore.write = function (key, value) { return key === 'ptStudio' ? false : window.__adWriteOriginal.apply(this, arguments); };
  });
  await adicionar();
  igual(await itens(), [], 'falha ao gravar não cria um exercício parcial');
  igual(await draft(), linhas, 'falha ao gravar preserva todas as séries preenchidas');
  ok(await p.inputValue('[data-exsel="' + fid + '"]') === 'Supino teste adicionar séries' && await p.inputValue('[data-exobs="' + fid + '"]') === 'Descer com controle.' && await p.inputValue('[data-extec="' + fid + '"]') === 'drop',
    'falha ao gravar preserva exercício escolhido, observação e técnica');
  await p.evaluate(() => { window.MTStore.write = window.__adWriteOriginal; delete window.__adWriteOriginal; });
  await adicionar();
  const salvo = await itens();
  ok(salvo.length === 1 && salvo[0].exId === 'ad-supino' && salvo[0].series === 3, 'adicionar confirma um único exercício com três séries');
  ok(!await p.locator('body').evaluate(el => el.classList.contains('tela-escolher')) && !await form.isVisible(),
    'adicionar com sucesso fecha o formulário e libera a navegação da ficha');
  igual(salvo[0].seriesDetalhadas, linhas, 'a ficha recebe somente a prescrição do modo por série ativo');
  ok(salvo[0].obs === 'Descer com controle.' && salvo[0].tec === 'drop', 'observação e técnica acompanham o exercício adicionado');
  ok(await p.getAttribute('[data-exab="' + fid + ':0"]', 'aria-expanded') === 'true', 'o exercício adicionado já abre para conferência');
  await p.click('[data-exab="' + fid + ':0"]'); await p.click('[data-exab="' + fid + ':0"]');
  ok(await p.inputValue('[data-serfld="' + fid + ':0:1:reps"]') === '8' && await p.inputValue('[data-serfld="' + fid + ':0:1:carga"]') === '0',
    'fechar e reabrir o exercício conserva a segunda série com peso zero');

  await abrirAdicao();
  ok(await form.locator('[data-exmode="uniform"]').getAttribute('aria-pressed') === 'true', 'a próxima adição volta ao modo simples');
  igual(await Promise.all(['ser', 'rep', 'carga', 'des'].map(c => uniforme(c).inputValue())), ['3', '12', '', '60'],
    'a próxima adição começa em 3×12, carga opcional vazia e 60 segundos');
  ok(await p.inputValue('[data-exobs="' + fid + '"]') === '' && await p.inputValue('[data-extec="' + fid + '"]') === '', 'observação e técnica não vazam para o próximo exercício');
  await escolhe('Remada teste adicionar séries');
  await uniforme('ser').fill('31'); await adicionar();
  ok((await itens()).length === 1 && await uniforme('ser').inputValue() === '31', 'mais de 30 séries no modo simples não adiciona nem normaliza silenciosamente');
  await uniforme('ser').fill('3');
  await adicionar();
  const dois = await itens();
  ok(dois.length === 2 && dois[1].exId === 'ad-remada' && dois[1].series === 3 && dois[1].reps === '12' && dois[1].descanso === 60 && dois[1].carga == null && !dois[1].seriesDetalhadas,
    'cadastro rápido 3×12 continua funcionando sem herdar linhas individuais');
  igual(dois[0].seriesDetalhadas, linhas, 'adicionar outro exercício não modifica o anterior');

  await p.reload(); await p.waitForFunction(() => window.__vaiMontarTreino && window.__dadosApp);
  await p.evaluate(id => window.__vaiMontarTreino(id), ids.aluno); await abrirFicha();
  igual(await itens(), dois, 'os dois exercícios persistem integralmente após recarregar');
  const pacote = await p.evaluate(id => {
    const st = window.MTStore.read('ptStudio', {});
    return window.__dadosApp(st.alunos.find(a => a.id === id), new Date().toISOString());
  }, ids.aluno);
  igual(pacote.fichasApp[0].itens[0].seriesDetalhadas, linhas, 'ficha do aluno recebe as mesmas séries criadas ao adicionar');
  igual(pacote.guiaFichasP[0].it[0].seriesDetalhadas, linhas, 'player recebe as mesmas cargas e descansos por série');
  ok(pacote.fichasApp[0].itens[1].series === 3 && pacote.fichasApp[0].itens[1].reps === '12' && pacote.guiaFichasP[0].it[1].s === 3 && pacote.guiaFichasP[0].it[1].r === '12',
    'o mesmo pacote mantém o exercício uniforme compatível com o formato antigo');
  ok(errors.length === 0, 'adicionar e reabrir não geram erros JavaScript: ' + errors.join('; '));
  await ctx.close();
  console.log(total + ' verificações passaram.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
