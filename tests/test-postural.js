/* Sem fotos reais ou escrita na nuvem. Geometria e contrato de rede. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../assets/postural-core.js');
let checks = 0;
const ok = (value, text) => { assert.ok(value, text); checks++; };
const eq = (a,b,text) => { assert.deepEqual(a,b,text); checks++; };
const doc = () => C.create({width:800,height:1600,data:'data:image/jpeg;base64,/9j/2Q=='});
const mark = (type, points) => ({id:'synthetic-mark',type,points,text:''});
const near = (a,b) => ok(Math.abs(a-b)<1e-8, `${a} ≈ ${b}`);
(async () => {
  const d = doc(); eq(C.validate(d),d,'documento válido');
  near(C.measure(mark('horizontal',[{x:0,y:0},{x:1,y:0.5}]),d),45);
  near(C.measure(mark('vertical',[{x:0,y:0},{x:0,y:1}]),d),0);
  near(C.measure(mark('angle',[{x:0,y:0.5},{x:0.5,y:0.5},{x:0.5,y:1}]),d),90);
  eq(C.measure(mark('horizontal',[{x:0,y:0},{x:0,y:0}]),d),null);
  eq(C.measure(mark('note',[{x:0.5,y:0.5}]),d),null);
  for (const rotation of [-180,-90,-17,0,45,90,180]) for (const mirrored of [false,true]) {
    const v=doc(); v.rotation=rotation; v.mirrored=mirrored;
    const p={x:0.17,y:0.83}, back=C.original(C.world(p,v),v);
    near(back.x,p.x); near(back.y,p.y);
    near(C.measure(mark('angle',[{x:0,y:0.5},{x:0.5,y:0.5},{x:0.5,y:1}]),v),90);
  }
  const bad = [d=>d.image.width=1601,d=>d.image.width=0,d=>d.image.data='https://example.invalid/x.jpg',
    d=>d.rotation=NaN,d=>d.grid.columns=0,d=>d.plumb.x=2,d=>d.mirrored='true',
    d=>d.marks=[mark('note',[{x:2,y:0}])],d=>d.marks=[mark('angle',[{x:0,y:0}])],
    d=>d.marks=[{...mark('note',[{x:0,y:0}]),text:'x'.repeat(2001)}],d=>d.marks=Array(61).fill(mark('note',[{x:0,y:0}]))];
  bad.forEach(mutate=>{const v=doc();mutate(v);assert.throws(()=>C.validate(v));checks++;});
  ok(C.equal({b:1,a:{z:2}},{a:{z:2},b:1}),'JSONB reordenado equivale');
  ok(!C.equal({x:1},{x:2}),'documentos diferentes não equivalem');
  let response={data:{id:'id'},error:null}, calls=[];
  const q={};
  ['select','eq','order','range','insert','delete'].forEach(k=>q[k]=(...args)=>{calls.push([k,...args]);return q;});
  q.single=async()=>response; q.then=(resolve,reject)=>Promise.resolve(response).then(resolve,reject);
  const ctx={scope:'account:studio:author',aid:'studio',uid:'author',client:{from:t=>{calls.push(['from',t]);return q;}}};
  const sandbox={MT_POSTURAL_CORE:C,localStorage:{getItem:()=>null},MTStore:{cloud:()=>null}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/postural-store.js'),'utf8'),sandbox);
  const S=sandbox.MT_POSTURAL_STORE;
  const rec={id:'id',scope:ctx.scope,alunoId:'student',data:'2026-09-01',vista:'frente',documento:doc()};
  ok(await S.remotePut(ctx,rec),'INSERT confirmado');
  ok(calls.some(c=>c[0]==='insert'),'usa INSERT');
  ok(!calls.some(c=>c[0]==='upsert'||c[0]==='update'),'não substitui snapshots');
  await assert.rejects(S.remotePut({...ctx,scope:'other'},rec)); checks++;
  response={data:null,error:{code:'42P01'}};
  await assert.rejects(S.remotePut(ctx,rec),/ativado/); checks++;
  response={data:[],error:null};
  await assert.rejects(S.remoteDelete(ctx,'id'),/não foi confirmada/); checks++;
  response={data:[{id:'id'}],error:null};calls=[];
  await S.remoteDelete(ctx,'id');
  ok(calls.some(c=>c[0]==='eq'&&c[1]==='academia_id'&&c[2]==='studio'),'DELETE filtra academia');
  ok(calls.some(c=>c[0]==='eq'&&c[1]==='autor_id'&&c[2]==='author'),'DELETE filtra autor');
  const ui=fs.readFileSync(path.join(__dirname,'../assets/personal-postural.js'),'utf8');
  ok(ui.includes('cloudPending:!!target.client'),'intenção de envio persistida antes de INSERT');
  ok(ui.includes('rec.synced||rec.cloudPending'),'DELETE pendente exige confirmação remota');
  ok(!ui.includes("$('ppConsent').checked=true"),'reabertura não presume autorização de novo salvamento');
  const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  for (const file of ['postural-core.js','postural-store.js','personal-postural.js','personal-postural.css']) {
    ok(sw.includes('"assets/'+file+'"'),'asset pré-carregado: '+file);
    ok(fs.existsSync(path.join(__dirname,'../assets',file)),'asset existe: '+file);
  }
  console.log(`Postural: ${checks} verificações passaram (rede simulada, sem RLS em servidor).`);
})().catch(e=>{console.error(e);process.exitCode=1;});
