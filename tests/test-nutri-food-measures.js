'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
(async()=>{
  const root=path.join(__dirname,'..'),moduleFile=name=>pathToFileURL(path.join(root,'nutri',name));
  const {foodMeasures,makeFoodItem,changeFoodMeasure,updateFoodQuantity,measuredItemNutrition,normalizeFoodMeasurementSnapshot,formatFoodQuantity,parseFoodQuantity}=await import(moduleFile('food-measures.js'));
  const {recipeIngredient,recipeNutrition,makeRecipeFood,expandRecipeItem}=await import(moduleFile('recipe-composition.js'));
  const {shoppingList,portionLabel}=await import(moduleFile('shopping.js'));
  const same=(left,right)=>assert.deepEqual(JSON.parse(JSON.stringify(left)),JSON.parse(JSON.stringify(right)));
  const near=(left,right)=>assert(Math.abs(left-right)<1e-9,`${left} differs from ${right}`);
  let count=0;const pass=message=>{count++;console.log('PASS '+message);};
  // Synthetic fixtures test conversions, not a nutritional reference database.
  const rice={id:'test:rice',n:'Arroz de teste',baseAmount:100,baseUnit:'g',k:130,pt:2.5,cb:28,g:.3,fb:1,sugars:null,sodiumMg:0,magnesiumMg:10,phosphorusMg:20,zincMg:2,vitaminCMg:null,source:'Fonte sintética',sourceUrl:'https://example.test/rice',retrievedAt:'2026-10-22',measures:[{id:'spoon',label:'colher de sopa',amount:25,unit:'g',source:'Equivalência sintética'}]};
  const original=structuredClone(rice),grams=makeFoodItem(rice,'150','g',{id:'food-rice'}),spoons=changeFoodMeasure(grams,'spoon');
  assert.equal(grams.qtd,150);assert.equal(grams.porcao,'1 g');near(grams.k,1.3);assert.equal(spoons.qtd,6);assert.equal(spoons.porcao,'1 colher de sopa (25 g)');near(spoons.k,32.5);for(const [key,value] of Object.entries(measuredItemNutrition(grams).total)){const other=measuredItemNutrition(spoons).total[key];if(value===null)assert.equal(other,null);else near(value,other);}same(changeFoodMeasure(spoons,'g'),grams);same(rice,original);
  assert.equal(formatFoodQuantity(grams),'150 g');assert.equal(formatFoodQuantity(spoons),'6 × colher de sopa (150 g)');assert.equal(measuredItemNutrition(spoons).total.sugars,null);assert.equal(measuredItemNutrition(spoons).total.sodiumMg,0);assert.equal(measuredItemNutrition(spoons).total.magnesiumMg,15);assert.equal(measuredItemNutrition(spoons).total.zincMg,3);assert.equal(measuredItemNutrition(spoons).total.vitaminCMg,null);
  const fractional=updateFoodQuantity(spoons,'1,5');assert.equal(fractional.qtd,1.5);near(measuredItemNutrition(fractional).baseQuantity,37.5);near(measuredItemNutrition(fractional).total.k,48.75);assert.equal(spoons.qtd,6);
  pass('grams and specific household measure preserve physical quantity and all known nutrients, including decimals and explicit zero');

  const drink={id:'test:drink',n:'Bebida de teste',baseAmount:100,baseUnit:'ml',k:40,pt:3,cb:4,g:1,calciumMg:120,brand:'Marca de teste',barcode:'12345678',source:'Rótulo sintético',measures:[{id:'glass',label:'copo',amount:200,unit:'ml',source:'Rótulo sintético'}]};
  const volume=makeFoodItem(drink,250,'ml',{id:'drink'}),glass=changeFoodMeasure(volume,'glass');
  assert.equal(volume.nome,'Bebida de teste · Marca de teste');assert.equal(volume.measurement.brand,'Marca de teste');assert.equal(volume.alimId,'test:drink');assert.equal(drink.n,'Bebida de teste');
  assert.equal(makeFoodItem({...drink,n:'Bebida MARCA DE TESTE'},100,'ml',{id:'brand-existing'}).nome,'Bebida MARCA DE TESTE');
  const longBrand=makeFoodItem({...drink,n:'Alimento '.repeat(40),brand:'Marca '.repeat(30)},100,'ml',{id:'long-name'});assert(longBrand.nome.length<=200);assert(longBrand.nome.includes(' · Marca'));assert(longBrand.nome.endsWith('…'));assert.equal(longBrand.measurement.brand,'Marca '.repeat(30).trim());
  assert.equal(glass.qtd,1.25);assert.equal(measuredItemNutrition(glass).baseQuantity,250);assert.equal(measuredItemNutrition(glass).total.calciumMg,300);assert.equal(glass.baseGramas,undefined);same(foodMeasures(drink).map(m=>m.id),['ml','glass']);assert.throws(()=>changeFoodMeasure(glass,'g'),/compatível/);assert.throws(()=>foodMeasures({...drink,measures:[{id:'spoon',label:'colher',amount:15,unit:'g'}]}),/mesma unidade/);
  assert.throws(()=>makeFoodItem({...rice,baseUnit:'kg'},100,'g',{id:'bad'}),/inválidas/);assert.throws(()=>makeFoodItem({...rice,baseAmount:null},1,'g',{id:'bad'}));
  pass('liquid portions use only ml equivalences; no milliliter is inferred to weigh one gram');

  for(const invalid of [null,undefined,'',' ','-1',-1,0,Infinity,NaN,true,[],{},'1,2,3','1.2.3',1001])assert.throws(()=>parseFoodQuantity(invalid));
  for(const invalid of [-1,Infinity,NaN,true,[],{},'invalid'])assert.throws(()=>makeFoodItem({...rice,k:invalid},100,'g',{id:'bad'}));
  assert.throws(()=>makeFoodItem({...rice,pt:null},100,'g',{id:'bad'}),/não informados/);assert.throws(()=>makeFoodItem({...rice,pt:undefined},100,'g',{id:'bad'}),/não informados/);
  assert.throws(()=>changeFoodMeasure(makeFoodItem(drink,10,'glass',{id:'large'}),'ml'),/1.000/);
  assert.throws(()=>normalizeFoodMeasurementSnapshot({...grams.measurement,measures:[{id:'x',label:'x',amount:0,unit:'g'}]}));
  assert.throws(()=>normalizeFoodMeasurementSnapshot({...grams.measurement,measures:[{id:'x',label:'x',amount:2,unit:'g'},{id:'x',label:'x',amount:3,unit:'g'}]}));
  const maximum={...rice,measures:Array.from({length:20},(_,i)=>({id:'measure'+i,label:'Medida '+i,amount:i+2,unit:'g'}))};assert.equal(foodMeasures(maximum).length,21);assert.equal(normalizeFoodMeasurementSnapshot(makeFoodItem(maximum,100,'g',{id:'max'}).measurement).measures.length,21);
  pass('invalid input, incomplete macros, duplicate measures and out-of-contract quantities fail instead of creating fake zero nutrients');

  const legacy={id:'old',alimId:'old',nome:'Legado',porcao:'1 fatia',qtd:2,k:50,pt:2,cb:8,g:1};
  assert.deepEqual(foodMeasures({n:'Legado',p:'100 g',k:100}),[]);assert.throws(()=>changeFoodMeasure(legacy,'g'),/porção antiga/);assert.equal(portionLabel(legacy),'2 × 1 fatia');
  const cores=[];
  for(const filename of ['assets/nutricao-core.js','nutri/vendor/nutricao-core.js']){
    const sandbox={TextEncoder};vm.runInNewContext(fs.readFileSync(path.join(root,filename),'utf8'),sandbox);const core=sandbox.MT_NUTRICAO;cores.push(core);
    same(core.normalizaItem(legacy),legacy);
    const restored=core.normalizaItem(JSON.parse(JSON.stringify({...spoons,k:9999,fb:9999,porcao:'porção falsa',baseGramas:999})));
    same(restored,spoons);assert.equal(restored.measurement.sourceUrl,rice.sourceUrl);assert.equal(restored.measurement.retrievedAt,rice.retrievedAt);assert.equal(core.normalizaItem(glass).baseGramas,undefined);
    const plan=core.normalizaPlano({titulo:'Plano teste',refeicoes:[{id:'m',titulo:'Almoço',itens:[spoons]}]});same(plan.refeicoes[0].itens[0].measurement,spoons.measurement);near(core.totalPlano(plan).k,195);
    const diary=core.normalizaRegistro({id:'test_record',d:'2026-10-22',atualizadoEm:'2026-10-22T12:00:00Z',itens:[glass]});same(diary.itens[0].measurement,glass.measurement);
    for(const measurement of [null,{}, {...spoons.measurement,selectedMeasureId:'ml'},{...spoons.measurement,baseUnit:'ml'},{...spoons.measurement,nutrients:{...spoons.measurement.nutrients,pt:null}},{...spoons.measurement,nutrients:{...spoons.measurement.nutrients,fb:-1}}]){
      assert.equal(core.normalizaItem({...spoons,measurement}),null);assert.match(core.validaPlanoEntrada({refeicoes:[{itens:[{...spoons,measurement}]}]}),/nutrientes/);
    }
    assert.equal(core.normalizaItem({...spoons,recipeComposition:{}}),null);
    const isolated=core.runtime();same(isolated.normalizaItem(spoons),spoons);
  }
  pass('both offline cores preserve independent snapshots across publication and diary, recompute from source, reject corrupt snapshots and preserve legacy portions');

  rice.k=999;rice.measures[0].amount=999;assert.equal(spoons.measurement.nutrients.k,130);assert.equal(spoons.measurement.measures[1].amount,25);
  const ingredient=recipeIngredient({...spoons,k:999});same(ingredient.measurement,spoons.measurement);near(ingredient.k,32.5);
  const recipe={v:1,recipeId:'recipe',recipeVersion:1,title:'Receita teste',yield:2,ingredients:[spoons,glass],steps:['Misture.'],source:'Teste'};
  const recipeTotals=recipeNutrition(recipe);near(recipeTotals.total.k,295);assert.equal(recipeTotals.total.fb,null);assert.equal(recipeTotals.total.calciumMg,null);assert.equal(recipeTotals.complete,true);
  const recipeFood=makeRecipeFood(recipe,2,{id:'meal-recipe',reviewedAt:'2026-10-22T12:00:00Z'}),restoredRecipe=cores[1].normalizaItem(recipeFood);
  same(restoredRecipe.recipeComposition.ingredients[0].measurement,spoons.measurement);assert.equal(restoredRecipe.fb,null);near(restoredRecipe.k,147.5);same(expandRecipeItem(recipeFood)[1].measurement,glass.measurement);
  const unknown={...spoons,measurement:{...spoons.measurement,nutrients:{...spoons.measurement.nutrients,pt:null}}};assert.equal(recipeIngredient(unknown).pt,null);assert.equal(recipeNutrition({...recipe,ingredients:[unknown]}).complete,false);assert.throws(()=>makeRecipeFood({...recipe,ingredients:[unknown]},1,{id:'bad'}),/não informados/);
  const rawExtra={...legacy,fb:null,sodiumMg:0};assert.equal(recipeIngredient(rawExtra).fb,null);assert.equal(recipeIngredient(rawExtra).sodiumMg,0);assert.throws(()=>recipeIngredient({...legacy,fb:-1}));
  pass('recipes retain measured ingredient provenance, correct yield and partial micronutrient availability without treating missing data as zero');

  const groceries=shoppingList({refeicoes:[{itens:[grams,glass]}]},'2026-10-22','2026-10-31');assert.equal(groceries.items.length,2);assert.equal(portionLabel(groceries.items[0]),'1500 g');assert.equal(portionLabel(groceries.items[1]),'12,5 × copo (2500 ml)');
  const badGroceries=shoppingList({refeicoes:[{itens:[{...grams,measurement:{}}]}]},'2026-10-22','2026-10-22');assert.equal(badGroceries.items.length,0);assert.equal(badGroceries.warnings.length,1);assert.equal(portionLabel({...grams,measurement:{}}),'Medida inválida — confira com sua nutri');
  pass('patient and grocery labels show physical totals, including aggregated quantities above one prescription line');
  console.log(count+' food measure groups passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
