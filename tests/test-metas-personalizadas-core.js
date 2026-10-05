const assert=require('node:assert/strict'),M=require('../app/metas-personalizadas.js');let checks=0;function ok(v){assert.ok(v);checks++;}
const base={id:'mp_1',nome:'Distância fictícia',tipo:'distancia',alvo:10,inicio:'2026-10-05',criadaDia:'2026-10-04',modalidade:'corrida',icone:'mapa'};
const initial=d=>M.evaluate(d,{hoje:'2026-10-04',cardio:[],cargas:{}},null,'2026-10-04T12:00:00Z').state;
const run=(records,prior,d=base)=>M.evaluate(d,{hoje:'2026-10-06',cardio:records,cargas:{}},prior||initial(d),'2026-10-06T12:00:00Z');
const r=(id,k,d='2026-10-05')=>({id,k,d,m:'corrida',s:3600,status:'completo'});
assert.throws(()=>M.definition({...base,inicio:'2026-10-04'}));checks++;
assert.throws(()=>M.definition({...base,tipo:'manual'}));checks++;
assert.throws(()=>M.definition({...base,alvo:NaN}));checks++;
assert.throws(()=>M.definition({...base,inicio:'2026-02-30'}));checks++;
ok(run([r('old',100,'2026-10-04')]).state.status==='sem_dados');
ok(run([r('future',100,'2026-10-07')]).state.status==='sem_dados');
ok(run([r('one',5),r('one',5)]).valor===5);
ok(run([r('one',5),r('one',7)]).registros===0);
ok(run([{...r('p',20),status:'parcial'}, {...r('b',30),m:'bike'}, {...r('',30)}, {...r('s',30),s:null}]).state.status==='sem_dados');
ok(M.evaluate(base,{hoje:'2026-10-06',cardio:[r('existing',20)]},null,'now').state.status==='sem_dados');
ok(run([r('decimal-a',0.7),r('decimal-b',0.1)],null,{...base,alvo:0.8}).state.status==='alcancada');
const earned=run([r('one',5),r('two',5)]);ok(earned.state.status==='alcancada');ok(earned.state.history.length===2);
ok(run([r('one',5),r('two',5)],earned.state).state.history.length===2);
const reviewed=run([r('one',4),r('two',5)],earned.state);ok(reviewed.state.status==='revisao');ok(reviewed.state.history.length===3);ok(reviewed.state.award.valor===10);
ok(run([r('one',5),r('two',5)],reviewed.state).state.status==='revisao');
ok(run([r('one',5)],earned.state).state.status==='revisao');
ok(run([r('one',5),r('two',5)],earned.state,{...base,alvo:20}).state.status==='revisao');
const futureBaseline=M.evaluate(base,{hoje:'2026-10-04',cardio:[r('future-present',20,'2026-10-06')]},null,'now').state;ok(run([r('future-present',20,'2026-10-06')],futureBaseline).state.status==='sem_dados');
ok(run([r('one',5),r('two',5)],earned.state,{...base,encerrada:true}).state.status==='alcancada');
ok(run([r('one',10)],null,{...base,encerrada:true}).state.status==='encerrada');
const strength={...base,tipo:'carga',exercicio:'Supino',exercicioId:'ex-a',alvo:50};
const evaluate=(cargas,prior)=>M.evaluate(strength,{hoje:'2026-10-06',cargas},prior||initial(strength),'2026-10-06T12:00:00Z');
const carga={exercicioId:'ex-a',d:'2026-10-05',g:2,i:'0:0:0',kg:50,serie:1,feito:true};
ok(evaluate({Outro:[carga]}).state.status==='alcancada'); // Rename keeps stable identity.
ok(evaluate({Supino:[{...carga,feito:false},{...carga,g:1}]}).state.status==='sem_dados');
const e=evaluate({Supino:[carga]});ok(e.state.status==='alcancada');ok(!('recorde' in e.state));
ok(evaluate({Supino:[{...carga,kg:40}]},e.state).state.status==='revisao');
ok(evaluate({Supino:[carga,carga]}).registros===1);
assert.throws(()=>M.list([base,base]));checks++;
const isolated=eval('('+M.runtime.toString()+')')();ok(isolated.evaluate(base,{hoje:'2026-10-06',cardio:[r('a',10)]},initial(base),'now').state.status==='alcancada');
console.log(checks+' verificações: prospectividade, fontes, dedupe, revisão persistente, encerramento e carga sem PR');

