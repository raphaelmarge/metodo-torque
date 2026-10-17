'use strict';
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
(async () => {
  const {planDaySummary,planWeekDays,prescribedTotals,nutrientLabel,planWeekTable} = await import(pathToFileURL(path.join(__dirname,'../nutri/day-summary.js')));
  const {comparePlans,previousPublishedPlan,renderPlanChanges} = await import(pathToFileURL(path.join(__dirname,'../nutri/plan-changes.js')));
  let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
  const food={id:'food',nome:'Arroz',porcao:'100 g',qtd:'1,5',k:100,pt:2,cb:20,g:0,manual:'KEEP',substituicoes:[{id:'alt',nome:'Batata',porcao:'100 g',qtd:1,k:80,pt:1,cb:15,g:0}]};
  const plan={titulo:'Plano',orientacoes:'Orientações',aguaMl:2000,refeicoes:[{id:'meal',titulo:'Almoço',hora:'12:00',dias:[1,3],itens:[food]},{id:'meal-2',titulo:'Jantar',hora:'19:00',dias:[2],itens:[{...food,qtd:2,k:200}]}]};
  const original=structuredClone(plan);
  test('weekday totals use only scheduled main foods and decimal portions',()=>{
    assert.deepEqual(planDaySummary(plan,'2026-10-12').totals,{k:150,pt:3,cb:30,g:0});
    assert.equal(planDaySummary(plan,'2026-10-13').totals.k,400);
    assert.deepEqual(planDaySummary(plan,'2026-10-14').mealIndices,[0]);
    assert.equal(planDaySummary(plan,'2026-10-15').meals.length,0);
    assert.equal(planDaySummary(plan,'2026-10-15').totals.k,0);
  });
  test('missing days and empty days preserve legacy daily meals',()=>{
    for(const dias of [undefined,[]])assert.equal(planDaySummary({refeicoes:[{dias,itens:[food]}]},'2026-10-18').totals.k,150);
  });
  test('future start and legacy expiry suppress meals, review date only warns',()=>{
    assert.equal(planDaySummary({...plan,startOn:'2026-10-13'},'2026-10-12').meals.length,0);
    assert.equal(planDaySummary({...plan,startOn:'2026-10-12',inicio:'2026-10-14'},'2026-10-13').meals.length,0);
    assert.equal(planDaySummary({...plan,fim:'2026-10-12'},'2026-10-13').meals.length,0);
    assert.equal(planDaySummary({...plan,ativo:false},'2026-10-12').meals.length,0);
    const review=planDaySummary({...plan,endOn:'2026-10-12'},'2026-10-13');assert.equal(review.totals.k,400);assert.match(review.warnings.join(''),/revisão/);
  });
  test('unknown nutrients remain unknown per field; genuine zero is retained',()=>{
    assert.deepEqual(prescribedTotals([food,{...food,cb:null}]),{k:300,pt:6,cb:null,g:0});
    for(const invalid of [null,undefined,'',false,'bad',Infinity,-1])assert.equal(prescribedTotals([{...food,k:invalid}]).k,null);
    for(const invalid of [null,undefined,0,-1,false,''])assert.deepEqual(prescribedTotals([{...food,qtd:invalid}]),{k:null,pt:null,cb:null,g:null});
    assert.equal(nutrientLabel(null),'Não informado');assert.equal(nutrientLabel(0),'0');
  });
  test('calendar is stable across months, leap days and invalid input',()=>{
    assert.deepEqual(planWeekDays('2028-02-29'),['2028-02-28','2028-02-29','2028-03-01','2028-03-02','2028-03-03','2028-03-04','2028-03-05']);
    for(const day of ['2026-02-30','2026-13-01','','2026-10-12T00:00Z'])assert.throws(()=>planDaySummary(plan,day));
  });
  test('review and PDF table contain separate daily values, not a cross-day sum',()=>{
    const html=planWeekTable(plan,'2026-10-12');assert.match(html,/Segunda 12\/10/);assert.match(html,/<td>150<\/td>/);assert.match(html,/<td>400<\/td>/);assert.doesNotMatch(html,/>550</);assert.deepEqual(plan,original);
  });
  test('first publication and an identical published version have distinct states',()=>{
    assert.equal(comparePlans(null,plan).first,true);assert.deepEqual(comparePlans(plan,structuredClone(plan)).changes,[]);
  });
  test('portions, times, days, alternatives and guidance are compared specifically',()=>{
    const next=structuredClone(plan);next.orientacoes='Nova orientação';next.aguaMl=2500;next.refeicoes[0].hora='13:00';next.refeicoes[0].dias=[2];next.refeicoes[0].itens[0].qtd=2;next.refeicoes[0].itens[0].substituicoes[0].qtd=3;
    const changes=comparePlans(plan,next).changes;
    for(const label of ['Orientações','Água por dia','Horário','Dias','Porção','Alternativa prescrita'])assert(changes.some(c=>c.label===label));
    assert(changes.some(c=>c.before==='1,5 × 100 g'&&c.after==='2 × 100 g'));assert.deepEqual(plan,original);
  });
  test('same food IDs across meals and repeated IDs within a meal remain separate',()=>{
    const before=structuredClone(plan);before.refeicoes[0].itens.push({...food,nome:'Outro alimento'});
    const after=structuredClone(before);after.refeicoes[0].itens[1].qtd=4;
    const changes=comparePlans(before,after).changes;assert.equal(changes.length,1);assert.match(changes[0].where,/Almoço.*Outro alimento.*item 2/);assert.doesNotMatch(changes[0].where,/Jantar/);
  });
  test('additions, removals, reorder and zero versus unknown are observable',()=>{
    const after=structuredClone(plan);after.refeicoes.reverse();after.refeicoes[0].itens[0].g=null;after.refeicoes[1].itens=[];
    const changes=comparePlans(plan,after).changes;assert(changes.some(c=>c.label==='Posição no plano'));assert(changes.some(c=>c.label==='Alimento removido'));assert(changes.some(c=>c.before==='0 g'&&c.after==='Não informado'));
    after.refeicoes.push({id:'new',titulo:'Lanche',itens:[food]});assert(comparePlans(plan,after).changes.some(c=>c.label==='Refeição adicionada'));
  });
  test('fractional nutrient and portion edits remain visible without rounding away a change',()=>{
    const before=JSON.parse(JSON.stringify(plan)),after=JSON.parse(JSON.stringify(plan));before.refeicoes[0].itens[0].pt=0.1;after.refeicoes[0].itens[0].pt=0.2;
    before.refeicoes[0].itens[0].substituicoes[0].g=0.1;after.refeicoes[0].itens[0].substituicoes[0].g=0.2;
    before.refeicoes[1].itens[0].qtd=1.0000001;after.refeicoes[1].itens[0].qtd=1.0000002;
    const changes=comparePlans(before,after).changes;assert.equal(changes.length,3);assert(changes.some(c=>c.before==='0,1 g'&&c.after==='0,2 g'));assert(changes.some(c=>c.label==='Alternativa prescrita'&&c.before.includes('0,1 g')&&c.after.includes('0,2 g')));assert(changes.some(c=>c.before==='1,0000001 × 100 g'&&c.after==='1,0000002 × 100 g'));
  });
  test('recipe instructions differ without diffing publication stamps or arbitrary private metadata',()=>{
    const before=structuredClone(plan);before.refeicoes[0].itens[0].recipeComposition={title:'Arroz',yield:2,ingredients:[food],steps:['Cozinhe'],reviewedAt:'before'};
    const next=structuredClone(before);next.refeicoes[0].itens[0].recipeComposition.reviewedAt='after';next.privateNote='SECRET';assert.equal(comparePlans(before,next).changes.length,0);
    next.refeicoes[0].itens[0].recipeComposition.steps=['Cozinhe e descanse'];assert(comparePlans(before,next).changes.some(c=>c.label==='Receita calculada'));
  });
  test('recipe notes, sources and ingredient nutrition/weights are visible even with unchanged food totals',()=>{
    const before=JSON.parse(JSON.stringify(plan));before.refeicoes[0].itens[0].recipeComposition={title:'Arroz',yield:2,ingredients:[{...food,baseGramas:100}],steps:['Cozinhe'],notes:'Sirva morno',source:'Tabela A'};
    for(const [change,expected] of [
      [c=>c.notes='Sirva frio','Sirva frio'],[c=>c.source='Tabela B','Tabela B'],
      [c=>c.ingredients[0].pt=0.2,'Proteínas: 0,2 g'],[c=>c.ingredients[0].baseGramas=80,'peso da medida: 80 g'],
      [c=>c.ingredients[0].preparo='Cozido sem óleo','Cozido sem óleo'],[c=>c.ingredients[0].fonte='Rótulo revisado','Rótulo revisado']
    ]){
      const next=structuredClone(before);change(next.refeicoes[0].itens[0].recipeComposition);assert.equal(next.refeicoes[0].itens[0].k,before.refeicoes[0].itens[0].k);
      const changes=comparePlans(before,next).changes;assert.equal(changes.length,1);assert.equal(changes[0].label,'Receita calculada');assert(changes[0].after.includes(expected),expected);
    }
  });
  test('recipe-only changes in alternatives are compared and HTML escapes their notes',()=>{
    const before=JSON.parse(JSON.stringify(plan));before.refeicoes[0].itens[0].substituicoes[0].recipeComposition={title:'Batata',yield:2,ingredients:[food],steps:['Cozinhe'],notes:'Sirva morno',source:'Tabela A'};
    const next=structuredClone(before);next.refeicoes[0].itens[0].substituicoes[0].recipeComposition.notes='<script>nota</script>';next.refeicoes[0].itens[0].substituicoes[0].recipeComposition.source='Tabela B';
    const comparison=comparePlans(before,next);assert.equal(comparison.changes.length,1);assert.equal(comparison.changes[0].label,'Alternativa prescrita');assert.match(comparison.changes[0].after,/Tabela B/);assert.match(renderPlanChanges(comparison),/&lt;script&gt;/);assert.doesNotMatch(renderPlanChanges(comparison),/<script>/);
  });
  test('malformed recipe arrays and legacy collections never crash the comparison',()=>{
    const before=JSON.parse(JSON.stringify(plan));before.refeicoes[0].itens[0].recipeComposition={title:'Arroz',yield:2,ingredients:[food],steps:['Cozinhe']};
    for(const malformed of [null,'invalid',{},[null,42,[]]]){
      const next=structuredClone(before);next.refeicoes[0].itens[0].recipeComposition.ingredients=malformed;next.refeicoes[0].itens[0].recipeComposition.steps=malformed;next.refeicoes[0].itens[0].recipeComposition.unquantifiedIngredients=malformed;
      assert.doesNotThrow(()=>renderPlanChanges(comparePlans(before,next)));
      next.refeicoes[0].itens[0].substituicoes=malformed;next.refeicoes[1].itens=malformed;next.receitas=malformed;assert.doesNotThrow(()=>comparePlans(before,next));
    }
  });
  test('only previous patient-visible snapshots of the same published plan and patient are eligible',()=>{
    const published={id:'p',patient_id:'patient-a',status:'published',version:5,data:plan};
    const record=(version,extra={})=>({patient_id:'patient-a',kind:'plan_version',visibility:'patient',data:{planId:'p',planVersion:version,plan},...extra});
    const records=[record(1),record(3),record(4,{visibility:'private'}),record(4,{patient_id:'patient-b'}),record(4,{kind:'draft'}),record(4,{data:{planId:'other',planVersion:4,plan}}),record(9),record(4,{archived:true}),record(4,{data:{planId:'p',planVersion:4,plan,archived:true}})];
    assert.equal(previousPublishedPlan(records,published,'patient-a').data.planVersion,3);
    assert.equal(previousPublishedPlan(records,published,'patient-b'),null);
    assert.equal(previousPublishedPlan(records,{...published,status:'draft'},'patient-a'),null);
    assert.equal(previousPublishedPlan([record(3),record(3)],published,'patient-a').data.planVersion,3);
    assert.equal(previousPublishedPlan([record(1),record(3),record(3,{data:{planId:'p',planVersion:3,plan:{...plan,orientacoes:'Conflicting'}}})],published,'patient-a'),null);
  });
  test('comparison HTML escapes every patient-provided field and never includes private metadata',()=>{
    const next=structuredClone(plan);next.orientacoes='<img src=x onerror=alert(1)>';next.secret='NEVER';
    const html=renderPlanChanges(comparePlans(plan,next));assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|NEVER/);
  });
  console.log(checks+' day-summary and plan-change checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
