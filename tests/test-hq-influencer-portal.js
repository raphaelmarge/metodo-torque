/* Real, ephemeral PGlite authorization tests plus mocked Auth/RPC contract.
 * No network, production credentials, Auth user creation or email sending. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('./runtime/node_modules/@electric-sql/pglite');
const Portal=require('../assets/hq-influencer-portal.js');
const proposal=fs.readFileSync(path.join(__dirname,'../supabase/hq-influencer-portal-proposal.sql'),'utf8');
const ledger=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260930193716_hq_referrals_ledger.sql'),'utf8');
let checks=0;
async function test(name,fn){await fn();console.log('ok '+(++checks)+' - '+name);}
async function rejects(fn,code){await assert.rejects(fn,e=>e.code===code);}

(async()=>{
 const db=new PGlite();
 const ids={admin:randomUUID(),a:randomUUID(),b:randomUUID(),other:randomUUID(),unverified:randomUUID()};
 const sessions=Object.fromEntries(Object.keys(ids).map(k=>[k,randomUUID()]));
 let partnerA,partnerB,inviteA,inviteB,customerA=randomUUID(),customerB=randomUUID();
 async function who(key,role='authenticated'){
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(key?{sub:ids[key],session_id:sessions[key]}:{})]);
   if(role!=='owner')await db.exec('set role '+role);
 }
 async function rpc(name,input){return (await db.query('select public.'+name+'('+(input===undefined?'':'$1')+') result',input===undefined?[]:[input])).rows[0].result;}
 async function scalar(sql){return Object.values((await db.query(sql)).rows[0])[0];}
 const expiry=new Date(Date.now()+7*86400000).toISOString();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;grant usage on schema auth to anon,authenticated,service_role;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
   create table public.saas_admins(user_id uuid primary key);alter table public.saas_admins enable row level security;
   create function public.hq_sou_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.saas_admins where user_id=auth.uid())$$;`);
  for(const key of Object.keys(ids)){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[ids[key],key+'@example.test',key==='unverified'?null:'2026-01-01T12:00:00Z']);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[key],ids[key]]);
  }
  await db.query('insert into public.saas_admins values($1)',[ids.admin]);
  await db.exec(ledger);await db.exec(proposal);
  await who('admin');
  partnerA=await rpc('hq_referrals_save_partner',{name:'Parceiro A fictício',contact:'PRIVATE CONTACT A',status:'active'});
  partnerB=await rpc('hq_referrals_save_partner',{name:'Parceiro B fictício',contact:'PRIVATE CONTACT B',status:'active'});
  const couponA=await rpc('hq_referrals_save_coupon',{partnerId:partnerA.id,code:'EXAMPLE_A',status:'ready'});
  const couponB=await rpc('hq_referrals_save_coupon',{partnerId:partnerB.id,code:'EXAMPLE_B',status:'ready'});
  await who(null,'owner');
  for(const [customer,partner,coupon,status] of [[customerA,partnerA,couponA,'paid'],[customerB,partnerB,couponB,'pending']]){
   await db.query("insert into hq_referrals_private.customers(id,revision,context,core_state,partner_id,coupon_id,status) values($1,1,$2,'{}',$3,$4,'paid')",[customer,{customerLabel:'SECRET PERSONAL NAME',email:'secret-personal@example.test',health:'SECRET HEALTH'},partner.id,coupon.id]);
   await db.query("insert into hq_referrals_private.commissions(customer_id,partner_id,coupon_id,core_id,core_entry,status,amount_cents,claimable_cents,paid_cents,eligible_at) values($1,$2,$3,$4,'{}',$5,1996,1996,$6,now())",[customer,partner.id,coupon.id,'internal-'+customer,status,status==='paid'?1996:0]);
  }
  await db.query('insert into hq_referrals_private.payments(partner_id,amount_cents,reference,operation_id,actor_id) values($1,1996,$2,$3,$4)',[partnerA.id,'SECRET BANK REFERENCE',randomUUID(),ids.admin]);
  await test('anon e sessão ausente não leem portal nem preparam convite',async()=>{
   await who(null,'anon');await rejects(()=>rpc('influencer_portal_snapshot'),'42501');await rejects(()=>rpc('influencer_accept_invite'),'42501');
   await who(null);await rejects(()=>rpc('influencer_portal_snapshot'),'IP401');
   await who('other');await rejects(()=>rpc('hq_influencer_prepare_invite',{}),'IP403');await rejects(()=>rpc('hq_influencer_admin_snapshot'),'IP403');
  });
  await test('admin prepara convite, sem criar Auth ou enviar e-mail',async()=>{
   await who('admin');
   inviteA=await rpc('hq_influencer_prepare_invite',{partnerId:partnerA.id,email:' A@EXAMPLE.TEST ',expiresAt:expiry,reason:'Piloto autorizado'});
   inviteB=await rpc('hq_influencer_prepare_invite',{partnerId:partnerB.id,email:'b@example.test',expiresAt:expiry,reason:'Piloto autorizado'});
   assert.equal(inviteA.email,'a@example.test');assert.equal(inviteA.delivery,'unavailable');assert.equal(inviteA.authUserCreated,false);
   const adm=await rpc('hq_influencer_admin_snapshot');assert.equal(adm.partners.length,2);assert.equal(adm.invites.length,2);assert.equal(adm.deliveryAvailable,false);
   await who(null,'owner');assert.equal(await scalar('select count(*)::int from auth.users'),5);
  });
  await test('e-mail cruzado, não confirmado e metadata não concedem vínculo',async()=>{
   await who('other');await rejects(()=>rpc('influencer_accept_invite'),'IP403');
   await who('unverified');await rejects(()=>rpc('influencer_accept_invite'),'IP403');
   await who(null,'owner');await db.query("update auth.users set raw_user_meta_data=$1 where id=$2",[{partnerId:partnerA.id,email:'a@example.test',role:'admin'},ids.other]);
   await who('other');await rejects(()=>rpc('influencer_accept_invite'),'IP403');await rejects(()=>rpc('influencer_portal_snapshot'),'IP403');
  });
  await test('aceite deriva parceiro do e-mail Auth, sem argumento de parceiro',async()=>{
   await who('a');assert.deepEqual(await rpc('influencer_accept_invite'),{accepted:true});assert.deepEqual(await rpc('influencer_accept_invite'),{accepted:true});
   await who('b');assert.deepEqual(await rpc('influencer_accept_invite'),{accepted:true});
   await assert.rejects(()=>db.query('select public.influencer_portal_snapshot($1::uuid)',[partnerA.id]),e=>e.code==='42883');
  });
  await test('A/B leem apenas sua projeção, sem contatos/cliente/contexto/referência bancária',async()=>{
   await who('a');const a=Portal.validateSnapshot(await rpc('influencer_portal_snapshot'));
   await who('b');const b=Portal.validateSnapshot(await rpc('influencer_portal_snapshot'));
   assert.equal(a.partner.displayName,'Parceiro A fictício');assert.equal(b.partner.displayName,'Parceiro B fictício');
   assert.equal(a.balances.paidCents,1996);assert.equal(b.balances.paidCents,0);assert.equal(b.balances.pendingCents,1996);
   assert.deepEqual(a.coupons.map(c=>c.code),['EXAMPLE_A']);assert.deepEqual(b.coupons.map(c=>c.code),['EXAMPLE_B']);
   assert.equal(a.counts.attributed,1);assert.equal(a.counts.firstPaymentsAfterTrial,1);assert.equal(a.payments.length,1);assert.equal(b.payments.length,0);
   const serialized=JSON.stringify(a)+JSON.stringify(b);for(const forbidden of ['SECRET','PRIVATE CONTACT',customerA,customerB,'example.test','customerLabel','customerId','partnerId','actor_id'])assert.equal(serialized.includes(forbidden),false,forbidden);
  });
  await test('parceiro não lê/escreve tabelas, convites ou funções privadas de identidade',async()=>{
   await who('a');
   for(const table of ['hq_influencer_private.invites','hq_influencer_private.memberships','hq_referrals_private.customers','hq_referrals_private.commissions'])await rejects(()=>db.query('select * from '+table),'42501');
   await rejects(()=>db.query('select hq_influencer_private.identity()'),'42501');
   await rejects(()=>rpc('hq_influencer_list_invites'),'IP403');await rejects(()=>rpc('hq_influencer_revoke_access',{inviteId:inviteB.id,reason:'attack'}),'IP403');
  });
  await test('payload extra, convite duplicado e prazo inválido são recusados',async()=>{
   await who('admin');
   await rejects(()=>rpc('hq_influencer_prepare_invite',{partnerId:partnerA.id,email:'x@example.test',expiresAt:expiry,reason:'x',userId:ids.other}),'IP400');
   await rejects(()=>rpc('hq_influencer_prepare_invite',{partnerId:partnerA.id,email:'x@example.test',expiresAt:expiry,reason:'x'}),'IP409');
   await rejects(()=>rpc('hq_influencer_prepare_invite',{partnerId:partnerA.id,email:'x@example.test',expiresAt:'2020-01-01T00:00:00Z',reason:'x'}),'IP400');
  });
  await test('mudança de e-mail confirmado não herda acesso de outro endereço',async()=>{
   await who(null,'owner');await db.query('update auth.users set email=$1 where id=$2',['changed@example.test',ids.a]);
   await who('a');await rejects(()=>rpc('influencer_portal_snapshot'),'IP403');
   await who(null,'owner');await db.query('update auth.users set email=$1 where id=$2',['a@example.test',ids.a]);
  });
  await test('sessão revogada/expirada e parceiro pausado bloqueiam consulta',async()=>{
   await who(null,'owner');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions.a]);
   await who('a');await rejects(()=>rpc('influencer_portal_snapshot'),'IP401');
   await who(null,'owner');await db.query('update auth.sessions set not_after=null where id=$1',[sessions.a]);await db.query("update hq_referrals_private.partners set status='paused' where id=$1",[partnerA.id]);
   await who('a');await rejects(()=>rpc('influencer_portal_snapshot'),'IP403');
   await who(null,'owner');await db.query("update hq_referrals_private.partners set status='active' where id=$1",[partnerA.id]);await db.query('delete from auth.sessions where id=$1',[sessions.a]);
   await who('a');await rejects(()=>rpc('influencer_portal_snapshot'),'IP401');
   await who(null,'owner');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions.a,ids.a]);
  });
  await test('revogação administrativa imediata preserva comissões e auditoria',async()=>{
   await who('admin');assert.deepEqual(await rpc('hq_influencer_revoke_access',{inviteId:inviteA.id,reason:'Encerramento autorizado'}),{revoked:true});
   await who('a');await rejects(()=>rpc('influencer_portal_snapshot'),'IP403');await rejects(()=>rpc('influencer_accept_invite'),'IP403');
   await who('b');assert.equal((await rpc('influencer_portal_snapshot')).partner.displayName,'Parceiro B fictício');
   await who(null,'owner');assert.equal(await scalar('select count(*)::int from hq_referrals_private.commissions'),2);await rejects(()=>db.query('delete from hq_influencer_private.audit'),'IP403');
  });
  await test('convite expirado não permite novo vínculo e exige revogação explícita',async()=>{
   await who('admin');const invite=await rpc('hq_influencer_prepare_invite',{partnerId:partnerA.id,email:'other@example.test',expiresAt:expiry,reason:'Novo piloto'});
   await who(null,'owner');await db.query("update hq_influencer_private.invites set expires_at=now()-interval '1 second' where id=$1",[invite.id]);
   await who('other');await rejects(()=>rpc('influencer_accept_invite'),'IP403');
   await who('admin');await rejects(()=>rpc('hq_influencer_prepare_invite',{partnerId:partnerA.id,email:'other@example.test',expiresAt:expiry,reason:'Retry'}),'IP409');
   await rpc('hq_influencer_revoke_access',{inviteId:invite.id,reason:'Convite expirado substituído'});
  });
  await test('campanha permanece inativa e proposta não concede execução anon/service',async()=>{
   await who('b');assert.equal((await rpc('influencer_portal_snapshot')).campaign.enabled,false);
   await who(null,'service_role');await rejects(()=>rpc('influencer_portal_snapshot'),'42501');
   await who(null,'owner');assert.equal(await scalar("select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='hq_influencer_private' and c.relkind='r'"),true);
  });
  await test('cliente browser recusa payload inesperado do publicador/servidor',async()=>{
   const valid=Portal.demoSnapshot();const extra=structuredClone(valid);extra.customers=[{name:'SECRET'}];assert.throws(()=>Portal.validateSnapshot(extra),/unexpected_payload/);
   const nested=structuredClone(valid);nested.commissions[0].customerId='SECRET';assert.throws(()=>Portal.validateSnapshot(nested),/unexpected_payload/);
   const enabled=structuredClone(valid);enabled.availability.automaticTransfer=true;assert.throws(()=>Portal.validateSnapshot(enabled),/unsupported_live/);
   let calls=[];const mock={auth:{getUser:async()=>({data:{user:{id:ids.a}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:extra};}};
   await assert.rejects(()=>Portal.createClient(mock).load(),/unexpected_payload/);assert.deepEqual(calls,[['influencer_portal_snapshot',undefined]]);
  });
  await test('cliente não chama RPC sem login, não usa parceiro da URL e não envia convite',async()=>{
   let calls=0;const mock={auth:{getUser:async()=>({data:{user:null}})},rpc:async()=>{calls++;}};
   await assert.rejects(()=>Portal.createClient(mock).load(),/auth_required/);assert.equal(calls,0);
   assert.equal(proposal.includes('inviteUserByEmail'),false);assert.equal(proposal.includes('raw_user_meta_data'),false);
   const html=fs.readFileSync(path.join(__dirname,'../apps/influencer.html'),'utf8');assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/cloud-config|supabase\.js/);
  });
  await test('render escapa conteúdo e demonstração permanece identificada',async()=>{
   const sample=Portal.demoSnapshot();sample.partner.displayName='<img src=x onerror=alert(1)>';
   const html=Portal.renderSnapshot(sample,true);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('valores fictícios'));assert.ok(html.includes('Campanha inativa'));
  });
  await browserChecks();
  console.log(checks+' grupos passaram em PGlite efêmero, navegador e mocks. Sem acesso externo.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

async function browserChecks(){
 const http=require('node:http');
 let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('./ci/node_modules/playwright').chromium;}
 const routes={
  '/apps/influencer.html':['text/html','../apps/influencer.html'],
  '/assets/hq-influencer-portal.js':['application/javascript','../assets/hq-influencer-portal.js'],
  '/assets/hq-influencer-portal.css':['text/css','../assets/hq-influencer-portal.css']
 };
 const server=http.createServer((req,res)=>{const route=routes[new URL(req.url,'http://localhost').pathname];if(!route){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':route[0],'Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,route[1])));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const windowsChrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:fs.existsSync(windowsChrome)?{executablePath:windowsChrome}:{})});
 try{
  await test('navegador: demo explícita, mobile320 e zero consultas externas',async()=>{
   const context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block'}),outside=[];
   await context.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')){outside.push(route.request().url());return route.abort();}return route.continue();});
   const page=await context.newPage();await page.goto(base+'/apps/influencer.html');await page.getByRole('heading',{name:'Seu portal está em preparação'}).waitFor();
   assert.equal(await page.locator('input[type=password]').count(),0);await page.getByRole('button',{name:'Conhecer a demonstração'}).click();
   await page.getByRole('heading',{name:'Parceiro de demonstração'}).waitFor();assert.match(await page.locator('body').innerText(),/valores fictícios/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
   assert.deepEqual(outside,[]);await page.getByRole('button',{name:'Sair da demonstração'}).click();await page.getByRole('heading',{name:'Seu portal está em preparação'}).waitFor();
   await context.close();
  });
  await test('navegador: admin prepara vínculo local e envio permanece indisponível',async()=>{
   const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
   const page=await context.newPage();await page.goto(base+'/apps/influencer.html');
   await page.evaluate(()=>{
    const partnerId='10000000-0000-4000-8000-000000000001',invites=[];window.__calls=[];
    const target=document.createElement('div');target.id='adminTest';document.body.appendChild(target);
    const mock={auth:{getUser:async()=>({data:{user:{id:'fixture'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name,args)=>{
     window.__calls.push({name,args});if(name==='hq_influencer_admin_snapshot')return {data:{partners:[{id:partnerId,name:'Parceiro teste'}],invites,deliveryAvailable:false}};
     if(name==='hq_influencer_prepare_invite'){const i={id:'20000000-0000-4000-8000-000000000001',partnerId,email:args.p_input.email,status:'pending',expiresAt:args.p_input.expiresAt,createdAt:new Date().toISOString(),delivery:'unavailable'};invites.push(i);return {data:{...i,authUserCreated:false}};}
     return {error:{code:'IP403'}};
    }};window.HQInfluencerPortal.mountAdmin(target,mock);
   });
   await page.getByRole('heading',{name:'Acesso dos influencers'}).waitFor();await page.locator('#adminTest input[name=email]').fill('invite@example.test');
   await page.locator('#adminTest input[name=expiresAt]').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await page.locator('#adminTest input[name=reason]').fill('Piloto sintético');
   assert.equal(await page.getByRole('button',{name:'Enviar convite · serviço pendente'}).isDisabled(),true);
   await page.getByRole('button',{name:'Preparar convite'}).click();await page.getByText('Convite preparado. Nenhum e-mail foi enviado e nenhuma conta foi criada.',{exact:true}).waitFor();
   assert.equal((await page.evaluate(()=>window.__calls.filter(x=>x.name==='hq_influencer_prepare_invite'))).length,1);await context.close();
  });
  await test('navegador: resposta atrasada não repõe extrato após logout',async()=>{
   const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();await page.goto(base+'/apps/influencer.html');
   await page.evaluate(()=>{
    let release;window.__pending=new Promise(resolve=>{release=resolve;});window.__release=release;
    const client={auth:{getUser:async()=>({data:{user:{id:'fixture'}}}),onAuthStateChange:fn=>{window.__auth=fn;return {data:{subscription:{unsubscribe(){}}}};}},rpc:async()=>({data:await window.__pending})};
    window.HQInfluencerPortal.mount(document.getElementById('influencerPortal'),{enabled:true,client});
   });
   await page.getByRole('button',{name:'Já entrei · consultar acesso'}).click();await page.getByText('Consultando seu acesso…',{exact:true}).waitFor();
   await page.evaluate(()=>{window.__auth('SIGNED_OUT');window.__release(window.HQInfluencerPortal.demoSnapshot());});
   await page.getByRole('heading',{name:'Entrar no portal'}).waitFor();await page.waitForTimeout(50);assert.equal(await page.getByRole('heading',{name:'Parceiro de demonstração'}).count(),0);await context.close();
  });
  await test('navegador: troca A→B limpa extrato e admin antes de reautorizar',async()=>{
   const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();await page.goto(base+'/apps/influencer.html');
   await page.evaluate(()=>{
    window.__uid='A';window.__listeners=[];window.__held=[];
    const client={auth:{getUser:async()=>({data:{user:{id:window.__uid}}}),onAuthStateChange:fn=>{window.__listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};}},rpc:async(name)=>{
     if(window.__uid==='B')await new Promise(resolve=>{window.__held.push(resolve);});
     if(name==='hq_influencer_admin_snapshot')return window.__uid==='A'?{data:{partners:[{id:'10000000-0000-4000-8000-000000000001',name:'ADMIN A ONLY'}],invites:[],deliveryAvailable:false}}:{error:{code:'IP403'}};
     const s=window.HQInfluencerPortal.demoSnapshot();s.partner.displayName='PARCEIRO '+window.__uid;return {data:s};
    }};window.HQInfluencerPortal.mount(document.getElementById('influencerPortal'),{enabled:true,client});
    const admin=document.createElement('div');admin.id='adminSwap';document.body.appendChild(admin);window.HQInfluencerPortal.mountAdmin(admin,client);
   });
   await page.getByRole('button',{name:'Já entrei · consultar acesso'}).click();await page.getByRole('heading',{name:'PARCEIRO A'}).waitFor();await page.getByRole('heading',{name:'Acesso dos influencers'}).waitFor();
   const cleared=await page.evaluate(()=>{window.__uid='B';window.__listeners.forEach(fn=>fn('SIGNED_IN',{user:{id:'B'}}));return !document.body.textContent.includes('PARCEIRO A')&&!document.body.textContent.includes('ADMIN A ONLY');});assert.equal(cleared,true);
   // Both loaders are intentionally held; no statement may remain visible.
   await page.waitForTimeout(25);assert.equal(await page.getByRole('heading',{name:'PARCEIRO A'}).count(),0);
   await page.evaluate(()=>window.__held.splice(0).forEach(resolve=>resolve()));await page.getByRole('heading',{name:'PARCEIRO B'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Acesso dos influencers'}).count(),0);
   const refreshed=await page.evaluate(()=>{window.__listeners.forEach(fn=>fn('TOKEN_REFRESHED',{user:{id:'B'}}));return !document.body.textContent.includes('PARCEIRO A')&&!document.body.textContent.includes('ADMIN A ONLY');});assert.equal(refreshed,true);
   await context.close();
  });
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
