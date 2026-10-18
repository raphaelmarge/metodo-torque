import {expandRecipeItem} from './recipe-composition.js';
// Preserve prescribed portions. Only explicit, reviewed recipe snapshots expand;
// no food equivalence or raw/cooked conversion is inferred.
// Match the decimal-comma parsing in MT_NUTRICAO.normalizaItem without
// defaulting absent quantities or requiring unrelated nutrient fields.
function portionQuantity(value) {
  if (value == null || typeof value === 'boolean' || !String(value).trim()) return NaN;
  return Number(String(value).trim().replace(',', '.'));
}
export function portionLabel(item) {
  const quantity = portionQuantity(item?.qtd);
  return Number.isFinite(quantity) && quantity > 0 && String(item?.porcao || '').trim()
    ? `${quantity.toLocaleString('pt-BR', {maximumFractionDigits: 6})} × ${item.porcao}`
    : 'Porção não informada — confira com sua nutri';
}
export function shoppingDates(start, end) {
  const parse = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw Error('Informe as duas datas do período.');
    const time = Date.parse(value + 'T12:00:00Z');
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw Error('Confira as datas do período.');
    return time;
  };
  const first = parse(start), last = parse(end), count = (last-first)/86400000+1;
  if (count < 1 || count > 31) throw Error('Escolha um período de 1 a 31 dias, com o fim após o início.');
  return Array.from({length: count}, (_,i) => new Date(first+i*86400000).toISOString().slice(0,10));
}
export function shoppingList(plan, start, end, choices = {}, dailyChoices = {}) {
  const dates = shoppingDates(start,end), items = new Map(), warnings = new Set();
  const occurrences = (plan.refeicoes || []).map(() => 0);
  for (const day of dates) {
    // endOn is a review date, not an expiry. Legacy fim is an explicit expiry.
    if (plan.ativo === false || (plan.startOn && day < plan.startOn) || (plan.inicio && day < plan.inicio) || (plan.fim && day > plan.fim)) continue;
    (plan.refeicoes || []).forEach((meal,mi) => {
      if (Array.isArray(meal.dias) && meal.dias.length && !meal.dias.includes(new Date(day+'T12:00:00Z').getUTCDay())) return;
      occurrences[mi]++;
      if (meal.receitaId) warnings.add('Preparos vinculados não são desmembrados em ingredientes. Confira a receita manualmente.');
      (meal.itens || []).forEach((main,ii) => {
        const selected = dailyChoices[day]?.[`${mi}:${ii}`] ?? choices[`${mi}:${ii}`] ?? -1;
        const item = selected === -1 ? main : Number.isInteger(selected) ? main.substituicoes?.[selected] : null;
        if (!item) { warnings.add('Uma opção escolhida não está mais prescrita. Selecione novamente.'); return; }
        if (item.receitaId) warnings.add('Preparos vinculados não são desmembrados em ingredientes. Confira a receita manualmente.');
        let ingredients;
        try { ingredients = expandRecipeItem(item); }
        catch (error) { warnings.add(error.message); return; }
        for (const entry of ingredients || [item]) {
          const qtd = portionQuantity(entry.qtd);
          if (!entry.nome || !entry.porcao?.trim() || !Number.isFinite(qtd) || qtd <= 0) {
            warnings.add(`Porção incompleta de ${entry.nome || 'alimento'}: confira com sua nutri antes de comprar.`); continue;
          }
          // Exact portion + identity + preparation: never merge incompatible measures.
          const key = JSON.stringify([entry.alimId || '',entry.nome,entry.porcao,entry.preparo || '',entry.baseGramas ?? null,entry.receitaId || '']);
          if (!items.has(key)) items.set(key,{nome:entry.nome,porcao:entry.porcao,qtd:0});
          const total = items.get(key).qtd + qtd;
          if (!Number.isFinite(total)) { warnings.add('Quantidade fora do limite de cálculo. Confira a prescrição.'); continue; }
          items.get(key).qtd = total;
        }
      });
    });
  }
  if (plan.endOn && end > plan.endOn) warnings.add('O período vai além da data de revisão do plano. Confirme a continuidade com sua nutri.');
  return {items:[...items.values()],occurrences,warnings:[...warnings],days:dates.length};
}
