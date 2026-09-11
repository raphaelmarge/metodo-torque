/* Exercita o store/CAS verdadeiro com nuvem simulada e recibos fictícios. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const scaffold=fs.readFileSync(path.join(__dirname,'test-sync-identidade.js'),'utf8').split('let count = 0;')[0];
const setup=new Function('require','__dirname',scaffold+'\nreturn setup;')(require,__dirname);
const R=require('../assets/relatorio-0809'),K='mtapp:ptStudio',stamp='2026-09-06T12:00:00+00:00';
const initial=()=>({alunos:[{id:'aluno-ficticio'}],pagamentos:[{id:'pg-ficticio',alunoId:'aluno-ficticio',valor:200,data:'2026-09-11',forma:'Pix',eventoId:'evento-ficticio'}]});
function anula(s){const p=s.pagamentos[0];R.alteraRecebimento(s,p.id,JSON.stringify(p),{motivo:'Lançamento duplicado'},{id:'audit-ficticio',acao:'anular',em:'2026-09-11T12:00:00Z',por:'usuario-ficticio'});}
(async()=>{
 const x=await setup({rows:[{chave:K,valor:initial(),atualizado:stamp}]});await x.start();
 const s=x.ctx.MTStore.read('ptStudio');anula(s);assert.equal(x.ctx.MTStore.write('ptStudio',s),true);await x.ctx.__MTSync.enviaSujas();
 const call=x.calls.filter(c=>c.rpc==='dados_cas').at(-1);
 assert.ok(call);assert.equal(call.args.p_base_atualizado,stamp);
 const valor=JSON.parse(JSON.stringify(call.args.p_valor));
 assert.deepEqual(valor.pagamentos,s.pagamentos);assert.deepEqual(valor.pagamentosAuditoria,s.pagamentosAuditoria);
 assert.equal(valor.recebimentosRevisao,1);assert.equal(valor.pagamentos[0].eventoId,'evento-ficticio');
 console.log('OK CAS transporta anulação, revisão, evento original e auditoria completa na revisão lida');
 const y=await setup({rows:[{chave:K,valor:initial(),atualizado:stamp}],sendPromise:Promise.resolve({error:{code:'PT409',message:'Conflito sintético'}})});await y.start();
 const t=y.ctx.MTStore.read('ptStudio');anula(t);assert.equal(y.ctx.MTStore.write('ptStudio',t),true);await y.ctx.__MTSync.enviaSujas();
 assert.ok(y.ctx.__MTSync._estado.conflitos[K]);
 const kept=JSON.parse(y.memory.get(K));assert.equal(kept.pagamentos[0].anulacao.motivo,'Lançamento duplicado');assert.equal(kept.pagamentosAuditoria.length,1);
 const n=y.calls.filter(c=>c.rpc==='dados_cas').length;await y.ctx.__MTSync.enviaSujas();assert.equal(y.calls.filter(c=>c.rpc==='dados_cas').length,n);
 console.log('OK conflito conserva rascunho financeiro e auditoria sem repetir a gravação');
})().catch(e=>{console.error(e);process.exitCode=1;});
