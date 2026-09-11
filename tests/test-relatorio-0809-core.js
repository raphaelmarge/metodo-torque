/* Executa regras reais, não procura nomes em strings. Dados inteiramente sintéticos. */
const assert=require('node:assert/strict');const vm=require('node:vm');
const R=require('../assets/relatorio-0809.js');let n=0;
function check(label,fn){fn();n++;console.log('OK '+label);}
check('modalidade e tipo explícito não confundem cobrança com atendimento',()=>{
 for(const m of ['online','Online',' on-line ','consultoria online','CONSULTORIA ON-LINE'])assert.equal(R.online({modalidade:m}),true);
 for(const m of ['mes','sessao','híbrido','presencial','consultoria presencial',''])assert.equal(R.online({modalidade:m}),false);
 assert.equal(R.online({modalidade:'online',atendimento:'híbrido'}),false);
 assert.equal(R.online({modo:'mes',atendimento:'consultoria online'}),true);
});
const a={id:'a',valor:200,modo:'mes',pacote:{total:13,usadas:1}},st={contratosPT:[{alunoId:'a',status:'encerrado'}]};
check('pré-pago com saldo e contrato encerrado não cria mensalidade fictícia',()=>assert.equal(R.pacotePrePago(st,a),true));
check('contrato mensal ativo permanece cobrável mesmo com pacote',()=>assert.equal(R.pacotePrePago({contratosPT:[{alunoId:'a',status:'ativo'}]},a),false));
check('saldo esgotado e aluno sem pacote conservam regra anterior',()=>{assert.equal(R.pacotePrePago(st,{id:'a',pacote:{total:1,usadas:1}}),false);assert.equal(R.pacotePrePago(st,{id:'a'}),false);});
const t={fichas:[{id:'f1',titulo:'Ficha própria'}],cardio:[{id:'c1',nome:'Corrida própria'}],plano:{dias:{5:[{tp:'ficha',id:'f1',h:'10:00'}]},datas:{'2026-09-11':[{tp:'cardio',id:'c1',h:'11:00'},{tp:'ficha',id:'f1',h:'07:00'}],'2026-09-18':[]}}};
const before=JSON.stringify(t);
check('datas substituem semana e aceitam múltiplos treinos',()=>assert.equal(R.dia(t.plano,'2026-09-11',5).length,2));
check('data sem exceção mantém semana recorrente',()=>assert.equal(R.dia(t.plano,'2026-09-25',5)[0].id,'f1'));
check('descanso explícito não recai na semana',()=>assert.deepEqual(R.dia(t.plano,'2026-09-18',5),[]));
check('dia legado com objeto único permanece compatível',()=>assert.equal(R.dia({dias:{5:{tp:'ficha',id:'antigo'}}},'2026-09-25',5)[0].id,'antigo'));
check('pacote resolve IDs próprios, ordena horários e preserva descanso',()=>{const p=R.pacoteDatas(t);assert.deepEqual(p['2026-09-11'].map(x=>x.tp),['ficha','cardio']);assert.equal(p['2026-09-11'][0].i,0);assert.deepEqual(p['2026-09-18'],[]);assert.equal(JSON.stringify(t),before);});
check('não publica treino inexistente ou data inválida',()=>{assert.deepEqual(R.pacoteDatas({plano:{datas:{'2026-09-31':[],'2026-09-11':[{tp:'ficha',id:'outro-aluno'}]}}}),{'2026-09-11':[]});assert.equal(R.dataOk('2026-02-29'),false);assert.equal(R.dataOk('2028-02-29'),true);});
let zp,zv,zf;
check('zonas de pace, velocidade e FC validam intervalos',()=>{zp=R.zona({id:'zp',nome:'Faixa teste',tipo:'pace',min:'5:00',max:'6:20'});zv=R.zona({id:'zv',nome:'Velocidade teste',tipo:'velocidade',min:'8,5',max:'10'});zf=R.zona({id:'zf',nome:'FC teste',tipo:'fc',min:'100',max:'120'});assert.equal(zp.min,300);assert.equal(zp.max,380);assert.equal(zv.min,8.5);assert.equal(zf.max,120);assert.match(R.zonaTxt(zp),/5:00–6:20 min\/km/);});
check('entradas inválidas não são truncadas ou convertidas silenciosamente',()=>{for(const x of [{...zp,min:'5:99',max:'6:20'},{...zp,min:'6:20',max:'5:00'},{...zv,min:'',max:'10'},{...zf,min:'100.5',max:'120'},{...zf,min:'-1',max:'120'}])assert.throws(()=>R.zona(x));});
const bs=[{tipo:'aquecimento',alvo:{valor:2,unidade:'km',zona:zp}},{tipo:'repetir',repeticoes:2,alvo:{valor:.1,unidade:'km',zona:zv},recuperacao:{valor:45,unidade:'s',zona:zf}},{tipo:'recuperacao',alvo:{valor:2,unidade:'min'}}];
check('blocos repetidos mantêm tempo, distância e alvos independentes',()=>{const ex=R.expande(bs);assert.equal(ex.length,6);assert.equal(ex[0].km,2);assert.equal(ex[1].km,.1);assert.equal(ex[2].s,45);assert.equal(ex[5].s,120);assert.match(ex[2].d,/bpm/);});
check('prescrição usa snapshot: biblioteca não altera treino salvo',()=>{const b=R.blocos(bs);zp.nome='Novo nome na biblioteca';assert.equal(b[0].alvo.zona.nome,'Faixa teste');zp.nome='Faixa teste';assert.throws(()=>R.blocos([{...bs[1],repeticoes:21}]));assert.throws(()=>R.blocos([{...bs[1],repeticoes:20},{...bs[1],repeticoes:20}]));});
global.self=global;require('../app/aluno-skin.js');require('../app/aluno-builder.js');
const D={a:{id:'synthetic',nome:'Aluno sintético'},studio:'Teste',COR:'#7c3aed',COR2:'#5925ba',CORC:'#b395ff',CORE:'#33155c',CORCL1:'#d6c4ff',CORCL2:'#e8ddff',cfg:{},cardiosApp:[{id:'c',nome:'Blocos de teste',tipo:'misto',mod:'corrida',dist:5,blocos:bs}],planoDatas:R.pacoteDatas(t),atendimento:'consultoria online'};
function cardios(html){const i=html.indexOf('var CARDIOS='),j=html.indexOf('function crAlvoTxt',i);assert.ok(i>0&&j>i);return vm.runInNewContext(html.slice(i,j)+'CARDIOS');}
check('builder independente e editor produzem a mesma fila de etapas',()=>{const c=cardios(global.MT_APP_ALUNO.monta(D))[0];assert.deepEqual(JSON.parse(JSON.stringify(c.bl)),R.expande(bs));assert.equal(c.d,0);assert.equal(c.t,'blocos');});
check('pacote malformado não inicia treino simples no lugar do prescrito',()=>{const x={...D,cardiosApp:[{id:'bad',blocos:[{tipo:'aquecimento',alvo:{valor:0,unidade:'km'}}]}]};const c=cardios(global.MT_APP_ALUNO.monta(x))[0];assert.equal(c.erro,true);assert.equal(c.bl.length,0);});
check('conteúdo de zona é dado, nunca código executável',()=>{const html=global.MT_APP_ALUNO.monta({...D,cardiosApp:[{id:'x',blocos:[{tipo:'ativo',alvo:{valor:1,unidade:'min',zona:{...zp,nome:'</script><script>window.evil=1</script>'}}}]}]});assert.equal(html.includes('</script><script>window.evil=1'),false);});
console.log(n+' contratos executáveis do relatório passaram.');
