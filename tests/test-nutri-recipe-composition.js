'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
(async()=>{
 const {recipeIngredient,normalizeRecipeComposition,recipeNutrition,makeRecipeFood,expandRecipeItem}=await import(pathToFileURL(path.join(__dirname,'../nutri/recipe-composition.js')));
 vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../nutri/vendor/nutricao-core.js'),'utf8'));
 let count=0;const pass=message=>{count++;console.log('PASS '+message);};
 const original={v:1,recipeId:'recipe-a',recipeVersion:3,title:'Preparação teste',yield:4,ingredients:[{id:'rice',alimId:'catalog-rice',nome:'Arroz cozido',porcao:'100 g',qtd:2,k:130,pt:3,cb:28,g:0},{id:'bean',nome:'Feijão',porcao:'1 concha',qtd:1,k:80,pt:5,cb:14,g:1}],steps:['Misture.'],source:'Valores sintéticos para teste',notes:'Sirva depois de descansar.'};
 const before=structuredClone(original),nutrition=recipeNutrition(original);
 assert.deepEqual(nutrition.total,{k:340,pt:11,cb:70,g:1});assert.deepEqual(nutrition.perServing,{k:85,pt:2.75,cb:17.5,g:.25});assert(nutrition.complete);
 const food=makeRecipeFood(original,2,{id:'prescribed-a',reviewedAt:'2026-10-17T12:00:00Z'});
 assert.equal(food.k,85);assert.equal(food.qtd,2);assert.equal(food.recipeComposition.recipeVersion,3);assert.deepEqual(original,before);
 const expanded=expandRecipeItem(food);assert.deepEqual(expanded.map(x=>[x.nome,x.qtd]),[['Arroz cozido',1],['Feijão',.5]]);expanded[0].nome='Alterado';assert.equal(food.recipeComposition.ingredients[0].nome,'Arroz cozido');
 pass('whole preparation -> serving macros -> grocery ingredients uses yield once and independent snapshots');
 original.ingredients[0].qtd=900;assert.equal(food.recipeComposition.ingredients[0].qtd,2);
 const normalized=MT_NUTRICAO.normalizaItem({...food,k:99999,pt:99999});assert.equal(normalized.k,85);assert.equal(normalized.pt,2.75);assert.deepEqual(normalized.recipeComposition,food.recipeComposition);
 const plan=MT_NUTRICAO.normalizaPlano({titulo:'Plano',refeicoes:[{id:'meal',titulo:'Almoço',itens:[food]}]});assert.deepEqual(plan.refeicoes[0].itens[0].recipeComposition,food.recipeComposition);assert.equal(MT_NUTRICAO.totalPlano(plan).k,170);
 pass('vendor normalizer and published plan preserve composition and recompute macros from its snapshot');
 const unknown={...before,ingredients:[{...before.ingredients[0],cb:null},{...before.ingredients[1]}]};
 assert.equal(recipeNutrition(unknown).perServing.cb,null);assert.equal(recipeNutrition(unknown).perServing.g,.25);assert.equal(recipeNutrition(unknown).complete,false);assert.throws(()=>makeRecipeFood(unknown,1,{id:'bad'}),/não informados/);
 assert.equal(recipeIngredient({...before.ingredients[0],k:''}).k,null);assert.equal(recipeIngredient({...before.ingredients[0],g:0}).g,0);
 pass('missing nutrients remain unknown, zero is preserved and incomplete recipes cannot enter prescription');
 for(const bad of [null,{}, {...before,yield:0},{...before,yield:Infinity},{...before,ingredients:[]},{...before,ingredients:[{...before.ingredients[0],recipeComposition:before}]},{...before,ingredients:[{...before.ingredients[0],recipeComposition:null}]},{...before,ingredients:[{...before.ingredients[0],qtd:-1}]}]){
  assert.throws(()=>expandRecipeItem({qtd:1,recipeComposition:bad}));assert.equal(MT_NUTRICAO.normalizaItem({...food,recipeComposition:bad}),null);
 }
 assert.equal(expandRecipeItem({nome:'Alimento comum',qtd:1}),null);assert.throws(()=>expandRecipeItem({...food,qtd:NaN}));assert.throws(()=>normalizeRecipeComposition({...before,ingredients:Array(101).fill(before.ingredients[0])}));
 pass('malformed, recursive and oversized compositions are rejected instead of partial groceries or silent fallback');
 const partial={...before,unquantifiedIngredients:['Azeite sem quantidade']};assert.deepEqual(recipeNutrition(partial).perServing,{k:null,pt:null,cb:null,g:null});assert.throws(()=>makeRecipeFood(partial,1,{id:'partial'}),/ingredientes sem quantidade/);assert.throws(()=>expandRecipeItem({...food,recipeComposition:partial}),/ingredientes sem quantidade/);assert.equal(MT_NUTRICAO.normalizaItem({...food,recipeComposition:partial}),null);
 const {normalizeRecipeReference}=await import(pathToFileURL(path.join(__dirname,'../nutri/plan-recipes.js')));
 const oldPartial=normalizeRecipeReference({id:'partial',n:'Preparo parcial antigo',ing:['Azeite sem quantidade'],composition:before});assert.deepEqual(oldPartial.composition.unquantifiedIngredients,['Azeite sem quantidade']);assert(oldPartial.ingredientes.includes('Azeite sem quantidade'));assert.equal(recipeNutrition(oldPartial.composition).complete,false);
 const legacyCopy=MT_NUTRICAO.normalizaReceita(oldPartial);assert(legacyCopy.ingredientes.includes('Azeite sem quantidade'));assert.equal(legacyCopy.notes,before.notes);assert.equal(food.recipeComposition.notes,before.notes);
 pass('text-only pending ingredients prevent partial nutrition and prescription, while notes and full ingredient text survive legacy preparation snapshots');
 const alternative={...food,id:'alt',qtd:1};const ordinary={...before.ingredients[0],substituicoes:[alternative]};const withAlternative=MT_NUTRICAO.normalizaItem(ordinary);assert.equal(withAlternative.substituicoes[0].recipeComposition.yield,4);
 const legacy=MT_NUTRICAO.normalizaReceita({id:'legacy',n:'Receita antiga',ing:['ingrediente em texto'],modo:['Prepare'],k:100});assert.deepEqual(legacy.ingredientes,['ingrediente em texto']);assert.equal(legacy.cb,undefined);assert(!legacy.recipeComposition);
 pass('recipes survive as prescribed alternatives while legacy text-only recipes remain unchanged');
 console.log(count+' recipe composition groups passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
