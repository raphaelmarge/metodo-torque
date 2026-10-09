import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(fs.readFileSync(new URL('../vendor/nutricao-core.js', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../plan-recipes.js', import.meta.url), 'utf8');
const {createPlanRecipes, normalizeRecipeReference, favoriteStorageKey} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const tests = [], test = (name, fn) => tests.push({name, fn});
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const memory = () => { const values = new Map(); return {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), values}; };
const raw = (id = 'r1', extra = {}) => ({id, n: 'Panqueca de aveia', cat: 'Café da manhã', tempo: 15, rende: 2, ing: ['Aveia', 'Ovo'], modo: ['Misture', 'Prepare'], k: 320, pt: 14, source: 'Fonte de exemplo', ...extra});
const foods = [{id: 'food', nome: 'Alimento prescrito', qtd: 2, porcao: '100 g', k: 100, pt: 5, cb: 10, g: 2}];
function harness({role = 'patient', page = 'recipes', resources = [], published, edit, sources = [raw()]} = {}) {
  globalThis.MT_RECEITAS = structuredClone(sources);
  const storage = memory(); globalThis.localStorage = storage;
  const nodes = new Map();
  globalThis.document = {querySelector: selector => nodes.get(selector) || null, querySelectorAll: selector => selector === '[data-x="recipe-favorite"]' ? [...nodes.values()].filter(node => node.dataset?.x === 'recipe-favorite') : []};
  const state = {role, page, clinic: {id: 'clinic-a'}, selected: 'a', user: {id: 'user-a'}, demo: false, edit: edit || {refeicoes: [{id: 'lunch', titulo: 'Almoço', itens: structuredClone(foods)}]}};
  const patient = {id: 'a'}, plan = published || {patient_id: 'a', version: 1, data: {refeicoes: [], receitas: []}};
  const calls = {render: 0, cache: 0, sync: 0, bind: 0, toast: [], modal: null};
  let serial = 0;
  const H = {
    state: () => state, esc: escape, uid: () => 'snapshot-' + (++serial), published: () => plan,
    syncEditor: () => calls.sync++, cacheEditor: () => calls.cache++, render: () => calls.render++, toast: value => calls.toast.push(value),
    heading: (label, title, description, action = '') => '<header><h1>' + title + '</h1><p>' + description + '</p>' + action + '</header>',
    modal: (title, body, submit) => {
      calls.modal = {title, body, submit};
      const choice = body.match(/<option value="([^"]+)"/);
      nodes.clear();
      if (body.includes('id="plan-recipe-choice"')) nodes.set('#plan-recipe-choice', {value: choice?.[1] || '', onchange: null});
      if (body.includes('id="plan-recipe-confirm"')) nodes.set('#plan-recipe-confirm', {checked: false});
      if (body.includes('id="plan-recipe-preview"')) nodes.set('#plan-recipe-preview', {innerHTML: ''});
      for (const [index, match] of [...body.matchAll(/<button[^>]*data-x="recipe-favorite"[^>]*data-id="([^"]+)"[^>]*>([^<]+)<\/button>/g)].entries()) {
        const attributes = {};
        nodes.set('#favorite-' + index, {dataset: {x: 'recipe-favorite', id: match[1]}, textContent: match[2], attributes, setAttribute: (name, value) => { attributes[name] = value; }});
      }
    }
  };
  const R = createPlanRecipes(H, {resources: kind => resources.filter(item => item.kind === kind), pat: () => patient, bind: () => calls.bind++});
  return {R, H, state, plan, patient, calls, nodes, storage};
}
const own = (id, title, shared = true, extra = {}) => ({id, clinic_id: 'clinic-a', kind: 'recipe', title, shared, data: {ing: ['Ingrediente'], modo: ['Prepare'], source: 'Receita da clínica'}, ...extra});

test('legacy catalog normalization retains preparations and preserves partial nutrition', () => {
  const normalized = normalizeRecipeReference(raw(), {key: 'source:r1'});
  assert.equal(normalized.nome, 'Panqueca de aveia');
  assert.deepEqual(normalized.ingredientes, ['Aveia', 'Ovo']);
  assert.equal(normalized.rendimento, 2);
  assert.equal(normalized.fonte, 'Fonte de exemplo');
  assert.equal(normalized.k, 320);
  assert.equal(normalized.cb, undefined);
  assert.equal(normalized.recipeKey, 'source:r1');
});

test('incomplete ingredient composition is never converted to fictitious nutrients', () => {
  const normalized = normalizeRecipeReference(raw('r1', {itens: [{id: 'bad', nome: 'Partial', qtd: 1, k: 100}]}));
  assert.deepEqual(normalized.itens, []);
  assert.equal(normalized.composicaoIncompleta, true);
  assert.equal(normalized.g, undefined);
});

test('patient catalog hides private, archived and other-clinic resources', () => {
  const h = harness({resources: [own('shared', 'Compartilhada'), own('private', 'Privada', false), own('archived', 'Arquivada', true, {data: {n: 'Arquivada', archived: true}}), own('other', 'Outra clínica', true, {clinic_id: 'clinic-b'})]});
  const html = h.R.recipes();
  assert.match(html, /Compartilhada/);
  assert.doesNotMatch(html, /Privada|Arquivada|Outra clínica/);
  h.R.recipeDetail('clinic:private');
  assert.equal(h.calls.modal, null);
});

test('professional sees private own recipes but still not another clinic', () => {
  const h = harness({role: 'nutri', resources: [own('private', 'Receita privada', false), own('other', 'Outra clínica', true, {clinic_id: 'clinic-b'})]});
  assert.match(h.R.recipes(), /Receita privada/);
  assert.doesNotMatch(h.R.recipes(), /Outra clínica/);
});

test('published linked recipes precede generic ideas and use only their snapshot', () => {
  const snapshot = {...normalizeRecipeReference(raw('old', {n: 'Preparo aprovado antigo'}), {key: 'source:r1'}), id: 'snapshot-old'};
  const h = harness({sources: [raw('r1', {n: 'Catálogo atualizado'})], published: {patient_id: 'a', version: 2, data: {refeicoes: [{id: 'lunch', titulo: 'Almoço', receitaId: snapshot.id}], receitas: [snapshot]}}});
  const html = h.R.recipes();
  assert.ok(html.indexOf('Receitas do meu plano') < html.indexOf('Ideias para conversar com sua nutri'));
  assert.match(html, /data-x="plan-recipe" data-id="lunch"/);
  h.R.planRecipe('lunch');
  assert.equal(h.calls.modal.title, 'Preparo aprovado antigo');
  assert.doesNotMatch(h.calls.modal.body, /Catálogo atualizado/);
});

test('missing snapshot never falls back to a live catalog or another patient plan', () => {
  const h = harness({published: {patient_id: 'a', data: {refeicoes: [{id: 'lunch', receitaId: 'r1'}], receitas: []}}});
  h.R.planRecipe('lunch');
  assert.equal(h.calls.modal, null);
  assert.match(h.calls.toast.at(-1), /versão publicada/);
  h.plan.patient_id = 'b';
  h.plan.data.receitas = [normalizeRecipeReference(raw())];
  h.R.planRecipe('lunch');
  assert.equal(h.calls.modal, null);
});

test('recipe titles, categories, ingredients, steps and source are escaped', () => {
  const attack = '<img src=x onerror=alert(1)>', h = harness({sources: [raw('evil', {n: attack, cat: attack, ing: [attack], modo: [attack], source: attack})]});
  h.R.recipeDetail('source:evil');
  assert.doesNotMatch(h.calls.modal.title + h.calls.modal.body, /<img/);
  assert.match(h.calls.modal.body, /&lt;img/);
  assert.doesNotMatch(h.R.filterTiles(''), /<img/);
});

test('assignment UI uses the existing action contract and stays in the draft', () => {
  const h = harness({role: 'nutri', page: 'editor'}), html = h.R.recipeAssignment(0);
  assert.match(html, /data-x="assign-recipe" data-id="0"/);
  assert.match(html, /rascunho até publicar/);
  assert.doesNotMatch(html, /remove-recipe/);
  assert.equal(h.calls.cache, 0);
  assert.equal(harness().R.recipeAssignment(0), '');
});

test('assigning requires professional review and never changes foods or published data', () => {
  const h = harness({role: 'nutri', page: 'editor'}), beforeFoods = structuredClone(h.state.edit.refeicoes[0].itens), beforePublished = structuredClone(h.plan);
  h.R.assignRecipe(0);
  assert.match(h.calls.modal.body, /type="checkbox" required/);
  assert.throws(() => h.calls.modal.submit(), /Confirme a revisão/);
  assert.equal(h.state.edit.refeicoes[0].receitaId, undefined);
  h.nodes.get('#plan-recipe-confirm').checked = true;
  h.calls.modal.submit();
  assert.equal(h.state.edit.refeicoes[0].receitaId, 'snapshot-1');
  assert.equal(h.state.edit.receitas[0].recipeKey, 'source:r1');
  assert.deepEqual(h.state.edit.refeicoes[0].itens, beforeFoods);
  assert.deepEqual(h.plan, beforePublished);
  assert.equal(h.calls.cache, 1);
});

test('attached recipe is a detached snapshot of catalog content', () => {
  const h = harness({role: 'nutri', page: 'editor'});
  h.R.assignRecipe(0); h.nodes.get('#plan-recipe-confirm').checked = true; h.calls.modal.submit();
  globalThis.MT_RECEITAS[0].ing[0] = 'Mudou depois';
  assert.equal(h.state.edit.receitas[0].ingredientes[0], 'Aveia');
});

test('changing choice resets confirmation and snapshots the newly reviewed recipe', () => {
  const h = harness({role: 'nutri', page: 'editor', sources: [raw(), raw('r2', {n: 'Outra receita'})]});
  h.R.assignRecipe(0);
  const choice = h.nodes.get('#plan-recipe-choice'), confirm = h.nodes.get('#plan-recipe-confirm');
  confirm.checked = true; choice.value = 'source:r2'; choice.onchange();
  assert.equal(confirm.checked, false);
  assert.match(h.nodes.get('#plan-recipe-preview').innerHTML, /Aveia/);
  confirm.checked = true; h.calls.modal.submit();
  assert.equal(h.state.edit.receitas[0].nome, 'Outra receita');
});

test('recipe changing during review requires a new confirmation of its content', () => {
  const h = harness({role: 'nutri', page: 'editor'});
  h.R.assignRecipe(0); h.nodes.get('#plan-recipe-confirm').checked = true;
  globalThis.MT_RECEITAS[0].ing.push('Ingrediente novo');
  assert.throws(() => h.calls.modal.submit(), /receita mudou/);
  assert.equal(h.state.edit.receitas, undefined);
});

test('stale modal cannot attach to a changed patient or reordered meal', () => {
  const h = harness({role: 'nutri', page: 'editor'});
  h.R.assignRecipe(0); h.nodes.get('#plan-recipe-confirm').checked = true;
  h.patient.id = 'b';
  assert.throws(() => h.calls.modal.submit(), /rascunho mudou/);
  assert.equal(h.state.edit.receitas, undefined);
});

test('patient cannot assign or remove preparations', () => {
  const h = harness();
  assert.throws(() => h.R.assignRecipe(0), /rascunho/);
  assert.throws(() => h.R.removeRecipe(0), /rascunho/);
  assert.equal(h.state.edit.receitas, undefined);
});

test('removing a draft link preserves foods, published data and shared snapshots', () => {
  const snapshot = {...normalizeRecipeReference(raw()), id: 'snap'};
  const edit = {refeicoes: [{id: 'lunch', titulo: 'Almoço', receitaId: 'snap', itens: structuredClone(foods)}, {id: 'dinner', receitaId: 'snap', itens: []}], receitas: [snapshot]};
  const h = harness({role: 'nutri', page: 'editor', edit});
  const before = structuredClone(h.plan);
  h.R.removeRecipe(0); h.calls.modal.submit();
  assert.equal(edit.refeicoes[0].receitaId, undefined);
  assert.equal(edit.receitas.length, 1);
  assert.deepEqual(edit.refeicoes[0].itens, foods);
  assert.deepEqual(h.plan, before);
  h.R.removeRecipe(1); h.calls.modal.submit();
  assert.equal(edit.receitas.length, 0);
});

test('replacing a link removes only its unused snapshot', () => {
  const old = {...normalizeRecipeReference(raw('old')), id: 'old-snap'}, retained = {...normalizeRecipeReference(raw('retained')), id: 'keep-snap'};
  const edit = {refeicoes: [{id: 'lunch', receitaId: 'old-snap', itens: structuredClone(foods)}, {id: 'dinner', receitaId: 'keep-snap', itens: []}], receitas: [old, retained]};
  const h = harness({role: 'nutri', page: 'editor', edit});
  h.R.assignRecipe(0); h.nodes.get('#plan-recipe-confirm').checked = true; h.calls.modal.submit();
  assert.deepEqual(edit.receitas.map(recipe => recipe.id), ['keep-snap', 'snapshot-1']);
});

test('favorites store only stable IDs and are isolated by clinic, account and patient', () => {
  const h = harness();
  h.R.toggleFavorite('source:r1');
  const key = favoriteStorageKey({clinicId: 'clinic-a', userId: 'user-a', patientId: 'a'});
  assert.deepEqual(JSON.parse(h.storage.getItem(key)), ['source:r1']);
  assert.match(h.R.recipes(), /♥ Favorita neste aparelho/);
  h.state.user.id = 'user-b';
  assert.doesNotMatch(h.R.recipes(), /♥ Favorita/);
  h.state.user.id = 'user-a'; h.patient.id = 'b';
  assert.doesNotMatch(h.R.recipes(), /♥ Favorita/);
  assert.equal(h.calls.cache, 0);
  assert.equal(favoriteStorageKey({clinicId: 'clinic-a', userId: 'ignored', patientId: 'a', demo: true}), 'torque-nutri-recipe-favorites:clinic-a:demo:a');
});

test('favorite toggling neither writes clinical data nor accepts unavailable private recipes', () => {
  const h = harness({resources: [own('hidden', 'Privada', false)]}), before = structuredClone(h.state.edit);
  h.R.toggleFavorite('clinic:hidden');
  assert.equal(h.storage.values.size, 0);
  h.R.toggleFavorite('source:r1'); h.R.toggleFavorite('source:r1');
  assert.deepEqual(JSON.parse([...h.storage.values.values()][0]), []);
  assert.deepEqual(h.state.edit, before);
});

test('favorite dialog button updates immediately without reopening or losing its node', () => {
  const h = harness();
  h.R.recipeDetail('source:r1');
  const control = h.nodes.get('#favorite-0'), modal = h.calls.modal;
  h.R.toggleFavorite('source:r1');
  assert.equal(control.textContent, '♥ Favorita neste aparelho');
  assert.equal(control.attributes['aria-pressed'], 'true');
  assert.equal(h.calls.modal, modal);
  h.R.toggleFavorite('source:r1');
  assert.equal(control.textContent, '♡ Favoritar neste aparelho');
  assert.equal(control.attributes['aria-pressed'], 'false');
});

test('favorite limit is enforced and storage failure does not report a saved favorite', () => {
  const h = harness(), key = favoriteStorageKey({clinicId: 'clinic-a', userId: 'user-a', patientId: 'a'});
  h.storage.setItem(key, JSON.stringify(Array.from({length: 200}, (_, i) => 'source:old-' + i)));
  h.R.toggleFavorite('source:r1');
  assert.match(h.calls.toast.at(-1), /200 favoritas/);
  assert.equal(JSON.parse(h.storage.getItem(key)).length, 200);
  h.storage.values.clear();
  h.storage.setItem = () => { throw Error('Storage blocked'); };
  h.R.toggleFavorite('source:r1');
  assert.match(h.calls.toast.at(-1), /Não foi possível/);
});

test('published snapshot keeps its stable favorite key even after catalog removal', () => {
  const recipe = {...normalizeRecipeReference(raw(), {key: 'source:r1'}), id: 'stable-snapshot'};
  const h = harness({sources: [], published: {patient_id: 'a', data: {refeicoes: [{id: 'lunch', receitaId: recipe.id}], receitas: [recipe]}}});
  h.R.toggleFavorite('source:r1');
  assert.deepEqual(JSON.parse([...h.storage.values.values()][0]), ['source:r1']);
  h.R.planRecipe('lunch');
  assert.match(h.calls.modal.body, /♥ Favorita/);
});

test('favorites collection prefers linked snapshots and deduplicates the stable key', () => {
  const recipe = {...normalizeRecipeReference(raw(), {key: 'source:r1'}), id: 'stable-snapshot'};
  const h = harness({sources: [raw('r1', {n: 'Nova versão do catálogo'}), raw('r2', {n: 'Segunda favorita'})], published: {patient_id: 'a', data: {refeicoes: [{id: 'lunch', titulo: 'Almoço', receitaId: recipe.id}, {id: 'dinner', receitaId: recipe.id}], receitas: [recipe]}}});
  h.R.toggleFavorite('source:r1'); h.R.toggleFavorite('source:r2');
  const html = h.R.filterTiles(''), section = html.split('<h2>Minhas favoritas neste aparelho</h2>')[1].split('<section class="recipe-section">')[0];
  assert.ok(html.indexOf('Receitas do meu plano') < html.indexOf('Minhas favoritas neste aparelho'));
  assert.equal((section.match(/data-id="source:r1"/g) || []).length, 1);
  assert.match(section, /data-x="plan-recipe" data-id="lunch"/);
  assert.doesNotMatch(section, /Nova versão do catálogo/);
  assert.match(h.R.filterTiles('segunda'), /Minhas favoritas neste aparelho/);
  assert.doesNotMatch(h.R.filterTiles('zzzz'), /Minhas favoritas neste aparelho/);
});

test('search handles accents and never fabricates a prescribed catalog result', () => {
  const h = harness();
  assert.match(h.R.filterTiles('cafe'), /Panqueca de aveia/);
  assert.match(h.R.filterTiles('zzzz'), /Nenhuma receita encontrada/);
  assert.match(h.R.filterTiles(''), /Ideias para conversar/);
  assert.doesNotMatch(h.R.filterTiles(''), /Receitas do meu plano/);
});

let failures = 0;
for (const {name, fn} of tests) {
  try { fn(); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { failures++; process.stderr.write('FAIL ' + name + '\n' + error.stack + '\n'); }
}
process.stdout.write(`${tests.length - failures}/${tests.length} plan-recipes checks passed\n`);
if (failures) process.exitCode = 1;
