'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve(__dirname,'..'),moduleFile=name=>pathToFileURL(path.join(root,'nutri',name));
  const {suggestFoodSubstitutions:suggest,compareFoodItems:compare}=await import(moduleFile('food-substitutions.js'));
  const {makeFoodItem,changeFoodMeasure,measuredItemNutrition}=await import(moduleFile('food-measures.js'));
  const near=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
  const macros=['k','pt','cb','g'];let passed=0;const pass=text=>{passed++;console.log('PASS '+text);};
  // Synthetic composition isolates ranking and conversion, not dietary advice.
  const rice={id:'test:rice',n:'Arroz cozido',baseAmount:100,baseUnit:'g',k:130,pt:3,cb:28,g:.3,source:'Teste sintético',sourceUrl:'https://example.test/rice',measures:[{id:'spoon',label:'colher de sopa',amount:25,unit:'g',source:'Equivalência de teste'}]};
  const food=(id,n,override={})=>({...structuredClone(rice),id,n,...override});
  const target=makeFoodItem(rice,150,'g',{id:'prescribed'});
  const potato=food('test:potato','Batata-doce, cozida',{k:65,pt:1.5,cb:14,g:.15});
  const badFit=food('test:poor','Batata, cozida',{k:130,pt:5,cb:25,g:.3});
  const before=structuredClone({target,foods:[potato,badFit]});
  const ranked=suggest(target,[badFit,potato]);
  assert(ranked.length>=1);assert.equal(ranked[0].food.id,potato.id);near(ranked[0].item.qtd,300);near(ranked[0].comparison.score,0);
  assert.deepEqual({target,foods:[potato,badFit]},before);assert.equal(ranked[0].group,'Cereais e tubérculos');assert.equal(ranked[0].preparation,'Cozido');
  const caloriesOnly=makeFoodItem(badFit,150,'g',{id:'calories-only'});
  const badRank=suggest(target,[badFit])[0];
  assert(badRank);assert(badRank.item.qtd!==150);assert(badRank.comparison.score<compare(target,caloriesOnly).score);
  pass('quantity fitting uses all four nutrients, scales once, preserves inputs and includes cooked sweet potato');

  const spoonTarget=changeFoodMeasure(target,'spoon');assert.equal(spoonTarget.qtd,6);
  const stale={...spoonTarget,k:9999,pt:9999,cb:9999,g:9999};
  const staleComparison=suggest(stale,[potato])[0].comparison;
  near(staleComparison.score,0);for(const k of macros)near(staleComparison.target[k],ranked[0].comparison.target[k]);
  const branded=food('test:branded','Mandioca cozida',{brand:'Marca exemplo',barcode:'12345678',fb:null,sodiumMg:0,sourceUpdatedAt:'2026-10-21',retrievedAt:'2026-10-22'});
  const suggestion=suggest(target,[branded])[0];assert(suggestion);assert.equal(suggestion.item.nome,'Mandioca cozida · Marca exemplo');
  assert.equal(suggestion.item.measurement.sourceUrl,rice.sourceUrl);assert.equal(suggestion.item.measurement.barcode,'12345678');assert.equal(suggestion.item.measurement.retrievedAt,'2026-10-22');
  assert.equal(suggestion.item.measurement.nutrients.fb,null);assert.equal(suggestion.item.measurement.nutrients.sodiumMg,0);
  const stored=JSON.parse(JSON.stringify(suggestion.item)),originalComparison=compare(target,stored);branded.k=500;branded.measures[0].amount=200;
  assert.deepEqual(compare(target,stored),originalComparison);assert.equal(stored.measurement.nutrients.k,130);assert.equal(stored.measurement.measures[1].amount,25);
  pass('household targets use their saved composition and suggested items retain independent branded provenance');

  const milk=food('test:milk','Leite integral',{baseUnit:'ml',k:60,pt:3,cb:5,g:3,measures:[]});
  const milkTarget=makeFoodItem(milk,200,'ml',{id:'milk-line'});
  const volumeCandidate=food('test:milk-volume','Leite parcialmente desnatado',{baseUnit:'ml',k:60,pt:3,cb:5,g:3,measures:[]});
  const massCandidate={...volumeCandidate,id:'test:milk-mass',n:'Leite semidesnatado',baseUnit:'g'};
  assert.deepEqual(suggest(milkTarget,[massCandidate,volumeCandidate]).map(v=>v.food.id),[volumeCandidate.id]);
  assert.deepEqual(suggest({...milkTarget,measurement:undefined},[volumeCandidate]),[]);
  assert.deepEqual(suggest({...rice,nome:'Leite integral',porcao:'1 porção',qtd:1},[massCandidate]),[],'generic mass-based milk does not prove liquid preparation');
  const legacy={id:'old-line',alimId:'old-food',nome:'Arroz cozido',porcao:'1 porção',qtd:'1,5',k:'130',pt:'3',cb:'28',g:'0,3'};
  const legacyBefore=structuredClone(legacy),legacyComparison=compare(legacy,target);near(legacyComparison.score,0);assert.deepEqual(legacy,legacyBefore);
  assert.equal(suggest(legacy,[potato])[0].item.qtd,300);
  const legacyMilk={id:'milk-line',nome:'Leite integral',porcao:'200 ml',qtd:1,k:120,pt:6,cb:10,g:6};
  assert.deepEqual(suggest(legacyMilk,[massCandidate,volumeCandidate]).map(v=>v.food.id),[volumeCandidate.id]);
  const zeros=compare({...legacy,qtd:1,g:0},{...legacy,qtd:1,g:1});assert.equal(zeros.percentDelta.g,null);assert.equal(compare({...legacy,g:0},{...legacy,g:0}).percentDelta.g,0);
  assert.equal(zeros.delta.g,1);assert(zeros.score>0);
  pass('ml and g remain distinct; legacy portions and decimal commas calculate without density assumptions or zero-denominator percentages');

  for(const value of [null,undefined,'',true,{},[],NaN,Infinity,-1]){
    const invalid={...legacy,pt:value};assert.deepEqual(suggest(invalid,[potato]),[]);assert.throws(()=>compare(invalid,target));
    assert.deepEqual(suggest(target,[{...potato,pt:value}]),[]);
  }
  for(const quantity of [0,-1,1001,'',null,NaN])assert.deepEqual(suggest({...legacy,qtd:quantity},[potato]),[]);
  for(const measurement of [null,{}, {...target.measurement,selectedMeasureId:'ml'},{...target.measurement,nutrients:{...target.measurement.nutrients,pt:null}}]){
    assert.deepEqual(suggest({...target,measurement},[potato]),[]);assert.throws(()=>compare({...target,measurement},target));
  }
  assert.deepEqual(suggest({...legacy,k:0},[potato]),[]);
  assert.deepEqual(suggest(target,[{...potato,baseUnit:undefined},{...potato,measures:[{id:'bad',label:'copo',amount:200,unit:'ml'}]}]),[]);
  for(const factor of [1000,.01])assert.deepEqual(suggest(target,[food('test:extreme','Batata cozida',Object.fromEntries(macros.map(k=>[k,rice[k]*factor])))]),[]);
  const fifth=food('test:ratio','Batata cozida',Object.fromEntries(macros.map(k=>[k,rice[k]/5])));assert.deepEqual(suggest(target,[fifth]),[]);
  assert.deepEqual(suggest({...legacy,recipeComposition:{}},[potato]),[]);
  assert.deepEqual(suggest({...legacy,nome:'Preparação sem grupo reconhecido',categoria:'Miscelâneas'},[potato]),[]);
  pass('incomplete or invalid nutrients and snapshots fail closed; unknown dishes and extreme quantities do not produce a suggestion');

  const incompatible=['Arroz cru','Arroz seco','Arroz frito','Farinha de arroz','Arroz integral','Arroz carreteiro cozido','Bolinho de arroz cozido','Almôndega + arroz + legumes cozidos','Sopa de arroz cozida'];
  assert.deepEqual(suggest(target,incompatible.map((n,i)=>food('bad:'+i,n))),[]);
  const targetBeans={...legacy,nome:'Feijão cozido'},beanCandidate=food('test:lentil','Lentilha cozida');
  assert.equal(suggest(targetBeans,[beanCandidate]).length,1);assert.deepEqual(suggest(targetBeans,[food('test:sprout','Feijão, broto, cru')]),[]);
  const targetFruit={...legacy,nome:'Mamão',porcao:'1 porção'};
  const fruitBad=['Suco de mamão','Papinha de banana','Purê de banana','Maria-mole de coco','Bananada','Doce de goiaba','Geleia de morango','Bala de banana'];
  assert.deepEqual(suggest(targetFruit,fruitBad.map((n,i)=>food('fruitbad:'+i,n))),[]);assert.equal(suggest(targetFruit,[food('fruit:good','Banana prata')]).length,1);
  const targetDairy={...legacy,nome:'Leite integral'};
  assert.deepEqual(suggest(targetDairy,['Doce de leite','Chocolate ao leite','Leite de coco','Leite, de soja'].map((n,i)=>food('dairy:'+i,n))),[]);
  assert.deepEqual(suggest({...legacy,nome:'Iogurte natural'},[food('candy:yogurt','Bala Iogurte')]),[]);
  assert.deepEqual(suggest({...legacy,nome:'Queijo minas'},[food('soy:tofu','Soja, queijo (tofu)')]),[]);
  assert.deepEqual(suggest({...legacy,nome:'Whey protein em pó'},['Aveia + whey','Bananada + whey','Bar Whey Grego','Whey protein shake'].map((n,i)=>food('whey:'+i,n))),[]);
  assert.deepEqual(suggest({...legacy,nome:'Frango grelhado'},['Frango empanado grelhado','Fígado bovino grelhado','Salsicha de frango grelhada'].map((n,i)=>food('meat:'+i,n))),[]);
  pass('food identity and preparation reject mixed dishes, confectionery, organ meats and misleading ingredient words');

  const a=food('id:a','Batata a cozida'),b=food('id:b','Batata b cozida'),c=food('id:c','Batata c cozida');
  const candidates=[rice,a,b,c,{...a},food('copy:name',rice.n)];
  assert.deepEqual(suggest(target,candidates,{excludeIds:[b.id],limit:2}).map(v=>v.food.id),[a.id,c.id]);
  assert.deepEqual(suggest(target,[...candidates].reverse(),{excludeIds:[b.id],limit:2}).map(v=>v.food.id),[a.id,c.id]);
  assert.deepEqual(suggest(target,candidates,{limit:0}),[]);assert(suggest(target,candidates,{limit:1}).length<=1);
  const barcodeTarget=makeFoodItem({...rice,barcode:'11111111'},100,'g',{id:'barcode-line'});assert.deepEqual(suggest(barcodeTarget,[{...a,barcode:'11111111'}]),[]);
  assert.equal(suggest({...legacy,id:a.id,alimId:undefined},[a]).length,1,'row id is not catalog id');
  assert.deepEqual(suggest(target,[{...a,archived:true},{...b,_resource:{archived:true}}]),[]);
  pass('stable catalog identity, barcodes, exclusions and limits prevent self suggestions and repeated candidates');

  const catalog=['taco.json','openfoodfacts.json'].flatMap(filename=>JSON.parse(fs.readFileSync(path.join(root,'nutri/data',filename),'utf8')));
  assert.equal(catalog.length,7201);const savedCatalog=JSON.stringify(catalog);
  const ambiguousMilk=catalog.find(f=>f.id==='off:7898080640369');assert(ambiguousMilk);assert.deepEqual(suggest({...legacyMilk,porcao:'1 porção'},[ambiguousMilk]),[]);
  const realRice=makeFoodItem(catalog.find(f=>f.id==='taco:3'),150,'g',{id:'real-rice'});
  const examples=[realRice,{id:'demo-rice',nome:'Arroz cozido',porcao:'100 g',qtd:1,k:130,pt:3,cb:28,g:0},{id:'demo-chicken',nome:'Frango grelhado',porcao:'100 g',qtd:1,k:165,pt:31,cb:0,g:4},{id:'demo-papaya',nome:'Mamão',porcao:'1 porção',qtd:1,k:60,pt:1,cb:15,g:0}];
  for(const example of examples){
    const found=suggest(example,catalog);assert(found.length>0,example.nome+' has candidates');assert(found.length<=6);
    for(const result of found){assert.deepEqual(result.comparison,compare(example,result.item));assert(result.item.qtd>=1&&result.item.qtd<=1000);near(Math.round(result.item.qtd*10),result.item.qtd*10);for(const k of macros)near(result.comparison.candidate[k],measuredItemNutrition(result.item).total[k]);}
  }
  assert.deepEqual(suggest({id:'demo-beans',nome:'Feijão',porcao:'1 concha',qtd:1,k:77,pt:5,cb:14,g:0},catalog),[],'unknown preparation is not inferred from a ladle');
  assert.equal(JSON.stringify(catalog),savedCatalog);
  pass('real 7,201-food catalog supports measured rice and legacy demo foods without changing the catalog or guessing bean preparation');
  console.log(passed+' food substitution groups passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
