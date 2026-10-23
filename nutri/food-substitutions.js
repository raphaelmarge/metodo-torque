import {makeFoodItem,measuredItemNutrition,parseFoodQuantity} from './food-measures.js';

const KEYS=Object.freeze(['k','pt','cb','g']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const key=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
// Floors prevent a trace/zero macro from dominating the fit. These are ranking
// parameters, not clinical equivalence limits or recommended serving sizes.
const FLOORS={k:50,pt:5,cb:10,g:3},WEIGHTS={k:2,pt:1,cb:1,g:1};
function numeric(value){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\s*\d+(?:[.,]\d+)?\s*$/.test(value))return null;
  const result=Number(String(value).replace(',','.'));
  return Number.isFinite(result)&&result>=0?result:null;
}
function totals(item){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Confira o alimento e sua quantidade.');
  const quantity=parseFoodQuantity(item.qtd);
  const values=own(item,'measurement')?measuredItemNutrition(item).total:Object.fromEntries(KEYS.map(k=>[k,numeric(item[k])]));
  const result={};
  for(const k of KEYS){
    const value=numeric(values[k]);
    if(value===null||(!own(item,'measurement')&&value>100000))throw Error('A comparação exige energia, proteínas, carboidratos e gorduras informados.');
    result[k]=own(item,'measurement')?value:value*quantity;
    if(!Number.isFinite(result[k]))throw Error('Os valores estão fora do limite de cálculo.');
  }
  return result;
}
function comparison(target,candidate){
  const delta={},percentDelta={};let squared=0,weight=0;
  for(const k of KEYS){
    delta[k]=candidate[k]-target[k];
    percentDelta[k]=target[k]===0?(candidate[k]===0?0:null):delta[k]/target[k]*100;
    squared+=WEIGHTS[k]*Math.pow(delta[k]/Math.max(target[k],FLOORS[k]),2);weight+=WEIGHTS[k];
  }
  return {target:{...target},candidate:{...candidate},delta,percentDelta,score:100*Math.sqrt(squared/weight)};
}
/** Compares prescribed totals. A score of zero is an exact macro match, not
 * evidence of clinical interchangeability. Null percentage means target zero. */
export function compareFoodItems(targetItem,candidateItem){return comparison(totals(targetItem),totals(candidateItem));}

