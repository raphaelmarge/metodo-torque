/* UI real, respostas externas inteiramente simuladas, sem dados ou serviços reais. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.TORQUE_PLAYWRIGHT || './ci/node_modules/playwright');
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL || process.env.MT_BASE || 'http://127.0.0.1:8765';
let browser,checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('OK '+label);};
async function pageFor(module, automaticos=false) {
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin ? route.continue() : route.abort());
  await context.addInitScript(automaticos=>{
    if(!localStorage.getItem('remote-test-seeded')) {
      const seed={perfil:{nome:'Pessoa Teste',id:'user-test'},academia:{id:'academy-test',nome:'Academia Teste',papel:'dono'},
        config:{dados:{},integracoes:{whatsappLigado:true}},
        alunos:{alunos:[{id:'a1',nome:'Aluno Um',zap:'31999990001',status:'ativo',contratos:[]},{id:'a2',nome:'Aluno Dois',zap:'31999990002',status:'ativo',contratos:[]}],recebiveis:[],planos:[]},
        produtos:{itens:[{id:'p1',nome:'Água Teste',preco:5,estoque:10}],vendas:[]},
        automacao:{templates:[{id:'tp1',nome:'Teste',texto:'Oi {nome}'},{id:'tp5',nome:'Teste',texto:'Oi'},{id:'tp6',nome:'Teste',texto:'Oi'}],
          regras:[{id:'rg5',gatilho:'venc_mensalidade',ativo:false,templateId:'tp6'},{id:'rg4',gatilho:'avaliacao_google',ativo:false,templateId:'tp5'}],
          historico:{},linksPix:{},jornada:{ativa:false,etapas:[]},resumoDono:{zap:'31999990000',ativo:false,semanal:false}}};
      if(automaticos) {
        seed.automacao.resumoDono.ativo=true;seed.automacao.resumoDono.semanal=true;
        seed.automacao.regras[0].ativo=true;
        seed.config.integracoes.pagarmeUrl='https://fake.invalid/pix';
        seed.alunos.recebiveis=seed.alunos.alunos.map(a=>({alunoId:a.id,status:'aberto',vencimento:'2026-09-13',valor:50}));
      }
      for(const [key,value] of Object.entries(seed))localStorage.setItem('mtapp:'+key,JSON.stringify(value));
      localStorage.setItem('remote-test-seeded','1');
    }
    if(automaticos)window.MT_CLOUD={url:'https://fake.invalid',anonKey:'fake-public'};
    window.__alerts=[];window.alert=text=>window.__alerts.push(String(text));window.confirm=()=>true;
    const original=window.setTimeout;
    window.setTimeout=(fn,ms,...args)=>!automaticos&&['geraPixPendentes','puxaPedidosApp','executaAutomaticoAgendado'].includes(fn&&fn.name)?0:original(fn,ms,...args);
  },automaticos);
  const page=await context.newPage(),errors=[];
  if(automaticos) {
    const domingo=new Date('2026-09-13T12:00:00-03:00');
    await page.clock.install({time:domingo});
    await page.clock.pauseAt(domingo);
  }
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(BASE+'/apps/'+module+'.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MTStore);
  await installMocks(page);
  return {page,context,close:async()=>{ok(errors.length===0,module+': sem erros de execução');await page.evaluate(()=>window.__restoreRemoteMock());await context.close();}};
}
async function installMocks(page) {
  await page.evaluate(()=>{
    window.__calls=[];window.__failWrite=true;window.__aid='academy-test';window.__holdExternal=false;window.__ackFail=true;
    const originalWrite=MTStore.write;
    MTStore.write=(key,value)=>window.__failWrite&&(key==='automacao'||key==='produtos')?false:originalWrite(key,value);
    MTStore.tokenNuvem=async()=> 'token-ficticio';
    window.MT_CLOUD={url:'https://fake.invalid',anonKey:'fake-public'};
    const originalFetch=window.fetch;
    window.fetch=(url,options)=>{
      if(!String(url).startsWith('https://fake.invalid/'))return originalFetch(url,options);
      const body=JSON.parse(options.body),isPix=body.acao==='criar';
      window.__calls.push({tipo:isPix?'pix':'whatsapp',body});
      const value={ok:true,orderId:'order-test',linkPagamento:'https://fake.invalid/link'};
      const response={json:async()=>value};
      if(window.__holdExternal)return new Promise(resolve=>window.__releaseExternal=()=>resolve(response));
      return Promise.resolve(response);
    };
    window.__orders=[{id:'pedido-1',aluno:'Aluno Um',itens:[{n:'Água Teste',q:2,v:5}],total:10,status:'novo',criado:'2026-09-01'}];
    const nuvem=window.mockNuvem({aid:window.__aid,tabelas:{app_pedidos(q){
      if(q.acao==='select')return window.__orders.filter(order=>Object.entries(q.filtros).every(([key,value])=>order[key]===value)).map(order=>({...order}));
      if(window.__ackFail)return {error:{message:'Falha sintética'}};
      const order=window.__orders.find(order=>order.id===q.filtros.id);if(order)Object.assign(order,q.corpo);
      return {data:q.colunas==='id,status'?(order?[{id:order.id,status:order.status}]:[]):null};
    }}});
    const originalFrom=nuvem.client.from.bind(nuvem.client);
    nuvem.client.from=table=>{
      const q=originalFrom(table),originalThen=q.then;
      if(table==='app_pedidos')q.then=(resolve,reject)=>{
        if(q.acao==='update') {
          window.__calls.push({tipo:'ack',value:q.corpo,id:q.filtros.id,colunas:q.colunas});
          if(window.__holdExternal)return new Promise(done=>window.__releaseExternal=done).then(()=>originalThen(resolve,reject));
        }
        return originalThen(resolve,reject);
      };
      return q;
    };
    const originalCloud=MTStore.cloud;
    MTStore.cloud=()=>{nuvem.aid=window.__aid;return nuvem;};
    window.__restoreRemoteMock=()=>{MTStore.cloud=originalCloud;MTStore.write=originalWrite;window.fetch=originalFetch;};
  });
}
const calls=(page,type)=>page.evaluate(t=>window.__calls.filter(call=>call.tipo===t).length,type);
const read=(page,key)=>page.evaluate(k=>JSON.parse(localStorage.getItem('mtapp:'+k)),key);
async function allowWrite(page){await page.evaluate(()=>window.__failWrite=false);}

(async()=>{
  browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}));
  {
    const x=await pageFor('automacao'),p=x.page;
    await p.click('#btnResumoAgora');await p.waitForFunction(()=>document.getElementById('resumoStatus').textContent.includes('histórico aguarda'));
    ok(await calls(p,'whatsapp')===1,'Resumo foi enviado apenas uma vez antes da falha local');
    ok(await p.locator('#remotoPendente').isVisible(),'Confirmação parcial permanece visível com ação de recuperação');
    await allowWrite(p);await p.click('#btnResumoAgora');
    ok(await calls(p,'whatsapp')===1,'Repetir resumo confirmado tenta somente salvar o histórico');
    ok(Boolean((await read(p,'automacao')).resumoDono.ultimo),'Retentativa preserva a data de envio confirmado');
    await p.click('#btnResumoAgora');ok(await calls(p,'whatsapp')===1,'Resumo já registrado hoje não é duplicado');
    await p.evaluate(()=>window.__failWrite=true);await p.click('#btnSemanalAgora');
    await p.waitForFunction(()=>document.getElementById('remotoPendente').hidden===false);
    ok(await calls(p,'whatsapp')===2,'Resumo semanal usa seu próprio registro');
    await p.reload({waitUntil:'domcontentloaded'});await installMocks(p);await allowWrite(p);
    await p.click('#remotoRepetir');
    ok(await calls(p,'whatsapp')===0&&Boolean((await read(p,'automacao')).resumoDono.ultimoSemanal),'Recibo confirmado sobrevive ao reload e salva sem novo envio');
    await x.close();
  }
  {
    const x=await pageFor('automacao'),p=x.page;
    await p.evaluate(()=>window.__holdExternal=true);await p.click('#btnResumoAgora');
    await p.waitForFunction(()=>window.__releaseExternal);
    await p.click('#btnResumoAgora');ok(await calls(p,'whatsapp')===1,'Clique repetido durante envio não faz segunda chamada');
    await p.evaluate(()=>{window.__aid='outra-conta';window.__releaseExternal();});
    await p.waitForTimeout(50);
    ok(!(await read(p,'automacao')).resumoDono.ultimo,'Resposta atrasada não grava na conta que passou a estar ativa');
    await p.evaluate(()=>{window.__aid='academy-test';window.__failWrite=false;window.__holdExternal=false;});
    await p.click('#btnResumoAgora');ok(await calls(p,'whatsapp')===1&&Boolean((await read(p,'automacao')).resumoDono.ultimo),'Conta original pode recuperar confirmação atrasada sem reenviar');
    await x.close();
  }
  {
    const x=await pageFor('automacao'),p=x.page;
    await p.evaluate(()=>{
      const alunos=MTStore.read('alunos');for(const aluno of alunos.alunos)aluno.nasc='2000-'+MTStore.todayISO().slice(5);
      MTStore.write('alunos',alunos);window.__failWrite=false;
      const st=MTStore.read('automacao');st.regras.push({id:'aniv',gatilho:'aniversario',ativo:true,templateId:'tp1'});MTStore.write('automacao',st);window.__failWrite=true;
    });
    await p.click('#btnTodos');await p.waitForFunction(()=>!document.getElementById('remotoPendente').hidden);
    ok(await calls(p,'whatsapp')===1,'Lote para imediatamente após confirmação sem histórico salvo');
    await allowWrite(p);await p.click('#remotoRepetir');
    ok(await calls(p,'whatsapp')===1,'Recuperar lote salva apenas a confirmação pendente');
    await p.click('#btnTodos');await p.waitForFunction(()=>window.__alerts.some(t=>t.includes('Disparo concluído')));
    ok(await calls(p,'whatsapp')===2,'Novo lote envia somente o aluno ainda pendente');
    const hist=(await read(p,'automacao')).historico;
    ok(Object.values(hist).flatMap(Object.keys).filter(k=>k.startsWith('aniv|')).length===2,'Cada aluno tem um registro de envio');
    await x.close();
  }
  {
    const x=await pageFor('automacao'),p=x.page;
    await p.evaluate(()=>{
      const cfg=MTStore.read('config');cfg.integracoes.pagarmeUrl='https://fake.invalid/pix';MTStore.write('config',cfg);
      const alunos=MTStore.read('alunos');alunos.recebiveis=alunos.alunos.map(a=>({alunoId:a.id,status:'aberto',vencimento:MTStore.todayISO(),valor:50}));MTStore.write('alunos',alunos);
      window.__failWrite=false;const st=MTStore.read('automacao');st.regras.find(r=>r.gatilho==='venc_mensalidade').ativo=true;MTStore.write('automacao',st);window.__failWrite=true;
    });
    await p.evaluate(()=>window.__geraPix());
    ok(await calls(p,'pix')===1,'Geração de Pix para após primeira cobrança cuja gravação falhou');
    await allowWrite(p);await p.evaluate(()=>window.__geraPix());
    ok(await calls(p,'pix')===1&&Boolean((await read(p,'automacao')).linksPix.a1),'Retentativa de Pix só recupera link e orderId confirmados');
    await p.evaluate(()=>window.__geraPix());ok(await calls(p,'pix')===2,'Cobrança seguinte não repete o aluno que já possui link');
    await p.evaluate(()=>window.__geraPix());ok(await calls(p,'pix')===2,'Todos os links existentes impedem gerar cobranças duplicadas');
    await x.close();
  }
  {
    const x=await pageFor('automacao',true),p=x.page;
    await allowWrite(p);await p.evaluate(()=>window.__holdExternal=true);
    await p.clock.runFor(1500);await p.waitForFunction(()=>window.__releaseExternal);
    ok(await calls(p,'whatsapp')===1,'Timer real inicia resumo diário em 1500 ms');
    await p.clock.runFor(1000);
    ok(await calls(p,'whatsapp')===1&&await calls(p,'pix')===0,'Semanal e Pix de 2500 ms esperam o diário ainda pendente');
    await p.evaluate(()=>document.getElementById('btnResumoAgora').click());
    ok(await calls(p,'whatsapp')===1,'Clique manual durante fila automática não duplica o diário');
    await p.evaluate(()=>{window.__holdExternal=false;window.__releaseExternal();});
    await p.waitForFunction(()=>window.__calls.filter(c=>c.tipo==='pix').length===2&&Boolean(MTStore.read('automacao').linksPix.a2));
    const st=await read(p,'automacao');
    ok(await calls(p,'whatsapp')===2&&await calls(p,'pix')===2,'Fila conclui diário, semanal e dois Pix sem perder trabalhos');
    ok(st.resumoDono.ultimo==='2026-09-13'&&st.resumoDono.ultimoSemanal==='2026-09-13'&&Object.keys(st.linksPix).length===2,'Todos os resultados da fila ficam registrados');
    await p.evaluate(()=>{document.getElementById('btnResumoAgora').click();document.getElementById('btnSemanalAgora').click();});
    await p.evaluate(()=>window.__geraPix());
    ok(await calls(p,'whatsapp')===2&&await calls(p,'pix')===2,'Retentar depois da fila não repete resumos nem cobranças confirmadas');
    await x.close();
  }
  {
    const x=await pageFor('automacao',true),p=x.page;
    await p.evaluate(()=>window.__holdExternal=true);
    await p.clock.runFor(2500);await p.waitForFunction(()=>window.__releaseExternal);
    await p.evaluate(()=>{window.__holdExternal=false;window.__releaseExternal();});
    await p.waitForFunction(()=>!document.getElementById('remotoPendente').hidden);
    ok(await calls(p,'whatsapp')===1&&await calls(p,'pix')===0,'Falha ao salvar recibo pausa os trabalhos automáticos seguintes');
    await allowWrite(p);await p.evaluate(()=>document.getElementById('remotoRepetir').click());
    await p.waitForFunction(()=>Boolean(MTStore.read('automacao').linksPix.a2));
    ok(await calls(p,'whatsapp')===2&&await calls(p,'pix')===2,'Salvar recibo retoma somente semanal e Pix que ainda faltavam');
    ok(await p.evaluate(()=>window.__calls.filter(c=>c.tipo==='whatsapp'&&c.body.texto.includes('resumo de')).length===1),'Retomada da fila nunca reenvia o diário já confirmado');
    await x.close();
  }
  {
    const x=await pageFor('automacao',true),p=x.page;
    await allowWrite(p);await p.evaluate(()=>{
      const st=MTStore.read('automacao');st.resumoDono.ativo=false;st.resumoDono.semanal=false;MTStore.write('automacao',st);
      window.__failWrite=true;
    });
    await p.clock.runFor(2500);await p.waitForFunction(()=>!document.getElementById('remotoPendente').hidden);
    ok(await calls(p,'pix')===1,'Lote automático de Pix pausa após confirmar o primeiro sem gravação local');
    await allowWrite(p);await p.evaluate(()=>document.getElementById('remotoRepetir').click());
    await p.waitForFunction(()=>Boolean(MTStore.read('automacao').linksPix.a2));
    ok(await calls(p,'pix')===2&&await calls(p,'whatsapp')===0,'Retomada do lote automático conclui somente o Pix restante');
    ok(await p.evaluate(()=>new Set(window.__calls.filter(c=>c.tipo==='pix').map(c=>c.body.nome)).size===2),'Cada aluno recebe uma única criação de Pix na retomada automática');
    await x.close();
  }
  {
    const x=await pageFor('automacao',true),p=x.page;
    await allowWrite(p);await p.evaluate(()=>window.__holdExternal=true);
    await p.clock.runFor(2500);await p.waitForFunction(()=>window.__releaseExternal);
    await p.evaluate(()=>{
      const st=MTStore.read('automacao');st.resumoDono.semanal=false;st.regras[0].ativo=false;MTStore.write('automacao',st);
      window.__holdExternal=false;window.__releaseExternal();
    });
    await p.waitForFunction(()=>Boolean(MTStore.read('automacao').resumoDono.ultimo));
    await p.clock.runFor(10);
    ok(await calls(p,'whatsapp')===1&&await calls(p,'pix')===0,'Fila revalida regras desativadas enquanto aguardavam');
    await x.close();
  }
  {
    const x=await pageFor('automacao',true),p=x.page;
    await allowWrite(p);await p.evaluate(()=>window.__holdExternal=true);
    await p.clock.runFor(2500);await p.waitForFunction(()=>window.__releaseExternal);
    await p.evaluate(()=>{window.__aid='outra-conta';window.__holdExternal=false;window.__releaseExternal();});
    await p.clock.runFor(10);
    ok(await calls(p,'whatsapp')===1&&await calls(p,'pix')===0,'Fila da conta original não envia semanal ou Pix após troca de identidade');
    ok(!(await read(p,'automacao')).resumoDono.ultimo,'Resposta do diário anterior não grava na nova conta');
    await x.close();
  }
  {
    const x=await pageFor('produtos'),p=x.page;
    await p.evaluate(()=>window.__puxaPedidosApp());await p.waitForSelector('[data-entrega]');
    await p.click('[data-entrega]');
    ok(await calls(p,'ack')===0,'Venda local recusada não confirma entrega remota');
    ok((await read(p,'produtos')).itens[0].estoque===10,'Recusa local conserva estoque');
    await allowWrite(p);await p.click('[data-entrega]');await p.waitForFunction(()=>document.getElementById('pedidosAppAviso').textContent.includes('Falta confirmar'));
    let st=await read(p,'produtos');ok(st.vendas.length===1&&st.itens[0].estoque===8&&st.vendas[0].pedidoId==='pedido-1','Venda guarda o pedidoId e baixa estoque uma única vez');
    await p.click('[data-entrega]');await p.waitForFunction(()=>window.__calls.filter(c=>c.tipo==='ack').length===2);
    st=await read(p,'produtos');ok(st.vendas.length===1&&st.itens[0].estoque===8,'Falha no ACK não duplica venda nem baixa estoque novamente');
    await p.evaluate(()=>{window.__ackFail=false;window.__holdExternal=true;});await p.click('[data-entrega]');
    await p.waitForFunction(()=>window.__releaseExternal);
    await p.evaluate(()=>document.querySelector('[data-entrega]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    ok(await calls(p,'ack')===3,'Clique repetido durante confirmação não inicia outro ACK');
    await p.evaluate(()=>window.__releaseExternal());await p.waitForFunction(()=>document.getElementById('pedidosAppBox').hidden);
    st=await read(p,'produtos');ok(st.vendas.length===1&&st.itens[0].estoque===8,'ACK confirmado termina com uma venda e uma baixa');
    ok(await p.evaluate(()=>window.__calls.filter(call=>call.tipo==='ack').every(call=>call.colunas==='id,status')),'ACK solicita id/status ao banco; resposta sem select não é confirmação');
    await x.close();
  }
  console.log(checks+' verificações dos efeitos externos PASS; nenhuma chamada externa real.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
