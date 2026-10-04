/* Transporte simulado; jamais executa rede ou consulta alunos reais. */
'use strict';
const assert = require('node:assert/strict');
const H = require('../app/treino-historico-core');
const Sync = require('../app/treino-historico-sync');
function storage() { const m = new Map(); return { get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.has(k)?m.get(k):null,setItem(k,v){if(this.fail && this.fail(k))throw Error('QUOTA');m.set(k,v);},m }; }
const start = { id:'s-a',kind:'corrida',date:'2026-09-03',prescribed:{intervals:[{id:'i-a',distance:200}]} };
function device(server, actor) {
  const s=storage(); let active=true;
  const j=H.create({storage:s,scope:'ficticio',actor,active:()=>active});
  const statuses=[];
  const sync=Sync.create({storage:s,scope:'ficticio',token:'synthetic-only',active:()=>active,journal:j,rpc:server,status:(...a)=>statuses.push(a)});
  return {s,j,sync,statuses,stop:()=>{active=false;}};
}
(async()=>{
  let checks=0; const rows=[],calls=[]; let loseAck=false,hold=null;
  async function rpc(fn,args){
    calls.push({fn,args});
    if(hold)await hold;
    if(fn==='app_treino_eventos_lista'){
      const all=rows.slice(Number(args.p_apos)),page=all.slice(0,2);
      return {ok:true,eventos:structuredClone(page),cursor:String(Number(args.p_apos)+page.length),mais:all.length>page.length};
    }
    for(const e of args.p_eventos){const old=rows.find(x=>x.id===e.id);if(old)assert.deepEqual(e,old);else rows.push(structuredClone(e));}
    if(loseAck){loseAck=false;return null;}
    return {ok:true,ids:args.p_eventos.map(e=>e.id)};
  }
  async function test(label,f){await f();checks++;console.log('OK '+label);}
  const a=device(rpc,'a');a.j.start(start);a.j.record({id:'r-a',session:start.id,target:'activity',expected:[],value:{km:1,seconds:360,source:'gps',route:[{lat:0,lng:0}]}});
  await test('ACK perdido preserva fila e reenvio não duplica no servidor',async()=>{
    loseAck=true;await assert.rejects(a.sync.run(),/SYNC_UNAVAILABLE/);assert.equal(rows.length,2);
    assert.equal(a.s.getItem('tqWorkoutSync:ficticio:ack:r-a'),null);
    await a.sync.run();assert.equal(rows.length,2);assert.equal(a.s.getItem('tqWorkoutSync:ficticio:ack:r-a'),'1');
  });
  const b=device(rpc,'b');
  await test('outro aparelho restaura snapshot e resultado por páginas',async()=>{
    await b.sync.run();assert.deepEqual(b.j.session(start.id).prescribed,start.prescribed);assert.equal(b.j.session(start.id).targets.activity.value.km,1);
  });
  await test('revisões concorrentes offline se conservam após sincronização',async()=>{
    for(const [d,id,reps] of [[a,'edit-a',8],[b,'edit-b',9]])d.j.record({id,session:start.id,target:'activity',expected:['r-a'],correction:true,reason:'Conferência',value:{reps}});
    await a.sync.run();await b.sync.run();await a.sync.run();
    assert.equal(a.j.session(start.id).targets.activity.conflict,true);assert.equal(b.j.session(start.id).targets.activity.conflict,true);
  });
  await test('quota na recepção não avança cursor e retry restaura todos',async()=>{
    const c=device(rpc,'c');let n=0;c.s.fail=k=>k.startsWith('tqWorkoutJournal:')&&++n===2;
    await assert.rejects(c.sync.run(),/QUOTA/);assert.equal(c.s.getItem('tqWorkoutSync:ficticio:cursor'),null);
    c.s.fail=null;await c.sync.run();assert.equal(Object.keys(c.j.read()).length,rows.length);
  });
  await test('chamadas simultâneas na mesma instância compartilham execução',async()=>{
    let release;hold=new Promise(r=>{release=r;});const one=a.sync.run(),two=a.sync.run();assert.equal(one,two);release();hold=null;await one;
  });
  await test('resposta tardia após troca de identidade não persiste dados',async()=>{
    const c=device(rpc,'c');let release;hold=new Promise(r=>{release=r;});const job=c.sync.run();c.stop();release();hold=null;
    await assert.rejects(job,/IDENTITY_CHANGED/);assert.equal(c.s.length,0);
  });
  await test('RPC ausente mantém local intacto e não afirma sincronização',async()=>{
    const c=device(async()=>null,'c');c.j.start(start);const before=H.canonical(c.j.read());await assert.rejects(c.sync.run(),/SYNC_UNAVAILABLE/);
    assert.equal(H.canonical(c.j.read()),before);assert.equal(c.statuses.at(-1)[0],'pendente');
  });
  console.log(checks+' cenários de transporte passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;});
