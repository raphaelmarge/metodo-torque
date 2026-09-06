/* Prescrição por série: comparação e lote sem navegador, rede ou dados reais. */
const assert = require('assert/strict');
const A = require('../assets/acompanhamento.js');
let total = 0;
function test(nome, fn) { fn(); total++; console.log('  ✅ ' + nome); }
function detalhado() {
  return {exId:'supino',series:9,reps:'10',carga:25,descanso:60,seriesDetalhadas:[
    {reps:'5',carga:null,descanso:90},
    {reps:'8',carga:40,descanso:75},
    {reps:'10',carga:35,descanso:0}
  ]};
}
function estado(item) {
  return {exercicios:[{id:'supino',nome:'Supino reto'}],treinosV2:{aluno:{
    fichas:[{id:'a',titulo:'A — Peito',itens:[item]}]
  }}};
}
function itemSnapshot(st) { return A.snapshot(st,'aluno').fichas[0].itens[0]; }

test('snapshot usa quantidade real e copia profundamente as séries e alternativas', () => {
  const original=detalhado(); original.alternativas=['Flexão'];
  const st=estado(original), snap=itemSnapshot(st);
  assert.equal(snap.series,3);
  assert.deepEqual(snap.seriesDetalhadas,original.seriesDetalhadas);
  original.seriesDetalhadas[0].reps='6'; original.alternativas[0]='Crucifixo';
  assert.equal(snap.seriesDetalhadas[0].reps,'5');
  assert.equal(snap.alternativas[0],'Flexão');
  snap.seriesDetalhadas[1].carga=99;
  assert.equal(original.seriesDetalhadas[1].carga,40);
});

test('comparação detecta mudança somente nas repetições de uma linha', () => {
  const st=estado(detalhado()), antes=A.snapshot(st,'aluno');
  st.treinosV2.aluno.fichas[0].itens[0].seriesDetalhadas[1].reps='9';
  const diff=A.diferencas(antes,A.snapshot(st,'aluno'));
  assert.equal(diff.length,1);
  assert.match(diff[0],/2ª série: 8 reps/);
  assert.match(diff[0],/2ª série: 9 reps/);
  assert.doesNotMatch(diff[0],/Nenhuma alteração/);
});

test('comparação descreve carga e descanso alterados em uma série', () => {
  const st=estado(detalhado()), antes=A.snapshot(st,'aluno');
  Object.assign(st.treinosV2.aluno.fichas[0].itens[0].seriesDetalhadas[1],{carga:42.5,descanso:120});
  const diff=A.diferencas(antes,A.snapshot(st,'aluno')).join('\n');
  assert.match(diff,/2ª série: 8 reps, 40 kg, 75s/);
  assert.match(diff,/2ª série: 8 reps, 42,5 kg, 120s/);
});

test('carga uniforme aparece no snapshot e na comparação', () => {
  const st=estado({exId:'supino',series:3,reps:'10',descanso:60,carga:20});
  const antes=A.snapshot(st,'aluno');
  st.treinosV2.aluno.fichas[0].itens[0].carga=22.5;
  assert.equal(antes.fichas[0].itens[0].carga,20);
  assert.match(A.diferencas(antes,A.snapshot(st,'aluno')).join('\n'),/3 × 10, 20 kg · 60s → Supino reto · 3 × 10, 22,5 kg · 60s/);
});

test('texto diferencia ausência explícita de carga, herança e zero', () => {
  const it=detalhado();
  it.seriesDetalhadas=[{reps:'5',carga:null,descanso:0},{reps:'8'},{reps:'10',carga:0,descanso:30}];
  assert.equal(A.itemTexto(itemSnapshot(estado(it))),
    'Supino reto · 1ª série: 5 reps, 0s; 2ª série: 8 reps, 25 kg, 60s; 3ª série: 10 reps, 0 kg, 30s');
});

test('lote misto altera uniformes e preserva todo o item individual', () => {
  const individual=detalhado(), original=JSON.stringify(individual);
  const f={itens:[{series:3,reps:'10',descanso:60,carga:20},individual,{series:2,reps:'8',descanso:90}]};
  assert.equal(A.lote(f,[0,1],{series:'4',reps:'12',descanso:'0'}),true);
  assert.deepEqual(f.itens[0],{series:4,reps:'12',descanso:0,carga:20});
  assert.equal(JSON.stringify(individual),original);
  assert.deepEqual(f.itens[2],{series:2,reps:'8',descanso:90});
  assert.deepEqual(A.loteSelecao(f,[0,1]),{total:2,elegiveis:1,individuais:1});
});

