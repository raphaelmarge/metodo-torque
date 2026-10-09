const list = value => Array.isArray(value) ? value : [];
const string = value => typeof value === 'string' ? value.trim() : '';
const KEY_PATTERN = /^(?:source|clinic|plan):[^\s]{1,120}$/;

// The original core preserves incomplete nutrition as incomplete. Preparations
// are attached separately and must never replace prescribed foods or nutrients.
export function normalizeRecipeReference(raw, {id, title, key} = {}) {
  if (!raw || typeof raw !== 'object' || !globalThis.MT_NUTRICAO?.normalizaReceita) return null;
  const value = globalThis.MT_NUTRICAO.normalizaReceita({
    ...raw, id: id ?? raw.id, nome: title ?? raw.nome ?? raw.n,
    fonte: raw.fonte || raw.source || ''
  });
  if (!value?.nome || !value.id) return null;
  return {...value, recipeKey: key || (KEY_PATTERN.test(raw.recipeKey || '') ? raw.recipeKey : 'plan:' + value.id)};
}

export function favoriteStorageKey({clinicId, userId, patientId, demo = false}) {
  return 'torque-nutri-recipe-favorites:' + String(clinicId || 'unknown') + ':' +
    String(demo ? 'demo' : userId || 'anonymous') + ':' + String(patientId || 'none');
}

