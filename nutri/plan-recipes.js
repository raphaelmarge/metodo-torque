import {recipeIngredient,normalizeRecipeComposition,recipeNutrition,makeRecipeFood} from './recipe-composition.js';
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
  const out={...value, recipeKey: key || (KEY_PATTERN.test(raw.recipeKey || '') ? raw.recipeKey : 'plan:' + value.id)};
  if(raw.composition){try{out.composition=normalizeRecipeComposition({...raw.composition,recipeId:value.id,title:value.nome,unquantifiedIngredients:[...new Set([...list(raw.composition.unquantifiedIngredients),...list(raw.ing)])],notes:raw.notes||raw.composition.notes});out.ingredientes=[...out.composition.ingredients.map(it=>it.qtd+' × '+it.porcao+' de '+it.nome),...list(out.composition.unquantifiedIngredients)];out.modo=out.composition.steps;out.rendimento=out.composition.yield;out.notes=out.composition.notes||'';}catch{out.compositionInvalid=true;}}
  return out;
}

export function favoriteStorageKey({clinicId, userId, patientId, demo = false}) {
  return 'torque-nutri-recipe-favorites:' + String(clinicId || 'unknown') + ':' +
    String(demo ? 'demo' : userId || 'anonymous') + ':' + String(patientId || 'none');
}

