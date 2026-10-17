// Calendar dates are evaluated at UTC noon, independently of browser timezone.
export const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const NUTRIENTS = [['k', 'Energia', 'kcal'], ['pt', 'Proteínas', 'g'], ['cb', 'Carboidratos', 'g'], ['g', 'Gorduras', 'g']];
export function validPlanDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
  const date = new Date(day + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
export function planWeekDays(day) {
  if (!validPlanDate(day)) throw Error('Confira a data do resumo.');
  const date = new Date(day + 'T12:00:00Z'), monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000;
  return Array.from({length: 7}, (_, index) => new Date(monday + index * 86400000).toISOString().slice(0, 10));
}
export function nutrientNumber(value) {
  if (value == null || typeof value === 'boolean' || !String(value).trim()) return null;
  const number = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(number) && number >= 0 && number <= 100000 ? number : null;
}
export function nutrientLabel(value) {
  return value == null || !Number.isFinite(value) ? 'Não informado' : Math.round(value).toLocaleString('pt-BR', {useGrouping:false});
}
export function prescribedTotals(items) {
  const totals = {k: 0, pt: 0, cb: 0, g: 0};
  for (const item of items || []) {
    const quantity = nutrientNumber(item?.qtd);
    for (const [key] of NUTRIENTS) {
      const value = nutrientNumber(item?.[key]);
      if (quantity == null || quantity <= 0 || quantity > 1000 || value == null) totals[key] = null;
      else if (totals[key] != null) totals[key] += quantity * value;
    }
  }
  return totals;
}
export function planDaySummary(plan, day) {
  if (!validPlanDate(day)) throw Error('Confira a data do resumo.');
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay(), warnings = [];
  const starts = [plan?.startOn, plan?.inicio].filter(validPlanDate).sort(), start = starts.at(-1);
  let unavailable = '';
  if (plan?.ativo === false) unavailable = 'Plano inativo nesta versão.';
  else if (start && day < start) unavailable = 'O plano ainda não começou nesta data.';
  else if (validPlanDate(plan?.fim) && day > plan.fim) unavailable = 'A vigência deste plano terminou.';
  // endOn is the date for review; only legacy fim expires a plan.
  if (validPlanDate(plan?.endOn) && day > plan.endOn) warnings.push('Data posterior à revisão do plano. Confirme a continuidade com sua nutri.');
  const mealIndices = [];
  if (!unavailable) (plan?.refeicoes || []).forEach((meal, index) => {
    if (!Array.isArray(meal.dias) || !meal.dias.length || meal.dias.includes(weekday)) mealIndices.push(index);
  });
  const meals = mealIndices.map(index => plan.refeicoes[index]);
  const totals = prescribedTotals(meals.flatMap(meal => meal.itens || []));
  if (NUTRIENTS.some(([key]) => totals[key] == null)) warnings.push('Há nutrientes ou porções incompletos. O total correspondente não foi estimado.');
  return {day, weekday, label: DAY_NAMES[weekday], meals, mealIndices, totals, warnings, unavailable};
}
const escapeDay = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function planDayControls(day, prefix) {
  return `<div class="plan-day-controls"><label>Data do resumo<input id="${prefix}-date" data-plan-date="${prefix}" type="date" required value="${escapeDay(day)}"></label><div class="plan-day-buttons" role="group" aria-label="Dias da semana do resumo">${planWeekDays(day).map(date => {
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    return `<button type="button" class="btn small ghost" data-plan-day="${date}" data-plan-day-context="${prefix}" aria-pressed="${date === day}"><span>${DAY_NAMES[weekday].slice(0,3)}</span><small>${date.slice(8)}/${date.slice(5,7)}</small></button>`;
  }).join('')}</div></div>`;
}
export function planDayNotice(summary) {
  return `<p class="plan-caption prescription-total-note" data-day-note>${escapeDay(summary.label)} · ${summary.day.slice(8)}/${summary.day.slice(5,7)}/${summary.day.slice(0,4)} · ${summary.meals.length} refeições previstas. Totais dos alimentos principais, antes de escolher substituições.</p>${summary.unavailable ? `<p class="notice" data-day-unavailable>${escapeDay(summary.unavailable)}</p>` : !summary.meals.length ? '<p class="notice" data-day-unavailable>Nenhuma refeição prevista nesta data.</p>' : ''}${summary.warnings.map(warning => `<p class="notice warning">${escapeDay(warning)}</p>`).join('')}`;
}
export function planWeekTable(plan, day) {
  const days = planWeekDays(day);
  return `<section class="plan-week-summary"><h3>Resumo por dia da semana</h3><p>Semana de ${days[0].split('-').reverse().join('/')} a ${days[6].split('-').reverse().join('/')}. Alimentos principais; substituições não são somadas.</p><div class="plan-week-scroll"><table><thead><tr><th scope="col">Dia</th><th scope="col">Refeições</th>${NUTRIENTS.map(([,label,unit]) => `<th scope="col">${label} (${unit})</th>`).join('')}</tr></thead><tbody>${days.map(date => {
    const summary = planDaySummary(plan, date);
    return `<tr><th scope="row">${summary.label} ${date.slice(8)}/${date.slice(5,7)}</th><td>${summary.meals.length}</td>${NUTRIENTS.map(([key]) => `<td>${nutrientLabel(summary.totals[key])}</td>`).join('')}</tr>${summary.unavailable || summary.warnings.length ? `<tr><td colspan="6">${escapeDay([summary.unavailable, ...summary.warnings].filter(Boolean).join(' '))}</td></tr>` : ''}`;
  }).join('')}</tbody></table></div></section>`;
}
