// Nutrients belong to one selected measure; qtd is its multiplier. The original
// composition and equivalences travel with the item so catalog edits cannot
// change a prescription. A volume is never treated as a mass.
export const FOOD_NUTRIENT_KEYS = Object.freeze(['k','pt','cb','g','fb','sugars','saturated','sodiumMg','calciumMg','ironMg','potassiumMg','cholesterolMg','magnesiumMg','phosphorusMg','zincMg','vitaminCMg']);
const MACROS = ['k','pt','cb','g'];
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const text = (value,max) => String(value ?? '').trim().slice(0,max);
function number(value) {
  if (value == null || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string')) return null;
  if (typeof value === 'string' && !/^\s*\d+(?:[.,]\d+)?\s*$/.test(value)) return null;
  const result=Number(String(value).trim().replace(',','.'));
  return Number.isFinite(result) && result>=0 ? result : null;
}
export function parseFoodQuantity(value) {
  const quantity=number(value);
  if (quantity===null || quantity<=0 || quantity>1000) throw Error('Use uma quantidade maior que zero e de até 1.000 medidas.');
  return quantity;
}
function positive(value,label) {
  const amount=number(value);
  if (amount===null || amount<=0 || amount>100000) throw Error('Confira '+label+' do alimento.');
  return amount;
}
function nutrients(raw) {
  const out={};
  for (const key of FOOD_NUTRIENT_KEYS) {
    if (!MACROS.includes(key) && !own(raw,key)) continue;
    const value=raw[key];
    if (value==null || value==='') { out[key]=null; continue; }
    const nutrient=number(value);
    if (nutrient===null || nutrient>100000) throw Error('Confira os valores nutricionais do alimento.');
    out[key]=nutrient;
  }
  return out;
}
function normalizeMeasures(raw,baseUnit) {
  if (!Array.isArray(raw) || raw.length>21) throw Error('Use até 20 medidas com equivalência conhecida por alimento.');
  const base={id:baseUnit,label:baseUnit==='g'?'Grama (g)':'Mililitro (ml)',amount:1,unit:baseUnit,source:'Unidade da base nutricional'};
  const out=[base],ids=new Set([baseUnit]);
  for (const measure of raw) {
    if (!measure || typeof measure!=='object') throw Error('Confira as medidas deste alimento.');
    const id=text(measure.id,100),label=text(measure.label,100),amount=positive(measure.amount,'a equivalência'),unit=measure.unit;
    if (!id || !label || unit!==baseUnit) throw Error('A medida precisa de equivalência na mesma unidade da base nutricional.');
    if (id===baseUnit && amount===1) continue;
    if (ids.has(id)) throw Error('Há medidas repetidas neste alimento.');
    ids.add(id);out.push({id,label,amount,unit,source:text(measure.source,400)});
  }
  if (out.length>21) throw Error('Use até 20 medidas com equivalência conhecida por alimento.');
  return out;
}
export function normalizeFoodMeasurementSnapshot(raw) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw) || raw.v!==1 || !['g','ml'].includes(raw.baseUnit) || !raw.nutrients || typeof raw.nutrients!=='object' || Array.isArray(raw.nutrients)) throw Error('A composição e as medidas deste alimento estão inválidas.');
  const snapshot={v:1,catalogId:text(raw.catalogId,250),baseAmount:positive(raw.baseAmount,'a base nutricional'),baseUnit:raw.baseUnit,nutrients:nutrients(raw.nutrients),measures:normalizeMeasures(raw.measures,raw.baseUnit),selectedMeasureId:text(raw.selectedMeasureId,100)};
  if (!snapshot.measures.some(measure=>measure.id===snapshot.selectedMeasureId)) throw Error('A medida escolhida não é compatível com este alimento.');
  for (const key of ['source','sourceUrl','brand','barcode','retrievedAt','sourceUpdatedAt']) if (raw[key]!=null) snapshot[key]=text(raw[key],key==='sourceUrl'?2000:400);
  return snapshot;
}
function foodSnapshot(food,measureId) {
  if (!food || typeof food!=='object') throw Error('Escolha um alimento do catálogo.');
  return normalizeFoodMeasurementSnapshot({v:1,catalogId:food.id??food.alimId,baseAmount:food.baseAmount,baseUnit:food.baseUnit,nutrients:food,measures:food.measures??[],selectedMeasureId:measureId??food.baseUnit,source:food.source??food.fonte,sourceUrl:food.sourceUrl,brand:food.brand,barcode:food.barcode,retrievedAt:food.retrievedAt,sourceUpdatedAt:food.sourceUpdatedAt});
}
export function foodMeasures(food) {
  // Legacy portions have no conversion contract; they keep their existing UI.
  if (!food || !own(food,'baseAmount') || !own(food,'baseUnit')) return [];
  return foodSnapshot(food).measures;
}
function formatted(value) { return String(Number(value.toPrecision(12))).replace('.',','); }
function portionLabel(measure) {
  if (measure.id===measure.unit && measure.amount===1) return '1 '+measure.unit;
  const label=/^1\s/.test(measure.label)?measure.label:'1 '+measure.label;
  return label+' ('+formatted(measure.amount)+' '+measure.unit+')';
}
function applyMeasurement(item,snapshot,quantity) {
  const selected=snapshot.measures.find(measure=>measure.id===snapshot.selectedMeasureId),factor=selected.amount/snapshot.baseAmount;
  const out={...structuredClone(item),qtd:parseFoodQuantity(quantity),porcao:portionLabel(selected),measurement:snapshot};
  for (const key of FOOD_NUTRIENT_KEYS) {
    if (!own(snapshot.nutrients,key)) { delete out[key]; continue; }
    const value=snapshot.nutrients[key];out[key]=value===null?null:value*factor;
    if (out[key]!==null && (!Number.isFinite(out[key]) || out[key]>100000)) throw Error('Os nutrientes por medida excedem o limite. Confira a equivalência.');
  }
  delete out.baseGramas;
  if (snapshot.baseUnit==='g') out.baseGramas=selected.amount;
  if (snapshot.source) out.fonte=snapshot.source;
  return out;
}
export function makeFoodItem(food,quantity,measureId,{id}={}) {
  let nome=text(food?.nome??food?.n,200);
  if (!nome || !text(id,100)) throw Error('O alimento prescrito precisa de nome e identidade próprios.');
  const snapshot=foodSnapshot(food,measureId);
  if (MACROS.some(key=>snapshot.nutrients[key]===null)) throw Error('Há nutrientes não informados neste alimento. Complete a composição antes de prescrever.');
  // The patient and printout must identify the selected packaged product, even
  // when its catalog name is generic. Only newly prescribed items gain a brand.
  const brand=text(food.brand,400),search=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
  if(brand&&!search(nome).includes(search(brand))){const visibleBrand=brand.length>80?brand.slice(0,79)+'…':brand;nome=text(nome,200-visibleBrand.length-3)+' · '+visibleBrand;}
  return applyMeasurement({id:text(id,100),alimId:snapshot.catalogId,nome,categoria:text(food.categoria??food.cat??food.c,120)},snapshot,quantity);
}
export function updateFoodQuantity(item,quantity) {
  if (!item || !own(item,'measurement')) throw Error('Este alimento usa uma porção antiga, sem conversão cadastrada.');
  if (own(item,'recipeComposition')) throw Error('Use as porções e o rendimento da receita.');
  return applyMeasurement(item,normalizeFoodMeasurementSnapshot(item.measurement),quantity);
}
export function changeFoodMeasure(item,measureId) {
  if (!item || !own(item,'measurement')) throw Error('Este alimento usa uma porção antiga, sem conversão cadastrada.');
  const snapshot=normalizeFoodMeasurementSnapshot(item.measurement),current=snapshot.measures.find(measure=>measure.id===snapshot.selectedMeasureId),next=snapshot.measures.find(measure=>measure.id===measureId);
  if (!next) throw Error('A medida escolhida não é compatível com este alimento.');
  const quantity=parseFoodQuantity(item.qtd)*current.amount/next.amount;
  return updateFoodQuantity({...item,measurement:{...snapshot,selectedMeasureId:next.id}},quantity);
}
export function measuredItemNutrition(item) {
  const normalized=updateFoodQuantity(item,item?.qtd),snapshot=normalized.measurement,selected=snapshot.measures.find(measure=>measure.id===snapshot.selectedMeasureId),total={};
  for (const key of FOOD_NUTRIENT_KEYS) if (own(snapshot.nutrients,key)) total[key]=normalized[key]===null?null:normalized[key]*normalized.qtd;
  return {total,complete:MACROS.every(key=>total[key]!==null),baseQuantity:selected.amount*normalized.qtd,baseUnit:snapshot.baseUnit};
}
export function formatFoodQuantity(item) {
  const snapshot=normalizeFoodMeasurementSnapshot(item?.measurement),selected=snapshot.measures.find(measure=>measure.id===snapshot.selectedMeasureId),quantity=number(item?.qtd);
  if (quantity===null || quantity<=0) throw Error('Confira a quantidade do alimento.');
  // Grocery aggregation can exceed the limit of one prescribed line.
  const total=quantity*selected.amount;
  if (!Number.isFinite(total)) throw Error('Quantidade fora do limite de cálculo.');
  if (selected.id===selected.unit && selected.amount===1) return formatted(quantity)+' '+selected.unit;
  return formatted(quantity)+' × '+selected.label.replace(/^1\s+/,'')+' ('+formatted(total)+' '+selected.unit+')';
}
