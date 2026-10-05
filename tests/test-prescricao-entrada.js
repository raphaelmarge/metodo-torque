/* Entrada guiada: aluno, criação, ajuste e revisão, sem publicação efetiva. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('./ci/node_modules/playwright'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || process.env.MT_BASE || 'http://127.0.0.1:8765';
const OUT = path.join(__dirname, 'out', 'prescricao-entrada');
let browser, checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; console.log('OK: ' + label); };
const ok = (actual, label) => { assert.ok(actual, label); checks++; console.log('OK: ' + label); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  browser = comMockNuvem(await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  for (const width of [390, 1280]) for (const theme of ['escuro', 'claro']) {
    const tag = width + '-' + theme;
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'pt-BR', serviceWorkers: 'block' });
    // Only this local fixture server is reachable, including when run without the Windows adapter.
    await context.route('**/*', route => {
      const request = new URL(route.request().url());
      return request.origin === new URL(BASE).origin ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage(), errors = [], dialogs = [];
    let promptAnswer = null, acceptConfirmation = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === 'prompt' && promptAnswer !== null) await dialog.accept(promptAnswer);
      else if (dialog.type() === 'confirm' && acceptConfirmation) await dialog.accept();
      else await dialog.dismiss();
    });
    await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'));
    await page.goto(BASE + '/demo-personal.html');
    await page.locator('#btnDemo').click(); await page.waitForURL(/personal\.html/);
    await page.waitForFunction(() => window.__ptStudio && window.__iaRevisao && window.__demoNuvem);
    await page.evaluate(theme => {
      const S = window.MTStore, st = S.read('ptStudio', {}), exId = st.exercicios[0].id;
      st.alunos = [
        { id: 'entrada-a', nome: 'Ana Teste de Oliveira', ativo: true, appTokenP: 'demo-entrada-a', metaSemana: 3, appPubEm: '2026-09-01T12:00:00Z' },
        { id: 'entrada-b', nome: 'Bruno Teste', ativo: true, appTokenP: 'demo-entrada-b', metaSemana: 2 },
      ];
      st.treinosV2 = {
        'entrada-a': { fichas: [{ id: 'entrada-f', titulo: 'A - Treino original', itens: [{ exId, series: 3, reps: '10', descanso: 60, carga: 0 }] }] },
        'entrada-b': { fichas: [] },
      };
      st.modelosPT = [{ id: 'entrada-modelo', nome: 'Modelo fictício de revisão', fichas: [{ titulo: 'Modelo de força', itens: [{ nome: st.exercicios[0].nome, series: 2, reps: '8', descanso: 0, carga: 0 }] }] }];
      st.treinosGrupo = []; st.gruposPT = [{ id: 'entrada-grupo', nome: 'Turma fictícia', alunoIds: ['entrada-a', 'entrada-b'] }];
      st.sessoes = []; st.avaliacoes = []; st.pagamentos = []; st.agFixas = []; st.bloqueios = [];
      st.config = Object.assign({}, st.config, { dia1Off: true, zapFilaOff: true });
      st.alunos[0].acompPublicado = window.MT_ACOMP.snapshot(st, 'entrada-a');
      localStorage.setItem('mtapp:ptStudio', JSON.stringify(st)); window.__ptStudio.render(); window.__tplMeu.popula();
      if ((document.documentElement.dataset.tema === 'claro') !== (theme === 'claro')) document.getElementById('btnTemaPt').click();
      document.querySelector('#abas [data-a="treinos"]').click();
      const sel = document.getElementById('tAluno'); sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
      // A publication attempt fails immediately; review tests never click its confirmation.
      window.__entradaPublicacoes = 0;
      document.getElementById('tEnviaApp').addEventListener('click', event => { window.__entradaPublicacoes++; event.stopImmediatePropagation(); }, true);
    }, theme);
    const student = async (id, name, value) => {
      await page.locator('#' + id + 'Busca').fill(name);
      await page.locator('#' + id + 'BuscaLista [data-bval="' + value + '"]').click();
    };
    const area = async value => {
      if (await page.locator('#trArea').isVisible()) await page.locator('#trArea').selectOption(value);
      else await page.locator('#trAbas [data-tra="' + value + '"]').click();
    };
    const snap = () => page.evaluate(() => JSON.stringify(window.MTStore.read('ptStudio', {}).treinosV2));
    const state = () => page.evaluate(() => window.MTStore.read('ptStudio', {}));
    const screenshot = async name => {
      await page.locator('#vTreinos').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, tag + '-' + name + '.png'), fullPage: false, animations: 'disabled' });
    };
    const fits = async name => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ': ' + name + ' sem rolagem horizontal');
    try {
      ok(await page.locator('#tdComecar').isHidden() && await page.locator('#tdRevisaoAcoes').isHidden(), tag + ': primeiro pede aluno antes de criar/revisar');
      eq(await page.evaluate(() => document.documentElement.dataset.tema === 'claro'), theme === 'claro', tag + ': tema solicitado aplicado');
      ok(await page.locator('#tAlunoBusca').isVisible(), tag + ': busca de aluno acessível');
      eq(await page.locator('#vTreinos > :first-child').getAttribute('class'), 'tdtopo', tag + ': contexto do aluno vem antes da navegação');
      eq(await page.locator('.td-guia .trx-steps li').count(), 3, tag + ': mostra as três etapas da prescrição');
      await fits('entrada'); await screenshot('01-escolher-aluno');
      const initial = await snap();
      await student('tAluno', 'Ana', 'entrada-a');
      ok(await page.locator('#tAlunoBuscaLista').isHidden(), tag + ': escolher aluno fecha a lista da busca');
      ok(await page.locator('#tdComecar').isVisible() && await page.locator('#tdRevisaoAcoes').isVisible(), tag + ': escolher aluno libera criação e revisão');
      ok(await page.locator('#tplSel').isHidden() && await page.locator('#tplSalvar').isHidden(), tag + ': modelos e opções avançadas começam recolhidos');
      ok((await page.locator('#tdNome').innerText()).includes('Ana Teste'), tag + ': destinatária explícita no cabeçalho');
      await fits('aluno selecionado'); await screenshot('02-aluno-selecionado');
      // Canceling a new sheet cannot create an empty prescription.
      await page.locator('#tFicha').click(); eq(await snap(), initial, tag + ': cancelar nova ficha conserva treino');
      promptAnswer = 'B - Ficha fictícia manual'; await page.locator('#tFicha').click(); promptAnswer = null;
      eq((await state()).treinosV2['entrada-a'].fichas.at(-1).titulo, 'B - Ficha fictícia manual', tag + ': cria ficha no aluno escolhido');
      ok((await page.locator('#tdSalvoStatus').innerText()).includes('salvas neste navegador'), tag + ': autosave local não anuncia publicação');
      await page.locator('#tdModelos > summary').click(); await page.locator('#tplSel').selectOption('meu:entrada-modelo');
      const beforeModel = await snap(); await page.locator('#tplAplicar').click();
      eq(await snap(), beforeModel, tag + ': cancelar aplicação de modelo conserva fichas');
      acceptConfirmation = true; await page.locator('#tplAplicar').click(); acceptConfirmation = false;
      const modeled = (await state()).treinosV2['entrada-a'];
      eq(modeled.fichas.length, 3, tag + ': modelo adiciona uma ficha após confirmação');
      eq(modeled.fichas.at(-1).itens[0].carga, 0, tag + ': modelo preserva carga zero');
      eq(modeled.fichas.at(-1).itens[0].descanso, 0, tag + ': modelo preserva descanso zero');
      await page.locator('#tdModelos > summary').click();
      await page.locator('.td-guia-opcoes > summary').click();
      ok(await page.locator('#tplSalvar').isVisible() && await page.locator('#tValidade').isVisible(), tag + ': opções contextuais continuam acessíveis');
      await page.locator('.td-guia-opcoes > summary').click();
      const beforeIA = await snap();
      await page.locator('#tdIA').click();
      eq(await page.locator('#taAluno').inputValue(), 'entrada-a', tag + ': IA herda destinatária');
      await page.locator('#taIA').click(); await page.waitForFunction(() => !document.getElementById('taRevisao').hidden);
      ok((await page.locator('#taRevisao').innerText()).includes('Ana Teste'), tag + ': revisão da proposta identifica destinatária');
      ok((await page.locator('#taRevisao').innerText()).includes('demonstração'), tag + ': proposta demonstra origem simulada');
      eq(await snap(), beforeIA, tag + ': gerar proposta não substitui prescrição');
      await fits('revisão IA'); await screenshot('03-revisao-ia');
      await area('fichas'); eq(await page.locator('#tAluno').inputValue(), 'entrada-a', tag + ': voltar da IA conserva aluna');
      eq(await snap(), beforeIA, tag + ': voltar da IA conserva treino salvo');
      await student('tAluno', 'Bruno', 'entrada-b');
      ok((await page.locator('#tdNome').innerText()).includes('Bruno'), tag + ': troca de aluno atualiza cabeçalho');
      await student('tAluno', 'Ana', 'entrada-a');
      eq(await snap(), beforeIA, tag + ': alternar aluno e voltar não mistura prescrições');
      await page.locator('#tdPrevia').click();
      ok((await page.locator('#acTitulo').innerText()).includes('Ana Teste'), tag + ': prévia identifica destinatária');
      ok((await page.locator('#acDialog').innerText()).includes('Alterações'), tag + ': prévia apresenta alterações');
      eq(await page.locator('#acDialog > ul > li').allTextContents(), ['Nova ficha: B - Ficha fictícia manual', 'Nova ficha: Modelo de força'], tag + ': diferenças identificam exatamente as duas fichas adicionadas');
      ok((await page.locator('#acDialog').innerText()).includes('Ficha fictícia manual') && (await page.locator('#acDialog').innerText()).includes('Modelo de força'), tag + ': prévia inclui fichas ajustadas');
      eq(await page.locator('#acPublicar').count(), 0, tag + ': prévia de consulta não dispara publicação');
      await screenshot('04-previa'); await page.locator('#acVoltarFicha').click();
      eq(await page.locator('#tAluno').inputValue(), 'entrada-a', tag + ': voltar e ajustar mantém destinatária');
      await page.locator('#tdPublica').click();
      ok(await page.locator('#acPublicar').isVisible(), tag + ': publicar abre confirmação revisável');
      ok((await page.locator('#acTitulo').innerText()).includes('Ana Teste'), tag + ': confirmação reforça destinatária');
      await page.locator('#acVoltarFicha').click();
      eq(await snap(), beforeIA, tag + ': voltar da confirmação mantém fichas');
      // Create an independent source for group distribution, then cancel its recipient review.
      await area('grupo'); await page.locator('#gtGerenciar > summary').click();
      await page.locator('#gtNome').fill('Disparo fictício'); await page.locator('#gtNovo').click();
      const groupId = await page.locator('#tAluno').inputValue();
      ok(groupId.startsWith('gt'), tag + ': novo treino para compartilhar abre seu próprio contexto');
      ok((await page.locator('#tdNome').innerText()).includes('Disparo fictício'), tag + ': cabeçalho identifica treino de disparo');
      ok(await page.locator('#tFicha').isVisible(), tag + ': treino de disparo permite montar ficha');
      ok(await page.locator('#tdRevisaoAcoes').isHidden(), tag + ': grupo orienta revisão em Em grupo sem ações de aluno individual');
      promptAnswer = 'A - Ficha de disparo'; await page.locator('#tFicha').click(); promptAnswer = null;
      eq((await state()).treinosV2[groupId].fichas.length, 1, tag + ': ficha de disparo salva fora dos alunos');
      await screenshot('05-treino-disparo');
      await area('grupo'); await page.locator('#geOrigem').selectOption(groupId); await page.locator('#geGrupo').selectOption('entrada-grupo');
      const beforeGroup = await snap(), dialogStart = dialogs.length;
      await page.locator('#geEnviar').click();
      ok(dialogs.slice(dialogStart).some(d => d.type === 'confirm' && d.message.includes('Ana Teste') && d.message.includes('Bruno Teste')), tag + ': revisão do grupo nomeia os dois destinatários');
      eq(await snap(), beforeGroup, tag + ': cancelar envio ao grupo não substitui os alunos');
      await fits('grupo'); await screenshot('06-grupo-destinatarios');
      eq(await page.evaluate(() => window.__entradaPublicacoes), 0, tag + ': nenhuma publicação efetiva foi acionada');
      await page.reload(); await page.waitForFunction(() => window.__ptStudio && window.__iaRevisao);
      eq(await snap(), beforeGroup, tag + ': recarregar conserva fichas individuais e treino de disparo');
      await page.evaluate(() => document.querySelector('#abas [data-a="treinos"]').click());
      await student('tAluno', 'Ana', 'entrada-a');
      eq(await page.locator('#fichasBox .td-sheet-title').allTextContents(), ['Treino original', 'Ficha fictícia manual', 'Modelo de força'], tag + ': após recarregar as fichas continuam abertas para ajuste');
      eq(errors, [], tag + ': sem erros JavaScript');
    } catch (error) {
      await page.screenshot({ path: path.join(OUT, tag + '-falha.png'), fullPage: false });
      throw error;
    } finally { await context.close(); }
  }
  console.log('PASSOU: ' + checks + ' verificações; evidências em ' + OUT);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