export function createPlanRecipes(H, {resources, pat, bind = () => {}, saveResource}) {
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
      .map(row => normalizeRecipeReference({...row.data,...(row.data.composition?{composition:{...row.data.composition,recipeVersion:row.version||1}}:{})}, {id: row.id, title: row.title, key: 'clinic:' + row.id})).filter(Boolean);
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
      const linked=recipe ? [{meal, recipe}] : [];
      for(const item of list(meal.itens)){
        if(!item.recipeComposition)continue;
        try{const composition=normalizeRecipeComposition(item.recipeComposition);linked.push({meal:{...meal,id:item.id,titulo:'Porção prescrita · '+meal.titulo},recipe:{id:item.id,nome:composition.title,recipeKey:'plan:'+item.id,categoria:'Receita prescrita',rendimento:composition.yield,ingredientes:[],modo:composition.steps,fonte:composition.source,composition}});}catch{/* Invalid compositions never become alternative catalog recipes. */}
      }
      return linked;
    });
  }
  function favoriteButton(recipe, favorite = favorites().includes(recipe.recipeKey)) {
    return '<button class="btn small ghost" data-x="recipe-favorite" data-id="' + esc(recipe.recipeKey) + '" aria-pressed="' + favorite + '">' +
      (favorite ? '♥ Favorita' : '♡ Favoritar') + ' neste aparelho</button>';
  }
  function preparation(recipe) {
    return '<p class="sub">' + esc(recipe.categoria || 'Receita') +
      (recipe.tempo != null ? ' · ' + esc(recipe.tempo) + ' min' : '') + ' · Rendimento: ' + esc(recipe.rendimento) + ' porções</p>' +
      '<h3>Ingredientes</h3>' + (recipe.composition?'<ul>'+recipe.composition.ingredients.map(it=>'<li>'+esc(it.qtd+' × '+it.porcao+' de '+it.nome)+'</li>').join('')+'</ul>'+(recipe.composition.unquantifiedIngredients?.length?'<h3>Ingredientes ainda sem quantificação</h3><ul>'+recipe.composition.unquantifiedIngredients.map(it=>'<li>'+esc(it)+'</li>').join('')+'</ul>':'')+nutritionPreview(recipe.composition):recipe.ingredientes.length ? '<ul>' + recipe.ingredientes.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '<p class="sub">Ingredientes não informados.</p>') +
      '<h3>Modo de preparo</h3>' + (recipe.modo.length ? '<ol>' + recipe.modo.map(step => '<li>' + esc(step) + '</li>').join('') + '</ol>' : '<p class="sub">Preparo não informado.</p>') +
      ((recipe.notes||recipe.composition?.notes)?'<h3>Orientações</h3><p style="white-space:pre-wrap">'+esc(recipe.notes||recipe.composition.notes)+'</p>':'') +
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
        favoriteButton(recipe, starred.has(recipe.recipeKey)) + (pro()&&recipe.recipeKey.startsWith('clinic:')?button('Editar receita','edit-recipe',recipe.id,'small ghost'):'') + '</div></section>';
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
      button('Prescrever porções de receita','prescribe-recipe',index,'small') +
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
  function nutritionPreview(composition) {
    const nutrition=recipeNutrition(composition),labels={k:'kcal',pt:'g de proteína',cb:'g de carboidrato',g:'g de gordura'};
    return '<p class="sub">Por porção: '+Object.entries(labels).map(([key,label])=>(nutrition.perServing[key]===null?'Não informado':nutrition.perServing[key].toLocaleString('pt-BR',{maximumFractionDigits:2}))+' '+label).join(' · ')+'</p>'+(!nutrition.complete?'<div class="notice warning">'+(composition.unquantifiedIngredients?.length?'Há ingredientes ainda sem quantificação. Inclua todos no catálogo com suas quantidades e retire-os da lista pendente.':'Há nutrientes não informados.')+' A receita pode ser salva como preparo, mas a prescrição de porções exige composição completa.</div>':'');
  }
  function editRecipe(existing) {
    if(!pro())throw Error('Somente a nutri pode editar a receita.');
    if(existing&&(!resources('recipe').includes(existing)||existing.clinic_id&&existing.clinic_id!==s().clinic.id))throw Error('Receita indisponível neste consultório.');
    const d=existing?.data||{},owner=s().user?.id,clinic=s().clinic?.id,version=existing?.version;
    let ingredients=list(d.composition?.ingredients).map(recipeIngredient);
    const input=(label,id,value='',extra='')=>'<label>'+label+'<input id="'+id+'" value="'+esc(value)+'" '+extra+'></label>';
    const textarea=(label,id,value='')=>'<label>'+label+'<textarea id="'+id+'">'+esc(value)+'</textarea></label>';
    const foods=[...list(globalThis.MT_ALIMENTOS),...resources('food').map(row=>({...row.data,id:row.id}))];
    const ownId=existing?.id||'',pendingIngredients=[...new Set([...list(d.composition?.unquantifiedIngredients),...list(d.ing??d.ingredientes)])];
    H.modal(existing?'Editar receita do consultório':'Nova receita do consultório',input('Nome','recipe-title',existing?.title||'','required maxlength="200"')+'<div class="form-grid">'+input('Categoria','recipe-category',d.cat||d.categoria||'','maxlength="120"')+input('Tempo de preparo (min)','recipe-time',d.tempo??'','type="number" min="0" max="10080"')+input('Rendimento total (porções)','recipe-yield',d.composition?.yield??d.rende??d.rendimento??1,'type="number" min="0.1" max="1000" step="0.1" required')+'</div><h3>Ingredientes do preparo inteiro</h3><p class="sub">Inclua todos os ingredientes do preparo no catálogo e informe suas quantidades. Ingredientes que ainda estão somente em texto impedem o cálculo e a prescrição de porções até serem quantificados.</p>'+input('Buscar alimento','recipe-search','','type="search"')+'<div id="recipe-search-results"></div><div id="recipe-ingredients"></div><div id="recipe-nutrition"></div>'+textarea('Ingredientes ainda sem quantificação (um por linha)','recipe-text',pendingIngredients.join('\n'))+'<p class="sub">Para receitas somente em texto, descreva aqui os ingredientes. Para prescrever porções, transfira todos para a lista do catálogo e deixe este campo vazio.</p>'+textarea('Orientações de preparo e serviço (não inclua ingredientes aqui)','recipe-notes',d.notes||d.observacoes||d.composition?.notes||'')+textarea('Modo de preparo (um passo por linha)','recipe-steps',(d.modo||[]).join('\n'))+input('Fonte dos valores e preparo','recipe-source',d.source||d.fonte||'','maxlength="400"')+'<label class="check-label"><input type="checkbox" id="recipe-review" required> Revisei quantidades, rendimento, restrições e fonte. Se há cálculo, confirmei todos os ingredientes na lista do catálogo.</label>',async()=>{
      if(s().role!=='nutri'||s().user?.id!==owner||s().clinic?.id!==clinic)throw Error('A conta mudou. Abra novamente a receita.');
      if(existing&&!resources('recipe').some(row=>row.id===ownId&&row.version===version))throw Error('A receita mudou. Abra novamente antes de salvar.');
      pull();if(!document.querySelector('#recipe-review').checked)throw Error('Confirme a revisão da receita.');
      const title=document.querySelector('#recipe-title').value.trim(),steps=lines('recipe-steps'),source=document.querySelector('#recipe-source').value.trim(),textIngredients=lines('recipe-text'),notes=document.querySelector('#recipe-notes').value.trim();
      if(!title||title.length>200)throw Error('Dê um nome à receita, até 200 caracteres.');
      if(notes.length>4000)throw Error('Use até 4000 caracteres nas orientações.');
      if(!steps.length||steps.length>40||steps.some(x=>x.length>1500))throw Error('Informe de 1 a 40 etapas, com até 1500 caracteres cada.');
      if(textIngredients.length>100||textIngredients.some(x=>x.length>500))throw Error('Use até 100 linhas de ingredientes, com até 500 caracteres cada.');
      const yieldValue=Number(document.querySelector('#recipe-yield').value),time=document.querySelector('#recipe-time').value;
      if(!Number.isFinite(yieldValue)||yieldValue<=0||yieldValue>1000)throw Error('Confira o rendimento da receita.');
      if(time!==''&&(!Number.isFinite(Number(time))||Number(time)<0||Number(time)>10080))throw Error('Confira o tempo de preparo.');
      if(!ingredients.length&&!textIngredients.length)throw Error('Adicione ingredientes do catálogo ou descreva o preparo em texto.');
      const data={...d,cat:document.querySelector('#recipe-category').value.trim(),tempo:time===''?null:Number(time),rende:yieldValue,ing:textIngredients,modo:steps,source,notes};
      for(const [alias,key] of [['categoria','cat'],['rendimento','rende'],['ingredientes','ing'],['fonte','source'],['observacoes','notes']])if(Object.prototype.hasOwnProperty.call(d,alias))data[alias]=data[key];
      if(ingredients.length)data.composition=normalizeRecipeComposition({v:1,recipeId:ownId,recipeVersion:(version||0)+1,title,yield:yieldValue,ingredients,steps,source,notes,unquantifiedIngredients:textIngredients,reviewedAt:new Date().toISOString()});
      else delete data.composition;
      await saveResource('recipe',title,data,existing?.shared??true,existing);
    });
    function lines(id){return document.querySelector('#'+id).value.split('\n').map(x=>x.trim()).filter(Boolean);}
    function pull(){for(const field of document.querySelectorAll('[data-recipe-quantity]'))ingredients[Number(field.dataset.recipeQuantity)].qtd=Number(field.value);}
    function preview(){try{document.querySelector('#recipe-nutrition').innerHTML=ingredients.length?nutritionPreview({v:1,title:document.querySelector('#recipe-title').value||'Receita',yield:Number(document.querySelector('#recipe-yield').value),ingredients,steps:[],unquantifiedIngredients:lines('recipe-text')}):'<p class="sub">Receita em texto: não gera cálculo nutricional nem porções prescritas.</p>';}catch(error){document.querySelector('#recipe-nutrition').textContent=error.message;}}
    function draw(){document.querySelector('#recipe-ingredients').innerHTML=ingredients.map((it,i)=>'<div class="summary-line"><div><b>'+esc(it.nome)+'</b><p class="sub">'+esc(it.porcao)+'</p></div><label>Quantidade<input type="number" min="0.1" max="1000" step="0.1" data-recipe-quantity="'+i+'" aria-label="Quantidade de '+esc(it.nome)+'" value="'+it.qtd+'"></label><button type="button" class="btn small ghost" data-recipe-remove="'+i+'">Remover</button></div>').join('');for(const field of document.querySelectorAll('[data-recipe-quantity]'))field.oninput=()=>{pull();document.querySelector('#recipe-review').checked=false;preview();};for(const control of document.querySelectorAll('[data-recipe-remove]'))control.onclick=()=>{pull();ingredients.splice(Number(control.dataset.recipeRemove),1);document.querySelector('#recipe-review').checked=false;draw();};preview();}
    function search(){const term=document.querySelector('#recipe-search').value.trim().toLocaleLowerCase('pt-BR');document.querySelector('#recipe-search-results').innerHTML=foods.map((food,index)=>({food,index})).filter(({food})=>(food.n||food.nome||'').toLocaleLowerCase('pt-BR').includes(term)).slice(0,8).map(({food,index})=>'<button type="button" class="btn small ghost" data-recipe-add="'+index+'">'+esc(food.n||food.nome)+' · '+esc(food.p||food.porcao)+'</button>').join('');for(const control of document.querySelectorAll('[data-recipe-add]'))control.onclick=()=>{pull();if(ingredients.length>=100)return H.toast('Use até 100 ingredientes.');ingredients.push(recipeIngredient({...foods[Number(control.dataset.recipeAdd)],qtd:1}));document.querySelector('#recipe-review').checked=false;draw();};}
    document.querySelector('#recipe-search').oninput=search;document.querySelector('#recipe-text').oninput=()=>{document.querySelector('#recipe-review').checked=false;preview();};document.querySelector('#recipe-yield').oninput=()=>{document.querySelector('#recipe-review').checked=false;preview();};draw();search();
  }
  function prescribeRecipe(index) {
    H.syncEditor();const meal=editorMeal(index),draft=s().edit,patientId=pat()?.id||s().selected,mealId=meal.id;
    const available=catalog().filter(recipe=>recipe.composition&&!recipe.compositionInvalid);
    if(!available.length)return H.toast('Crie uma receita com ingredientes do catálogo na Biblioteca para prescrever porções.');
    H.modal('Prescrever porções de receita','<p class="sub">A receita será adicionada como um alimento da refeição. As porções e os ingredientes serão preservados nesta versão do plano.</p><label>Receita<select id="recipe-prescribe-choice">'+available.map(recipe=>'<option value="'+esc(recipe.recipeKey)+'">'+esc(recipe.nome)+'</option>').join('')+'</select></label><label>Porções da receita nesta refeição<input id="recipe-prescribe-quantity" type="number" min="0.1" max="1000" step="0.1" value="1" required></label><div id="recipe-prescribe-preview">'+preparation(available[0])+'</div><label class="check-label"><input id="recipe-prescribe-review" type="checkbox" required> Revisei a composição, as porções e as restrições deste paciente.</label>',()=>{
      if(!document.querySelector('#recipe-prescribe-review').checked)throw Error('Confirme a revisão antes de prescrever.');
      H.syncEditor();const current=assertSameDraft(draft,patientId,index,mealId),key=document.querySelector('#recipe-prescribe-choice').value;
      const chosen=available.find(x=>x.recipeKey===key),latest=catalog().find(x=>x.recipeKey===key);
      if(!chosen||!latest||JSON.stringify(chosen)!==JSON.stringify(latest))throw Error('A receita mudou. Abra novamente para revisar.');
      if(current.itens.length>=50)throw Error('Use até 50 alimentos por refeição.');
      const item=makeRecipeFood(chosen.composition,Number(document.querySelector('#recipe-prescribe-quantity').value),{id:H.uid()});
      if(new TextEncoder().encode(JSON.stringify({...current,itens:[...current.itens,item]})).length>60000)throw Error('A refeição está muito grande. Reduza a composição antes de adicionar.');
      current.itens.push(item);H.cacheEditor();H.render();H.toast('Porções adicionadas ao rascunho. Revise e publique para disponibilizar ao paciente.');
    });
    document.querySelector('#recipe-prescribe-choice').onchange=()=>{const selected=available.find(x=>x.recipeKey===document.querySelector('#recipe-prescribe-choice').value);document.querySelector('#recipe-prescribe-preview').innerHTML=preparation(selected);document.querySelector('#recipe-prescribe-review').checked=false;};
    document.querySelector('#recipe-prescribe-quantity').oninput=()=>{document.querySelector('#recipe-prescribe-review').checked=false;};
  }
  return {recipes, recipeDetail, planRecipe, recipeAssignment, assignRecipe, removeRecipe, toggleFavorite, filterTiles,editRecipe,prescribeRecipe};
}
