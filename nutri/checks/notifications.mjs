import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url),url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const {patientNotifications,createPatientNotifications}=await import(url(read('notifications.js').replace("'./assessment.js'",JSON.stringify(url(read('assessment.js'))))));
const now=Date.parse('2026-10-10T12:00:00Z'),at='2026-10-09T12:00:00Z';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tests=[],test=(name,fn)=>tests.push({name,fn});
function fixture(){
 const state={role:'patient',selected:'p1',user:{id:'u1'},clinic:{id:'c1'},patients:[{id:'p1',clinician_id:'n1'},{id:'p2',clinician_id:'n1'}],
  messages:[{id:'m1',patient_id:'p1',sender_id:'n1',body:'Mensagem <script>',created_at:at}],
  plans:[{id:'pl1',patient_id:'p1',status:'published',version:1,data:{titulo:'Plano atual'}}],
  appointments:[{id:'a1',patient_id:'p1',start_at:'2099-10-11T14:00:00Z',status:'scheduled'}],
  records:[{id:'r1',patient_id:'p1',kind:'assessment',created_by:'n1',visibility:'patient',created_at:at,title:'Avaliação',data:{day:'2026-10-09'}}]};
 return state;
}
function controller(state,storage){
 let body='',renders=0,closed=0;const nodes={};
 const H={state:()=>state,esc,render:()=>renders++,modal:(title,html)=>{body=html;},};
 globalThis.document={querySelector:s=>s==='#modal'?{close:()=>closed++}:nodes[s]||null,querySelectorAll:s=>nodes[s]||[]};
 const N=createPatientNotifications(H,{storage,icon:()=>'<svg aria-hidden="true"></svg>'});
 return {N,nodes,get body(){return body;},get renders(){return renders;},get closed(){return closed;}};
}
test('Only this patient’s published and shared records produce notices',()=>{
 const s=fixture();
 s.messages.push({...s.messages[0],id:'m-other',patient_id:'p2'},{...s.messages[0],id:'own',sender_id:'u1'});
 s.plans.unshift({...s.plans[0],id:'draft',status:'draft'},{...s.plans[0],id:'pl-other',patient_id:'p2'});
 for(const extra of [{id:'private',visibility:'private'},{id:'other',patient_id:'p2'},{id:'archived',data:{archived:true}},{id:'self-reported',created_by:'u1'}])s.records.push({...s.records[0],...extra});
 s.appointments.push({...s.appointments[0],id:'old',start_at:at},{...s.appointments[0],id:'bad',start_at:'invalid'},{...s.appointments[0],id:'a-other',patient_id:'p2'});
 const notices=patientNotifications(s,now);
 assert.equal(notices.length,4);assert.deepEqual(new Set(notices.map(x=>x.page)),new Set(['chat','food','booking','progress']));
 s.selected='missing';assert.deepEqual(patientNotifications(s,now),[]);
 s.selected='p1';s.role='nutri';assert.deepEqual(patientNotifications(s,now),[]);
});
test('Feedback must reference a visible diary and its clinician author',()=>{
 const s=fixture(),journal={id:'j1',patient_id:'p1',kind:'food_journal',visibility:'patient',data:{}},feedback={id:'f1',patient_id:'p1',kind:'nutrition_feedback',visibility:'patient',created_by:'n1',clinician_id:'n1',data:{entryId:'j1',text:'Orientação'}};
 s.records.push(journal,feedback);assert(patientNotifications(s,now).some(x=>x.kind==='feedback'));
 journal.visibility='private';assert(!patientNotifications(s,now).some(x=>x.kind==='feedback'));
 journal.visibility='patient';feedback.created_by='u1';assert(!patientNotifications(s,now).some(x=>x.kind==='feedback'));
 delete feedback.created_by;delete feedback.clinician_id;delete s.patients[0].clinician_id;
 assert(!patientNotifications(s,now).some(x=>x.kind==='feedback'));
});
test('A confirmed request and its linked appointment create one scheduling notice',()=>{
 const s=fixture();s.records.push({id:'request',patient_id:'p1',kind:'appointment_request',visibility:'patient',data:{status:'confirmed',appointmentId:'a1'}});
 assert.equal(patientNotifications(s,now).filter(x=>x.page==='booking').length,1);
 s.records.at(-1).data.status='refused';assert.equal(patientNotifications(s,now).filter(x=>x.page==='booking').length,2);
});
test('Opening a notice escapes content, marks only it read and navigates without a clinical write',()=>{
 const s=fixture(),original=JSON.stringify(s),writes=[],h=controller(s,{getItem:()=>null,setItem:(k,v)=>writes.push([k,v])});
 assert.match(h.N.button(),/aria-haspopup="dialog"/);h.N.open();
 assert.match(h.body,/Mensagem &lt;script&gt;/);assert(!h.body.includes('<script>'));
 assert.equal(JSON.stringify(s),original);assert.equal(writes.length,0);
 const message=h.N.entries().find(x=>x.page==='chat'),button={dataset:{noticeId:message.id}};
 h.nodes['[data-notice-id]']=[button];h.N.bind();button.onclick();
 assert.equal(s.page,'chat');assert.equal(h.closed,1);assert.equal(h.renders,1);
 assert.equal(h.N.entries().filter(x=>!x.unread).length,1);
 assert.equal(writes.length,1);assert(!writes[0][1].includes('Mensagem'));assert(!writes[0][1].includes('script'));
 delete s.page;assert.equal(JSON.stringify(s),original);
});
test('Read state survives reload, isolates accounts and patients, and recognizes revised plans',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},s=fixture(),h=controller(s,storage);
 h.nodes['#notifications-read-all']={};h.N.bind();h.nodes['#notifications-read-all'].onclick();
 assert(h.N.entries().every(x=>!x.unread));assert(!h.N.button().includes('notification-badge'));
 assert(controller(s,storage).N.entries().every(x=>!x.unread));
 s.plans[0].version++;assert(h.N.entries().find(x=>x.page==='food').unread);
 s.user.id='u2';assert(h.N.entries().every(x=>x.unread));
 s.user.id='u1';s.selected='p2';s.messages.push({...s.messages[0],patient_id:'p2'});
 assert(h.N.entries().every(x=>x.unread));
});
test('Demo read state remains in memory and blocked storage does not break notifications',()=>{
 for(const demo of [true,false]){
  let attempts=0;const s=fixture();s.demo=demo;
  const h=controller(s,{getItem(){attempts++;throw Error('blocked');},setItem(){attempts++;throw Error('blocked');}});
  h.nodes['#notifications-read-all']={};h.N.bind();h.nodes['#notifications-read-all'].onclick();
  assert(h.N.entries().every(x=>!x.unread));assert.equal(attempts,demo?0:2);
 }
});
test('Empty, busy and stale notices remain harmless',()=>{
 const s=fixture();s.messages=[];s.plans=[];s.appointments=[];s.records=[];
 const h=controller(s,{getItem:()=>'{bad json'});h.N.open();assert.match(h.body,/Nenhuma novidade/);assert(!h.N.button().includes('notification-badge'));
 const b={dataset:{noticeId:'stale'}};h.nodes['[data-notice-id]']=[b];h.N.bind();b.onclick();assert.equal(h.renders,0);
 s.role='nutri';assert.equal(h.N.button(),'');
});
let failed=0;for(const {name,fn} of tests){try{fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
console.log(`${tests.length-failed}/${tests.length} notification checks passed.`);if(failed)process.exitCode=1;