export function createPlanRecipes(H, {resources, pat, bind = () => {}}) {
  const s = H.state, pro = () => s().role === 'nutri', esc = H.esc;
  const button = (label, action, id, cls = 'small') => '<button class="btn ' + cls + '" data-x="' + action + '" data-id="' + esc(id) + '">' + label + '</button>';
  const context = () => ({clinicId: s().clinic?.id, userId: s().user?.id, patientId: pat()?.id || s().selected, demo: !!s().demo});
  const storageKey = () => favoriteStorageKey(context());
  const favorites = () => {
    try { return [...new Set(list(JSON.parse(localStorage.getItem(storageKey()) || '[]')).filter(key => typeof key === 'string' && KEY_PATTERN.test(key)))].slice(0, 200); }
    catch { return []; }
  };
  function catalog() {
    const source = list(globalThis.MT_RECEITAS).map(raw => raw && normalizeRecipeReference(raw, {key: 'source:' + string(raw.id)})).filter(Boolean);
    const own = list(resources('recipe')).filter(row => row && !row.data?.archived && !row.archived &&
      (!row.clinic_id || row.clinic_id === s().clinic?.id) && (pro() || row.shared === true))
      .map(row => normalizeRecipeReference(row.data, {id: row.id, title: row.title, key: 'clinic:' + row.id})).filter(Boolean);
    return [...source, ...own];
  }
  function publishedPlan() {
    const plan = H.published();
    if (plan?.patient_id && plan.patient_id !== (pat()?.id || s().selected)) return null;
    return plan?.data || null;
  }
  function linkedRecipes() {
    const plan = publishedPlan();
    return list(plan?.refeicoes).flatMap(meal => {
      if (!meal || typeof meal !== 'object') return [];
      const raw = list(plan?.receitas).find(recipe => recipe?.id === meal.receitaId);
      const recipe = normalizeRecipeReference(raw);
      return recipe ? [{meal, recipe}] : [];
    });
  }
  function favoriteButton(recipe, favorite = favorites().includes(recipe.recipeKey)) {
    return '<button class="btn small ghost" data-x="recipe-favorite" data-id="' + esc(recipe.recipeKey) + '" aria-pressed="' + favorite + '">' +
      (favorite ? '♥ Favorita' : '♡ Favoritar') + ' neste aparelho</button>';
  }
  function preparation(recipe) {
    return '<p class="sub">' + esc(recipe.categoria || 'Receita') +
      (recipe.tempo != null ? ' · ' + esc(recipe.tempo) + ' min' : '') + ' · Rendimento: ' + esc(recipe.rendimento) + ' porções</p>' +
      '<h3>Ingredientes</h3>' + (recipe.ingredientes.length ? '<ul>' + recipe.ingredientes.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '<p class="sub">Ingredientes não informados.</p>') +
      '<h3>Modo de preparo</h3>' + (recipe.modo.length ? '<ol>' + recipe.modo.map(step => '<li>' + esc(step) + '</li>').join('') + '</ol>' : '<p class="sub">Preparo não informado.</p>') +
      '<p class="sub">Fonte: ' + esc(recipe.fonte || 'Catálogo de receitas Torque; fonte detalhada não informada.') + '</p>';
  }
  function recipeDetail(key) {
    const recipe = catalog().find(item => item.recipeKey === key || item.id === key);
    if (!recipe) return H.toast('Esta receita não está disponível neste catálogo.');
    H.modal(esc(recipe.nome), '<div class="notice">Ideia para conversar com sua nutri. Esta receita não substitui os alimentos ou as porções do seu plano.</div>' + preparation(recipe) + '<div class="actions">' + favoriteButton(recipe) + '</div>');
    bind();
  }
  function planRecipe(mealId) {
    const linked = linkedRecipes().find(item => item.meal.id === mealId);
    if (!linked) return H.toast('O preparo desta refeição não está disponível na versão publicada.');
    H.modal(esc(linked.recipe.nome), '<div class="notice">Preparo vinculado pela sua nutri à refeição ' + esc(linked.meal.titulo || '') + '. Confira no plano os alimentos e as porções prescritos.</div>' + preparation(linked.recipe) + '<div class="actions">' + favoriteButton(linked.recipe) + '</div>');
    bind();
  }
  function tiles(items, linked = false) {
    const starred = new Set(favorites());
    return items.map(item => {
      const isLinked = linked || !!item.recipe, recipe = isLinked ? item.recipe : item;
      return '<section class="card recipe-card"><span class="pill">' + esc(isLinked ? item.meal.titulo || 'No meu plano' : recipe.categoria || 'Receita') + '</span><h2>' + esc(recipe.nome) + '</h2><p class="sub">' +
        (recipe.tempo != null ? esc(recipe.tempo) + ' min · ' : '') + 'Rendimento: ' + esc(recipe.rendimento) + ' porções</p><div class="actions">' +
        button('Ver ingredientes e preparo', isLinked ? 'plan-recipe' : 'recipe-detail', isLinked ? item.meal.id : recipe.recipeKey) +
        favoriteButton(recipe, starred.has(recipe.recipeKey)) + '</div></section>';
    }).join('');
  }
  function filterTiles(term = '') {
    const search = string(term).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matches = recipe => (recipe.nome + ' ' + recipe.categoria).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(search);
    const linked = linkedRecipes().filter(item => matches(item.recipe));
    const ideas = catalog().filter(matches);
    const starred = new Set(favorites()), preferred = new Map();
    // A favorite already linked to the plan opens its approved snapshot. The
    // same stable key appears once, even when it belongs to several meals.
    for (const item of linked) if (starred.has(item.recipe.recipeKey) && !preferred.has(item.recipe.recipeKey)) preferred.set(item.recipe.recipeKey, item);
    for (const recipe of ideas) if (starred.has(recipe.recipeKey) && !preferred.has(recipe.recipeKey)) preferred.set(recipe.recipeKey, recipe);
    let html = !pro() && linked.length ? '<section class="recipe-section"><h2>Receitas do meu plano</h2><p class="sub">Preparos da versão publicada pela sua nutri. As porções continuam no plano alimentar.</p><div class="module-grid">' + tiles(linked, true) + '</div></section>' : '';
    if (preferred.size) html += '<section class="recipe-section recipe-favorites"><h2>Minhas favoritas neste aparelho</h2><p class="sub">Seus preparos guardados para encontrar de novo. Favoritar não muda o plano alimentar.</p><div class="module-grid">' + tiles([...preferred.values()]) + '</div></section>';
    html += '<section class="recipe-section"><h2>' + (pro() ? 'Catálogo e receitas do consultório' : 'Ideias para conversar com sua nutri') + '</h2><p class="sub">' +
      (pro() ? 'Revise ingredientes, restrições e porções antes de vincular um preparo ao rascunho.' : 'Explore preparos e leve suas preferências à consulta. O catálogo não é uma prescrição para você.') +
      '</p><div class="module-grid">' + (tiles(ideas) || '<div class="empty">Nenhuma receita encontrada.</div>') + '</div></section>';
    return html;
  }
  function recipes() {
    return H.heading('Biblioteca', pro() ? 'Receitas do consultório' : 'Receitas e preparos', 'Ingredientes, preparo e preferências para sua rotina.',
      pro() ? button('+ Receita própria', 'resource-new', 'recipe') : '') +
      '<p class="sub">Seus favoritos ficam somente neste aparelho e não rendem XP.</p><label class="search">Buscar receita<input id="x-recipe-search" placeholder="Nome ou categoria"></label><div id="x-recipe-list">' + filterTiles() + '</div>';
  }
  function editorMeal(index) {
    if (!pro() || s().page !== 'editor' || !s().edit) throw new Error('Abra o rascunho do plano para vincular um preparo.');
    const number = Number(index);
    if (!Number.isInteger(number) || number < 0 || !s().edit.refeicoes?.[number]) throw new Error('Refeição do rascunho não disponível.');
    return s().edit.refeicoes[number];
  }
  function recipeAssignment(index) {
    if (!pro() || s().page !== 'editor' || !s().edit) return '';
    const meal = editorMeal(index), raw = list(s().edit.receitas).find(recipe => recipe?.id === meal.receitaId), recipe = normalizeRecipeReference(raw);
    return '<div class="recipe-assignment"><p class="sub">Preparo opcional: ' + esc(recipe?.nome || (meal.receitaId ? 'Receita vinculada indisponível' : 'Nenhuma receita vinculada')) + '</p><div class="actions">' +
      button(recipe ? 'Trocar preparo' : 'Vincular preparo', 'assign-recipe', index, 'small ghost') +
      (meal.receitaId ? button('Remover vínculo', 'remove-recipe', index, 'small ghost') : '') + '</div><p class="sub">O preparo não altera os alimentos ou nutrientes prescritos. Mudanças ficam no rascunho até publicar.</p></div>';
  }
  function assertSameDraft(draft, patientId, index, mealId) {
    const meal = editorMeal(index);
    if (s().edit !== draft || (pat()?.id || s().selected) !== patientId || meal.id !== mealId) throw new Error('O rascunho mudou. Abra novamente a vinculação do preparo.');
    return meal;
  }
  function discardUnused(plan, recipeId) {
    if (recipeId && !list(plan.refeicoes).some(meal => meal?.receitaId === recipeId)) plan.receitas = list(plan.receitas).filter(recipe => recipe?.id !== recipeId);
  }
  function assignRecipe(index) {
    H.syncEditor();
    const meal = editorMeal(index), draft = s().edit, patientId = pat()?.id || s().selected, mealId = meal.id;
    const available = catalog();
    if (!available.length) return H.toast('Não há receitas disponíveis para vincular.');
    H.modal('Vincular preparo à refeição', '<p class="sub">Refeição: ' + esc(meal.titulo || '') + '</p><label>Receita<select id="plan-recipe-choice" required>' +
      available.map(recipe => '<option value="' + esc(recipe.recipeKey) + '">' + esc(recipe.nome) + '</option>').join('') + '</select></label>' +
      '<div id="plan-recipe-preview">' + preparation(available[0]) + '</div><div class="notice">Vincular este preparo mantém os alimentos, porções e nutrientes do plano. O paciente recebe a cópia somente após a publicação.</div>' +
      '<label class="check-label"><input id="plan-recipe-confirm" type="checkbox" required> Revisei ingredientes, alergias, restrições e a compatibilidade deste preparo com a prescrição.</label>', () => {
        if (!document.querySelector('#plan-recipe-confirm')?.checked) throw new Error('Confirme a revisão do preparo antes de vincular.');
        H.syncEditor();
        const current = assertSameDraft(draft, patientId, index, mealId);
        const key = document.querySelector('#plan-recipe-choice')?.value;
        const chosen = available.find(recipe => recipe.recipeKey === key), latest = catalog().find(recipe => recipe.recipeKey === key);
        if (!chosen || !latest) throw new Error('A receita não está mais disponível. Escolha outra.');
        if (JSON.stringify(chosen) !== JSON.stringify(latest)) throw new Error('A receita mudou durante a revisão. Abra novamente a vinculação antes de confirmar.');
        const previous = current.receitaId;
        const retained = list(draft.receitas).filter(recipe => recipe?.id !== previous || list(draft.refeicoes).some(other => other && other !== current && other.receitaId === previous));
        if (retained.length >= 200) throw new Error('O plano aceita até 200 preparos. Remova um vínculo antes de adicionar outro.');
        const snapshot = structuredClone({...chosen, id: H.uid()});
        current.receitaId = snapshot.id;
        draft.receitas = [...retained, snapshot];
        H.cacheEditor(); H.render(); H.toast('Preparo vinculado ao rascunho. Publique após revisar.');
      });
    const select = document.querySelector('#plan-recipe-choice');
    if (select) select.onchange = () => {
      const chosen = available.find(recipe => recipe.recipeKey === select.value), preview = document.querySelector('#plan-recipe-preview');
      if (chosen && preview) preview.innerHTML = preparation(chosen);
      const confirm = document.querySelector('#plan-recipe-confirm');
      if (confirm) confirm.checked = false;
    };
    bind();
  }
  function removeRecipe(index) {
    H.syncEditor();
    const meal = editorMeal(index), draft = s().edit, patientId = pat()?.id || s().selected, mealId = meal.id;
    if (!meal.receitaId) return;
    H.modal('Remover vínculo do preparo', '<p>Remover o preparo de ' + esc(meal.titulo || 'esta refeição') + ' no rascunho? Os alimentos e porções continuam prescritos.</p>', () => {
      H.syncEditor();
      const current = assertSameDraft(draft, patientId, index, mealId), previous = current.receitaId;
      delete current.receitaId;
      discardUnused(draft, previous);
      H.cacheEditor(); H.render(); H.toast('Vínculo removido do rascunho. A versão publicada continua disponível.');
    });
    bind();
  }
  function toggleFavorite(key) {
    const available = [...catalog(), ...linkedRecipes().map(item => item.recipe)];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key) || !available.some(recipe => recipe.recipeKey === key)) return H.toast('Esta receita não está disponível para favoritar.');
    const saved = favorites(), index = saved.indexOf(key);
    if (index >= 0) saved.splice(index, 1);
    else {
      if (saved.length >= 200) return H.toast('Você já tem 200 favoritas neste aparelho. Remova uma para guardar outra.');
      saved.push(key);
    }
    try { localStorage.setItem(storageKey(), JSON.stringify(saved)); }
    catch { return H.toast('Não foi possível salvar o favorito neste aparelho.'); }
    H.render();
    // render() updates the app while the detail dialog stays open. Update its
    // existing controls too, without reopening it or losing keyboard focus.
    for (const control of document.querySelectorAll?.('[data-x="recipe-favorite"]') || []) {
      if (control.dataset?.id !== key) continue;
      control.textContent = (index >= 0 ? '♡ Favoritar' : '♥ Favorita') + ' neste aparelho';
      control.setAttribute?.('aria-pressed', String(index < 0));
    }
    H.toast(index >= 0 ? 'Favorito removido neste aparelho.' : 'Receita favorita guardada neste aparelho.');
  }
  return {recipes, recipeDetail, planRecipe, recipeAssignment, assignRecipe, removeRecipe, toggleFavorite, filterTiles};
}
