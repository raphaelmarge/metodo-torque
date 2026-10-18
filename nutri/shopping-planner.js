import {portionLabel, shoppingDates, shoppingList} from './shopping.js';

// A local preference, never a consumption record or a change to the prescription.
// The account, clinic, patient and publication scope are all part of the key.
export function plannerKey({demo, userId, clinicId, patientId, planId, version}) {
  if (!clinicId || !patientId || !planId || (!demo && !userId)) return null;
  return 'torque-nutri-shopping:v1:' + JSON.stringify([demo ? 'demo' : 'account',
    demo ? 'demo' : userId, clinicId, patientId, demo ? 'demo-plan' : planId, version]);
}
export function planSignature(plan, demo = false) {
  // Non-security fingerprint only prevents applying old positional choices to a
  // changed prescription. Authorization is always the loaded account context.
  const value = JSON.stringify(plan, (key, entry) => demo && ['id','recipeId'].includes(key) ? undefined : entry);
  let hash = 14695981039346656037n;
  for (const char of value) { hash ^= BigInt(char.codePointAt(0)); hash = BigInt.asUintN(64, hash * 1099511628211n); }
  return hash.toString(16);
}
export function validatePlanner(plan, raw) {
  if (!raw || typeof raw !== 'object') throw Error('Planejamento salvo inválido. Calcule novamente.');
  const dates = shoppingDates(raw.start, raw.end), allowed = new Set(dates);
  function choices(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Opções de compras inválidas.');
    const result = {};
    for (const [key, option] of Object.entries(value)) {
      if (!/^\d{1,3}:\d{1,3}$/.test(key)) throw Error('Opção de compras inválida.');
      const [mi, ii] = key.split(':').map(Number), item = plan.refeicoes?.[mi]?.itens?.[ii];
      if (!item || !Number.isInteger(option) || option < -1 || (option >= 0 && !item.substituicoes?.[option])) {
        throw Error('Uma opção não está mais prescrita. Revise o planejamento.');
      }
      result[key] = option;
    }
    return result;
  }
  const dailyChoices = {};
  if (raw.dailyChoices != null && (typeof raw.dailyChoices !== 'object' || Array.isArray(raw.dailyChoices))) throw Error('Dias de compras inválidos.');
  for (const [day, value] of Object.entries(raw.dailyChoices || {})) {
    if (allowed.has(day)) dailyChoices[day] = choices(value);
  }
  return {start: raw.start, end: raw.end, choices: choices(raw.choices || {}), dailyChoices};
}
export function readPlanner(storage, key, signature, plan) {
  if (!key) return {state: null, message: ''};
  try {
    const raw = JSON.parse(storage.getItem(key) || 'null');
    if (!raw) return {state: null, message: ''};
    if (raw.signature !== signature) return {state: null, message: 'O plano mudou. Revise e salve novas escolhas para esta versão.'};
    return {state: validatePlanner(plan, raw.state), message: 'Planejamento recuperado deste aparelho.'};
  } catch {
    return {state: null, message: 'Não foi possível recuperar as escolhas neste aparelho. Calcule e salve novamente.'};
  }
}
export function savePlanner(storage, key, signature, plan, state) {
  const valid = validatePlanner(plan, state);
  if (!key) return {state: valid, saved: false};
  try {
    storage.setItem(key, JSON.stringify({v: 1, signature, state: valid}));
    return {state: valid, saved: true};
  } catch { return {state: valid, saved: false}; }
}

