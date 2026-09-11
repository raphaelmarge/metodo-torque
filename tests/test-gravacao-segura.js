/* Falhas locais de gravação: UI real, dados fictícios e nenhuma rede externa. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { comMockNuvem } = require('./_nuvem.js');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const ROOT = path.resolve(__dirname, '..');
const modules = 'adquirentes agenda armarios automacao bancos caixa checklist contagem contas convenios descontos equipe experimentais fluxo fornecedores funil grade inadimplencia manutencao metas niveis nps personais produtos recompensas saude suspensoes turmas vouchers wod'.split(' ');
let passed = 0, browser;
function ok(value, label) { assert.ok(value, label); passed++; console.log('OK ' + label); }
const seed = {
  perfil: { nome: 'Pessoa Teste' }, academia: { id: 'teste-local', papel: 'dono', nome: 'Academia Teste' },
  alunos: { planos: [], alunos: [{ id: 'a1', nome: 'Aluno Teste', status: 'ativo', contratos: [] }], recebiveis: [] }
};
async function pageFor(name, extra = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  await context.addInitScript(s => {
    Object.entries(s).forEach(([k,v]) => localStorage.setItem('mtapp:' + k, JSON.stringify(v)));
    window.__alerts = []; window.alert = t => window.__alerts.push(String(t)); window.confirm = () => true;
  }, { ...seed, ...extra });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/apps/' + name + '.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__writes = []; window.__fail = true;
    window.__cloudOriginal = MTStore.cloud;
    window.__funcaoOriginal = window.MT_FUNCAO && MT_FUNCAO.chama;
    const original = MTStore.write;
    MTStore.write = (key,value) => {
      window.__writes.push({ key, value: JSON.parse(JSON.stringify(value)) });
      if (window.__fail === true || window.__fail === key) return false;
      return original(key,value);
    };
  });
  return { page, context, errors, close: async () => {
    await page.evaluate(() => {
      MTStore.cloud = window.__cloudOriginal;
      if (window.MT_FUNCAO && window.__funcaoOriginal) MT_FUNCAO.chama = window.__funcaoOriginal;
    });
    ok(errors.length === 0, name + ': sem erro de execução'); await context.close();
  } };
}
async function read(page,key) { return page.evaluate(k => JSON.parse(localStorage.getItem('mtapp:' + k) || 'null'), key); }
async function retry(page) { await page.evaluate(() => { window.__fail = false; }); }

(async () => {
  let helpers = 0, forms = 0, writes = 0;
  for (const name of modules) {
    const source = fs.readFileSync(path.join(ROOT, 'apps', name + '.html'), 'utf8');
    for (const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1], { filename: name });
    const save = source.match(/function save\(st\) \{[^\n]+\}/);
    if (save) {
      const context = { S: { write: () => false }, render: () => { throw Error('Render apagaria o rascunho após falha: ' + name); } };
      vm.runInNewContext(save[0] + ';result=save({teste:true});', context);
      assert.equal(context.result, false, name + ': propaga falha'); helpers++;
    }
    // Inventário dos handlers: retorno de toda gravação direta deve ser observado.
    for (const line of source.split('\n').filter(l => l.includes('S.write('))) {
      assert.match(line, /S\.write\(.+\) === false/, name + ': gravação sem guarda: ' + line); writes++;
    }
    for (const match of source.matchAll(/querySelector\("form"\)\.addEventListener\("submit", function \(e\) \{([\s\S]*?)\n  \}\);/g)) {
      if (!/\bsave\(|S\.write\(/.test(match[1])) continue;
      assert.match(match[1], /e\.preventDefault\(\)/, name + ': cancela fechamento automático antes de salvar'); forms++;
    }
    assert.doesNotMatch(source, /addEventListener\("close", function \(\) \{[\s\S]*?returnValue !== "ok"/, name + ': não salva depois de fechar');
  }
  ok(helpers === 29 && modules.length === 30 && forms >= 30 && writes >= 80,
    'Cobertura dos 30 módulos: ' + helpers + ' helpers, ' + forms + ' formulários e ' + writes + ' gravações diretas protegidas');
  browser = comMockNuvem(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }));

  {
    const x = await pageFor('adquirentes'), p = x.page;
    await p.click('#btnNova'); await p.fill('#aNome', 'Operadora Teste');
    await p.click('#dlg [value="ok"]');
    ok(await p.locator('#dlg').evaluate(el => el.open), 'Falha mantém diálogo nativo de cadastro aberto');
    ok(await p.inputValue('#aNome') === 'Operadora Teste' && await read(p, 'adquirentes') === null, 'Cadastro mantém preenchimento sem criar registro');
    await retry(p); await p.click('#dlg [value="ok"]');
    ok(!await p.locator('#dlg').evaluate(el => el.open), 'Cadastro fecha somente depois de salvar');
    const saved = await read(p,'adquirentes');
    ok(saved.itens.length === 1, 'Retentativa cria uma única adquirente');
    await p.click('[data-edit]'); await p.evaluate(() => { window.__fail = true; }); await p.click('#btnExcluir');
    ok(await p.locator('#dlg').evaluate(el => el.open) && (await read(p,'adquirentes')).itens.length === 1, 'Exclusão recusada mantém diálogo e cadastro');
    await p.click('#dlg [value="cancel"]');
    ok(!await p.locator('#dlg').evaluate(el => el.open), 'Cancelar continua fechando sem gravar');
    await x.close();
  }
  {
    const x = await pageFor('metas', { metas: { vendedoras: [{ id:'v1',nome:'Vendedora Teste',ativa:true }],metas:{},vendas:[] } }), p = x.page;
    await p.evaluate(() => {
      document.getElementById('vVend').innerHTML='<option value="v1">Vendedora Teste</option>';
      document.getElementById('vData').value=MTStore.todayISO();
      document.getElementById('dlgVenda').showModal();
    });
    await p.fill('#vValor','75'); await p.click('#dlgVenda [value="ok"]');
    ok(await p.locator('#dlgVenda').evaluate(el => el.open) && await p.inputValue('#vValor') === '75', 'Formulário antigo de close conserva venda não salva');
    await retry(p); await p.click('#dlgVenda [value="ok"]');
    ok((await read(p,'metas')).vendas.length === 1, 'Venda de metas salva uma única vez após retentativa');
    await x.close();
  }
  {
    const x = await pageFor('grade'), p = x.page;
    await p.evaluate(() => {
      const old = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) { if (k === 'mtapp:grade') throw new DOMException('Teste de cota', 'QuotaExceededError'); return old.call(this,k,v); };
      window.__fail = false;
      document.getElementById('rgCancela').value = '12';
    });
    // Handler real, mesmo quando a seção está recolhida.
    await p.evaluate(() => document.getElementById('rgSalvar').click());
    ok((await p.textContent('#rgStatus')).includes('Não foi possível salvar'), 'Quota real não mostra Salvo na grade');
    ok(await p.inputValue('#rgCancela') === '12', 'Quota real preserva a configuração digitada');
    await x.close();
  }
  {
    const x = await pageFor('produtos', { produtos: { itens: [{ id:'p1', nome:'Água Teste', preco:5, custo:2, estoque:4 }], vendas:[] } }), p=x.page;
    await p.click('[data-add="p1"]'); await p.fill('#vCliente','Cliente Teste'); await p.click('#btnFinalizar');
    ok(await p.locator('[data-mais]').count() === 1 && await p.inputValue('#vCliente') === 'Cliente Teste', 'Venda recusada preserva carrinho e cliente');
    ok((await read(p,'produtos')).itens[0].estoque === 4 && (await read(p,'produtos')).vendas.length === 0, 'Venda recusada não baixa estoque');
    await retry(p); await p.click('#btnFinalizar');
    const s=await read(p,'produtos');
    ok(s.vendas.length === 1 && s.itens[0].estoque === 3 && await p.locator('[data-mais]').count() === 0, 'Retentativa de venda baixa estoque e limpa carrinho uma vez');
    await x.close();
  }
  {
    const x=await pageFor('nps'),p=x.page;
    await p.fill('#rAluno','Aluno Teste'); await p.fill('#rComent','Comentário preservado'); await p.click('[data-n="8"]'); await p.click('#rSalvar');
    ok(await p.inputValue('#rComent') === 'Comentário preservado' && await p.locator('#notas .sel').count() === 1, 'NPS mantém comentário e nota na falha');
    await retry(p); await p.click('#rSalvar');
    ok((await read(p,'nps')).respostas.length === 1 && await p.inputValue('#rComent') === '', 'NPS limpa o formulário apenas após salvar');
    await x.close();
  }
  {
    const x=await pageFor('manutencao'),p=x.page;
    await p.evaluate(() => { window.__photos=[]; MTStore.savePhoto=async()=>{window.__photos.push('saved');return 'foto-teste';}; MTStore.deletePhoto=id=>window.__photos.push('delete:'+id); });
    await p.click('#btnNovo'); await p.fill('#nTitulo','Aparelho Teste');
    await p.setInputFiles('#nFoto',{name:'teste.png',mimeType:'image/png',buffer:Buffer.from('foto fictícia')});
    await p.click('#dlgNovo [value="ok"]'); await p.waitForFunction(()=>!document.querySelector('#dlgNovo [value="ok"]').disabled);
    ok(await p.locator('#dlgNovo').evaluate(el=>el.open) && await p.inputValue('#nTitulo')==='Aparelho Teste', 'Manutenção conserva chamado e foto após gravação recusada');
    await retry(p); await p.click('#dlgNovo [value="ok"]'); await p.waitForFunction(()=>!document.getElementById('dlgNovo').open);
    ok((await read(p,'manut')).chamados.length===1 && await p.evaluate(()=>window.__photos.filter(x=>x==='saved').length)===1, 'Retentativa reutiliza foto pendente e cria apenas um chamado');
    await p.evaluate(()=>{window.__fail=true;}); await p.click('[data-acao="excluir"]');
    ok((await read(p,'manut')).chamados.length===1 && await p.evaluate(()=>!window.__photos.some(x=>x.startsWith('delete:'))), 'Foto não é apagada quando exclusão do chamado falha');
    await retry(p); await p.click('[data-acao="excluir"]');
    ok((await read(p,'manut')).chamados.length===0 && await p.evaluate(()=>window.__photos.includes('delete:foto-teste')), 'Exclusão confirmada remove chamado e sua foto');
    await p.evaluate(()=>{MTStore.savePhoto=()=>new Promise(resolve=>{window.__resolveFoto=resolve;});});
    await p.click('#btnNovo'); await p.fill('#nTitulo','Rascunho cancelado');
    await p.setInputFiles('#nFoto',{name:'outra.png',mimeType:'image/png',buffer:Buffer.from('outra foto fictícia')});
    await p.click('#dlgNovo [value="ok"]'); await p.click('#dlgNovo [value="cancel"]');
    await p.click('#btnNovo'); await p.fill('#nTitulo','Novo rascunho');
    await p.evaluate(async()=>{window.__resolveFoto('foto-cancelada');await new Promise(r=>setTimeout(r,0));});
    ok((await read(p,'manut')).chamados.length===0 && await p.locator('#dlgNovo').evaluate(el=>el.open) && await p.inputValue('#nTitulo')==='Novo rascunho',
      'Foto atrasada de diálogo cancelado não salva nem fecha o novo rascunho');
    await x.close();
  }
  {
    const x=await pageFor('descontos',{aprovacoes:{itens:[{id:'ap1',tipo:'credito',alunoId:'a1',nome:'Aluno Teste',valor:25,status:'pendente'}]}}),p=x.page;
    await p.evaluate(()=>{window.__fail='aprovacoes';document.querySelector('[data-aprova="ap1"]').click();});
    ok((await read(p,'alunos')).alunos[0].saldoCredor===25 && (await read(p,'aprovacoes')).itens[0].status==='pendente', 'Falha da segunda gravação conserva o crédito já registrado');
    await retry(p); await p.evaluate(()=>document.querySelector('[data-aprova="ap1"]').click());
    ok((await read(p,'alunos')).alunos[0].saldoCredor===25 && (await read(p,'aprovacoes')).itens[0].status==='aprovado', 'Retentativa não duplica crédito financeiro');
    await x.close();
  }
  {
    const x=await pageFor('turmas',{turmas:{turmas:[{id:'t1',nome:'Turma Teste',prof:'Professor Teste',hora:'10:00',bonusSeguidas:1,alunos:['Aluno Teste'],espera:[]}],chamadas:{}}}),p=x.page;
    await p.evaluate(()=>{const ch=document.querySelector('[data-ch="t1"]');ch.closest('details').open=true;ch.checked=true;document.querySelector('[data-salvar="t1"]').click();});
    ok(Object.keys((await read(p,'turmas')).chamadas).length===0 && !(await read(p,'alunos')).alunos[0].bonusSessoes, 'Chamada recusada não concede bônus');
    await p.evaluate(()=>{window.__fail='alunos';document.querySelector('[data-salvar="t1"]').click();});
    ok(Object.keys((await read(p,'turmas')).chamadas).length===1 && await p.evaluate(()=>window.__alerts.some(t=>t.includes('bônus não foram registrados'))), 'Falha de bônus informa exatamente o resultado parcial');
    await retry(p); await p.evaluate(()=>document.querySelector('[data-salvar="t1"]').click());
    await p.evaluate(()=>document.querySelector('[data-salvar="t1"]').click());
    ok((await read(p,'alunos')).alunos[0].bonusSessoes===1, 'Retentar a chamada duas vezes registra apenas um bônus');
    await x.close();
  }
  {
    const x=await pageFor('inadimplencia',{inad:{devedores:[{id:'d1',nome:'Aluno Teste',valor:50,vencimento:'2026-01-01',status:'aberto',envios:{}}],config:{}}}),p=x.page;
    await p.evaluate(()=>{
      window.__charges=0;
      const nuvem = window.mockNuvem({aid:'teste-local'});
      MTStore.cloud=()=>nuvem;
      MT_FUNCAO.chama=async(client,nome,payload)=>{
        if(client!==nuvem.client || nome!=='pagarme' || payload.acao!=='criar') throw Error('Operação inesperada no teste de cobrança');
        window.__charges++;return {ok:true,orderId:'ordem-ficticia',metodo:'pix',pixCopiaECola:'PIX FICTICIO',linkPagamento:'https://pagamento.example.invalid/teste'};
      };
      document.querySelector('[data-acao="cobranca"]').click();
    });
    await p.click('#cobPix'); await p.waitForSelector('#cobRetentar');
    ok(await p.inputValue('#cobCodigo')==='PIX FICTICIO' && (await p.textContent('#cobAviso')).includes('registro local não foi salvo'), 'Cobrança remota confirmada continua visível quando o registro local falha');
    await p.evaluate(()=>{document.getElementById('dlgCob').close();document.querySelector('[data-acao="cobranca"]').click();});
    ok(await p.locator('#cobRetentar').count()===1 && await p.locator('#cobPix').count()===0, 'Reabrir cobrança pendente oferece gravar o resultado existente');
    await retry(p); await p.click('#cobRetentar');
    ok((await read(p,'inad')).devedores[0].cobranca.orderId==='ordem-ficticia' && await p.evaluate(()=>window.__charges)===1, 'Retentativa de cobrança grava localmente sem criar outra cobrança');
    await x.close();
  }
  {
    const unsafe='Conta <img src=x onerror="window.__unsafe=true"> & teste';
    const x=await pageFor('fluxo',{bancos:{contas:[{id:'" data-injetado="sim',nome:unsafe}],transferencias:[]}}),p=x.page;
    ok(await p.locator('#fConta option').nth(1).textContent()===unsafe, 'Nome da conta é apresentado como texto literal');
    ok(await p.locator('#fConta [data-injetado], #fConta img').count()===0, 'Dados de conta não criam atributos ou elementos HTML');
    await x.close();
  }
  {
    const x=await pageFor('inadimplencia',{config:{dados:{},integracoes:{whatsappLigado:true}},inad:{devedores:[{id:'d1',nome:'Aluno Teste',zap:'31999990000',valor:50,vencimento:'2026-01-01',status:'aberto',envios:{}}],config:{}}}),p=x.page;
    await p.evaluate(()=>{
      window.__messages=0; MTStore.tokenNuvem=async()=>'token-ficticio';
      const original=window.fetch;
      window.fetch=(url,options)=>String(url).includes('/functions/v1/whatsapp') ? (window.__messages++,Promise.resolve({json:async()=>({ok:true})})) : original(url,options);
      document.querySelector('[data-acao="zapauto"]').click();
    });
    await p.waitForFunction(()=>document.querySelector('[data-acao="zapauto"]').textContent.includes('Salvar registro'));
    ok(await p.evaluate(()=>window.__alerts.some(x=>x.includes('Mensagem enviada')&&x.includes('histórico não foi salvo'))), 'WhatsApp confirmado informa falha só do registro local');
    await retry(p); await p.evaluate(()=>document.querySelector('[data-acao="zapauto"]').click());
    await p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('mtapp:inad')).devedores[0].envios).length>0);
    ok(await p.evaluate(()=>window.__messages)===1, 'Retentativa do histórico não reenvia WhatsApp');
    await x.close();
  }
  console.log(passed+' verificações passaram; sem serviços externos.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
