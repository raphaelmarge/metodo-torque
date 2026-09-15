/* Ajuda real com dados fictícios. A leitura não grava negócio ou publica alunos. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; } catch (_) {
  try { chromium = require('./ci/node_modules/playwright').chromium; } catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
}
const { comMockNuvem } = require('./_nuvem');
const ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.BASE_URL || 'http://torque-ajuda.test').replace(/\/+$/, '');
let browser, checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; console.log('OK ' + message); }
function eq(a,b,message) { assert.deepEqual(a,b,message); checks++; console.log('OK ' + message); }
(async () => {
  const opts = { args: ['--no-sandbox'] };
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  browser = comMockNuvem(await chromium.launch(opts));
  const c = await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const errors = [], requests = [];
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
  await c.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== BASE) { requests.push(r.request().method()+' '+u.origin); return r.abort(); }
    const file = path.resolve(ROOT, '.'+decodeURIComponent(u.pathname));
    if (!file.startsWith(ROOT+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return r.fulfill({status:404,body:''});
    return r.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const p = await c.newPage(); p.on('pageerror', e=>errors.push(e.message)); p.on('dialog', d=>d.dismiss());
  await p.clock.setFixedTime(new Date('2026-09-14T13:00:00-03:00'));
  await p.goto(BASE+'/demo-personal.html'); await p.locator('#btnDemo').click(); await p.waitForURL(/personal\.html/);
  await p.waitForFunction(()=>window.__ajudaPT && window.MT_FERRAMENTAS?.ready());
  await p.evaluate(()=>{MTStore.cloud=()=>null;document.querySelector('#abas [data-a="ajuda"]').click();});
  const initial = await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio'));
  const nav = await p.locator('#abas [data-a]').evaluateAll(es=>es.map(e=>e.dataset.a));
  ok(await p.locator('#vAjuda').isVisible(), 'Ajuda abre pelo menu original');
  eq(await p.locator('#vAjuda .ajgrid [data-ajtopico]').count(),24,'24 tópicos na mesma grade');
  eq(await p.locator('#vAjuda .ajgrid [data-ajtopico]').first().getAttribute('data-ajtopico'),'novidades','Novidades no início do índice');
  ok((await p.locator('#vAjuda').innerText()).includes('Dúvidas e novidades'),'Título visível atualizado');
  eq(await p.locator('#vAjuda details').count(),0,'Índice sem respostas expandidas ou painéis extras');
  for (const [q,id] of [['nome fantasia','marca'],['personal abaixo opcional','marca'],['EXTORNO PIX','cancelamentos'],['nuvem celular','sincronizacao'],['central pro','novidades'],['alimentacao registros','nutricao'],['corrida metros','treinos'],['cadastro inicial','quest'],['senha','conta']]) {
    await p.locator('#ajBusca').fill(q);
    ok(await p.locator('#vAjuda .ajgrid [data-ajtopico="'+id+'"]').isVisible(),'Busca encontra '+q);
    ok(await p.locator('#vAjuda [data-ajtopico="_chamado"]').isVisible(),'Suporte continua acessível ao buscar '+q);
  }
  await p.locator('#ajBusca').fill('zzsemresultadoxyz');
  ok(await p.locator('#ajBuscaVazia').isVisible(),'Busca vazia tem orientação útil');
  eq(await p.locator('#vAjuda .ajgrid [data-ajtopico]:visible').count(),0,'Nenhum resultado fictício para termo inexistente');
  await p.locator('#ajBusca').fill('nome fantasia'); await p.locator('#vAjuda .ajgrid [data-ajtopico="marca"]').click();
  eq(await p.locator('#vAjuda details[open]').count(),1,'Só a primeira resposta abre por padrão');
  const second=p.locator('#vAjuda details').nth(1);
  await second.locator('summary').focus(); await p.keyboard.press('Enter');
  ok(await second.evaluate(e=>e.open),'Resposta pode ser aberta pelo teclado');
  ok((await second.innerText()).includes('desligado por padrão'),'Nome abaixo permanece opcional na ajuda');
  await p.locator('[data-ajvolta]').click();
  eq(await p.locator('#ajBusca').inputValue(),'nome fantasia','Busca preservada ao voltar do tópico');
  await p.locator('#ajBusca').fill(''); await p.locator('#vAjuda .ajgrid [data-ajtopico="novidades"]').click();
  await p.locator('#vAjuda [data-ajtopico="cancelamentos"]').click();
  ok((await p.locator('#vAjuda .alh').innerText()).includes('Cancelamentos'),'Atalho do resumo leva à ajuda, não executa cancelamento');
  for (const width of [320,390,1280]) {
    await p.setViewportSize({width,height:900});
    for (const light of [false,true]) {
      await p.evaluate(light=>document.documentElement.classList.toggle('claro',light),light);
      for (const id of ['novidades','marca','cancelamentos','sincronizacao','nutricao','presencial']) {
        await p.evaluate(id=>__ajudaPT.abre(id),id);
        eq(await p.locator('#vAjuda details[open]').count(),1,'Recolhimento em '+id+' '+width+' '+light);
        ok(await p.locator('#vAjuda').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Sem rolagem lateral em '+id+' '+width+' '+light);
      }
    }
  }
  await p.evaluate(()=>{document.documentElement.classList.remove('claro');__ajudaPT.abre(null);});
  const attack='\"><img src=x onerror="window.__ajudaXss=1">';
  await p.locator('#ajBusca').fill(attack);
  await p.evaluate(()=>__ajudaPT.abre('marca')); await p.locator('[data-ajvolta]').click();
  eq(await p.locator('#ajBusca').inputValue(),attack,'Busca mantém texto especial sem interpretar HTML');
  eq(await p.evaluate(()=>window.__ajudaXss),undefined,'Busca não executa conteúdo digitado');
  await p.locator('#ajBusca').fill(''); await p.locator('[data-ajtopico="_chamado"]').click();
  ok((await p.locator('#vAjuda').textContent()).includes('Entre na sua conta'),'Suporte sem conta não finge envio');
  await p.locator('[data-ajvolta]').click();
  eq(await p.locator('#abas [data-a]').evaluateAll(es=>es.map(e=>e.dataset.a)),nav,'Nenhum destino ou controle do menu foi removido');
  eq(await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio')),initial,'Ler, buscar e navegar na ajuda preservam todo o estado do negócio');
  if (process.env.TORQUE_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.TORQUE_EVIDENCE_DIR,{recursive:true}); await p.setViewportSize({width:390,height:844});
    await p.locator('#vAjuda').screenshot({path:path.join(process.env.TORQUE_EVIDENCE_DIR,'duvidas-indice-mobile.png')});
    await p.evaluate(()=>__ajudaPT.abre('cancelamentos'));
    await p.locator('#vAjuda').screenshot({path:path.join(process.env.TORQUE_EVIDENCE_DIR,'duvidas-devolucoes-mobile.png')});
  }
  eq(errors,[],'Nenhum erro JavaScript na navegação revisada');
  // Requisições externas foram bloqueadas; nenhuma transação/registro remoto de produção é usado.
  console.log('Requisições externas bloqueadas: '+requests.length);
  console.log(checks+' verificações da interface de ajuda passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