export function createShoppingPlanner(H, {pat, icon}) {
  const {state: s, today, esc, dateLabel} = H;
  const q = selector => document.querySelector(selector);
  let context = '', current = null, editDay = 'all', message = '', storageKey = null, signature = '';
  const storage = {getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value)};
  function defaults() {
    const date = new Date(today() + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 6);
    return {start: today(), end: date.toISOString().slice(0,10), choices: {}, dailyChoices: {}};
  }
  function prepare(published) {
    const value = s();
    const key = plannerKey({demo: value.demo, userId: value.user?.id, clinicId: value.clinic?.id,
      patientId: pat()?.id, planId: published.id, version: published.version});
    const sig = planSignature(published.data, !!value.demo), next = JSON.stringify([key, sig, value.role]);
    if (context !== next) {
      context = next; storageKey = key; signature = sig; editDay = 'all';
      const restored = readPlanner(storage, key, sig, published.data);
      current = restored.state || defaults(); message = restored.message;
    }
    return current;
  }
  function active(meal, day) {
    return day === 'all' || !Array.isArray(meal.dias) || !meal.dias.length || meal.dias.includes(new Date(day + 'T12:00:00Z').getUTCDay());
  }
  function optionsHTML(plan) {
    let count = 0;
    const html = (plan.refeicoes || []).map((meal, mi) => active(meal, editDay) ? (meal.itens || []).map((item, ii) => {
      if (!item.substituicoes?.length) return '';
      count++; const key = `${mi}:${ii}`, override = current.dailyChoices[editDay]?.[key];
      const selected = editDay === 'all' ? current.choices[key] ?? -1 : override ?? 'default';
      return `<label>${esc(meal.titulo)} · ${esc(item.nome)}<select data-shopping-choice="${key}">${editDay !== 'all' ? `<option value="default" ${selected === 'default' ? 'selected' : ''}>Usar opção padrão do período</option>` : ''}${[item,...item.substituicoes].map((option, index) => `<option value="${index-1}" ${selected === index-1 ? 'selected' : ''}>${esc(option.nome)} — ${esc(portionLabel(option))}${index === 0 ? ' (principal)' : ''}</option>`).join('')}</select></label>`;
    }).join('') : '').join('');
    return count ? html : '<p class="plan-caption">Sem alternativas prescritas para esta seleção.</p>';
  }
  function resultHTML(plan, result) {
    return `<p class="plan-caption">${esc(dateLabel(current.start))} a ${esc(dateLabel(current.end))} · ${result.days} dias · somente os dias previstos de cada refeição.</p><details><summary>Conferir ocorrências das refeições</summary><ul>${(plan.refeicoes || []).map((meal, mi) => `<li><span>${esc(meal.titulo)}</span><span>${result.occurrences[mi]} vezes</span></li>`).join('')}</ul></details>${result.warnings.map(w => `<p class="notice warning">${esc(w)}</p>`).join('')}<ul>${result.items.map(item => `<li><span>${esc(item.nome)}</span><span>${esc(portionLabel(item))}</span></li>`).join('') || '<li>Nenhum alimento quantificado neste período.</li>'}</ul><p class="plan-caption">Ingredientes de receitas prescritas entram conforme as porções e o rendimento revisados. Medidas diferentes e alimentos crus/cozidos ficam separados.</p>`;
  }
  function dayOptions() {
    return '<option value="all">Padrão para todo o período</option>' + shoppingDates(current.start, current.end).map(day => `<option value="${day}" ${editDay === day ? 'selected' : ''}>${esc(dateLabel(day))} · ${['dom','seg','ter','qua','qui','sex','sáb'][new Date(day+'T12:00:00Z').getUTCDay()]}</option>`).join('');
  }
  function panel(published) {
    const plan = published.data, st = prepare(published), result = shoppingList(plan, st.start, st.end, st.choices, st.dailyChoices);
    return `<section class="plan-shopping"><div class="plan-support-heading">${icon('food')}<span class="eyebrow">Organize suas compras</span></div><h2>Lista de compras</h2><form id="shopping-form"><div class="shopping-dates"><label>De<input id="shopping-start" type="date" required value="${esc(st.start)}"></label><label>Até (inclusive)<input id="shopping-end" type="date" required value="${esc(st.end)}"></label></div><p class="plan-caption">Escolha de 1 a 31 dias. Use uma opção padrão e ajuste os dias em que quiser outra alternativa prescrita.</p><details id="shopping-choices"><summary>Escolher alternativas para as compras</summary><label>Opções para<select id="shopping-edit-day">${dayOptions()}</select></label><div id="shopping-options">${optionsHTML(plan)}</div></details><p class="plan-caption">Ao calcular, as escolhas ficam salvas neste aparelho, nesta conta e versão do plano. Não alteram a prescrição nem registram consumo no diário.</p><button class="btn" type="submit">Calcular e salvar compras</button><p id="shopping-feedback" role="status" aria-live="polite">${esc(message)}</p></form><div id="shopping-result">${resultHTML(plan, result)}</div></section>`;
  }
  function captureOptions() {
    const target = editDay === 'all' ? current.choices : (current.dailyChoices[editDay] ||= {});
    document.querySelectorAll('[data-shopping-choice]').forEach(select => {
      if (select.value === 'default') delete target[select.dataset.shoppingChoice];
      else target[select.dataset.shoppingChoice] = Number(select.value);
    });
  }
  function captureDates(plan) {
    current = validatePlanner(plan, {...current, start: q('#shopping-start').value, end: q('#shopping-end').value});
    if (editDay !== 'all' && (editDay < current.start || editDay > current.end)) editDay = 'all';
  }
  function bind() {
    const form = q('#shopping-form'); if (!form) return;
    const published = H.published(); if (!published) return;
    prepare(published);
    const capturedContext = context;
    const sameContext = () => { const latest = H.published(); if (!latest) return false; prepare(latest); return context === capturedContext; };
    const fail = error => { q('#shopping-feedback').textContent = error.message; q('#shopping-result').hidden = true; };
    const markDirty = () => { q('#shopping-result').hidden = true; q('#shopping-feedback').textContent = 'Calcule e salve para guardar as escolhas e atualizar a lista.'; };
    form.oninput = markDirty;
    q('#shopping-edit-day').onchange = () => {
      if (!sameContext()) return H.render();
      try {
        captureOptions(); captureDates(published.data); editDay = q('#shopping-edit-day').value;
        q('#shopping-options').innerHTML = optionsHTML(published.data); markDirty();
      } catch (error) { fail(error); }
    };
    for (const field of ['#shopping-start','#shopping-end']) q(field).onchange = () => {
      if (!sameContext()) return H.render();
      try {
        captureOptions(); captureDates(published.data);
        q('#shopping-edit-day').innerHTML = dayOptions(); q('#shopping-options').innerHTML = optionsHTML(published.data); markDirty();
      } catch (error) { fail(error); }
    };
    form.onsubmit = event => {
      event.preventDefault(); if (!sameContext()) return H.render();
      try {
        captureOptions(); captureDates(published.data);
        const result = shoppingList(published.data, current.start, current.end, current.choices, current.dailyChoices);
        const saved = savePlanner(storage, storageKey, signature, published.data, current);
        current = saved.state;
        message = saved.saved ? 'Lista atualizada e escolhas salvas neste aparelho.' : 'Lista calculada. Não foi possível salvar neste aparelho; mantenha esta tela aberta.';
        q('#shopping-result').innerHTML = resultHTML(published.data, result); q('#shopping-result').hidden = false;
        q('#shopping-feedback').textContent = message; form.querySelector('button[type="submit"]').focus();
      } catch (error) { fail(error); }
    };
  }
  return {panel, bind};
}