function identity(food){return String(food?.measurement?.catalogId||food?.alimId||food?.id||'').trim();}
function nameOf(food){return key(food?.nome??food?.n).split(' · ')[0];}
function preparation(name,food,defaultState=''){
  const text=name+' '+key(food.preparo);
  if(/\b(po|powder|farinha|farelo|fuba|amido|polvilho)\b/.test(text))return 'Pó ou farinha';
  if(/\b(desidratad[oa]s?|liofilizad[oa]s?|sec[oa]s?|passas?)\b/.test(text))return 'Seco';
  if(/\b(cru[as]?|crus|raw)\b/.test(text))return 'Cru';
  if(/\b(frit[oa]s?|fritura)\b/.test(text))return 'Frito';
  if(/\b(grelhad[oa]s?)\b/.test(text))return 'Grelhado';
  if(/\b(assad[oa]s?|forno)\b/.test(text))return 'Assado';
  if(/\b(cozid[oa]s?|cozimento|vapor|fervid[oa]s?)\b/.test(text))return 'Cozido';
  if(/\b(torrad[oa]s?|tostad[oa]s?)\b/.test(text))return 'Torrado';
  if(/\b(conserva|enlatad[oa]s?)\b/.test(text))return 'Conserva';
  return defaultState;
}
// Deliberately conservative: ingredient words do not prove the identity of a
// mixed dish. Unknown names/categories remain available in the manual catalog.
function classification(food){
  if(!food||own(food,'recipeComposition'))return null;
  const name=nameOf(food),category=key(food.categoria??food.cat??food.c);
  if(!name||/\b(cerveja|vinho|whisky|vodka|cachaca|licor|rum)\b/.test(name))return null;
  if(/\b(alm[oa]ndega|bolinho|risoto|carreteiro|feijoada|sopa|caldo|salada|lasanha|pizza|sanduiche|hamburguer|croquete|panqueca|empad[ao]|torta|papinha|pure|maria[- ]mole|empanad[oa]|linguica|salsicha|mortadela|presunto|pate|figado|moela|coracao|rim|rins|miudos)\b/.test(name)||/\s\+\s|\bcom\b/.test(name))return null;
  let group='',state='';
  // Confectionery precedes dairy, fruit and supplements mentioned as flavours.
  if(/\b(bala|balas|bombom|bananada|goiabada|geleia|doce|condensado|sorvete|creme de avela)\b/.test(name.replace(/\bbatata[- ]doce\b/g,'batata')))return null;
  if(/\b(barra|barras|bar|biscoito|bolacha|cookie|cookies|bolo|snack|salgadinho)\b/.test(name))return null;
  if(/\b(tofu)\b/.test(name)){group='Tofu';state='Pronto para consumo';}
  else if(/\b(leite[, ]+(?:de )?(?:coco|soja|amendoa|aveia|arroz)|bebida vegetal|bebida de soja|bebida de aveia|bebida de amendoa)\b/.test(name)){group='Bebidas vegetais';state='Pronto para consumo';}
  else if(/^(?:\d+(?:[.,]\d+)?%?\s+)?(?:(?:pure|iso|isolated|concentrated|premium|top|max|best|super)\s+)*(?:whey|proteina (?:isolada|concentrada))\b/.test(name)){group='Suplementos proteicos';}
  else if(/\b(whey|proteina isolada|proteina concentrada)\b/.test(name))return null;
  else if(/\b(iogurte|yogurt|kefir|coalhada)\b/.test(name)){group='Iogurtes e fermentados';state='Pronto para consumo';}
  else if(/\b(queijo|ricota|cottage|mussarela|mucarela|requeijao)\b/.test(name)){group='Queijos';state='Pronto para consumo';}
  else if(/\b(chocolate|achocolatado)\b/.test(name))return null;
  else if(/\b(leite)\b/.test(name)){group='Leites';state='Pronto para consumo';}
  else if(/\b(pasta de amendoim|pasta de amendoa|pasta de castanha)\b/.test(name)){group='Pastas de oleaginosas';state='Pronto para consumo';}
  else if(/\b(azeite|oleo)\b/.test(name)){group='Óleos';state='Pronto para consumo';}
  else if(/\b(manteiga|margarina)\b/.test(name)){group='Manteigas e margarinas';state='Pronto para consumo';}
  else if(/\b(suco|nectar)\b/.test(name)){group='Sucos e néctares';state='Pronto para consumo';}
  else if(/\b(refrigerante)\b/.test(name)){group='Refrigerantes';state='Pronto para consumo';}
  else if(/\b(polpa)\b/.test(name)){group='Polpas de frutas';state='Pronto para consumo';}
  else if(/\b(pao|paes|torrada|wrap)\b/.test(name)){group='Pães';state='Pronto para consumo';}
  else if(/\b(granola|muesli|cereal matinal)\b/.test(name)){group='Cereais matinais';state='Pronto para consumo';}
  else if(/\b(farinha|farelo|fuba|amido|polvilho)\b/.test(name)){group='Farinhas e farelos';state='Pó ou farinha';}
  else if(/\b(aveia|arroz|milho|trigo|quinoa)\b.*\b(flocos)\b/.test(name)){group='Cereais em flocos';state='Cru';}
  else if(/\b(broto|brotos)\b/.test(name)){group='Hortaliças';}
  else if(/\b(arroz|quinoa|cuscuz|cuzcuz|milho|aveia|trigo|cevada|centeio|sorgo|amaranto|painco|canjica|macarrao|batata|mandioca|macaxeira|aipim|inhame|cara|tapioca)\b/.test(name)){group='Cereais e tubérculos';}
  else if(/\b(feijao|lentilha|grao de bico|ervilha|soja)\b/.test(name)){group='Leguminosas';}
  else if(/\b(frango|galinha|peru|pato|carne|bovin[oa]|suin[oa]|porc[oa]|lombo|patinho|alcatra|picanha|coxao|musculo|acem|lagarto|file mignon|tilapia|salmao|sardinha|atum|pescada|merluza|peixe|corvina|bacalhau|camarao|ovo|ovos)\b/.test(name)){group='Carnes, pescados e ovos';}
  else if(/\b(amendoim|amendoa|castanha|noz|nozes|pistache|avela|gergelim|linhaca|chia|semente)\b/.test(name)||['nozes e sementes','oleaginosas e sementes'].includes(category)){group='Oleaginosas e sementes';state='Cru';}
  else if(/^(banana|maca|pera|laranja|tangerina|mexerica|mamao|manga|abacaxi|melancia|melao|morango|uva|kiwi|pessego|ameixa|goiaba|acerola|caju|abacate|coco|figo|caqui|pitanga|jabuticaba|maracuja|limao|jaca|carambola|framboesa|amora|mirtilo)\b/.test(name)){group='Frutas';state='Cru';}
  else if(category==='verduras, hortalicas e derivados'||/\b(brocolis|couve|alface|agriao|rucula|espinafre|tomate|pepino|cenoura|beterraba|abobrinha|abobora|berinjela|chuchu|quiabo|repolho|vagem|rabanete|cebola|pimentao|aspargo|palmito)\b/.test(name)){group='Hortaliças';}
  const prepared=preparation(name,food,state);
  return group&&prepared?{group,preparation:prepared}:null;
}
function baseUnit(item){
  if(own(item,'measurement'))return measuredItemNutrition(item).baseUnit;
  if(numeric(item.baseGramas)>0)return 'g';
  // This is a compatibility restriction only. Text never supplies a density or
  // changes the existing per-portion nutrient contract of a legacy item.
  const portion=key(item.porcao??item.p),g=/\b(g|grama|gramas)\b/.test(portion),ml=/\b(ml|mililitro|mililitros)\b/.test(portion);
  return g!==ml?(g?'g':'ml'):null;
}
/** Suggests conservative candidates for professional review, never applies a
 * substitution. Unknown identity/preparation, incomplete macros and unproven
 * units are excluded. Allergens and medical restrictions are not inferred. */
