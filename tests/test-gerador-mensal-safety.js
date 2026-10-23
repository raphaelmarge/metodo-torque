/* Regressões de aplicação/publicação; dados sintéticos e nenhum browser/rede. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Core=require('../assets/gerador-mensal-core.js');
const Catalog=require('../assets/gerador-mensal-catalogo.js');
const Adapter=require('../assets/personal-gerador-mensal-adapter.js');
const F=require('./gerador-mensal-fixtures.js');
const box={MT_GERADOR_MENSAL:Core,MT_GERADOR_MENSAL_CATALOGO:Catalog,MT_GERADOR_MENSAL_ADAPTER:Adapter,MTStore:{todayISO:()=> '2026-11-01'}};
box.self=box;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/personal-gerador-mensal.js'),'utf8'),box,{filename:'personal-gerador-mensal.js'});
const UI=box.MT_PERSONAL_GERADOR_MENSAL;
const id='gm-test-a';
const clone=x=>JSON.parse(JSON.stringify(x));
function applied(){
  const st=F.state(),input=Adapter.build(st,id),v=Core.validate(input,F.decision());assert(v.ok,JSON.stringify(v.issues));
  const r=Core.generate(input,v.validation);assert(r.ok,JSON.stringify(r.issues));
  const approved={proposal:r.proposal,validation:v.validation,author:'Personal de teste',at:'2026-11-01T12:00:00Z'};
  UI.applyState(st,id,approved);return{st,approved};
}
let n=0,failures=0;
function test(name,fn){try{fn();n++;console.log('OK '+name);}catch(error){failures++;console.error('FALHA '+name+'\n'+error.message);}}
test('aplicação conserva histórico e outro aluno sem publicar',()=>{const{st}=applied();assert.equal(st.alunos[0].geradorMensal.history.length,1);assert(st.alunos[0].geradorMensal.active);assert.equal(st.treinosV2['gm-test-b'].fichas[0].titulo,'Preservar outro aluno');assert(UI.packet(st,id).active);assert.equal(st.alunos[0].geradorMensal.active.publishedAt,undefined);});
test('carga editada no editor legado bloqueia publicação mensal',()=>{const{st}=applied();st.treinosV2[id].fichas[0].itens[0].carga=90;assert.throws(()=>UI.packet(st,id));});
test('agenda de resistência alterada bloqueia publicação',()=>{const{st}=applied();st.treinosV2[id].plano.datas['2026-11-02']=[];assert.throws(()=>UI.packet(st,id));});
test('catálogo usado alterado exige conferir exercício publicado',()=>{const{st}=applied(),ex=st.treinosV2[id].fichas[0].itens[0].exId;st.exercicios.find(x=>x.id===ex).nome='Outro movimento';assert.throws(()=>UI.packet(st,id));});
test('alteração de saúde estruturada bloqueia publicação',()=>{const{st}=applied();st.alunos[0].geradorMensal.perfil.healthStatus='reported';st.alunos[0].geradorMensal.perfil.conditions=[{id:'nova',name:'Nova limitação'}];assert.throws(()=>UI.packet(st,id));});
test('relato clínico ainda não reconhecido bloqueia publicação',()=>{const{st}=applied(),a=st.alunos[0],cycle=a.geradorMensal.active.id;a.retorno.geradorMensal={reports:{[cycle]:{revisions:{r:{id:'r',cycleId:cycle,kind:'health',author:'aluno',createdAt:'2026-11-01T12:00:00Z',data:{symptoms:'sim',healthChanges:'Dor nova'}}}}}};assert.throws(()=>UI.packet(st,id));});
test('nova anamnese clínica legada também bloqueia publicação',()=>{const{st}=applied();st.alunos[0].retorno.anamnese={lesoes:'Nova lesão relatada',doencas:'Condição nova'};st.alunos[0].retorno.anamneseEm='2026-11-01T12:00:00Z';assert.throws(()=>UI.packet(st,id));});
test('correção de idade que muda elegibilidade exige nova conferência',()=>{const{st}=applied();st.alunos[0].geradorMensal.perfil.age=15;assert.throws(()=>UI.packet(st,id));});
test('novos logs ordinários não alteram ficha aplicada nem bloqueiam publicação',()=>{const{st}=applied(),before=clone(st.treinosV2[id].fichas);st.alunos[0].retorno.cargas={Teste:[{g:2,feito:true,id:'log',hid:'session',d:'2026-11-01',kg:10,r:12}]};assert(UI.packet(st,id).active);assert.deepEqual(clone(st.treinosV2[id].fichas),before);});
test('XP e gênero não revogam prescrição',()=>{const{st}=applied();st.alunos[0].xp=99999;st.alunos[0].geradorMensal.perfil.genderIdentity='outra';assert(UI.packet(st,id).active);});
test('agenda de modalidade independente não altera aprovação de resistência',()=>{const{st}=applied();st.treinosV2[id].plano.datas['2026-11-02'].push({tp:'cardio',id:'cardio',h:'19:00'});st.treinosV2[id].cardio=[{id:'cardio',nome:'Sessão independente'}];assert(UI.packet(st,id).active);});
test('pacote do aluno não carrega condições nem snapshot clínico',()=>{const{st}=applied(),packet=JSON.stringify(UI.packet(st,id));assert(!/conditions|anamnese|clinicalHash|guidance|snapshot|birthDate/.test(packet));});
test('reaplicar proposta já incorporada não sobrescreve histórico',()=>{const{st,approved}=applied();const before=JSON.stringify(st);assert.throws(()=>UI.applyState(st,id,approved));assert.equal(JSON.stringify(st),before);});
console.log(n+' testes de segurança passaram; '+failures+' falharam.');
if(failures)process.exitCode=1;
