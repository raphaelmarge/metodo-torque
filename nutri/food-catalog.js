import {foodMeasures,makeFoodItem,changeFoodMeasure,updateFoodQuantity,measuredItemNutrition,formatFoodQuantity} from './food-measures.js';
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('pt-BR',{maximumFractionDigits:2}):'—';
export const foodSearchKey=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
export function nutritionCatalog(resources=[]){return [...resources.map(row=>({...row.data,id:row.id,_resource:row})),...(Array.isArray(globalThis.MT_NUTRI_FOODS)?globalThis.MT_NUTRI_FOODS:[])];}
export function filterFoodCatalog(foods,{query='',category='',page=0,pageSize=20}={}){
 const terms=foodSearchKey(query).split(/\s+/).filter(Boolean),matches=foods.filter(food=>(!category||(food.c||food.cat)===category)&&terms.every(term=>foodSearchKey([food.n,food.nome,food.c,food.cat,food.brand,food.barcode,...(food.aliases||[])].filter(Boolean).join(' ')).includes(term)));
 const pages=Math.max(1,Math.ceil(matches.length/pageSize)),current=Math.min(Math.max(0,page),pages-1);
 return {items:matches.slice(current*pageSize,(current+1)*pageSize),count:matches.length,page:current,pages};
}
export function foodSourceMarkup(food){
 const name=food.source||food.fonte||(food._resource?'Cadastro do consultório':'Fonte não informada');let url='';
 try{const parsed=new URL(food.sourceUrl||food.measurement?.sourceUrl);if(parsed.protocol==='https:')url=parsed.href;}catch{}
 return url?'<a href="'+html(url)+'" target="_blank" rel="noopener noreferrer">'+html(name)+'</a>':html(name);
}
export function foodBrowserMarkup(id='food-browser'){
 return '<section class="food-browser" id="'+html(id)+'"><div class="food-browser-filters"><label>Buscar alimento<input data-catalog-search type="search" placeholder="Nome, marca ou código de barras" autocomplete="off"></label><label>Categoria<select data-catalog-category><option value="">Todas as categorias</option></select></label></div><p class="food-browser-count" data-catalog-count role="status"></p><div data-catalog-results></div><div class="food-browser-pages"><button type="button" class="btn small ghost" data-catalog-prev>Anterior</button><span data-catalog-page></span><button type="button" class="btn small ghost" data-catalog-next>Próxima</button></div></section>';
}
export function bindFoodBrowser(root,{foods,onSelect,actionLabel='Ver alimento',onEdit}={}){
 if(!root||root.dataset.bound==='true')return;root.dataset.bound='true';let page=0;
 const find=selector=>root.querySelector(selector),categories=[...new Set(foods.map(f=>f.c||f.cat).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 find('[data-catalog-category]').innerHTML='<option value="">Todas as categorias</option>'+categories.map(c=>'<option value="'+html(c)+'">'+html(c)+'</option>').join('');
 function draw(){
  const result=filterFoodCatalog(foods,{query:find('[data-catalog-search]').value,category:find('[data-catalog-category]').value,page});page=result.page;
  find('[data-catalog-count]').textContent=result.count.toLocaleString('pt-BR')+' alimentos encontrados · '+foods.length.toLocaleString('pt-BR')+' no catálogo';
  find('[data-catalog-results]').innerHTML=result.items.map((food,index)=>'<article class="food-catalog-row"><div class="food-catalog-copy"><span class="food-catalog-category">'+html(food.c||food.cat||'Alimento do consultório')+'</span><h3>'+html(food.n||food.nome)+'</h3>'+(food.brand?'<p>'+html(food.brand)+'</p>':'')+'<p>'+html(food.p||food.porcao)+' · <b>'+number(food.k)+' kcal</b> · P '+number(food.pt)+' / C '+number(food.cb)+' / G '+number(food.g)+' g</p><small>'+foodSourceMarkup(food)+'</small></div><div class="actions"><button type="button" class="btn small" data-catalog-select="'+index+'">'+html(actionLabel)+'</button>'+(food._resource&&onEdit?'<button type="button" class="btn small ghost" data-catalog-edit="'+index+'">Editar cadastro</button>':'')+'</div></article>').join('')||'<div class="empty">Nenhum alimento encontrado. Tente outro nome, marca ou código.</div>';
  find('[data-catalog-page]').textContent='Página '+(page+1)+' de '+result.pages;find('[data-catalog-prev]').disabled=page===0;find('[data-catalog-next]').disabled=page+1===result.pages;
  root.querySelectorAll('[data-catalog-select]').forEach(button=>button.onclick=()=>onSelect(result.items[Number(button.dataset.catalogSelect)]));
  root.querySelectorAll('[data-catalog-edit]').forEach(button=>button.onclick=()=>onEdit(result.items[Number(button.dataset.catalogEdit)]._resource));
 }
 find('[data-catalog-search]').oninput=()=>{page=0;draw();};find('[data-catalog-category]').onchange=()=>{page=0;draw();};find('[data-catalog-prev]').onclick=()=>{page--;draw();};find('[data-catalog-next]').onclick=()=>{page++;draw();};draw();
}
export function measuredFoodControls(item,key,kind='food'){
 if(!item.measurement)return '';
 return '<div class="food-measure-controls"><label>Quantidade<input aria-label="Quantidade de '+html(item.nome)+'" type="number" min="0.001" max="1000" step="any" value="'+html(item.qtd)+'" data-'+kind+'-measure-quantity="'+html(key)+'" required></label><label>Medida<select aria-label="Medida de '+html(item.nome)+'" data-'+kind+'-measure-unit="'+html(key)+'">'+item.measurement.measures.map(m=>'<option value="'+html(m.id)+'" '+(m.id===item.measurement.selectedMeasureId?'selected':'')+'>'+html(m.label)+'</option>').join('')+'</select></label></div>';
}
export function foodNutritionMarkup(item){
 const total=item.measurement?measuredItemNutrition(item).total:Object.fromEntries(['k','pt','cb','g'].map(k=>[k,typeof item[k]==='number'?item[k]*item.qtd:null]));
 const nutrients=[['k','Energia','kcal'],['pt','Proteínas','g'],['cb','Carboidratos','g'],['g','Gorduras','g'],['fb','Fibras','g'],['sugars','Açúcares','g'],['saturated','Gorduras saturadas','g'],['sodiumMg','Sódio','mg'],['calciumMg','Cálcio','mg'],['ironMg','Ferro','mg'],['potassiumMg','Potássio','mg'],['magnesiumMg','Magnésio','mg'],['phosphorusMg','Fósforo','mg'],['zincMg','Zinco','mg'],['vitaminCMg','Vitamina C','mg'],['cholesterolMg','Colesterol','mg']];
 const measure=item.measurement?.measures.find(m=>m.id===item.measurement.selectedMeasureId),household=measure&&measure.id!==item.measurement.baseUnit;
 return (measure?'<p class="food-measure-equivalence"><b>'+html(formatFoodQuantity(item))+'</b>'+(household?'<small>Equivalência: '+html(measure.source||'Medida cadastrada')+'. Medida de referência; o peso pode variar.</small>':'')+'</p>':'')+'<dl class="food-nutrition-preview">'+nutrients.filter(([key],i)=>i<4||total[key]!=null).map(([key,label,unit])=>'<div><dt>'+label+'</dt><dd>'+number(total[key])+' <span>'+unit+'</span></dd></div>').join('')+'</dl>';
}
export function initialCatalogItem(food,id){
 const measures=foodMeasures(food);if(measures.length){const base=measures.find(m=>m.id===food.baseUnit)||measures[0];return makeFoodItem(food,food.baseAmount||100,base.id,{id});}
 return {id,alimId:food.id||food.n,nome:food.n||food.nome,porcao:food.p||food.porcao,qtd:1,k:food.k,pt:food.pt,cb:food.cb,g:food.g,fonte:food.source||food.fonte||'',categoria:food.c||food.cat||''};
}
export function foodPortionModal(H,food,{item:original,onSave,title='Definir quantidade',note='',renderComparison,submitLabel}={}){
 let item=original?structuredClone(original):initialCatalogItem(food,H.uid());
 const measured=!!item.measurement,identity=food||{},source={...identity,source:identity.source||item.measurement?.source||item.fonte,sourceUrl:identity.sourceUrl||item.measurement?.sourceUrl};
 H.modal(title,'<div class="food-portion-heading"><span class="eyebrow">'+html(identity.brand||item.measurement?.brand||'Composição nutricional')+'</span><h3>'+html(item.nome)+'</h3><p class="sub">'+(measured?'Referência: '+item.measurement.baseAmount+' '+html(item.measurement.baseUnit):'Valores por '+html(item.porcao))+' · '+foodSourceMarkup(source)+'</p></div>'+(note?'<p class="sub">'+html(note)+'</p>':'')+(measured?measuredFoodControls(item,'preview','portion'):'<label>Quantidade de porções<input id="food-legacy-quantity" type="number" min="0.001" max="1000" step="any" value="'+html(item.qtd)+'" required></label><p class="sub">Medida cadastrada: '+html(item.porcao)+'. Outras medidas exigem equivalência revisada.</p>')+'<div id="food-portion-preview" aria-live="polite">'+foodNutritionMarkup(item)+'</div><p class="sub">Os nutrientes acompanham a quantidade escolhida. Campos ausentes na fonte permanecem não informados.</p>',onSave?()=>{pull();if(!MT_NUTRICAO.normalizaItem(item,true))throw Error('Confira a quantidade e os nutrientes.');onSave(item);}:undefined);
 const dialog=document.querySelector('#modal');
 if(renderComparison){const comparison=document.createElement('div');comparison.id='food-portion-comparison';comparison.setAttribute('aria-live','polite');comparison.innerHTML=renderComparison(item);const preview=dialog.querySelector('#food-portion-preview');preview.before(comparison);const details=document.createElement('details'),summary=document.createElement('summary');details.className='substitution-nutrition-details';summary.textContent='Ver composição completa da porção';preview.before(details);details.append(summary,preview);}
 function pull(){if(measured){const unit=dialog.querySelector('[data-portion-measure-unit]');if(unit.value!==item.measurement.selectedMeasureId)item=changeFoodMeasure(item,unit.value);item=updateFoodQuantity(item,dialog.querySelector('[data-portion-measure-quantity]').value);}else{const quantity=Number(dialog.querySelector('#food-legacy-quantity').value);if(!Number.isFinite(quantity)||quantity<=0||quantity>1000)throw Error('Informe uma quantidade positiva, até 1000 porções.');item.qtd=quantity;}return item;}
 function preview(){try{pull();document.querySelector('#food-portion-preview').innerHTML=foodNutritionMarkup(item);if(renderComparison)dialog.querySelector('#food-portion-comparison').innerHTML=renderComparison(item);dialog.querySelector('button[type="submit"]')?.removeAttribute('disabled');}catch(error){document.querySelector('#food-portion-preview').textContent=error.message;if(renderComparison)dialog.querySelector('#food-portion-comparison').textContent='Corrija a quantidade para comparar os nutrientes.';dialog.querySelector('button[type="submit"]')?.setAttribute('disabled','');}}
 if(measured){dialog.querySelector('[data-portion-measure-quantity]').oninput=preview;dialog.querySelector('[data-portion-measure-unit]').onchange=event=>{try{item=changeFoodMeasure(item,event.target.value);dialog.querySelector('[data-portion-measure-quantity]').value=item.qtd;preview();}catch(error){event.target.value=item.measurement.selectedMeasureId;H.toast(error.message);}};}else dialog.querySelector('#food-legacy-quantity').oninput=preview;
 if(onSave)dialog.querySelector('button[type="submit"]').textContent=submitLabel||(original?'Aplicar quantidade':'Adicionar ao plano');
 if(renderComparison)dialog.scrollTop=0;
}