test('lote só de individuais explica a limitação sem declarar sucesso ou alterar dados', () => {
  const f={itens:[detalhado()]}, antes=JSON.stringify(f);
  assert.throws(()=>A.lote(f,[0],{series:'4'}),/séries individuais.*Edite cada exercício/);
  assert.equal(JSON.stringify(f),antes);
  assert.equal(A.lote(f,[0],{series:'',reps:'',descanso:''}),false);
});

test('seleção conta índices válidos únicos e não oferece falso sucesso', () => {
  const f={itens:[{series:3,reps:'10',descanso:60},detalhado()]};
  assert.deepEqual(A.loteSelecao(f,[0,'0',1,1,4,-1,null,'']),{total:2,elegiveis:1,individuais:1});
  assert.equal(A.lote(f,[99],{series:'3'}),false);
  assert.deepEqual(A.loteSelecao(null,[0]),{total:0,elegiveis:0,individuais:0});
});

test('validação do lote é atômica inclusive para conversão explícita', () => {
  const f={itens:[{series:3,reps:'10',descanso:60},detalhado()]}, antes=JSON.stringify(f);
  assert.throws(()=>A.lote(f,[0,1],{series:'4',descanso:'-1',uniformizar:true}),/descanso/);
  assert.throws(()=>A.lote(f,[0],{series:0}),/1 a 30 séries/);
  assert.throws(()=>A.lote(f,[0],{reps:'1'.repeat(41)}),/40 caracteres/);
  assert.equal(JSON.stringify(f),antes);
});

test('somente conversão explícita troca linhas por série uniforme e usa a primeira', () => {
  const f={itens:[detalhado()]};
  assert.equal(A.lote(f,[0],{descanso:'30',uniformizar:true}),true);
  assert.equal('seriesDetalhadas' in f.itens[0],false);
  assert.equal(f.itens[0].series,3);
  assert.equal(f.itens[0].reps,'5');
  assert.equal(f.itens[0].carga,null);
  assert.equal(f.itens[0].descanso,30);
});

test('prescrição legada sem linhas mantém texto, lote e comparação estável', () => {
  const st=estado({exId:'supino',series:3,reps:'10',descanso:60});
  const antes=A.snapshot(st,'aluno');
  assert.equal(A.itemTexto(antes.fichas[0].itens[0]),'Supino reto · 3 × 10 · 60s');
  assert.match(A.diferencas(antes,A.snapshot(st,'aluno'))[0],/Nenhuma alteração/);
  const f=st.treinosV2.aluno.fichas[0];
  assert.equal(A.lote(f,[0],{series:'',reps:'8–10',descanso:'0'}),true);
  assert.deepEqual(f.itens[0],{exId:'supino',series:3,reps:'8–10',descanso:0});
});

test('lista vazia de séries não impede edição de prescrição uniforme', () => {
  const f={itens:[{series:3,reps:'10',descanso:60,seriesDetalhadas:[]}]};
  assert.deepEqual(A.loteSelecao(f,[0]),{total:1,elegiveis:1,individuais:0});
  assert.equal(A.lote(f,[0],{series:'4'}),true);
  assert.equal(f.itens[0].series,4);
});

test('resumo só considera cargas de séries concluídas como novos máximos', () => {
  const aluno={id:'aluno',retorno:{cargas:{Supino:[
    {d:'2026-08-28',kg:20},
    {d:'2026-08-29',kg:100,g:2,serie:1,feito:false},
    {d:'2026-09-01',kg:25,g:2,serie:1,feito:true},
    {d:'2026-09-02',kg:150,g:2,serie:2,feito:false},
    {d:'2026-09-03',kg:180,g:2,serie:3}
  ]}}};
  const st={treinosV2:{},sessoes:[]};
  assert.deepEqual(A.resumo(st,aluno,'2026-09-05').avancos,[{ex:'Supino',de:20,para:25}]);
  aluno.retorno.cargas.Supino[2].feito=false;
  assert.deepEqual(A.resumo(st,aluno,'2026-09-05').avancos,[]);
});

test('prescrição por tempo mantém a unidade na publicação', () => {
  const texto=A.itemTexto({nome:'Prancha',seriesDetalhadas:[{reps:'30s',descanso:0,carga:null}]});
  assert.match(texto,/1ª série: 30s, 0s/);
  assert.doesNotMatch(texto,/30s reps/);
});

console.log('\n' + total + ' verificações de acompanhamento por série passaram.');
