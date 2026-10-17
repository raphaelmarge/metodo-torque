'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {shoppingList}=await import(pathToFileURL(path.join(__dirname,'../nutri/shopping.js')));
 const {plannerKey,planSignature,validatePlanner,savePlanner,readPlanner}=await import(pathToFileURL(path.join(__dirname,'../nutri/shopping-planner.js')));
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
 const rice={id:'rice',alimId:'rice',nome:'Arroz',qtd:1,porcao:'100 g',k:130,pt:3,cb:28,g:0,substituicoes:[{id:'potato',nome:'Batata',qtd:2,porcao:'80 g'}]};
 const plan={refeicoes:[{id:'lunch',titulo:'Almoço',dias:[1,3,5],itens:[rice]}]};
 const state={start:'2026-10-12',end:'2026-10-18',choices:{'0:0':0},dailyChoices:{'2026-10-12':{'0:0':-1},'2026-10-16':{'0:0':-1}}};
 const context={demo:false,userId:'user',clinicId:'clinic',patientId:'patient',planId:'plan',version:2};
 const memory=new Map(),store={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 test('daily overrides replace defaults without counting both options',()=>{
  const r=shoppingList(plan,state.start,state.end,state.choices,state.dailyChoices);
  assert.deepEqual(r.items,[{nome:'Arroz',porcao:'100 g',qtd:2},{nome:'Batata',porcao:'80 g',qtd:2}]);assert.deepEqual(r.occurrences,[3]);
 });
 test('choices on unscheduled days do not add occurrences',()=>{
  const r=shoppingList(plan,state.start,state.end,{}, {'2026-10-13':{'0:0':0}});assert.equal(r.items.length,1);assert.equal(r.items[0].qtd,3);
 });
 test('explicit main overrides alternative and absent daily option inherits default',()=>{
  const r=shoppingList(plan,state.start,state.end,{'0:0':0},{'2026-10-12':{'0:0':-1}});assert.equal(r.items[0].qtd,1);assert.equal(r.items[1].qtd,4);
 });
 test('reload restores validated choices under exactly the same publication/account',()=>{
  const key=plannerKey(context),sig=planSignature(plan);assert(savePlanner(store,key,sig,plan,state).saved);
  assert.deepEqual(readPlanner(store,key,sig,plan).state,state);
  for(const field of ['userId','clinicId','patientId','planId','version']){const other={...context,[field]:'other'};assert.equal(readPlanner(store,plannerKey(other),sig,plan).state,null);}
  assert.notEqual(plannerKey({...context,demo:true}),key);assert.equal(plannerKey({...context,userId:null}),null);
 });
 test('changed source invalidates old positional choices even with same version',()=>{
  const changed=structuredClone(plan);changed.refeicoes[0].itens[0].substituicoes[0].nome='Outra batata';
  assert.equal(readPlanner(store,plannerKey(context),planSignature(changed),changed).state,null);
  const demo1={refeicoes:[{id:'random1',itens:[{id:'random2',nome:'A',qtd:1}]}]};
  const demo2={refeicoes:[{id:'random3',itens:[{id:'random4',nome:'A',qtd:1}]}]};
  assert.equal(planSignature(demo1,true),planSignature(demo2,true));assert.notEqual(planSignature(demo1),planSignature(demo2));
 });
 test('invalid options never silently revert to another prescribed food',()=>{
  for(const choices of [{'0:0':99},{'0:0':-2},{'0:0':'0'},{'9:0':0},{'__proto__x':0}])assert.throws(()=>validatePlanner(plan,{...state,choices}));
  assert.throws(()=>validatePlanner(plan,{...state,dailyChoices:{'2026-10-12':{'0:0':99}}}));
 });
 test('shortening period drops out-of-range choices without mutating input',()=>{
  const before=structuredClone(state);const value=validatePlanner(plan,{...state,end:'2026-10-14'});
  assert.deepEqual(Object.keys(value.dailyChoices),['2026-10-12']);assert.deepEqual(state,before);
 });
 test('storage quota/corruption returns visible recoverable status and never claims saved',()=>{
  const broken={getItem:()=>'{bad',setItem:()=>{throw Error('quota');}};
  assert.equal(readPlanner(broken,'k','sig',plan).state,null);assert(readPlanner(broken,'k','sig',plan).message);
  const result=savePlanner(broken,'k','sig',plan,state);assert.equal(result.saved,false);assert.deepEqual(result.state,state);
 });
 test('recipe servings expand once into reviewed batch ingredients',()=>{
  const recipe={id:'dish',nome:'Arroz com legumes',qtd:2,porcao:'1 porção',recipeComposition:{v:1,recipeId:'r',recipeVersion:1,title:'Arroz com legumes',yield:4,ingredients:[{id:'i',alimId:'rice',nome:'Arroz',porcao:'100 g',qtd:4,k:130,pt:3,cb:28,g:0}],steps:[],source:'Manual',reviewedAt:'2026-10-17T12:00:00Z'}};
  const r=shoppingList({refeicoes:[{itens:[recipe]}]},state.start,state.start);
  assert.deepEqual(r.items,[{nome:'Arroz',porcao:'100 g',qtd:2}]);
 });
 test('malformed recipe never falls back to counting recipe title',()=>{
  const r=shoppingList({refeicoes:[{itens:[{nome:'Receita inválida',porcao:'1 porção',qtd:1,recipeComposition:{}}]}]},state.start,state.start);
  assert.equal(r.items.length,0);assert.equal(r.warnings.length,1);
 });
 console.log(`${count} weekly shopping checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
