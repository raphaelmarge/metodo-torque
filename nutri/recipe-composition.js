// Recipe quantities describe the whole preparation. Prescribed item quantities
// describe servings. Copies travel with the published food, never a live link.
const MACROS = ['k','pt','cb','g'];
const text = (value,max) => String(value ?? '').trim().slice(0,max);
const number = value => value == null || typeof value === 'boolean' || !String(value).trim() ? null : Number(String(value).replace(',','.'));
function amount(value,max,label) {
  const n=number(value);
  if (!Number.isFinite(n)||n<=0||n>max) throw Error('Confira '+label+' da receita.');
  return n;
}
export function recipeIngredient(raw) {
  if (!raw || typeof raw!=='object' || Object.prototype.hasOwnProperty.call(raw,'recipeComposition')) throw Error('Use alimentos simples como ingredientes da receita.');
  const nome=text(raw.nome??raw.n,200),porcao=text(raw.porcao??raw.p,100);
  if (!nome||!porcao) throw Error('Cada ingrediente precisa de nome e medida.');
  const out={id:text(raw.id,100),alimId:text(raw.alimId||raw.id,250),nome,porcao,qtd:amount(raw.qtd,1000,'a quantidade do ingrediente')};
  for (const key of MACROS) {
    const n=number(raw[key]);
    if (n!==null&&(!Number.isFinite(n)||n<0||n>100000)) throw Error('Confira os nutrientes de '+nome+'.');
    out[key]=n;
  }
  for (const key of ['fonte','preparo','categoria']) if(raw[key]??(key==='fonte'?raw.source:undefined))out[key]=text(raw[key]??raw.source,key==='fonte'?400:120);
  if(raw.baseGramas!=null)out.baseGramas=amount(raw.baseGramas,100000,'a medida em gramas');
  return out;
}
export function normalizeRecipeComposition(raw) {
  if (!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1) throw Error('A composição desta receita está inválida. Confira com sua nutri.');
  if (!Array.isArray(raw.ingredients)||!raw.ingredients.length||raw.ingredients.length>100) throw Error('Use de 1 a 100 ingredientes na composição da receita.');
  if (!Array.isArray(raw.steps)||raw.steps.length>40) throw Error('Use até 40 etapas de preparo.');
  const unquantified=raw.unquantifiedIngredients??[];
  if(!Array.isArray(unquantified)||unquantified.length>100||unquantified.some(x=>typeof x!=='string'||x.length>500))throw Error('Confira os ingredientes ainda sem quantificação.');
  const title=text(raw.title,200);
  if(!title)throw Error('Dê um nome à receita.');
  const out={v:1,recipeId:text(raw.recipeId,100),recipeVersion:Number.isInteger(raw.recipeVersion)&&raw.recipeVersion>0?raw.recipeVersion:1,title,yield:amount(raw.yield,1000,'o rendimento'),ingredients:raw.ingredients.map(recipeIngredient),steps:raw.steps.map(x=>text(x,1500)).filter(Boolean),source:text(raw.source,400)};
  if(unquantified.some(x=>x.trim()))out.unquantifiedIngredients=unquantified.map(x=>x.trim()).filter(Boolean);
  if(raw.notes)out.notes=text(raw.notes,4000);
  if(raw.reviewedAt){if(!Number.isFinite(Date.parse(raw.reviewedAt)))throw Error('Confira a revisão desta receita.');out.reviewedAt=text(raw.reviewedAt,40);}
  if(new TextEncoder().encode(JSON.stringify(out)).length>80000)throw Error('A composição da receita está muito grande. Reduza os textos.');
  return out;
}
export function recipeNutrition(raw) {
  const composition=normalizeRecipeComposition(raw),total={},perServing={};
  for(const key of MACROS){total[key]=composition.unquantifiedIngredients?.length||composition.ingredients.some(it=>it[key]===null)?null:composition.ingredients.reduce((sum,it)=>sum+it[key]*it.qtd,0);perServing[key]=total[key]===null?null:total[key]/composition.yield;}
  return {total,perServing,complete:MACROS.every(key=>perServing[key]!==null)};
}
export function makeRecipeFood(raw,servings,{id,reviewedAt=new Date().toISOString()}={}) {
  const composition=normalizeRecipeComposition({...raw,reviewedAt}),nutrition=recipeNutrition(composition);
  if(composition.unquantifiedIngredients?.length)throw Error('Há ingredientes sem quantidade no texto. Inclua todos no catálogo com suas quantidades e remova-os da lista sem quantificação antes de prescrever.');
  if(!nutrition.complete)throw Error('Há nutrientes não informados nos ingredientes. Complete a composição antes de prescrever porções; o preparo pode continuar como orientação.');
  if(MACROS.some(key=>nutrition.perServing[key]>100000))throw Error('Os valores por porção excedem o limite. Confira ingredientes e rendimento.');
  if(!id)throw Error('A porção prescrita precisa de uma identidade própria.');
  return {id:text(id,100),alimId:'recipe:'+composition.recipeId,nome:composition.title,porcao:'1 porção da receita',qtd:amount(servings,1000,'a quantidade de porções'),...nutrition.perServing,fonte:composition.source,recipeComposition:structuredClone(composition)};
}
// null means ordinary food. A present but corrupt snapshot always throws;
// callers must show a warning, never substitute the recipe name as an ingredient.
export function expandRecipeItem(item) {
  if(!item||!Object.prototype.hasOwnProperty.call(item,'recipeComposition'))return null;
  const composition=normalizeRecipeComposition(item.recipeComposition),servings=amount(item.qtd,1000,'a quantidade de porções');
  if(composition.unquantifiedIngredients?.length)throw Error('A receita tem ingredientes sem quantidade. Confira a composição com sua nutri antes de comprar.');
  return composition.ingredients.map(ingredient=>({...structuredClone(ingredient),qtd:ingredient.qtd*servings/composition.yield}));
}
