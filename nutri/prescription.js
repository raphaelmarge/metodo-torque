// Editor operations only affect the working copy. Publication remains explicit.
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function mealDaysLabel(days) {
  if (!Array.isArray(days) || !days.length || days.length === 7) return 'Todos os dias';
  return days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6).map(day => WEEKDAYS[day]).join(', ');
}

function copiedFood(item, uid) {
  const copy = structuredClone(item);
  copy.id = uid();
  if (Array.isArray(copy.substituicoes)) copy.substituicoes = copy.substituicoes.map(item => copiedFood(item, uid));
  return copy;
}

export function duplicateMeal(plan, index, uid) {
  if (!plan.refeicoes?.[index]) throw Error('Refeição não encontrada.');
  if (plan.refeicoes.length >= 12) throw Error('Use até 12 refeições por plano.');
  const next = structuredClone(plan), source = next.refeicoes[index];
  const copy = {...structuredClone(source), id: uid(), titulo: `${source.titulo || 'Refeição'} (cópia)`.slice(0, 120), itens: source.itens.map(item => copiedFood(item, uid))};
  next.refeicoes.splice(index + 1, 0, copy);
  return next;
}

export function duplicateFood(plan, mealIndex, itemIndex, uid) {
  const meal = plan.refeicoes?.[mealIndex];
  if (!meal?.itens?.[itemIndex]) throw Error('Alimento não encontrado.');
  if (meal.itens.length >= 50) throw Error('Use até 50 alimentos por refeição.');
  const next = structuredClone(plan);
  next.refeicoes[mealIndex].itens.splice(itemIndex + 1, 0, copiedFood(meal.itens[itemIndex], uid));
  return next;
}

export function movePrescriptionItem(plan, mealIndex, itemIndex, direction) {
  if (direction !== -1 && direction !== 1) throw Error('Movimento inválido.');
  const next = structuredClone(plan);
  const list = itemIndex == null ? next.refeicoes : next.refeicoes?.[mealIndex]?.itens;
  const index = itemIndex == null ? mealIndex : itemIndex;
  if (!Array.isArray(list) || !Number.isInteger(index) || !list[index]) throw Error('Item não encontrado.');
  const destination = index + direction;
  if (destination < 0 || destination >= list.length) return next;
  [list[index], list[destination]] = [list[destination], list[index]];
  return next;
}

export function latestAnamnesis(records, patientId) {
  return (records || []).filter(record => record.patient_id === patientId && record.kind === 'anamnesis' && !record.data?.archived)
    .slice().sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0] || null;
}

export function publicationError(plan) {
  if (!plan.refeicoes?.length || plan.refeicoes.some(meal => !meal.itens?.length)) return 'Adicione pelo menos uma refeição e um alimento em cada refeição.';
  for (const meal of plan.refeicoes) {
    if (!String(meal.titulo || '').trim()) return 'Dê um nome a cada refeição antes de publicar.';
    if (meal.hora && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(meal.hora)) return 'Confira os horários das refeições.';
    if (meal.dias != null && (!Array.isArray(meal.dias) || meal.dias.some(day => !Number.isInteger(day) || day < 0 || day > 6))) return 'Confira os dias de cada refeição.';
  }
  return '';
}
