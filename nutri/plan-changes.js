import {mealDaysLabel} from './prescription.js';
import {portionLabel} from './shopping.js';
import {nutrientNumber, NUTRIENTS} from './day-summary.js';

const text = value => String(value ?? '').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objects = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
const days = value => !Array.isArray(value) || !value.length ? [0,1,2,3,4,5,6] : [...new Set(value)].sort();
// Match only within the enclosing meal/food. Duplicate legacy IDs never merge.
function pairItems(before, after) {
  before = objects(before); after = objects(after);
  const used = new Set(), pairs = after.map((item, index) => {
    let old = before.findIndex((candidate, i) => !used.has(i) && text(candidate.id) === text(item.id) && same(candidate, item));
    if (old < 0) old = before.findIndex((candidate, i) => !used.has(i) && text(item.id) && candidate.id === item.id);
    if (old < 0 && !text(item.id)) old = before.findIndex((candidate, i) => !used.has(i) && !text(candidate.id) && (candidate.nome || candidate.titulo) === (item.nome || item.titulo));
    if (old >= 0) used.add(old);
    return {before: old >= 0 ? before[old] : null, after: item, beforeIndex: old, afterIndex: index};
  });
  before.forEach((item, index) => { if (!used.has(index)) pairs.push({before:item, after:null, beforeIndex:index, afterIndex:-1}); });
  return pairs;
}
const exactNumber = value => value == null ? 'Não informado' : value.toLocaleString('pt-BR', {useGrouping:false, maximumFractionDigits:20});
function precisePortion(item) {
  const quantity = nutrientNumber(item?.qtd);
  return quantity > 0 && text(item?.porcao) ? `${exactNumber(quantity)} × ${item.porcao}` : portionLabel(item);
}
function foodDescription(item) { return `${text(item.nome) || 'Alimento'} — ${precisePortion(item)}`; }
function nutrientDescription(item) {
  return NUTRIENTS.map(([key,label,unit]) => `${label}: ${exactNumber(nutrientNumber(item?.[key]))}${nutrientNumber(item?.[key]) == null ? '' : ' '+unit}`).join(', ');
}
function compositionDescription(composition) {
  if (!composition || typeof composition !== 'object' || Array.isArray(composition)) return 'Sem receita calculada';
  const ingredients = Array.isArray(composition.ingredients) ? composition.ingredients.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Ingrediente indisponível';
    return `${foodDescription(item)} · por medida: ${nutrientDescription(item)}${item.baseGramas != null ? ' · peso da medida: '+exactNumber(nutrientNumber(item.baseGramas))+' g' : ''}${text(item.preparo) ? ' · preparo: '+text(item.preparo) : ''}${text(item.fonte || item.source) ? ' · fonte: '+text(item.fonte || item.source) : ''}`;
  }).join('\n') : 'Ingredientes indisponíveis';
  const steps = Array.isArray(composition.steps) ? composition.steps.map(text).join('\n') : 'Etapas indisponíveis';
  const unquantified = Array.isArray(composition.unquantifiedIngredients) ? composition.unquantifiedIngredients.map(text).join('; ') : composition.unquantifiedIngredients == null ? '' : 'Informação indisponível';
  return `${text(composition.title)} · rendimento: ${text(composition.yield)} porções\n${ingredients}\nPreparo: ${steps}\nOrientações: ${text(composition.notes) || 'Não informado'}\nFonte: ${text(composition.source) || 'Não informado'}${unquantified ? '\nIngredientes sem quantidade: '+unquantified : ''}`;
}
export function comparePlans(before, after) {
  const changes = [], add = (where, label, oldValue, newValue) => {
    if (!same(oldValue, newValue)) changes.push({where, label, before: oldValue == null || oldValue === '' ? 'Não informado' : String(oldValue), after: newValue == null || newValue === '' ? 'Não informado' : String(newValue)});
  };
  if (!before) return {first:true, changes:[]};
  for (const [key,label] of [['titulo','Título'],['objetivo','Objetivo'],['orientacoes','Orientações'],['dias','Contexto dos dias'],['startOn','Início'],['endOn','Revisar até'],['inicio','Início da vigência'],['fim','Fim da vigência'],['responsavel','Profissional responsável'],['crn','CRN']]) add('Plano',label,text(before[key]),text(after[key]));
  add('Plano','Água por dia',nutrientNumber(before.aguaMl) == null ? null : `${nutrientNumber(before.aguaMl)} ml`,nutrientNumber(after.aguaMl) == null ? null : `${nutrientNumber(after.aguaMl)} ml`);
  add('Plano','Situação',before.ativo === false ? 'Inativo' : 'Ativo',after.ativo === false ? 'Inativo' : 'Ativo');
  for (const pair of pairItems(before.refeicoes || [], after.refeicoes || [])) {
    const old = pair.before, next = pair.after, meal = next || old, where = `${meal.titulo || 'Refeição'} · refeição ${(next ? pair.afterIndex : pair.beforeIndex) + 1}`;
    if (!old || !next) { add(where,old ? 'Refeição removida' : 'Refeição adicionada',old ? `${old.hora || 'Sem horário'} · ${mealDaysLabel(old.dias)} · ${objects(old.itens).map(foodDescription).join('; ')}` : 'Ausente',next ? `${next.hora || 'Sem horário'} · ${mealDaysLabel(next.dias)} · ${objects(next.itens).map(foodDescription).join('; ')}` : 'Ausente'); continue; }
    add(where,'Nome da refeição',text(old.titulo),text(next.titulo));
    add(where,'Horário',text(old.hora),text(next.hora));
    if (!same(days(old.dias),days(next.dias))) add(where,'Dias',mealDaysLabel(old.dias),mealDaysLabel(next.dias));
    if (pair.beforeIndex !== pair.afterIndex) add(where,'Posição no plano',pair.beforeIndex + 1,pair.afterIndex + 1);
    for (const itemPair of pairItems(old.itens || [], next.itens || [])) {
      const a = itemPair.before, b = itemPair.after, item = b || a, context = `${where} / ${item.nome || 'Alimento'} · item ${(b ? itemPair.afterIndex : itemPair.beforeIndex) + 1}`;
      if (!a || !b) { add(context,a ? 'Alimento removido' : 'Alimento adicionado',a ? foodDescription(a) : 'Ausente',b ? foodDescription(b) : 'Ausente'); continue; }
      add(context,'Alimento',text(a.nome),text(b.nome));
      add(context,'Porção',precisePortion(a),precisePortion(b));
      add(context,'Preparo',text(a.preparo),text(b.preparo));
      add(context,'Receita calculada',compositionDescription(a.recipeComposition),compositionDescription(b.recipeComposition));
      for (const [key,label,unit] of NUTRIENTS) if (nutrientNumber(a[key]) !== nutrientNumber(b[key])) add(context,`${label} por porção`,`${exactNumber(nutrientNumber(a[key]))}${nutrientNumber(a[key]) == null ? '' : ' '+unit}`,`${exactNumber(nutrientNumber(b[key]))}${nutrientNumber(b[key]) == null ? '' : ' '+unit}`);
      for (const alternative of pairItems(a.substituicoes || [], b.substituicoes || [])) {
        const left = alternative.before, right = alternative.after, describe = option => option ? `${foodDescription(option)} · ${nutrientDescription(option)}${option.recipeComposition ? '\n'+compositionDescription(option.recipeComposition) : ''}` : 'Ausente';
        add(context,'Alternativa prescrita',describe(left),describe(right));
      }
    }
    const recipeDescription = (plan, ref) => {
      const ids = [ref.receitaId,...objects(ref.itens).map(item => item.receitaId)].filter(Boolean);
      return objects(plan.receitas).filter(recipe => ids.includes(recipe.id)).map(recipe => ({nome:recipe.nome || recipe.n,ingredientes:recipe.ingredientes || recipe.ing,modo:recipe.modo,rendimento:recipe.rendimento || recipe.rende,itens:objects(recipe.itens).map(item => ({nome:item.nome,porcao:portionLabel(item),k:item.k,pt:item.pt,cb:item.cb,g:item.g}))}));
    };
    const oldRecipes = recipeDescription(before,old), newRecipes = recipeDescription(after,next);
    if (!same(oldRecipes,newRecipes)) add(where,'Receita e modo de preparo',oldRecipes.map(recipe => recipe.nome).join(', ') || 'Sem preparo vinculado',newRecipes.map(recipe => recipe.nome).join(', ') + (oldRecipes.length && newRecipes.length ? ' (conteúdo revisado)' : '') || 'Sem preparo vinculado');
  }
  return {first:false, changes};
}
export function previousPublishedPlan(records, published, patientId) {
  if (!published || published.patient_id !== patientId || published.status !== 'published') return null;
  const eligible = (records || []).filter(record => record.patient_id === patientId && record.kind === 'plan_version' && record.visibility === 'patient' && !record.archived && !record.data?.archived && record.data?.planId === published.id && Number.isInteger(record.data?.planVersion) && record.data.planVersion > 0 && record.data.planVersion < published.version && record.data.plan && typeof record.data.plan === 'object' && !Array.isArray(record.data.plan))
    .slice().sort((a,b) => b.data.planVersion - a.data.planVersion);
  const latest = eligible[0];
  // A conflicting snapshot cannot be chosen by row order or arrival time.
  if (!latest || eligible.some(record => record.data.planVersion === latest.data.planVersion && !same(record.data.plan,latest.data.plan))) return null;
  return latest;
}
export function renderPlanChanges(comparison, {title = 'O que mudou no meu plano', subtitle = ''} = {}) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  return `<section class="plan-changes"><h2>${escape(title)}</h2>${subtitle ? `<p class="sub">${escape(subtitle)}</p>` : ''}${comparison.first ? '<p>Primeira publicação. Confira todas as refeições e orientações.</p>' : comparison.changes.length ? `<p class="sub">${comparison.changes.length} alterações identificadas.</p><details><summary>Conferir alterações</summary><ul>${comparison.changes.map(change => `<li><b>${escape(change.where)} · ${escape(change.label)}</b><div><span>Antes</span><p>${escape(change.before)}</p></div><div><span>Agora</span><p>${escape(change.after)}</p></div></li>`).join('')}</ul></details>` : '<p>Sem alterações nos alimentos, porções, horários, dias e orientações comparados.</p>'}</section>`;
}
