import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(new URL('../finance.js',import.meta.url),'utf8');
const {createFinance,validFinanceDay,moneyCents,filterFinance,financeTotals,safeFinanceCSV,installmentAmounts,installmentDay,financeCashEntries}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tests=[],test=(name,fn)=>tests.push({name,fn});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const unescape=value=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const entry=(id,extra={})=>({id,clinic_id:'clinic',owner_id:'owner',patient_id:'p1',kind:'income',title:'Consulta '+id,amount_cents:10001,due_on:'2026-10-11',status:'pending',paid_on:null,method:'pix',note:'',version:1,created_at:'2026-10-01T12:00:00Z',...extra});
export function harness({entries=[entry('e1')],demo=false,role='nutri',rpc,response,uid}={}){
 const state={demo,role,user:{id:role==='nutri'?'owner':'patient'},clinic:{id:'clinic',name:'Clínica',professional_name:'Nutri',crn:'CRN'},selected:'p1',patients:[{id:'p1',clinic_id:'clinic',clinician_id:'owner',name:'Ana'},{id:'p2',clinic_id:'clinic',clinician_id:'owner',name:'Bia'}],finances:entries,records:[],resources:[],financeLedger:{available:false}};
 const nodes=new Map(),queries=[],calls=[],notices=[],downloads=[];let submitted=null,html='',printed='',serial=0,saves=0,epoch=0;
 const parse=body=>{nodes.clear();for(const match of body.matchAll(/<(input)\b([^>]*)>|<(textarea|select)\b([^>]*)>([\s\S]*?)<\/\3>/g)){
  const tag=match[1]||match[3],attrs=match[2]||match[4],content=match[5]||'',id=attrs.match(/\bid="([^"]+)"/)?.[1];if(!id)continue;let value=unescape(attrs.match(/\bvalue="([^"]*)"/)?.[1]||'');
  if(tag==='textarea')value=unescape(content);if(tag==='select'){const options=[...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)],option=options.find(x=>/\bselected\b/.test(x[1]))||options[0];value=unescape(option?.[1].match(/\bvalue="([^"]*)"/)?.[1]||'');}
  nodes.set(id,{value,checked:false,innerHTML:'',textContent:''});
 }if(body.includes('finance-installment-preview'))nodes.set('finance-installment-preview',{innerHTML:'',textContent:''});};
 globalThis.document={querySelector:selector=>nodes.get(selector.slice(1)),querySelectorAll:()=>[]};globalThis.window={open:()=>({opener:{},document:{write:value=>printed=value,close(){}}})};
 const database={from:table=>{const query={table,filters:[],operation:'select'};queries.push(query);const builder={update(values){query.operation='update';query.values=values;return this;},insert(values){query.operation='insert';query.values=values;return this;},eq(key,value){query.filters.push([key,value]);return this;},select(columns){query.select=columns;return this;},then(resolve,reject){return Promise.resolve(response?response(query,state):{data:[{...entries[0],...query.values,version:2}],error:null}).then(resolve,reject);}};return builder;},rpc:async(name,args)=>{calls.push({name,args});return rpc?rpc(name,args,state):{data:null,error:{code:'PGRST202',message:'missing'}};}};
 const H={state:()=>state,database:()=>database,sessionEpoch:()=>epoch,esc,uid:uid||(()=> 'operation-'+(++serial)),today:()=> '2026-10-11',dateLabel:x=>esc(x||''),heading:(_label,title,sub,actions='')=>'<h1>'+title+'</h1>'+sub+actions,modal:(_title,body,submit)=>{html=body;submitted=submit;parse(body);},toast:value=>notices.push(value),render(){},run:fn=>fn(),cacheSnapshot:()=>saves++,errorCheck:result=>{if(result.error)throw Error(result.error.message);return result.data;}};
 const D={pat:id=>state.patients.find(patient=>patient.id===(id||state.selected)),resources:kind=>state.resources.filter(resource=>resource.kind===kind),field:(label,id,value='',type='text',extra='')=>`<label>${label}<input id="${id}" value="${esc(value)}" type="${type}" ${extra}></label>`,area:(label,id,value='',extra='')=>`<label>${label}<textarea id="${id}" ${extra}>${esc(value)}</textarea></label>`,choices:()=>'<select id="x-patient">'+state.patients.map(patient=>'<option value="'+esc(patient.id)+'">'+esc(patient.name)+'</option>').join('')+'</select>',btn:(label,action,id='')=>`<button data-x="${action}" data-id="${esc(id)}">${label}</button>`,card:(title,body,actions='')=>'<section><h2>'+title+'</h2>'+actions+body+'</section>',row:(title,subtitle,actions='')=>esc(title)+' '+esc(subtitle)+actions,empty:text=>text,money:cents=>(Number(cents||0)/100).toFixed(2),download:(...args)=>downloads.push(args),bind(){}};
 const F=createFinance(H,D);return {F,state,nodes,queries,calls,notices,downloads,parse,advanceSession:()=>epoch++,get submit(){return submitted;},get html(){return html;},get printed(){return printed;},get saves(){return saves;}};
}
test('Centavos, datas e parcelas preservam totais e recusam valores inválidos',()=>{
 assert.equal(moneyCents('10,01'),1001);assert.equal(moneyCents('0.29'),29);for(const bad of ['','0','-1','1e3','NaN','1.001','10000000.01'])assert.throws(()=>moneyCents(bad));
 assert(!validFinanceDay('2026-02-29'));assert(validFinanceDay('2024-02-29'));assert.deepEqual(installmentAmounts(10001,3),[3334,3334,3333]);assert.equal(installmentDay('2026-01-31',1),'2026-02-28');assert.equal(installmentDay('2026-01-31',2),'2026-03-31');assert.throws(()=>installmentAmounts(2,3));
});
test('Filtros distinguem caixa, vencimento, competência e atraso parcial sem incluir anulados',()=>{
 const rows=[entry('old',{status:'paid',paid_on:'2026-10-02',due_on:'2026-09-01'}),entry('partial',{due_on:'2026-10-01',received_cents:1000}),entry('void',{status:'void'}),entry('other',{patient_id:'p2'}),entry('competent',{competency_on:'2026-09-10'})];
 assert.deepEqual(filterFinance(rows,{basis:'paid',from:'2026-10-01'},'2026-10-11').map(x=>x.id),['old']);
 assert.deepEqual(filterFinance(rows,{basis:'due',patient:'p1',status:'overdue'},'2026-10-11').map(x=>x.id),['partial']);
 assert.deepEqual(filterFinance(rows,{basis:'competency',from:'2026-09-01'},'2026-10-11').map(x=>x.id),['competent']);
 assert.equal(financeTotals(rows).voidCount,1);
});
test('Caixa usa movimentos reais do período e subtrai devolução mesmo após quitação anterior',()=>{
 const rows=[entry('a',{ledger_managed:true,received_cents:10001,net_paid_cents:8001,refunded_cents:2000,balance_cents:0,status:'paid',paid_on:'2026-09-11'}),entry('b',{ledger_managed:true,received_cents:1000,net_paid_cents:1000,balance_cents:9001})];
 const events=[{entry_id:'a',kind:'payment',amount_cents:10001,occurred_on:'2026-09-11'},{entry_id:'a',kind:'refund',amount_cents:2000,occurred_on:'2026-10-01'},{entry_id:'b',kind:'payment',amount_cents:1000,occurred_on:'2026-10-05'}];
 const projection=financeCashEntries(rows,events,{basis:'paid',from:'2026-10-01',to:'2026-10-31'},'2026-10-11');assert.equal(projection.length,2);assert.equal(financeTotals(projection).incomePaid,-1000);assert.equal(financeTotals(projection).incomePending,0);assert.equal(financeTotals(rows).incomePending,9001);
});
test('CSV neutraliza fórmulas disfarçadas, preserva aspas e quebras',()=>{
 const csv=safeFinanceCSV([['=1+1',' \t@SUM(A1)','\n-2','normal "texto"','linha\nseguinte']]);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=1+1"'));assert(csv.includes('"\' \t@SUM(A1)"'));assert(csv.includes('"\'\n-2"'));assert(csv.includes('"normal ""texto"""'));
});
test('Baixa legada usa versão/status/conta e exige confirmação de uma linha',async()=>{
 const h=harness();await h.F.act('financial-paid','e1');h.nodes.get('finance-confirm-paid').checked=true;await h.submit();const query=h.queries[0];assert.equal(query.select,'*');assert.deepEqual(query.filters,[['id','e1'],['clinic_id','clinic'],['owner_id','owner'],['version',1],['status','pending']]);assert.equal(h.state.finances[0].status,'paid');assert.equal(h.state.finances[0].version,2);
});
test('Zero linhas afetadas nunca confirma baixa nem altera estado local',async()=>{
 const h=harness({response:()=>({data:[],error:null})});await h.F.act('financial-paid','e1');h.nodes.get('finance-confirm-paid').checked=true;await assert.rejects(h.submit,/Nenhum lançamento/);assert.equal(h.state.finances[0].status,'pending');assert.equal(h.notices.length,0);
});
test('Criação legada usa ID do servidor e bloqueia reenvio ambíguo',async()=>{
 const success=harness({entries:[],response:query=>({data:[{id:'server-id',...query.values,version:1}]})});await success.F.act('financial-new','income');success.nodes.get('x-title').value='Consulta';success.nodes.get('x-amount').value='10.00';await success.submit();assert(!('id' in success.queries[0].values));assert.equal(success.state.finances[0].id,'server-id');
 const ambiguous=harness({entries:[],response:()=>({data:null,error:{message:'Conexão interrompida'}})});await ambiguous.F.act('financial-new','income');ambiguous.nodes.get('x-title').value='Consulta';ambiguous.nodes.get('x-amount').value='10';await assert.rejects(ambiguous.submit,/Conexão/);await assert.rejects(ambiguous.submit,/já foi tentado/);assert.equal(ambiguous.queries.length,1);
});
test('Formulário aberto recusa troca de conta e não executa gravação',async()=>{
 const h=harness();await h.F.act('financial-paid','e1');h.nodes.get('finance-confirm-paid').checked=true;h.state.user.id='other';await assert.rejects(h.submit,/conta ou a clínica mudou/);assert.equal(h.queries.length,0);
});
test('Nova sessão do mesmo usuário invalida modal e respostas financeiras tardias',async()=>{
 const h=harness();await h.F.act('financial-paid','e1');h.nodes.get('finance-confirm-paid').checked=true;h.advanceSession();await assert.rejects(h.submit,/conta ou a clínica mudou/);assert.equal(h.queries.length,0);
 const loading=harness({rpc:()=>{loading.advanceSession();return {data:{version:1}};}});await assert.rejects(loading.F.load({defer:true}),/sessão ou a clínica mudou/);assert.equal(loading.state.financeLedger.available,false);
 const saving=harness({rpc:(name,args)=>{saving.advanceSession();return {data:{operation_id:args.p_operation_id,entries:[entry('e1',{ledger_managed:true,version:2,received_cents:1000,balance_cents:9001,net_paid_cents:1000})],events:[]}};}});enableLedger(saving);await saving.F.act('financial-paid','e1');saving.nodes.get('finance-confirm-paid').checked=true;saving.nodes.get('finance-paid-amount').value='10.00';await assert.rejects(saving.submit,/conta ou a clínica mudou/);assert.equal(saving.state.finances[0].received_cents,0);
});
test('Paciente não pode emitir recibo alheio, exportar, alterar ou ver despesa',async()=>{
 const h=harness({role:'patient',entries:[entry('own'),entry('other',{patient_id:'p2'}),entry('expense',{kind:'expense'})]});assert(!h.F.payments().includes('Consulta other'));assert(!h.F.payments().includes('Consulta expense'));
 await assert.rejects(h.F.act('financial-paid','own'),/Somente o profissional/);await assert.rejects(h.F.act('receipt','other'),/indisponível/);await assert.rejects(h.F.act('export-finance'),/profissional/);
});
test('Receita identifica observação compartilhada; recibo exige pagamento e escapa conteúdo',async()=>{
 const h=harness({entries:[entry('e1',{title:'<img src=x>',status:'paid',paid_on:'2026-10-10'})]});await h.F.act('financial-new','income');assert.match(h.html,/paciente tem acesso/);await assert.rejects(h.F.act('financial-void','e1'),/sem pagamentos/);await h.F.act('receipt','e1');assert(!h.html.includes('<img'));assert(h.html.includes('&lt;img'));assert.match(h.html,/Não é documento fiscal/);
 const unpaid=harness();await assert.rejects(unpaid.F.act('receipt','e1'),/lançamento pago/);
});
test('Falha de rede não permite fallback para PATCH legado; função inexistente permite',async()=>{
 const missing=harness();assert.deepEqual(await missing.F.load(),{financeLedger:{available:false}});
 const denied=harness({rpc:()=>({error:{code:'42501',message:'Sem acesso'}})});await assert.rejects(denied.F.load(),/Sem acesso/);assert.equal(denied.queries.length,0);
 const unknown=harness({rpc:()=>({data:{version:9}})});await assert.rejects(unknown.F.load(),/versão do financeiro/);
});
test('Snapshot financeiro é validado e defer não altera estado antes do commit global',async()=>{
 const h=harness({rpc:name=>({data:name==='nutri_finance_capabilities'?{version:1}:{version:1,entries:[entry('ledger',{ledger_managed:true})],events:[]}})});const bundle=await h.F.load({defer:true});assert.equal(h.state.finances[0].id,'e1');assert.equal(bundle.finances[0].id,'ledger');assert.equal(bundle.financeLedger.userId,'owner');
 const other=harness({rpc:name=>({data:name==='nutri_finance_capabilities'?{version:1}:{version:1,entries:[entry('leak',{owner_id:'someone'})],events:[]}})});await assert.rejects(other.F.load(),/não correspondem/);
});
test('Primeiro login real detecta capabilities antes do commit que encerra a demo',async()=>{
 const h=harness({demo:true,rpc:name=>({data:name==='nutri_finance_capabilities'?{version:1}:{version:1,entries:[],events:[]}})});
 const result=await h.F.load({defer:true,context:{userId:'owner',clinic:h.state.clinic,patients:h.state.patients,role:'nutri'}});assert.equal(result.financeLedger.available,true);assert.equal(h.calls.length,2);assert.equal(h.state.demo,true);
});
test('Snapshot com múltiplos contextos carrega somente lançamentos e eventos da clínica escolhida',async()=>{
 const rows=[entry('active'),entry('another',{clinic_id:'another-clinic',patient_id:'another-patient',owner_id:'another-owner'})],events=[{id:'active-event',entry_id:'active'},{id:'another-event',entry_id:'another'}];
 const h=harness({role:'patient',rpc:name=>({data:name==='nutri_finance_capabilities'?{version:1}:{version:1,entries:rows,events}})});await h.F.load();assert.deepEqual(h.state.finances.map(x=>x.id),['active']);assert.deepEqual(h.state.financeLedger.events.map(x=>x.id),['active-event']);
 const pro=harness({rpc:name=>({data:name==='nutri_finance_capabilities'?{version:1}:{version:1,entries:rows,events}})});await pro.F.load();assert.deepEqual(pro.state.finances.map(x=>x.id),['active']);
});
function enableLedger(h,events=[]){h.state.financeLedger={available:true,version:1,userId:h.state.user.id,clinicId:'clinic',events};h.state.finances=h.state.finances.map(entry=>({...entry,ledger_managed:true,received_cents:0,refunded_cents:0,balance_cents:entry.amount_cents,net_paid_cents:0}));}
test('Pagamento parcial usa command idempotente e nunca PATCH financeiro',async()=>{
 const h=harness({rpc:(name,args)=>({data:{operation_id:args.p_operation_id,entries:[entry('e1',{ledger_managed:true,version:2,received_cents:2000,balance_cents:8001,net_paid_cents:2000})],events:[]}})});enableLedger(h);await h.F.act('financial-paid','e1');h.nodes.get('finance-confirm-paid').checked=true;h.nodes.get('finance-paid-amount').value='20.00';await h.submit();await h.submit();
 assert.equal(h.calls.length,2);assert.equal(h.calls[0].args.p_operation_id,h.calls[1].args.p_operation_id);assert.deepEqual(h.calls[0].args.p_command,{action:'pay',entry_id:'e1',expected_version:1,amount_cents:2000,occurred_on:'2026-10-11',method:'pix',reason:''});assert.equal(h.queries.length,0);assert.equal(h.state.finances[0].balance_cents,8001);
});
test('Parcelamento envia soma exata e competência explícita numa única operação',async()=>{
 const h=harness({rpc:(name,args)=>({data:{operation_id:args.p_operation_id,entries:[entry('new',{ledger_managed:true})],events:[]}})});enableLedger(h);await h.F.act('financial-new','income');h.nodes.get('x-title').value='Pacote';h.nodes.get('x-amount').value='100.01';h.nodes.get('x-due').value='2026-01-31';h.nodes.get('finance-competency').value='2026-01-15';h.nodes.get('finance-installments').value='3';await h.submit();
 const command=h.calls[0].args.p_command;assert.deepEqual(command.installments.map(x=>x.amount_cents),[3334,3334,3333]);assert.deepEqual(command.installments.map(x=>x.due_on),['2026-01-31','2026-02-28','2026-03-31']);assert(command.installments.every(x=>x.competency_on==='2026-01-15'));assert.equal(h.queries.length,0);
});
test('Devolução exige conferência, usa CAS e não anula ou reabre cobrança',async()=>{
 const h=harness({rpc:(name,args)=>({data:{operation_id:args.p_operation_id,entries:[entry('e1',{status:'paid',paid_on:'2026-10-10',ledger_managed:true,version:3,received_cents:10001,refunded_cents:2000,net_paid_cents:8001,balance_cents:0})],events:[]}})});enableLedger(h);Object.assign(h.state.finances[0],{status:'paid',paid_on:'2026-10-10',version:2,received_cents:10001,net_paid_cents:10001,balance_cents:0});await h.F.act('financial-refund','e1');h.nodes.get('finance-refund-amount').value='20';h.nodes.get('finance-refund-reason').value='Acordo comercial';await assert.rejects(h.submit,/confirme/i);h.nodes.get('finance-confirm-refund').checked=true;await h.submit();assert.equal(h.calls[0].args.p_command.action,'refund');assert.equal(h.calls[0].args.p_command.expected_version,2);assert.equal(h.state.finances[0].status,'paid');assert.equal(h.state.finances[0].balance_cents,0);
});
test('Recibo de pagamento parcial usa snapshot do evento, mesmo após corrigir cadastro',async()=>{
 const h=harness();enableLedger(h,[{id:'ev',entry_id:'e1',kind:'payment',amount_cents:2000,occurred_on:'2026-10-09',method:'pix',entry_version:2,entry_snapshot:{clinic_name:'Clínica original',patient_name:'Nome original',title:'Condição original',professional_name:'Nutri original',crn:'CRN original'}}]);h.state.clinic.name='Nova clínica';await h.F.act('finance-event-receipt','ev');assert.match(h.html,/Clínica original/);assert.match(h.html,/Condição original/);assert(!h.html.includes('Nova clínica'));assert.match(h.html,/20.00/);
});
test('Pagamento legado mostra snapshot de abertura, sem virar nova baixa ou recibo atual',async()=>{
 const h=harness({entries:[entry('e1',{status:'paid',paid_on:'2026-10-10',title:'Título alterado'})]});enableLedger(h,[{id:'opening',entry_id:'e1',kind:'opening',amount_cents:10001,occurred_on:'2026-10-10',method:'cash',entry_version:1,entry_snapshot:{clinic_name:'Clínica original',patient_name:'Paciente original',title:'Título original'}}]);await h.F.act('receipt','e1');assert.match(h.html,/Registro legado/);await h.F.act('finance-event-receipt','opening');assert.match(h.html,/Título original/);assert(!h.html.includes('Título alterado'));assert.match(h.html,/não registra uma nova baixa/);assert.equal(h.calls.length,0);
});
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){let passed=0;for(const {name,fn} of tests){try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name);throw error;}}console.log(`${passed} checks financeiros passaram.`);}