export function suggestFoodSubstitutions(targetItem,foods,{limit=6,excludeIds=[]}={}){
  let target,profile,unit,physical=null;
  try{
    target=totals(targetItem);profile=classification(targetItem);unit=baseUnit(targetItem);
    if(own(targetItem,'measurement'))physical=measuredItemNutrition(targetItem).baseQuantity;
  }catch{return [];}
  if(!profile||target.k<=0||!Array.isArray(foods))return [];
  const count=Number.isFinite(limit)?Math.min(30,Math.max(0,Math.floor(limit))):6;
  if(!count)return [];
  // A prescription row id is not the id of a catalog food.
  const targetId=String(targetItem.measurement?.catalogId||targetItem.alimId||'');
  const excluded=new Set([targetId,...(Array.isArray(excludeIds)?excludeIds.map(String):[])]),seen=new Set(),results=[];
  const targetName=nameOf(targetItem),targetBrand=key(targetItem.measurement?.brand??targetItem.brand),targetBarcode=String(targetItem.measurement?.barcode??targetItem.barcode??'');
  for(const food of foods){
    try{
      const id=identity(food),name=nameOf(food),brand=key(food?.brand),barcode=String(food?.barcode??'');
      if(!id||excluded.has(id)||seen.has(id)||food?.archived||food?._resource?.archived||food?._resource?.data?.archived)continue;
      if((barcode&&targetBarcode&&barcode===targetBarcode)||(name===targetName&&brand===targetBrand))continue;
      const candidateProfile=classification(food);
      if(!candidateProfile||candidateProfile.group!==profile.group||candidateProfile.preparation!==profile.preparation||!['g','ml'].includes(food.baseUnit)||(unit&&unit!==food.baseUnit))continue;
      // One gram or ml supplies a coefficient; makeFoodItem validates the full
      // snapshot (including household measures) and refuses incomplete macros.
      const item=makeFoodItem(food,1,food.baseUnit,{id:'suggestion:'+id.slice(0,89)}),perUnit=totals(item);
      if(perUnit.k<=0)continue;
      let numerator=0,denominator=0;
      for(const k of KEYS){const scale=Math.max(target[k],FLOORS[k]),weight=WEIGHTS[k]/(scale*scale);numerator+=weight*perUnit[k]*target[k];denominator+=weight*perUnit[k]*perUnit[k];}
      const optimum=numerator/denominator;
      // Bound the search, not the patient's intake. Do not clamp a poor fit into
      // an apparently valid portion or extrapolate a tiny/huge amount.
      if(!Number.isFinite(optimum)||optimum<1||optimum>1000||(physical!==null&&(optimum<physical/4||optimum>physical*4)))continue;
      const quantity=Math.round(optimum*10)/10,candidate=makeFoodItem(food,quantity,food.baseUnit,{id:item.id});
      const compared=comparison(target,totals(candidate));
      if(compared.score>35||Math.abs(compared.percentDelta.k)>25)continue;
      seen.add(id);results.push({food,item:candidate,comparison:compared,...candidateProfile});
    }catch{/* A malformed catalog record is not a usable candidate. */}
  }
  return results.sort((a,b)=>a.comparison.score-b.comparison.score||nameOf(a.food).localeCompare(nameOf(b.food),'pt-BR')||identity(a.food).localeCompare(identity(b.food))).slice(0,count);
}
