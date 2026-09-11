/* Regressões de contrato da agenda: fonte canônica, dados fictícios, sem rede. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let checks = 0;
function ok(label, fn) { fn(); checks++; console.log('OK ' + label); }

// A régua aceita formatação, não outro operador ou outro relógio.
const dateRule = /p_dia\s*<\s*public\.hoje_br\(\)/;
for (const text of ['p_dia < public.hoje_br()', 'p_dia<public.hoje_br()', 'p_dia\n <\tpublic.hoje_br()']) {
  ok('Data local aceita espaços opcionais: ' + JSON.stringify(text), () => assert.ok(dateRule.test(text)));
}
for (const text of ['p_dia > public.hoje_br()', 'p_dia <= public.hoje_br()', 'p_dia < current_date']) {
  ok('Data local recusa semântica diferente: ' + text, () => assert.ok(!dateRule.test(text)));
}
const infra = fs.readFileSync(path.join(root, 'tests/test-infra.js'), 'utf8');
ok('Suíte original conserva comparação e aceita formatação', () => assert.ok(infra.includes(String(dateRule))));
const personal = fs.readFileSync(path.join(root, 'tests/test-personal.js'), 'utf8');
const signature = /function plnDia\(d(?:,iso)?\)/;
ok('Suíte original aceita assinatura legada ou com data', () => {
  assert.ok(personal.includes(String(signature)));
  assert.ok(signature.test('function plnDia(d)'));
  assert.ok(signature.test('function plnDia(d,iso)'));
  assert.ok(!signature.test('function outro(d,iso)'));
  assert.ok(!signature.test('function plnDia()'));
});
const sql = fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8');
// O delimitador inicial $$ vem antes do corpo: localizar o corpo pela dupla.
const start = sql.search(/create or replace function public\.app_agenda_pede\(/i);
assert.ok(start >= 0, 'RPC da agenda existe no setup');
const first = sql.indexOf('$$', start), last = sql.indexOf('$$', first + 2);
assert.ok(first >= start && last > first, 'Corpo completo da RPC localizado');
const body = sql.slice(first + 2, last);
ok('RPC canônica conserva data local, porteiro e regra online', () => {
  assert.ok(dateRule.test(body));
  assert.match(body, /public\.app_aluno_ativo\(t\)/);
  assert.match(body, /atendimento_online/);
  assert.match(sql, /create or replace function public\.hoje_br\(\)/);
});

global.self = global;
require('../app/aluno-skin.js');
require('../app/aluno-builder.js');
const weekly = { '1': [{tp:'ficha',i:0,n:'Semanal',h:'07:00'}], '2': {tp:'cardio',i:0,n:'Legado'} };
const dated = { '2026-09-14': [{tp:'wod',i:0,n:'Por data',h:'18:00'}], '2026-09-21': [] };
const html = global.MT_APP_ALUNO.monta({a:{nome:'Fixture isolada'},planoApp:weekly,planoDatas:dated});
const begin = html.indexOf('function plnDia('), end = html.indexOf('function plnPri(', begin);
assert.ok(begin >= 0 && end > begin, 'Leitor de agenda canônico localizado');
function payload(name) { const m = html.match(new RegExp('var '+name+'=(.+?);(?=var |function )')); assert.ok(m, name+' serializado'); return JSON.parse(m[1]); }
const context = vm.createContext({PLANO:payload('PLANO'),PLANO_DATAS:payload('PLANO_DATAS')});
ok('Pacote mantém a semana publicada',()=>assert.deepEqual(context.PLANO,weekly));
ok('Pacote mantém o planejamento por data',()=>assert.deepEqual(context.PLANO_DATAS,dated));
vm.runInContext(html.slice(begin,end), context, {timeout:1000});
const get = expression => JSON.parse(JSON.stringify(vm.runInContext(expression,context,{timeout:1000})));
const before = JSON.stringify({weekly:context.PLANO,dated:context.PLANO_DATAS});
ok('Chamada legada mantém o plano semanal',()=>assert.deepEqual(get('plnDia(1)'),weekly['1']));
ok('Data específica prevalece sobre a semana',()=>assert.deepEqual(get("plnDia(1,'2026-09-14')"),dated['2026-09-14']));
ok('Descanso explícito por data não recupera treino semanal',()=>assert.deepEqual(get("plnDia(1,'2026-09-21')"),[]));
ok('Data sem substituição mantém a semana',()=>assert.deepEqual(get("plnDia(1,'2026-09-28')"),weekly['1']));
ok('Objeto legado continua sendo uma lista',()=>assert.deepEqual(get('plnDia(2)'),[weekly['2']]));
ok('Dia sem treino retorna lista vazia',()=>assert.deepEqual(get('plnDia(0)'),[]));
ok('Consultar não modifica a fonte',()=>assert.equal(JSON.stringify({weekly:context.PLANO,dated:context.PLANO_DATAS}),before));
context.PLANO_DATAS = Object.create({'2026-09-28':dated['2026-09-14']});
ok('Propriedade herdada não substitui a prescrição',()=>assert.deepEqual(get("plnDia(1,'2026-09-28')"),weekly['1']));
ok('Gaveta original permanece sem cartão duplicado',()=>{
  assert.match(html,/id='semDia'/); assert.match(html,/data-semt=/); assert.doesNotMatch(html,/id='agHojeCard'/);
});
console.log(checks+' verificações de contrato da agenda aprovadas; sem servidor ou dados reais.');
