'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
 const context={};context.self=context;
 vm.runInNewContext(fs.readFileSync(path.join(root,'nutri/food-catalog-data.js'),'utf8'),context);
 const foods=JSON.parse(JSON.stringify(context.MT_NUTRI_FOODS));
 const {makeFoodItem,changeFoodMeasure,measuredItemNutrition}=await import(pathToFileURL(path.join(root,'nutri/food-measures.js')));
 assert(foods.length>=3000,'At least 3,000 actual catalog records');assert.equal(new Set(foods.map(f=>f.id)).size,foods.length);
 const {normalizaItem}=(()=>{const c={};c.self=c;vm.runInNewContext(fs.readFileSync(path.join(root,'nutri/vendor/nutricao-core.js'),'utf8'),c);return c.MT_NUTRICAO;})();
 for(const food of foods){
   assert(food.n&&food.source&&/^https:\/\//.test(food.sourceUrl),food.id);
   const item=makeFoodItem(food,100,food.baseUnit,{id:'validation'}),saved=normalizaItem(item,true);
   assert(saved,food.id+' survives persistence');
   const nutrition=measuredItemNutrition(saved);
   for(const key of ['k','pt','cb','g'])assert(Math.abs(nutrition.total[key]-food[key])<1e-8,food.id+' '+key);
   for(const measure of food.measures){
     const changed=changeFoodMeasure(item,measure.id);
     assert(Math.abs(measuredItemNutrition(changed).baseQuantity-100)<1e-8,food.id+' quantity invariant');
   }
 }
 console.log('PASS '+foods.length+' source records persist and calculate without inventing macros');
 const rice=foods.find(f=>f.id==='taco:3'),oats=foods.find(f=>f.id==='taco:7');
 assert.equal(rice.measures.find(m=>m.id==='ibge-16').amount,25);
 assert.equal(oats.measures.find(m=>m.id==='ibge-16').amount,15);
 assert(!foods.some(f=>f.id==='taco:2'&&f.measures.length),'Cooked rice measures cannot leak to raw rice');
 const zero=foods.find(f=>f.k===0);assert(zero,'Known zero-energy products stay valid');
 assert(foods.some(f=>f.baseUnit==='ml'),'Explicit volume reference available');
 assert(foods.some(f=>f.id.startsWith('off:')&&f.brand&&f.barcode),'Real branded products available');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'nutri/data/catalog-manifest.json'),'utf8'));
 assert.equal(manifest.records,foods.length);
 const sha256=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
 const sourceFoods=[];
 for(const source of manifest.sources){
   const bytes=fs.readFileSync(path.join(root,'nutri/data',source.file));
   assert.equal(sha256(bytes),source.sha256,source.file+' distributed checksum');
   assert.equal(JSON.parse(bytes).length,source.records);
   sourceFoods.push(...JSON.parse(bytes));
 }
 const quarantineBytes=fs.readFileSync(path.join(root,'nutri/data',manifest.quarantine.file));
 assert.equal(sha256(quarantineBytes),manifest.quarantine.sha256);
 const quarantined=new Set(JSON.parse(quarantineBytes).records.map(record=>record.id));
 assert.equal(quarantined.size,manifest.quarantine.records);
 assert.deepEqual(foods,sourceFoods.filter(food=>!quarantined.has(food.id)),'App catalog exactly matches source files after documented quarantine');
 assert.deepEqual(JSON.parse(JSON.stringify(context.MT_NUTRI_FOOD_CATALOG_INFO)),manifest);
 const offReport=JSON.parse(fs.readFileSync(path.join(root,'nutri/data/openfoodfacts-import-report.json'),'utf8'));
 assert.equal(offReport.sha256,manifest.sources.find(source=>source.file==='openfoodfacts.json').sha256);
 const auditBytes=fs.readFileSync(path.join(root,'nutri/data',offReport.micronutrientQuality.auditFile));
 assert.equal(sha256(auditBytes),offReport.micronutrientQuality.auditSha256);
 assert.equal(offReport.acceptedRows+Object.values(offReport.rejectedRows).reduce((sum,n)=>sum+n,0),offReport.inputRows);
 for(const code of ['7899970402883','7891097101717','7898276600108','7896051131038','7894904252213','7891991000840','7894900087123']){
   assert(!foods.some(food=>food.id==='off:'+code),'Suspect source record stays quarantined: '+code);
 }
 console.log('PASS source-specific household weights, explicit volume, provenance and count');
})().catch(error=>{console.error(error);process.exitCode=1;});