const old={...carga};delete old.exercicioId;
ok(evaluate({Supino:[old]}).state.status==='sem_dados');
ok(evaluate({Supino:[{...carga,exercicioId:'ex-b'}]}).state.status==='sem_dados');
ok(evaluate({Supino:[{...carga,exercicioId:'ex-b',kg:99},{...carga,kg:40}]}).valor===40);
ok(evaluate({Supino:[{...carga,exercicioId:'ex-b'}]},e.state).state.status==='revisao');
const legacyDef={...strength};delete legacyDef.exercicioId;
ok(M.list([legacyDef])[0].nome===strength.nome);
ok(M.evaluate(legacyDef,{hoje:'2026-10-06',cargas:{Supino:[carga]}},initial(legacyDef),'now').state.status==='sem_dados');
const received=M.evaluate(strength,{hoje:'2026-10-04',cargas:{Supino:[old]}},null,'now').state;
ok(evaluate({Supino:[carga]},received).state.status==='sem_dados'); // No identity retrofit bypasses baseline.
const unchanged=JSON.stringify({legacyDef,old});evaluate({Supino:[old]});M.list([legacyDef]);ok(JSON.stringify({legacyDef,old})===unchanged);
console.log(checks+' verificações totais, incluindo homônimos, renomeação e legado sem migração');
// Exercise the actual series writer: legacy records must never acquire guessed identity.
const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../app/aluno-builder.js'),'utf8');
const code=source.slice(source.indexOf('  function normalizaSeries('),source.indexOf('  // v821: agenda única'));
const memory={ptdc:{}},it={e:'Supino',exercicioId:'ex-a'},history=new Map();
// O gravador agora depende do journal. Executa os módulos canônicos, com
// armazenamento e concessão de uma única aba sintéticos, sem confirmar writes por mock.
const storage={get length(){return history.size;},key:i=>[...history.keys()][i]||null,getItem:k=>history.has(k)?history.get(k):null,setItem:(k,v)=>history.set(k,v),removeItem:k=>history.delete(k)};
const ctx={gv:{f:0,e:0},L:(k,d)=>JSON.parse(JSON.stringify(memory[k]||d)),Sv:(k,v)=>{memory[k]=v;return true;},isoHj:()=> '2026-10-06',storage,
  crypto:require('node:crypto').webcrypto,clearTimeout,setTimeout,
  navigator:{locks:{request:(name,options,callback)=>Promise.resolve(callback({name}))}},
  document:{getElementById:()=>null},window:{addEventListener(){},removeEventListener(){}}};
ctx.self=ctx;
vm.createContext(ctx);
for(const file of ['treino-historico-core.js','treino-historico-player.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../app',file),'utf8'),ctx);
vm.runInContext(code+'\nvar TH=MT_TREINO_HISTORICO_PLAYER.create({storage:storage,scope:"synthetic-series-meta",active:()=>true});var SR=runtimeSeries();',ctx);
ok(ctx.TH.ready());
ctx.SR.marca(it,0,true);ok(memory.ptdc.Supino[0].exercicioId==='ex-a');
ctx.SR.marca(it,0,false);ok(memory.ptdc.Supino[0].exercicioId==='ex-a');
ctx.SR.marca({...it,exercicioId:'ex-b'},0,true);ok(!memory.ptdc.Supino[0].exercicioId);
ctx.SR.marca(it,0,true);ok(!memory.ptdc.Supino[0].exercicioId);
ok(ctx.TH.list()[0].targets['0:0:0'].value.exercicioId===undefined);
ctx.TH.dispose();
console.log(checks+' verificações totais; gravador real preserva identidade e não migra legado por nome');

const oldAward={...e.state,signature:JSON.stringify(['carga',50,strength.inicio,'Supino'])};const oldAudit=JSON.stringify(oldAward);ok(evaluate({Supino:[old]},oldAward).state.status==='revisao');ok(JSON.stringify(oldAward)===oldAudit);console.log(checks+' verificações finais; histórico anterior preservado em revisão');
