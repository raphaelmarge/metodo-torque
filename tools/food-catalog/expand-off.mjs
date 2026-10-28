// Select an additive, reproducible OFF release without changing existing records.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=process.argv[2];
if(!dir)throw Error('Usage: node tools/food-catalog/expand-off.mjs NORMALIZED_DIRECTORY');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=name=>fs.readFileSync(path.join(dir,name));
const candidatesBytes=read('off-selected.json'),report=JSON.parse(read('off-manifest.json'));
if(sha(candidatesBytes)!==report.sha256)throw Error('Candidate checksum mismatch');
const auditBytes=read(report.micronutrientQuality.auditFile);
if(sha(auditBytes)!==report.micronutrientQuality.auditSha256)throw Error('Quality audit checksum mismatch');
const previous=JSON.parse(fs.readFileSync(path.join(root,'nutri/data/openfoodfacts.json')));
const context={};context.self=context;
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/alimentos-db.js'),'utf8'),context);
const norm=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function signature(food){
  const name=food.n.replace(/\b(?:(?:caixa|lata|pacote|garrafa|pote|embalagem)\s+)?\d+(?:[.,]\d+)?\s*(?:kg|mg|g|ml|cl|dl|litros?|l)\b/gi,'');
  const brands=[...new Set(food.brand.split(',').map(norm).filter(Boolean))].sort().join('|');
  return JSON.stringify([norm(name),brands,food.baseUnit]);
}
const ids=new Set(previous.map(x=>x.id)),signatures=new Set(previous.map(signature));
const legacyNames=new Set(context.MT_ALIMENTOS.map(x=>norm(x.n)).concat(previous.map(x=>norm(x.n+' — '+x.brand))));
const skipped={},pool=[],selectionExclusions=[];
const reviewExclusions={'off:7891000251355':'Powder named Alpino em Pó reports 72 kcal per 100 g; dry/prepared reference unresolved in source sample. Do not infer or rescale.'};
function skip(reason){skipped[reason]=(skipped[reason]||0)+1;}
for(const food of JSON.parse(candidatesBytes)){
  const display=food.n+' — '+food.brand;
  if(reviewExclusions[food.id]){skip('source_reference_needs_review');selectionExclusions.push({id:food.id,reason:reviewExclusions[food.id],sourceUrl:food.sourceUrl});continue;}
  if(food.measures.some(m=>100/m.amount>1000)){skip('measure_exceeds_quantity_contract');selectionExclusions.push({id:food.id,reason:'Changing 100 g/ml to the reported serving exceeds the 1,000-measure contract.',measures:food.measures,sourceUrl:food.sourceUrl});continue;}
  if(ids.has(food.id)){skip('existing_barcode');continue;}
  if(signatures.has(signature(food))){skip('existing_product_brand_unit');continue;}
  if(display.length>200){skip('name_exceeds_prescription_limit');continue;}
  if(legacyNames.has(norm(display))){skip('existing_display_name');continue;}
  ids.add(food.id);signatures.add(signature(food));legacyNames.add(norm(display));pool.push(food);
}
// Round-robin categories and brands, then name/GTIN for a stable order.
const buckets=new Map();
for(const food of pool){
  if(!buckets.has(food.c))buckets.set(food.c,new Map());
  const brands=buckets.get(food.c),brand=norm(food.brand);
  if(!brands.has(brand))brands.set(brand,[]);brands.get(brand).push(food);
}
const groups=[...buckets.entries()].sort(([a],[b])=>a.localeCompare(b,'pt-BR')).map(([,brands])=>[...brands.entries()].sort(([a],[b])=>a.localeCompare(b,'pt-BR')).map(([,items])=>items.sort((a,b)=>norm(a.n).localeCompare(norm(b.n),'pt-BR')||a.id.localeCompare(b.id))));
const selected=[];
while(selected.length<5000){
  let progress=false;
  for(const brands of groups){
    const queue=brands.shift();if(!queue)continue;
    selected.push(queue.shift());if(queue.length)brands.push(queue);progress=true;
    if(selected.length===5000)break;
  }
  if(!progress)throw Error('Only '+selected.length+' distinct additional products passed; no files written.');
}
selected.sort((a,b)=>a.c.localeCompare(b.c,'pt-BR')||norm(a.n).localeCompare(norm(b.n),'pt-BR')||a.id.localeCompare(b.id));
const target=path.join(root,'nutri/data'),file='openfoodfacts-expansion-20261028.json';
const bytes=JSON.stringify(selected,null,2)+'\n';
const out={version:'2026-10-28',source:report.source,sourceUrl:report.sourceUrl,sourceVersion:report.sourceVersion,sourceDate:report.sourceDate,license:report.license,
  candidateRecords:report.acceptedRows,candidateSha256:report.sha256,existingOFFRecords:previous.length,eligibleAdditionalRecords:pool.length,selectedRecords:selected.length,skipped,selectionExclusions,
  selection:'5,000 additional products; round-robin category and brand; exact barcode, normalized product/brand/unit and legacy display-name deduplication. Existing composition is preserved.',
  units:Object.fromEntries(['g','ml'].map(u=>[u,selected.filter(x=>x.baseUnit===u).length])),brands:new Set(selected.flatMap(x=>x.brand.split(',').map(norm))).size,
  sourceFile:file,sha256:sha(bytes),qualityReport:'off-expansion-normalization-report.json',qualityAudit:'off-expansion-quality-exclusions.json',qualityNote:report.qualityNote};
fs.writeFileSync(path.join(target,file),bytes);
report.micronutrientQuality.auditFile='off-expansion-quality-exclusions.json';
fs.writeFileSync(path.join(target,'off-expansion-normalization-report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(target,'off-expansion-quality-exclusions.json'),auditBytes);
fs.writeFileSync(path.join(target,'off-expansion-report.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
