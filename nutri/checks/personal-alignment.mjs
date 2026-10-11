import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.TZ='America/Sao_Paulo';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const root=new URL('../',import.meta.url);
const assessment=url(fs.readFileSync(new URL('assessment.js',root),'utf8'));
const care=url(fs.readFileSync(new URL('care-progress.js',root),'utf8'));
const schedule=url(fs.readFileSync(new URL('schedule.js',root),'utf8').replace("'./assessment.js'",JSON.stringify(assessment)).replace("'./care-progress.js'",JSON.stringify(care)));
const {calendarDay,calendarDays,shiftCalendar,calendarEvents}=await import(schedule);
const {photoPair,measurementHistory}=await import(assessment);
const tests=[],test=(name,run)=>tests.push({name,run});
const record=(id,day,data={},extra={})=>({id,patient_id:'a',kind:'assessment',visibility:'patient',created_at:day+'T12:00:00Z',data:{day,...data},...extra});
const image='data:image/png;base64,aGVsbG8=';

test('Calendar uses local dates, preserves date keys and rejects missing dates',()=>{
 assert.equal(calendarDay('2026-10-10T01:00:00Z'),'2026-10-09');
 assert.equal(calendarDay('2026-10-09'),'2026-10-09');
 for(const x of [null,undefined,'','invalid'])assert.equal(calendarDay(x),'');
});
test('Week and month share Monday alignment including leap years and year boundaries',()=>{
 const days=calendarDays('2024-02-29');assert.equal(days.length,42);assert.equal(days[0],'2024-01-29');assert(days.includes('2024-02-29'));
 assert.deepEqual(calendarDays('2026-01-01','week'),['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04']);
 assert.deepEqual(calendarDays('2026-02-30'),[]);
 assert.equal(shiftCalendar('2024-01-31',1,'month'),'2024-02-29');
 assert.equal(shiftCalendar('2026-01-31',1,'month'),'2026-02-28');
 assert.equal(shiftCalendar('2026-12-31',1,'week'),'2027-01-07');
});
test('Calendar isolates patients and private requests and deduplicates accepted appointments',()=>{
 const request=(id,extra={})=>record(id,'2026-10-09',{startAt:'2026-10-10T01:00:00Z',status:'requested',...extra.data},{kind:'appointment_request',...extra,data:{startAt:'2026-10-10T01:00:00Z',status:'requested',...extra.data}});
 const state={role:'patient',selected:'a',patients:[{id:'a'},{id:'b'}],appointments:[{id:'ap',patient_id:'a',start_at:'2026-10-10T01:00:00Z',status:'scheduled'},{id:'b-ap',patient_id:'b',start_at:'2026-10-09T12:00:00Z'}],records:[request('open'),request('private',{visibility:'private'}),request('archived',{data:{archived:true}}),request('accepted',{data:{status:'confirmed',appointmentId:'ap'}}),request('b',{patient_id:'b'}),request('bad',{data:{startAt:null}}),request('missing',{patient_id:'missing'})]};
 const snapshot=JSON.stringify(state);
 assert.deepEqual(calendarEvents(state).map(x=>x.id).sort(),['ap','open']);
 assert.equal(calendarEvents(state)[0].day,'2026-10-09');
 assert.equal(JSON.stringify(state),snapshot);
 assert.deepEqual(calendarEvents({...state,role:'nutri'},'b').map(x=>x.id).sort(),['b','b-ap']);
 assert(calendarEvents({...state,role:'nutri'}).some(x=>x.id==='private'));
});
test('Photo pairs use first and latest eligible images of one angle and one patient',()=>{
 const photo=(id,day,angle='front',extra={})=>record(id,day,{angle,image},{kind:'progress_photo',...extra});
 const rows=[photo('first','2026-01-01'),photo('middle','2026-02-01'),photo('last','2026-03-01'),photo('side','2026-01-01','side-right'),photo('private','2025-12-01','front',{visibility:'private'}),photo('other','2025-11-01','front',{patient_id:'b'}),record('legacy','2026-02-01',{image},{kind:'progress_photo'})];
 const p=photoPair(rows,'a','patient','front');assert.equal(p.before.id,'first');assert.equal(p.after.id,'last');assert.equal(p.list.length,3);
 assert.equal(photoPair(rows,'a','patient','front','last','middle').before.id,'first');
 assert.equal(photoPair(rows,'a','patient','front','','first').before,undefined);
 assert.equal(photoPair(rows,'a','patient','side-right').before,undefined);
 assert.equal(photoPair(rows,'a','patient','back').after,undefined);
 assert.equal(photoPair(rows,'a','patient','unspecified').after.id,'legacy');
 assert.equal(photoPair(rows,'a','nutri','front').before.id,'private');
});
test('Evolution periods include their boundary and omit missing values and future data',()=>{
 const rows=[record('old','2026-09-09',{weight:80,waist:90}),record('boundary','2026-09-10',{weight:79,waist:88}),record('partial','2026-09-15',{waist:87}),record('now','2026-10-09',{weight:77,fat:20,waist:84}),record('future','2026-10-10',{weight:76})];
 assert.deepEqual(measurementHistory(rows,'weight','30','2026-10-09').map(p=>p.x.id),['boundary','now']);
 assert.deepEqual(measurementHistory(rows,'waist','30','2026-10-09').map(p=>p.value),[88,87,84]);
 assert.equal(measurementHistory(rows,'leanMass','all','2026-10-09')[0].value,61.6);
 assert.equal(measurementHistory(rows,'weight','all','2026-10-09').length,3);
 assert.deepEqual(measurementHistory(rows,'unknown'),[]);
});
let failed=0;
for(const {name,run} of tests)try{await run();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+String(error.stack).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[module]'));}
console.log(`${tests.length-failed}/${tests.length} Personal alignment checks passed.`);
if(failed)process.exitCode=1;
