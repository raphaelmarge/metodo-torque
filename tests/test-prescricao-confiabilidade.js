/* Painel real com alunos fictícios; toda rede externa é bloqueada. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { try { chromium = require('./ci/node_modules/playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; } }
const {comMockNuvem} = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; console.log('OK ' + label); }
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
(async () => {
  browser = comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH || chromium.executablePath(),args:['--no-sandbox']}));
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const label = viewport.width < 600 ? 'mobile' : 'desktop';
    const context = await browser.newContext({viewport,serviceWorkers:'block',timezoneId:'America/Sao_Paulo'});
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
    const p = await context.newPage(), errors = [], messages = [];
    p.on('pageerror', error => errors.push(error.message));
    p.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.accept(dialog.type() === 'prompt' ? 'Modelo fictício de confiabilidade' : undefined); });
    await p.clock.setFixedTime(new Date('2026-10-02T12:00:00-03:00'));
    await p.goto(BASE + '/demo-personal.html');
    await p.click('#btnDemo'); await p.waitForURL(/personal\.html/);
    await p.waitForFunction(() => window.__ptStudio && window.__tplMeu && window.__catalogoPT);
    const candidate = await p.evaluate(() => {
      MTStore.cloud = () => null; // Prescrição offline: não executar a régua automática de push da demo.
      const s = MTStore.read('ptStudio',{});
      s.alunos = Array.from({length:4}, (_,i) => ({id:'conf-'+i,nome:'Aluno fictício '+i,ativo:true}));
      s.exercicios = [{id:'conf-legitimo',nome:'Supino reto com barra',grupo:'Peito',video:'https://example.invalid/video',descricao:'Cópia pessoal legítima',semGif:true}];
      s._exSeed = 1; s._exSeed2 = 1;
      s.config = Object.assign({},s.config,{dia1Off:true,zapFilaOff:true});
      const item = {exId:'conf-legitimo',series:2,reps:'10',descanso:0,carga:null,obs:'Prescrição fictícia',tec:'normal',seriesDetalhadas:[{reps:'10',carga:null,descanso:0},{reps:'8',carga:0,descanso:45}]};
      s.treinosV2 = {'conf-0':{fichas:[{id:'conf-ficha',titulo:'Ficha fictícia',itens:[item]}]},'conf-1':{fichas:[]}};
      s.modelosPT = [];
      localStorage.setItem('mtapp:ptStudio', JSON.stringify(s)); __ptStudio.render();
      return MT_EXERCICIOS.find(x => x.v && x.n !== 'Supino reto com barra').n;
    });
    const store = () => p.evaluate(() => MTStore.read('ptStudio',{}));
    const raw = () => p.evaluate(() => localStorage.getItem('mtapp:ptStudio'));
    const area = async (name, page = p) => {
      await page.evaluate(() => document.querySelector('#abas [data-a="treinos"]').click());
      if (await page.locator('#trArea').isVisible()) await page.locator('#trArea').selectOption(name);
      else await page.locator('#trAbas [data-tra="'+name+'"]').click();
    };
    const reveal = async id => p.locator(id).evaluate(el => { for (let node = el.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; });
    const openCatalog = async (name = candidate, page = p) => {
      await area('ex',page); await page.locator('#catBusca').fill(name);
      await page.locator('[data-exabrir='+JSON.stringify(name)+']').click();
      await page.waitForFunction(() => document.getElementById('dlgEx').open);
    };
    await openCatalog();
    const beforeCancel = await raw();
    eq((await store()).exercicios.length,1,label+': abrir catálogo não cria cópia');
    await p.locator('#dxDesc').fill('Texto que será descartado');
    await p.locator('#dlgEx [value="cancel"]').click();
    eq(await raw(),beforeCancel,label+': Cancelar preserva armazenamento e cópias legítimas');
    await openCatalog();
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.getElementById('dlgEx').open);
    eq(await raw(),beforeCancel,label+': Esc não cria cópia');
    await openCatalog();
    await p.reload(); await p.waitForFunction(() => window.__catalogoPT); await p.evaluate(() => { MTStore.cloud = () => null; });
    eq((await store()).exercicios.length,1,label+': recarregar com editor aberto não cria cópia');
    await openCatalog();
    await p.locator('#dxDesc').fill('Descrição fictícia confirmada');
    await p.locator('#dxVideo').fill(''); await p.locator('#dxGifSem').click();
    // Falha de quota percorre a implementação real de MTStore.write.
    await p.evaluate(() => {
      window.__confSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key,value) { if (key === 'mtapp:ptStudio') throw new DOMException('Quota fictícia','QuotaExceededError'); return window.__confSetItem.call(this,key,value); };
    });
    await p.locator('#dlgEx [value="ok"]').click();
    await p.waitForFunction(() => document.getElementById('dlgEx').open);
    eq((await store()).exercicios.length,1,label+': falha real de gravação não cria cópia');
    eq(await p.locator('#dxDesc').inputValue(),'Descrição fictícia confirmada',label+': falha conserva edição para nova tentativa');
    ok(messages.some(x => x.includes('Sua edição continua aberta')),label+': falha é comunicada');
    if (process.env.ARTIFACT_DIR) {
      fs.mkdirSync(process.env.ARTIFACT_DIR,{recursive:true});
      await p.locator('#dlgEx').screenshot({path:path.join(process.env.ARTIFACT_DIR,'confiabilidade-'+label+'-falha.png'),animations:'disabled'});
    }
    await p.evaluate(() => { Storage.prototype.setItem = window.__confSetItem; delete window.__confSetItem; });
    await p.locator('#dlgEx [value="ok"]').click();
    await p.waitForFunction(name => !document.getElementById('dlgEx').open && MTStore.read('ptStudio',{}).exercicios.some(x => x.nome === name && x.descricao === 'Descrição fictícia confirmada'),candidate);
    let s = await store(), copy = s.exercicios.find(x => x.nome === candidate);
    eq(s.exercicios.length,2,label+': confirmação após falha cria uma única cópia');
    eq(copy.descricao,'Descrição fictícia confirmada',label+': confirmação conserva descrição digitada');
    eq(copy.semVideo,true,label+': nova tentativa preserva escolha sem vídeo');
    eq(copy.semGif,true,label+': confirmação preserva escolha sem GIF');
    eq(s.exercicios.find(x => x.id === 'conf-legitimo').descricao,'Cópia pessoal legítima',label+': cópia legítima não foi alterada');
    await p.locator('[data-exedit="'+copy.id+'"]').click();
    await p.locator('#dxDesc').fill('Não salvar pelo Esc'); await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.getElementById('dlgEx').open);
    eq((await store()).exercicios.find(x => x.id === copy.id).descricao,'Descrição fictícia confirmada',label+': Esc após Salvar anterior não reaplica confirmação');
    await p.reload(); await p.waitForFunction(() => window.__tplMeu); await p.evaluate(() => { MTStore.cloud = () => null; });
    eq((await store()).exercicios.length,2,label+': recarga mantém só a cópia confirmada');

    // Duas abas compartilham a mesma origem e o mesmo armazenamento real.
    const otherCandidate = await p.evaluate(() => MT_EXERCICIOS.find(x => x.v && !MTStore.read('ptStudio',{}).exercicios.some(e => e.nome === x.n)).n);
    const otherPage = await context.newPage();
    otherPage.on('pageerror', error => errors.push(error.message));
    otherPage.on('dialog', dialog => dialog.accept());
    await otherPage.clock.setFixedTime(new Date('2026-10-02T12:00:00-03:00'));
    await otherPage.goto(BASE + '/personal.html');
    await otherPage.waitForFunction(() => window.__catalogoPT); await otherPage.evaluate(() => { MTStore.cloud = () => null; });
    await openCatalog(otherCandidate);
    await p.locator('#dxNome').fill(otherCandidate+' ajustado na aba A');
    await p.locator('#dxDesc').fill('Rascunho da aba A, ainda não salvo');
    await openCatalog(otherCandidate,otherPage);
    await otherPage.locator('#dxDesc').fill('Cópia confirmada pela aba B');
    await otherPage.locator('#dlgEx [value="ok"]').click();
    await otherPage.waitForFunction(name => !document.getElementById('dlgEx').open && MTStore.read('ptStudio',{}).exercicios.some(x => x.nome === name && x.descricao === 'Cópia confirmada pela aba B'),otherCandidate);
    const savedByB = await raw();
    messages.length = 0;
    await p.locator('#dlgEx [value="ok"]').click();
    await p.waitForFunction(() => document.getElementById('dlgEx').open);
    eq(await raw(),savedByB,label+': aba A não duplica nem sobrescreve a cópia salva pela aba B');
    eq(await p.locator('#dxDesc').inputValue(),'Rascunho da aba A, ainda não salvo',label+': conflito entre abas conserva descrição não salva');
    eq(await p.locator('#dxNome').inputValue(),otherCandidate+' ajustado na aba A',label+': conflito confere nome de origem mesmo após renomear rascunho');
    ok(messages.some(x => x.includes('Já existe uma cópia') && x.includes('reabra a cópia existente')),label+': conflito orienta reabrir a cópia existente');
    await p.locator('#dlgEx [value="ok"]').click();
    await p.waitForFunction(() => document.getElementById('dlgEx').open);
    eq(await raw(),savedByB,label+': repetir confirmação após conflito continua sem gravar');
    await p.locator('#dlgEx [value="cancel"]').click();
    await p.locator('#catBusca').fill(otherCandidate);
    const existing = (await store()).exercicios.find(x => x.nome === otherCandidate);
    await p.locator('[data-exedit="'+existing.id+'"]').click();
    eq(await p.locator('#dxDesc').inputValue(),'Cópia confirmada pela aba B',label+': reabrir carrega a cópia confirmada na outra aba');
    await p.locator('#dlgEx [value="cancel"]').click();
    eq((await store()).exercicios.filter(x => x.nome === otherCandidate).length,1,label+': duas abas deixam uma única cópia confirmada');
    await otherPage.close();

    // Um nome legado parecido já existia ao abrir: não é cópia concorrente.
    await p.evaluate(() => {
      MTStore.cloud = () => null; // Prescrição offline: não executar a régua automática de push da demo.
      const s = MTStore.read('ptStudio',{});
      s.exercicios.find(x => x.id === 'conf-legitimo').nome = 'Supino reto';
      localStorage.setItem('mtapp:ptStudio',JSON.stringify(s)); __catalogoPT();
    });
    await openCatalog('Supino reto com barra');
    await p.locator('#dxDesc').fill('Cópia canônica confirmada com variante antiga preservada');
    await p.locator('#dlgEx [value="ok"]').click();
    await p.waitForFunction(() => !document.getElementById('dlgEx').open && MTStore.read('ptStudio',{}).exercicios.some(x => x.nome === 'Supino reto com barra' && x.descricao === 'Cópia canônica confirmada com variante antiga preservada'));
    const afterLegacy = (await store()).exercicios;
    eq(afterLegacy.find(x => x.id === 'conf-legitimo').nome,'Supino reto',label+': salvar catálogo preserva nome legado semelhante anterior');
    eq(afterLegacy.find(x => x.id === 'conf-legitimo').descricao,'Cópia pessoal legítima',label+': salvar catálogo não altera descrição da variante legítima');
    eq(afterLegacy.filter(x => x.nome === 'Supino reto com barra').length,1,label+': variante anterior não bloqueia criar cópia canônica confirmada');

    await area('fichas'); await p.locator('#tAluno').selectOption('conf-0');
    await reveal('#tplSalvar');
    const initialSheets = (await store()).treinosV2['conf-0'].fichas;
    await p.evaluate(() => { window.__confWrite = MTStore.write; MTStore.write = () => false; });
    messages.length = 0;
    await p.locator('#tplSalvar').click();
    ok(messages.some(x => x.includes('Não foi possível salvar o modelo')),label+': salvar modelo informa falha');
    ok(!messages.some(x => x.includes('guardado com')),label+': salvar modelo não anuncia falso sucesso');
    eq((await store()).modelosPT,[],label+': modelo recusado não persiste');
    eq((await store()).treinosV2['conf-0'].fichas,initialSheets,label+': salvar modelo recusado mantém ficha original');
    await p.evaluate(() => { MTStore.write = window.__confWrite; });
    await p.locator('#tplSalvar').click();
    s = await store();
    eq(s.modelosPT.length,1,label+': nova tentativa salva só um modelo');
    eq(s.modelosPT[0].fichas[0].itens[0].seriesDetalhadas,initialSheets[0].itens[0].seriesDetalhadas,label+': modelo preserva séries, descanso zero e carga vazia/zero');
    const modelValue = 'meu:'+s.modelosPT[0].id;
    await reveal('#tplAplicar'); await p.locator('#tplSel').selectOption(modelValue);
    await p.evaluate(() => { MTStore.write = () => false; }); messages.length = 0;
    await p.locator('#tplAplicar').click();
    ok(messages.some(x => x.includes('Não foi possível aplicar o modelo')),label+': aplicar modelo informa falha');
    ok(!messages.some(x => /fichas? criadas?/.test(x)),label+': aplicar modelo não anuncia falso sucesso');
    eq((await store()).treinosV2['conf-0'].fichas,initialSheets,label+': aplicação recusada preserva fichas anteriores');
    await p.evaluate(() => { MTStore.write = window.__confWrite; delete window.__confWrite; });
    await p.locator('#tplAplicar').click();
    s = await store();
    eq(s.treinosV2['conf-0'].fichas.length,2,label+': nova tentativa aplica modelo uma única vez');
    eq(s.treinosV2['conf-0'].fichas[1].itens[0].seriesDetalhadas,initialSheets[0].itens[0].seriesDetalhadas,label+': aplicar preserva prescrição detalhada');
    eq(s.treinosV2['conf-1'].fichas,[],label+': modelos não afetam outro aluno');
    const concurrent = await p.evaluate(value => {
      const original = window.confirm;
      window.confirm = () => { const s = MTStore.read('ptStudio',{}); s.config.confConcorrente = 'preservar'; localStorage.setItem('mtapp:ptStudio',JSON.stringify(s)); return true; };
      const result = __tplMeu.aplica('conf-0',value); window.confirm = original;
      return {result,stored:MTStore.read('ptStudio',{})};
    }, modelValue);
    ok(concurrent.result.erro && !concurrent.result.ok,label+': CAS real recusa aplicação aberta antes de outra gravação');
    eq(concurrent.stored.treinosV2['conf-0'].fichas.length,2,label+': conflito não duplica fichas');
    eq(concurrent.stored.config.confConcorrente,'preservar',label+': conflito preserva alteração concorrente');
    eq(errors,[],label+': nenhum erro JavaScript não tratado');
    await context.close();
  }
  await browser.close(); console.log(checks+' verificações de confiabilidade passaram.');
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
