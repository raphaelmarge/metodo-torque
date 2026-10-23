import {foodBrowserMarkup,bindFoodBrowser,foodPortionModal,foodSourceMarkup} from './food-catalog.js';
import {suggestFoodSubstitutions,compareFoodItems} from './food-substitutions.js';
import {portionLabel} from './shopping.js';

const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nutrients=[['k','Energia','kcal'],['pt','Proteínas','g'],['cb','Carboidratos','g'],['g','Gorduras','g']];
const number=value=>Number.isFinite(value)?value.toLocaleString('pt-BR',{maximumFractionDigits:2}):'—';
const signed=value=>Math.abs(value)<.005?'0':(value>0?'+':'−')+number(Math.abs(value));
const notice=restrictions=>restrictions?'<p class="notice warning substitution-restrictions"><b>Restrições registradas</b><br>'+html(restrictions)+'</p>':'';

export function substitutionComparisonMarkup(target,candidate){
 let comparison;try{comparison=compareFoodItems(target,candidate);}catch{return '<p class="notice">Comparação indisponível: confira os valores nutricionais do alimento principal e da alternativa.</p>';}
 return '<div class="substitution-comparison"><table><caption>Comparação com '+html(target.nome)+' · '+html(portionLabel(target))+'</caption><thead><tr><th scope="col">Nutriente</th><th scope="col">Original</th><th scope="col">Opção</th><th scope="col">Diferença</th></tr></thead><tbody>'+nutrients.map(([key,label,unit])=>'<tr><th scope="row">'+label+' <small>'+unit+'</small></th><td>'+number(comparison.target[key])+'</td><td>'+number(comparison.candidate[key])+'</td><td>'+signed(comparison.delta[key])+'</td></tr>').join('')+'</tbody></table><p>Ao escolher esta opção, a diferença também se aplica ao total do dia. Outras trocas podem somar diferenças.</p></div>';
}

export function foodSubstitutionModal(H,{target,foods,restrictions='',onSave}){
 // Keep the reference independent from later catalogue or editor mutations.
 const reference=structuredClone(target),suggestions=suggestFoodSubstitutions(reference,foods,{limit:6,excludeIds:(reference.substituicoes||[]).map(item=>item.alimId)});
 let targetTotals=null;try{targetTotals=compareFoodItems(reference,reference).target;}catch{}
 const referenceMarkup='<section class="substitution-target"><span class="eyebrow">Alimento principal</span><h3>'+html(reference.nome)+'</h3><p>'+html(portionLabel(reference))+'</p><div class="substitution-macros">'+nutrients.map(([key,label,unit])=>'<div><span>'+label+'</span><b>'+number(targetTotals?.[key])+' <small>'+unit+'</small></b></div>').join('')+'</div></section>';
 const candidateMarkup=suggestions.map((suggestion,index)=>'<article class="substitution-option"><div class="substitution-option-head"><div><span class="eyebrow">Porção ajustada</span><h3>'+html(suggestion.item.nome)+'</h3><p class="substitution-amount">'+html(portionLabel(suggestion.item))+'</p></div><button type="button" class="btn small" data-substitution-select="'+index+'">Revisar substituição</button></div><dl class="substitution-macros">'+nutrients.map(([key,label,unit])=>'<div><dt>'+label+'</dt><dd>'+number(suggestion.comparison.candidate[key])+' <small>'+unit+'</small></dd><small>'+signed(suggestion.comparison.delta[key])+' '+unit+' vs. original</small></div>').join('')+'</dl><small class="substitution-source">'+foodSourceMarkup(suggestion.food)+'</small></article>').join('');
 H.modal('Substituições sugeridas',referenceMarkup+'<p class="sub">Porções ajustadas, em ordem de proximidade de calorias e macros.</p>'+notice(restrictions)+'<p class="substitution-clinical-note">As sugestões não verificam alergias ou adequação clínica. Revise as restrições e o rótulo.</p><div class="substitution-tabs" role="group" aria-label="Escolher alternativa"><button type="button" class="btn small" data-substitution-tab="suggestions" aria-pressed="true">Sugestões · '+suggestions.length+'</button><button type="button" class="btn small ghost" data-substitution-tab="catalog" aria-pressed="false">Buscar no catálogo</button></div><section data-substitution-panel="suggestions">'+(candidateMarkup||'<div class="empty"><b>Nenhuma sugestão próxima disponível.</b><p>Não encontramos uma combinação de grupo, preparo e nutrientes que permita sugerir uma porção. Use a busca para escolher e revisar outra opção.</p></div>')+'</section><section data-substitution-panel="catalog" hidden><p class="sub">Escolha outro alimento e confira a comparação ao definir sua quantidade.</p>'+foodBrowserMarkup()+'</section>');
 const root=document.querySelector('#modal-body');document.querySelector('#modal').scrollTop=0;root.querySelector('#close-modal').focus({preventScroll:true});
 const review=(food,item)=>{
  foodPortionModal(H,food,{...(item?{item:{...structuredClone(item),id:H.uid()}}:{}),title:'Revisar substituição',note:'Esta alternativa substitui a porção inteira de '+reference.nome+'.'+(restrictions?' Restrições registradas: '+restrictions:''),submitLabel:'Adicionar substituição',renderComparison:next=>substitutionComparisonMarkup(reference,next),onSave});
  const back=document.createElement('button');back.type='button';back.className='btn small ghost substitution-back';back.textContent='Voltar às sugestões';back.onclick=()=>foodSubstitutionModal(H,{target:reference,foods,restrictions,onSave});document.querySelector('.food-portion-heading').before(back);back.focus({preventScroll:true});document.querySelector('#modal').scrollTop=0;
 };
 root.querySelectorAll('[data-substitution-select]').forEach(button=>button.onclick=()=>{const suggestion=suggestions[Number(button.dataset.substitutionSelect)];review(suggestion.food,suggestion.item);});
 root.querySelectorAll('[data-substitution-tab]').forEach(button=>button.onclick=()=>{
  root.querySelectorAll('[data-substitution-tab]').forEach(tab=>{const active=tab===button;tab.setAttribute('aria-pressed',String(active));tab.classList.toggle('ghost',!active);});
  root.querySelectorAll('[data-substitution-panel]').forEach(panel=>panel.hidden=panel.dataset.substitutionPanel!==button.dataset.substitutionTab);
  if(button.dataset.substitutionTab==='catalog')root.querySelector('[data-catalog-search]').focus();
 });
 bindFoodBrowser(root.querySelector('#food-browser'),{foods,actionLabel:'Comparar alimento',onSelect:food=>review(food,null)});
}
