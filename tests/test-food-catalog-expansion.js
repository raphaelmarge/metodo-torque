'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),json=file=>JSON.parse(read(file));
const context={};context.self=context;context.window=context;
vm.runInNewContext(read('assets/alimentos-db.js'),context);
const legacy=JSON.stringify(context.MT_ALIMENTOS),legacyCount=context.MT_ALIMENTOS.length;
vm.runInNewContext(read('nutri/food-catalog-data.js'),context);
vm.runInNewContext(read('assets/alimentos-catalogo-compartilhado.js'),context);
vm.runInNewContext(read('assets/nutricao-core.js'),context);
vm.runInNewContext(read('assets/personal-nutricao.js'),context);
const expanded=JSON.parse(JSON.stringify(context.MT_ALIMENTOS)),extra=json('nutri/data/openfoodfacts-expansion-20261028.json'),old=json('nutri/data/openfoodfacts.json');
const report=json('nutri/data/off-expansion-report.json'),manifest=json('nutri/data/catalog-manifest.json');
assert.equal(extra.length,5000);assert.equal(expanded.length,legacyCount+manifest.records);assert.equal(JSON.stringify(expanded.slice(0,legacyCount)),legacy);
assert.equal(new Set(expanded.map(x=>x.n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())).size,expanded.length);
assert.equal(manifest.records,12199);assert.equal(report.selectedRecords,5000);
const oldIds=new Set(old.map(x=>x.id));assert(extra.every(x=>!oldIds.has(x.id)));assert.equal(new Set(extra.map(x=>x.id)).size,5000);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
assert.equal(sha('nutri/data/'+report.sourceFile),report.sha256);
const quality=json('nutri/data/'+report.qualityReport),audit=json('nutri/data/'+report.qualityAudit);
assert.equal(sha('nutri/data/'+report.qualityAudit),quality.micronutrientQuality.auditSha256);
assert.equal(quality.acceptedRows+Object.values(quality.rejectedRows).reduce((a,b)=>a+b,0),quality.inputRows);
const quarantined=new Set(audit.records.map(x=>x.id));assert(extra.every(x=>!quarantined.has(x.id)));
const catalog=context.MT_PERSONAL_NUTRICAO.catalogo({}),byId=new Map(catalog.map(x=>[x.id,x]));
const extraIds=new Set(extra.map(x=>x.id));
for(const food of context.MT_NUTRI_FOODS){
  if(food.source==='Open Food Facts'){assert(food.brand&&food.barcode&&food.id==='off:'+food.barcode);assert.equal(food.sourceUrl,'https://world.openfoodfacts.org/product/'+food.barcode);}
  assert.equal(food.baseAmount,100);assert(['g','ml'].includes(food.baseUnit));
  assert.equal(food.p,'100 '+food.baseUnit);
  const item=byId.get('cat:'+food.id);assert(item,food.id+' available in Personal');
  if(extraIds.has(food.id))assert.equal(item.nome,food.n+' — '+food.brand);assert(item.nome.length<=200);
  assert(item.fonte.includes(food.sourceUrl));assert.equal(item.barcode,food.barcode||undefined);
  if(food.baseUnit==='ml')assert.equal(item.baseGramas,undefined,'volume is never inferred to be grams');
  else assert.equal(item.baseGramas,100);
  for(const q of [.5,2]){
    const saved=context.MT_NUTRICAO.normalizaItem({...item,qtd:q});assert(saved,food.id+' survives persistence');
    assert.equal(saved.nome,item.nome);assert.equal(saved.fonte,item.fonte);
    const totals=context.MT_NUTRICAO.totalItens([saved]);
    for(const key of ['k','pt','cb','g'])assert.equal(totals[key],food[key]*q,food.id+' '+key+' scales by portion');
    for(const key of ['fb','sugars','saturated','sodiumMg','calciumMg','ironMg','potassiumMg','cholesterolMg','magnesiumMg','phosphorusMg','zincMg','vitaminCMg']){
      if(Object.hasOwn(food,key))assert.equal(saved[key],food[key]);else assert(!Object.hasOwn(saved,key),'missing '+key+' remains unknown');
    }
  }
}
// Re-loading a script cannot double the catalog or change any existing entry.
vm.runInNewContext(read('assets/alimentos-catalogo-compartilhado.js'),context);assert.equal(context.MT_ALIMENTOS.length,legacyCount+manifest.records);
assert.equal(JSON.stringify(context.MT_ALIMENTOS.slice(0,legacyCount)),legacy);
for(const file of ['personal.html','nutricao.html'])assert(read(file).indexOf('src="assets/alimentos-catalogo-compartilhado.js"')>read(file).indexOf('src="assets/alimentos-db.js"'));
assert(read('sw.js').includes('"assets/alimentos-catalogo-compartilhado.js"'));
assert(read('nutri/sw.js').includes("'data/openfoodfacts-expansion-20261028.json'"));
assert.equal(catalog.length,13747);
for(const file of ['personal.html','nutricao.html']){const html=read(file);assert(html.indexOf('src="nutri/food-catalog-data.js"')>html.indexOf('src="assets/alimentos-db.js"'));assert(html.indexOf('src="assets/alimentos-catalogo-compartilhado.js"')>html.indexOf('src="nutri/food-catalog-data.js"'));}
console.log('PASS 5,000 new branded foods and full shared Nutri catalog: 12,199 in Nutri, 13,747 in Personal; legacy preserved, traceability, quantities and optional nutrients.');
