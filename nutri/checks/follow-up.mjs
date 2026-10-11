import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.TZ='America/Sao_Paulo';
const source=fs.readFileSync(new URL('../follow-up.js',import.meta.url),'utf8');
const {followDay,questionnairePeriod,diaryReview,reviewQueue,followupReport,patientTimeline,checkinSignature,createFollowUp}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const day='2026-10-11', patient={id:'a',clinic_id:'clinic',clinician_id:'nutri',name:'Ana'}, other={id:'b',clinic_id:'clinic',clinician_id:'nutri',name:'Bruno'};
const record=(id,kind,data={},extra={})=>({id,kind,patient_id:'a',version:1,visibility:'patient',created_at:day+'T12:00:00Z',data,...extra});
const base=()=>({role:'nutri',clinic:{id:'clinic'},patients:[patient,other],records:[],resources:[],plans:[{patient_id:'a',status:'published',data:{}},{patient_id:'b',status:'published',data:{}}],logs:[],appointments:[]});
const tests=[], test=(title,fn)=>tests.push({title,fn});
test('Dates reject absent and impossible calendar values and use local time',()=>{
 assert.equal(followDay(null),'');assert.equal(followDay('2026-02-30'),'');assert.equal(followDay('bad'),'');assert.equal(followDay('2026-10-12T01:00:00Z'),day);
});
test('Questionnaires keep exact version and recurring period boundaries',()=>{
 const assignment=record('form','questionnaire_assignment',{availableOn:'2026-10-01',intervalDays:7});
 assert.equal(questionnairePeriod(assignment,'2026-10-07'),'2026-10-01');assert.equal(questionnairePeriod(assignment,'2026-10-08'),'2026-10-08');assert.equal(questionnairePeriod(assignment,'2026-09-30'),null);
 const state=base();state.records=[assignment,record('response','form_response',{assignmentId:'form',assignmentVersion:1,period:'2026-10-01'})];
 assert(reviewQueue(state,day,day).some(x=>x.type==='questionnaire'));
 state.records[1].data.period='2026-10-08';assert(!reviewQueue(state,day,day).some(x=>x.type==='questionnaire'));
 assignment.version=2;assert(reviewQueue(state,day,day).some(x=>x.type==='questionnaire'));
});
test('Diary review requires the owning clinician and exact entry version; older feedback remains visible',()=>{
 const entry=record('food','food_journal',{day},{version:2});
 const old=record('feedback','nutrition_feedback',{entryId:'food',entryVersion:1,text:'Original'},{created_by:'nutri'});
 assert.equal(diaryReview(entry,[old],patient).status,'changed');
 const forged={...old,id:'forged',created_by:'other',data:{...old.data,entryVersion:2}};
 assert.equal(diaryReview(entry,[forged],patient).status,'pending');
 const current={...forged,created_by:'nutri'};
 assert.equal(diaryReview(entry,[old,current],patient).status,'reviewed');
 assert.equal(diaryReview(entry,[{...current,patient_id:'b'}],patient).status,'pending');
 assert.equal(diaryReview(entry,[{...current,data:{...current.data,archived:true}}],patient).status,'pending');
 assert.equal(diaryReview(entry,[{...current,created_by:undefined}],{}).status,'pending');
});
test('Queue is derived without mutating data, isolates clinic/patient and suppresses reviewed versions only',()=>{
 const state=base();state.patients.push({id:'foreign',clinic_id:'another'});
 state.records=[record('meal','food_journal',{day}),record('foreign','food_journal',{day},{patient_id:'foreign'}),record('archived','food_journal',{day,archived:true}),record('response','form_response',{})];
 state.resources.push({kind:'settings',data:{type:'follow_up_review',patientId:'a',recordId:'response',recordVersion:1}});
 const before=JSON.stringify(state);assert.deepEqual(reviewQueue(state,day,day).map(x=>x.id),['meal']);assert.equal(JSON.stringify(state),before);
 state.records[3].version=2;assert(reviewQueue(state,day,day).some(x=>x.type==='response'));
});
test('Queue prioritizes changed food records and distinguishes paused patients and scheduled returns',()=>{
 const state=base();state.plans=[];state.resources=[{kind:'settings',data:{type:'patient_stage',patientId:'b',status:'paused',reviewOn:'2026-10-01'}}];
 state.records=[record('meal','food_journal',{day}),record('feedback','nutrition_feedback',{entryId:'meal',entryVersion:0},{created_by:'nutri'})];
 state.appointments=[{id:'tomorrow',patient_id:'a',start_at:'2026-10-12T12:00:00Z',status:'scheduled'},{id:'cancel',patient_id:'a',start_at:'2026-10-12T13:00:00Z',status:'cancelled'}];
 const queue=reviewQueue(state,day,day);assert.equal(queue[0].type,'diary');assert.equal(queue[0].title,'Rever refeição editada');assert(queue.some(x=>x.type==='plan'&&x.patientId==='a'));assert(!queue.some(x=>x.type==='plan'&&x.patientId==='b'));assert(queue.some(x=>x.id==='tomorrow'));assert(!queue.some(x=>x.id==='cancel'));
});
test('A draft identical to the published plan is not presented as a pending review',()=>{const state=base();state.plans.push({patient_id:'a',status:'draft',data:{}});assert(!reviewQueue(state,day,day).some(x=>x.type==='plan'));state.plans.at(-1).data={titulo:'Changed'};assert(reviewQueue(state,day,day).some(x=>x.type==='plan'));});
test('Check-in review becomes pending again after data changes and excludes water-only logs',()=>{
 const state=base(),log={patient_id:'a',day,note:'Rotina',sleep:0,weight:null};state.logs=[log,{patient_id:'b',day,water_ml:250}];
 state.resources=[{kind:'settings',data:{type:'checkin_review',patientId:'a',day,signature:checkinSignature(log)}}];
 assert(!reviewQueue(state,day,day).some(x=>x.type==='checkin'));log.note='Atualizada';assert.equal(reviewQueue(state,day,day).filter(x=>x.type==='checkin').length,1);
});
test('Suggested return uses the latest completed consultation and ignores drafts and superseded copies',()=>{
 const state=base();state.records=[record('first','session',{status:'completed',returnOn:'2026-10-12'},{created_at:'2026-10-01T12:00:00Z'}),record('correction','session',{status:'completed',returnOn:'2026-10-14',supersedesId:'first'},{created_at:'2026-10-02T12:00:00Z'}),record('draft','session',{status:'draft',returnOn:'2026-10-11'})];
 let returns=reviewQueue(state,day,day).filter(x=>x.type==='return');assert.equal(returns.length,1);assert.equal(returns[0].date,'2026-10-14');assert.equal(returns[0].id,'correction');assert.equal(state.appointments.length,0);
 state.resources.push({kind:'settings',data:{type:'patient_stage',patientId:'a',reviewOn:'2026-10-14'}});returns=reviewQueue(state,day,day).filter(x=>x.type==='return');assert.equal(returns.length,1);
});
test('Reports respect period, scope, distinct denominators and absent dates; missing reads are not zero',()=>{
 const state=base();state.records=[record('meal','food_journal',{day}),record('meal2','food_journal',{day},{patient_id:'b'}),record('future','food_journal',{day:'2026-10-12'}),record('missing','assessment',{}, {created_at:null}),record('foreign','food_journal',{day},{patient_id:'not-loaded'}),record('archived','food_journal',{day,archived:true})];
 state.appointments=[{patient_id:'a',start_at:'2026-10-11T12:00:00Z',status:'completed'},{patient_id:'a',start_at:'2026-10-11T13:00:00Z',status:'cancelled'},{patient_id:'a',start_at:'2026-10-12T14:00:00Z',status:'scheduled'}];
 const report=followupReport(state,day,day);assert.equal(report.diary,2);assert.equal(report.patientCount,2);assert.equal(report.patientsWithDiary,2);assert.equal(report.completed,1);assert.equal(report.cancelled,1);assert.equal(report.scheduled,0);assert.equal(report.undated,1);assert.equal(report.assessments,0);
 assert.equal(followupReport(state,day,day,'a').diary,1);assert.equal(followupReport({...state,records:undefined},day,day),null);assert.equal(followupReport({...state,loadError:'Network error'},day,day),null);assert.equal(reviewQueue({...state,loading:true},day),null);assert.equal(followupReport(state,'2026-10-12',day),null);
});
test('Timeline preserves record/version and private labels within the selected patient',()=>{
 const state=base();state.records=[record('note','clinical_note',{},{title:'Privado',visibility:'private',version:3}),record('other','session',{}, {patient_id:'b'}),record('meal','food_journal',{day:'2026-10-10'})];
 const rows=patientTimeline(state,'a');assert.equal(rows.length,2);assert.equal(rows[0].id,'note');assert.match(rows[0].detail,/versão 3 · privado/);assert.deepEqual(patientTimeline(state,'not-loaded'),[]);
});
test('Contextual shortcuts select their patient and keep agenda date and finance filters',async()=>{
 const state=base();state.selected='a';state.page='overview';let finance,agenda,edited,syncedPatient,rendered=0;
 const H={state:()=>state,esc:String,today:()=>day,render:()=>rendered++,syncEditor(){syncedPatient=state.selected;},openEditor:id=>edited=id};
 const U=createFollowUp(H,{pat:id=>state.patients.find(x=>x.id===(id||state.selected)),financeForPatient:id=>finance=id,scheduleForPatient:(id,date)=>agenda={id,date}});
 state.page='editor';await U.openPage('journal','b');assert.equal(syncedPatient,'a');assert.equal(state.selected,'b');assert.equal(state.page,'journal');assert.equal(rendered,1);
 await U.openPage('appointments','a','2026-10-15');assert.deepEqual(agenda,{id:'a',date:'2026-10-15'});
 await U.openPage('finance','b');assert.equal(finance,'b');await U.openPage('editor','a');assert.equal(edited,'a');
 await assert.rejects(()=>U.openPage('journal','foreign'),/não está disponível/);
});
let failed=0;for(const {title,fn} of tests)try{await fn();console.log('PASS '+title);}catch(error){failed++;console.error('FAIL '+title+'\n'+String(error.stack).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[module]'));}
console.log(`${tests.length-failed}/${tests.length} follow-up checks passed.`);if(failed)process.exitCode=1;
