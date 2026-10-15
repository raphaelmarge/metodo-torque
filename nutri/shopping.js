// Conservative shopping arithmetic: preserve the prescribed portion verbatim.
// No equivalence, ingredient expansion or raw/cooked conversion is inferred.
export function portionLabel(item) {
  const quantity = Number(item?.qtd);
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
export function shoppingList(plan, start, end, choices = {}) {
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
        const selected = choices[`${mi}:${ii}`] ?? -1;
        const item = selected === -1 ? main : Number.isInteger(selected) ? main.substituicoes?.[selected] : null;
        if (!item) { warnings.add('Uma opção escolhida não está mais prescrita. Selecione novamente.'); return; }
        if (item.receitaId) warnings.add('Preparos vinculados não são desmembrados em ingredientes. Confira a receita manualmente.');
        const qtd = Number(item.qtd);
        if (!item.nome || !item.porcao?.trim() || !Number.isFinite(qtd) || qtd <= 0) {
          warnings.add(`Porção incompleta de ${item.nome || 'alimento'}: confira com sua nutri antes de comprar.`); return;
        }
        // Exact portion + identity + preparation: never merge incompatible measures.
        const key = JSON.stringify([item.alimId || '',item.nome,item.porcao,item.preparo || '',item.baseGramas ?? null,item.receitaId || '']);
        if (!items.has(key)) items.set(key,{nome:item.nome,porcao:item.porcao,qtd:0});
        items.get(key).qtd += qtd;
      });
    });
  }
  if (plan.endOn && end > plan.endOn) warnings.add('O período vai além da data de revisão do plano. Confirme a continuidade com sua nutri.');
  return {items:[...items.values()],occurrences,warnings:[...warnings],days:dates.length};
}
