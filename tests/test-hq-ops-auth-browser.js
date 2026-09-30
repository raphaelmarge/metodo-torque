/* Regressao de autorizacao na rota real; fixtures sinteticas e rede externa bloqueada. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('./ci/node_modules/playwright');
const { createServer } = require('../tools/hq-ops/serve.cjs');
const Data = require('../assets/hq-ops-data.js');
const USER_A = '00000000-0000-4000-8000-000000009000';
const USER_B = '00000000-0000-4000-8000-000000009001';
const PRIVATE_ACCOUNT = 'Cliente privado da sessao A';
const PRIVATE_CASE = 'Caso privado da sessao A';
const PRIVATE_MESSAGE = 'Mensagem interna confidencial de teste';
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
async function run() {
  // CI may supply its own server; otherwise this suite owns an ephemeral one.
  const server = process.env.BASE_URL ? null : createServer();
  if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = (process.env.BASE_URL || 'http://127.0.0.1:' + server.address().port).replace(/\/+$/, '');
  const origin = new URL(base).origin;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','/opt/pw-browsers/chromium'].find(p=>require('node:fs').existsSync(p)), headless: true, args: ['--no-sandbox'] });
  const demo = Data.createDemoStore({ now: '2026-09-30T15:00:00Z' });
  const admin = await demo.load();
  admin.meta.mode = 'server'; admin.meta.commandsAvailable = true; admin.currentUserId = USER_A;
  admin.accounts[0].name = PRIVATE_ACCOUNT;
  admin.cases[0].subject = PRIVATE_CASE;
  admin.cases[0].messages = [{ id: 'synthetic-private-message', text: PRIVATE_MESSAGE, visibility: 'internal', delivery: 'internal', createdAt: admin.now }];
  const finance = JSON.parse(JSON.stringify(admin)); finance.role = 'finance'; finance.permissions = Data.permissions.finance.slice();
  for (const key of ['leads','cases','incidents','audit','events']) { finance[key] = []; finance.sources[key] = {status:'unavailable',origin:'authorization',updatedAt:null,reason:'forbidden'}; }
  const contexts = [], external = [], pageErrors = [];
  async function page(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); contexts.push(context);
    await context.route('**/*', route => { const url=route.request().url(); if(new URL(url).origin!==origin) {external.push(url); return route.abort();} return route.continue(); });
    await context.addInitScript(({admin,finance,options,userA}) => {
      const state = window.__hqAuthTest = {user:userA,role:'admin',denyRead:!!options.denyRead,denyCommand:false,legacyAdmin:options.legacyAdmin!==false,listeners:[],calls:[]};
      state.emit = (event,id) => { if(id)state.user=id; const session=event==='SIGNED_OUT'?null:{user:{id:state.user}}; state.listeners.slice().forEach(fn=>fn(event,session)); };
      window.MT_supabase = {
        auth: {
          getSession: async () => ({data:{session:{user:{id:state.user}}}}),
          signOut: async () => {state.emit('SIGNED_OUT');return {error:null};},
          onAuthStateChange: fn => {state.listeners.push(fn);return {data:{subscription:{unsubscribe(){state.listeners=state.listeners.filter(x=>x!==fn);}}}};}
        },
        rpc: async (name,args) => {
          state.calls.push({name,args});
          if(name==='hq_sou_admin')return {data:state.legacyAdmin && state.role==='admin'};
          if(name==='hq_ops_snapshot') {
            if(state.denyRead)return {error:{code:'42501',message:'fixture forbidden'}};
            const result=JSON.parse(JSON.stringify(state.role==='finance'?finance:admin)); result.currentUserId=state.user;return {data:result};
          }
          if(name==='hq_ops_command')return state.denyCommand?{error:{code:'42501',message:'fixture forbidden command'}}:{data:{ok:true,id:'synthetic-operation',type:args.p_command.type}};
          return {error:{code:'PGRST202',message:'fixture RPC not installed'}};
        }
      };
    }, {admin,finance,options,userA:USER_A});
    const p = await context.newPage(); p.on('pageerror',e=>pageErrors.push(e.message));
    await p.goto(base+'/apps/hq.html');
    if(!options.denyRead)await p.locator('#hqSearch').waitFor();
    return p;
  }
  async function openPrivateCase(p) {
    await p.locator('#hqSearch').fill(PRIVATE_CASE); await p.locator('#hqSearch').press('Enter');
    await p.locator('dialog[open] [data-search-kind="case"]').click();
    await p.locator('dialog[open]').filter({hasText:PRIVATE_MESSAGE}).waitFor();
  }
  async function cleared(p) {
    await p.getByText('Acesso indisponível ou sessão não autorizada.',{exact:false}).waitFor();
    ok(await p.locator('dialog[open]').count()===0,'gate remove dialogs abertos');
    const text=await p.locator('body').innerText();
    ok(!text.includes(PRIVATE_MESSAGE)&&!text.includes(PRIVATE_CASE)&&!text.includes(PRIVATE_ACCOUNT),'gate remove dados anteriores do DOM');
    ok(await p.locator('.hq-nav').count()===0,'gate nao mantem menus operacionais autorizados');
  }
  try {
    const p1=await page();
    ok(await p1.evaluate(()=>!window.MTStore),'rota real nao carrega store tenant');
    await openPrivateCase(p1);
    await p1.evaluate(id=>window.__hqAuthTest.emit('SIGNED_IN',id),USER_B);
    await cleared(p1);
    ok(!(await p1.locator('body').innerText()).includes('Acesso autorizado'),'troca de usuario nao apresenta autorizacao antiga');

    const p2=await page(); await openPrivateCase(p2);
    await p2.evaluate(()=>{window.__hqAuthTest.role='finance';document.querySelector('#hqRefresh').click();});
    await p2.waitForFunction(()=>document.querySelector('.hq-sidebar-foot')?.textContent.includes('finance'));
    ok(await p2.locator('dialog[open]').count()===0,'downgrade de papel no mesmo usuario fecha detalhe antigo');
    ok(!(await p2.locator('body').innerText()).includes(PRIVATE_MESSAGE),'downgrade remove mensagem interna anterior');
    ok(await p2.locator('.hq-nav [data-nav="support"]').count()===0 && await p2.locator('.hq-nav [data-nav="finance"]').count()===1,'downgrade usa permissoes atuais do servidor');

    const p3=await page(); await openPrivateCase(p3);
    await p3.evaluate(()=>{window.__hqAuthTest.denyRead=true;document.querySelector('#hqRefresh').click();});
    await cleared(p3);
    ok(!(await p3.evaluate(()=>window.__hqAuthTest.calls)).some(x=>x.name==='hq_suporte_lista'),'leitura negada nunca tenta RPC de suporte mutante');

    const p4=await page();
    await p4.locator('.hq-nav [data-nav="finance"]').click();
    await p4.getByRole('button',{name:'Nova despesa',exact:true}).click();
    const form=p4.locator('dialog[open]');
    await form.locator('[name="payee"]').fill('Fornecedor sintetico');
    await form.locator('[name="label"]').fill('Despesa de teste');
    await form.locator('[name="total"]').fill('10,00');
    await form.locator('[name="reason"]').fill('Conferencia de autorizacao');
    await p4.evaluate(()=>{window.__hqAuthTest.denyCommand=true;});
    await form.locator('button[type="submit"]').click();
    await cleared(p4);
    const writes=(await p4.evaluate(()=>window.__hqAuthTest.calls)).filter(x=>x.name==='hq_ops_command');
    ok(writes.length===1 && writes[0].args.p_command.type==='expense.create','comando negado nao repete nem tenta gravacao legada');

    const p5=await page({denyRead:true,legacyAdmin:false}); await cleared(p5);
    ok((await p5.evaluate(()=>window.__hqAuthTest.calls)).every(x=>['hq_sou_admin','hq_ops_snapshot'].includes(x.name)),'staff negado nunca recebe fallback legado');
    ok(external.length===0,'rede externa bloqueada em todos os cenarios');
    ok(pageErrors.length===0,'nenhuma excecao de pagina durante revogacao e descarte');
    console.log(`PASS ${checks} verificacoes HQ auth browser; nenhum backend remoto acessado.`);
  } finally {
    demo.dispose(); for(const context of contexts)await context.close(); await browser.close(); if(server)await new Promise(resolve=>server.close(resolve));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
