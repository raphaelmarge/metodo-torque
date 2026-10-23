/* Gerador mensal: revisão humana, propostas e publicação separadas. */
(function (root) {
  'use strict';
  var ctx, editor, base, identity, dirty = false, drafts = {}, message = '';
  var C = function () { return root.MT_GERADOR_MENSAL; };
  var A = function () { return root.MT_GERADOR_MENSAL_ADAPTER; };
  var $ = function (id) { return document.getElementById(id); };
  var clone = function (x) { return JSON.parse(JSON.stringify(x == null ? null : x)); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); };
  var list = function (x) { return String(x || '').split(/[;\n]/).map(function (v) { return v.trim(); }).filter(Boolean); };
  function today() { return root.MTStore.todayISO(); }
  function addMonth(d) { var a = d.split('-').map(Number), n = new Date(a[0], a[1]+1, 0).getDate(); return [a[0] + (a[1] === 12 ? 1 : 0), a[1] === 12 ? 1 : a[1]+1, Math.min(a[2],n)].map(function (v,i) { return i ? String(v).padStart(2,'0') : v; }).join('-'); }
  function dayAfter(d, delta) { var a=d.split('-').map(Number), v=new Date(a[0],a[1]-1,a[2]+(delta==null?1:delta),12); return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0'); }
  function person(st,id) { return (st.alunos || []).find(function (a) { return a.id===id && a.ativo!==false; }); }
  function current() { return $('gmAluno') && $('gmAluno').value; }
  function account() { return String(ctx.account()); }
  function key() { return account()+':'+current(); }
  function status(s, bad) { message=s; var el=$('gmStatus'); if(el){el.textContent=s;el.classList.toggle('gm-error',!!bad);} }
  function showIssues(issues) { return (issues || []).map(function (v) { return typeof v==='string'?v:(v.message||v.mensagem||v.code||JSON.stringify(v)); }).join(' '); }
  function get(o,p) { return p.split('.').reduce(function (v,k) { return v==null?undefined:v[k]; },o); }
  function set(o,p,v) { var ps=p.split('.'), k=ps.pop(), t=o;ps.forEach(function(x){if(!t[x]||typeof t[x]!=='object')t[x]={};t=t[x];});t[k]=v; }
  function field(id,label,value,type,extra) { return '<label class="gm-field" for="'+id+'">'+esc(label)+'<input id="'+id+'" type="'+(type||'text')+'" value="'+esc(value)+'" '+(extra||'')+'></label>'; }
  function text(id,label,value,extra) { return '<label class="gm-field gm-wide" for="'+id+'">'+esc(label)+'<textarea id="'+id+'" rows="2" maxlength="2000" '+(extra||'')+'>'+esc(value)+'</textarea></label>'; }
  function select(id,label,value,options) { return '<label class="gm-field" for="'+id+'">'+esc(label)+'<select id="'+id+'">'+options.map(function(v){return '<option value="'+esc(v[0])+'"'+(String(value)===String(v[0])?' selected':'')+'>'+esc(v[1])+'</option>';}).join('')+'</select></label>'; }
  function check(id,label,value) { return '<label class="gm-check"><input id="'+id+'" type="checkbox"'+(value?' checked':'')+'>'+esc(label)+'</label>'; }
  function options(values,fallback) {
    if(!values)return fallback;
    if(Array.isArray(values))return values.map(function(v){return typeof v==='string'?[v,v]:[v.id||v.value||v.key,v.label||v.name||v.nome];});
    return Object.keys(values).map(function(k){var v=values[k];return [k,typeof v==='string'?v:(v.label||v.name||v.nome||k)];});
  }
  var goals=[['hipertrofia','Ganhar massa muscular'],['emagrecimento','Reduzir gordura corporal'],['forca','Aumentar a força'],['condicionamento','Melhorar o condicionamento'],['saude','Saúde e autonomia']];
  var levels=[['iniciante','Iniciante'],['intermediario','Intermediário'],['avancado','Avançado']];
  var equipment=[['bodyweight','Peso do corpo'],['dumbbells','Halteres'],['barbell','Barra'],['machines','Máquinas'],['cables','Polias'],['bands','Elásticos'],['bench','Banco'],['cardio','Equipamento aeróbico']];
  function defaults(a, st) {
    var gm=clone(a.geradorMensal||{}), an=a.anamnese||{}, report=(a.retorno||{}).anamnese&&a.retorno.anamnese.geradorMensal||an.geradorMensal||{}, p=Object.assign({},report,gm.perfil||{});
    var age=null;if(a.nasc){var b=a.nasc.split('-').map(Number),n=today().split('-').map(Number);age=n[0]-b[0]-((n[1]<b[1]||(n[1]===b[1]&&n[2]<b[2]))?1:0);}
    var nd=Number(an.dias||a.metaSemana||3), ds=nd===1?[1]:nd===2?[1,4]:nd===3?[1,3,5]:nd===4?[1,2,4,5]:[1,2,3,4,5,6,0].slice(0,Math.min(7,nd));
    p=Object.assign({age:age,healthStatus:'unknown',conditions:[],functional:{available:[],unavailable:[]},guidance:{},level:an.nivel||'iniciante',returning:false,objective:((st.treinosV2||{})[a.id]||{}).objetivo||'hipertrofia',secondaryObjective:'',priorities:[],days:ds,minutes:45,equipment:[],preferences:{prefer:[],avoid:[]},recovery:'',physiology:'',source:'personal'},p);
    p.guidance=p.guidance||{};p.functional=p.functional||{};p.preferences=p.preferences||{};
    gm.perfil=p; gm.config=gm.config||C().defaultConfig();
    var t=today(), active=gm.active;
    var hasLegacy=((((st.treinosV2||{})[a.id]||{}).fichas)||[]).length>0, prior=dayAfter(t,-1);
    gm.period=gm.period|| (active?{start:active.start,end:active.end}:hasLegacy?{start:prior.slice(0,8)+'01',end:prior}:{start:t,end:t});
    if(!active && gm.period.start>gm.period.end)gm.period={start:t,end:t};
    var start=active?dayAfter(active.end):t;
    gm.nextPeriod=gm.nextPeriod||{start:start,end:dayAfter(addMonth(start),-1)};
    return gm;
  }
  var labels={minComparableSessions:'Sessões comparáveis mínimas',maxLoadIncreasePct:'Aumento máximo de carga (%)',loadIncrementKg:'Degrau de carga (kg)',secondsPerRep:'Segundos por repetição',transitionSeconds:'Transição entre exercícios (s)',warmupMinutes:'Preparação (min)',timeToleranceMinutes:'Tolerância de duração (min)',maxExercisesPerSession:'Exercícios máximos por sessão',minExercisesPerSession:'Exercícios mínimos por sessão',minAge:'Idade mínima',maxAge:'Idade máxima',sets:'Séries',repsMin:'Repetições mínimas',repsMax:'Repetições máximas',restSeconds:'Descanso (s)',rest:'Descanso (s)',min:'Mínimo',max:'Máximo',rpeMax:'RPE máximo',rpeMin:'RPE mínimo',setsMin:'Séries mínimas',setsMax:'Séries máximas',initialSets:'Séries iniciais',rir:'Repetições em reserva'};
  function configFields(obj,path) {
    return Object.keys(obj||{}).filter(function(k){return !['approved','author','date','approvedAt','version','loadIncrements'].includes(k);}).map(function(k){
      var v=obj[k],p=path?path+'.'+k:k;
      if(typeof v==='number')return '<label class="gm-field">'+esc(p.split('.').map(function(x){return labels[x]||(goals.concat(levels).find(function(y){return y[0]===x;})||[])[1]||x;}).join(' · '))+'<input type="number" step="any" data-gm-config="'+esc(p)+'" value="'+v+'"></label>';
      if(v&&typeof v==='object'&&!Array.isArray(v))return configFields(v,p);
      return '';
    }).join('');
  }
  Object.assign(labels,{durationToleranceMinutes:'Tolerância da duração (min)',minExercises:'Exercícios mínimos por sessão',readaptationSets:'Séries na readaptação',maxWeeklyPrimarySets:'Máximo de séries semanais por músculo primário',maximumDays:'Dias máximos de treino por semana',minimumRecoveryHours:'Intervalo mínimo entre sessões (h)',targetRpeMin:'Esforço mínimo RPE (1–10)',targetRpeMax:'Esforço máximo RPE (1–10)',maxExercises:'Exercícios máximos por sessão',doses:'Dose',healthDetails:'Detalhes de saúde',injury:'Lesão ou cirurgia',region:'Região',side:'Lado',phase:'Fase relatada',limitations:'Limitações',limb:'Ausência de membro / deficiência',segment:'Segmento',diabetes:'Diabetes',type:'Tipo',treatment:'Tratamento relatado',hypoglycemia:'Histórico de hipoglicemia',complications:'Complicações relatadas',professional:'Profissional que orientou',guidanceDate:'Data da orientação',functional:'Capacidade funcional',available:'Capacidades confirmadas',unavailable:'Capacidades limitadas',resources:'Apoios e recursos',details:'Detalhes',reportedAt:'Data do relato',healthStatus:'Situação de saúde',conditions:'Condições relatadas',recovery:'Recuperação',physiology:'Fatores fisiológicos',sleep:'Sono',fatigue:'Fadiga',adherence:'Adesão (%)',plannedEligible:'Sessões elegíveis',completed:'Sessões realizadas',paused:'Pausas autorizadas',missed:'Ausências confirmadas',unknown:'Sessões sem confirmação',coverage:'Cobertura dos registros (%)',extraSessions:'Sessões adicionais',completedSets:'Séries concluídas',perception:'Percepção de evolução',difficulty:'Dificuldades',symptoms:'Sintomas',healthChanges:'Mudanças de saúde',routineChanged:'Mudança de rotina',routineNotes:'Observações da rotina',minutes:'Minutos por sessão',author:'Responsável',at:'Data',name:'Nome',source:'Fonte',population:'População',prerequisites:'Pré-condições',requiredData:'Dados necessários',exceptions:'Exceções',limits:'Limites',technicalOwner:'Responsável técnico',clinicallyValidated:'Algoritmo clinicamente validado',editorialDate:'Data editorial',reviewedAt:'Revisado em'});
  function capture() {
    if(!editor||!$('gmForm'))return;
    var values={};$('gmForm').querySelectorAll('input,textarea,select').forEach(function(el){var id=el.id||el.dataset.gmConfig||el.name;if(id)values[id]=el.type==='checkbox'?el.checked:el.value;});
    drafts[identity]={values:values,base:base,dirty:dirty};
  }
  function refresh(force) {
    if(!ctx||!$('gmRoot')||!C()||!A())return;
    if(!force)capture();
    var st=ctx.load(),id=current(),a=person(st,id); identity=key();dirty=false;
    if(!a){editor=null; $('gmRoot').innerHTML='<p class="muted">Escolha um aluno para preparar a próxima etapa.</p>';return;}
    editor=defaults(a,st);base=JSON.stringify(a.geradorMensal||null);
    var p=editor.perfil,g=p.guidance,catalog=root.MT_GERADOR_MENSAL_CATALOGO||{}, eq=options(catalog.EQUIPMENT||catalog.equipment,equipment), conditions=(p.conditions||[]).map(function(v){return (v.name||v.id||'')+(v.details?' — '+v.details:'');}).join('\n');
    var eqLabels={cadeira:'Cadeira',halteres:'Halteres',banco:'Banco',colchonete:'Colchonete',parede:'Parede',elastico:'Elástico',ancoragem:'Ancoragem para elástico',apoio:'Apoio estável',polia:'Polia',leg_press:'Leg press',extensora:'Cadeira extensora',flexora:'Cadeira flexora',supino_maquina:'Máquina de supino',remada_maquina:'Máquina de remada'};eq=eq.map(function(v){return [v[0],eqLabels[v[0]]||v[1]];});
    var rawAn=(a.retorno||{}).anamnese||a.anamnese||{};
    $('gmRoot').innerHTML='<div class="gm-overview"><div><span class="gm-eyebrow">Planejamento acompanhado</span><h3>'+esc(a.nome)+'</h3><p>'+ (editor.active?'Etapa atual: '+esc(editor.active.start)+' a '+esc(editor.active.end):'Primeira etapa: confirme o perfil e os parâmetros para gerar.')+'</p></div><button type="button" class="btn sec" id="gmReload">Recarregar dados</button></div>'+
      '<p class="gm-note">Os registros do aluno orientam o fechamento. A próxima etapa só é aplicada após sua revisão.</p>'+
      (editor.active?'<div class="gm-actions"><button type="button" class="btn sec" id="gmExtraordinaryStart">Preparar revisão extraordinária da etapa</button><button type="button" class="btn sec" id="gmRequestReview">Solicitar fechamento ao aluno</button></div>':'')+
      '<form id="gmForm"><details class="gm-section" open><summary>1. Perfil e anamnese</summary><div class="gm-grid">'+
      field('gmAge','Idade na próxima etapa',p.age,'number','min="1" max="120"')+
      select('gmLevel','Nível na musculação',p.level,options(C().LEVELS,levels))+
      select('gmObjective','Objetivo principal',p.objective,options(C().OBJECTIVES,goals))+
      select('gmSecondary','Objetivo secundário',p.secondaryObjective,[['','Sem objetivo secundário']].concat(options(C().OBJECTIVES,goals)))+
      field('gmMinutes','Minutos por sessão',p.minutes,'number','min="10" max="180"')+
      text('gmPriorities','Regiões prioritárias (separe por ponto e vírgula)',(p.priorities||[]).join('; '))+
      '<fieldset class="gm-wide"><legend>Dias disponíveis</legend><div class="gm-checks">'+['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(function(d,i){return check('gmDay'+i,d,(p.days||[]).includes(i));}).join('')+'</div></fieldset>'+
      '<fieldset class="gm-wide"><legend>Equipamentos disponíveis</legend><div class="gm-checks">'+eq.map(function(e){return check('gmEq_'+e[0],e[1],(p.equipment||[]).includes(e[0]));}).join('')+'</div></fieldset>'+
      check('gmReturning','Retornando após uma pausa',p.returning)+
      text('gmPrefer','Preferências de exercícios (IDs do catálogo; ponto e vírgula)',(p.preferences.prefer||[]).join('; '))+
      text('gmAvoid','Exercícios que evita (IDs do catálogo; ponto e vírgula)',(p.preferences.avoid||[]).join('; '))+
      text('gmRecovery','Rotina, sono, recuperação e outras atividades',typeof p.recovery==='object'?(p.recovery.notes||[p.recovery.sleep,p.recovery.fatigue,p.recovery.details].filter(Boolean).join(' · ')):p.recovery)+
      text('gmPhysiology','Informações fisiológicas pertinentes e orientações específicas',typeof p.physiology==='object'?(p.physiology.notes||[p.physiology.status,p.physiology.details].filter(Boolean).join(' · ')):p.physiology)+
      check('gmPregnant','Gestação informada',p.physiology&&p.physiology.pregnant)+check('gmPostpartum','Pós-parto informado',p.physiology&&p.physiology.postpartum)+check('gmRequiresProtocol','Outra necessidade de protocolo específico',p.physiology&&(p.physiology.requiresProtocol||p.physiology.status==='reported'))+
      '</div><details class="gm-source"><summary>Respostas de origem do aluno</summary><div class="gm-readable">'+readable(rawAn)+'</div><p>O relato original é preservado. As confirmações abaixo pertencem ao personal.</p></details>'+
      '<button type="button" class="btn sec" id="gmImportProfile">Carregar relato estruturado mais recente para revisão</button>'+check('gmProfileConfirmed','Revisei a anamnese, o nível, os objetivos e a disponibilidade',!!p.reviewedAt)+'</details>'+
      '<details class="gm-section"><summary>2. Saúde, função e adaptações</summary><div class="gm-grid">'+
      select('gmHealth','Situação de saúde informada',p.healthStatus,[['unknown','Ainda não confirmada'],['none','Sem condições ou limitações informadas após revisão'],['reported','Há condições ou necessidades de adaptação']])+
      text('gmConditions','Condições, lesões ou cirurgias (uma por linha)',conditions)+
      text('gmFunctionalAvailable','Capacidades confirmadas (identificadores do catálogo; ponto e vírgula)',(p.functional.available||[]).join('; '))+
      text('gmFunctionalUnavailable','Capacidades indisponíveis / apoio ou preensão limitados',(p.functional.unavailable||[]).join('; '))+
      text('gmFunctionNotes','Membro, lado, segmento, prótese/órtese, apoios e adaptações',p.functional.notes||[p.functional.details,p.functional.resources].filter(Boolean).join(' · '))+
      '<details class="gm-source gm-wide"><summary>Detalhes de saúde informados na anamnese</summary><div class="gm-readable">'+readable(p.healthDetails||{})+'</div></details>'+
      field('gmGuidanceAuthor','Responsável pela orientação',g.author)+field('gmGuidanceDate','Data da orientação',g.date,'date')+
      field('gmGuidanceExpires','Validade da orientação (se definida)',g.expiresAt,'date')+
      text('gmGuidanceScope','Escopo, limitações e orientações vigentes',g.scope)+
      text('gmExecutionNotes','Posição, amplitude e ajustes de execução orientados',g.executionNotes)+
      text('gmAllowed','Exercícios explicitamente permitidos (IDs do catálogo; ponto e vírgula)',(g.allowedExerciseIds||[]).join('; '))+
      text('gmBlocked','Exercícios restritos (IDs; ponto e vírgula)',(g.blockedExerciseIds||[]).join('; '))+
      text('gmPatterns','Padrões de movimento restritos (IDs; ponto e vírgula)',(g.blockedPatterns||[]).join('; '))+
      field('gmMaxLoad','Limite de carga orientado (kg; deixe vazio se não definido)',(g.limits||{}).maxLoadKg,'number','min="0" step="any"')+
      field('gmMaxSets','Limite de séries orientado (se definido)',(g.limits||{}).maxSets,'number','min="1"')+
      field('gmMaxReps','Limite de repetições orientado (se definido)',(g.limits||{}).maxReps,'number','min="1"')+
      field('gmMinRest','Descanso mínimo orientado (s; se definido)',(g.limits||{}).minRestSeconds,'number','min="0"')+
      '</div>'+check('gmGuidanceReviewed','Conferi o escopo das orientações vigentes e as adaptações',g.reviewed)+
      '<p class="gm-help">A melhora relatada não retira uma restrição. Condições sem protocolo compatível seguem com prescrição manual e revisão individual.</p></details>'+
      '<details class="gm-section"><summary>3. Datas e parâmetros da prescrição</summary><div class="gm-grid">'+
      field('gmPeriodStart','Fechamento: início',editor.period.start,'date')+field('gmPeriodEnd','Fechamento: fim',editor.period.end,'date')+
      field('gmNextStart','Próxima etapa: início',editor.nextPeriod.start,'date')+field('gmNextEnd','Próxima etapa: fim',editor.nextPeriod.end,'date')+
      field('gmAuthor','Personal responsável',editor.config.author||ctx.author())+
      '</div><p class="gm-help">Os valores iniciais são propostas editáveis. Confira sua adequação ao aluno antes de aprovar; não representam validação clínica automática.</p>'+
      '<details class="gm-source"><summary>Editar faixas e limites do protocolo</summary><div class="gm-grid">'+configFields(editor.config,'')+'</div></details>'+
      text('gmLoadIncrements','Degraus por equipamento/exercício (opcional: ID do catálogo = kg, uma linha por exercício)',Object.keys(editor.config.loadIncrements||{}).map(function(id){return id+' = '+editor.config.loadIncrements[id];}).join('\n'))+
      check('gmConfigApproved','Revisei e aprovo estes parâmetros para este aluno',editor.config.approved)+
      '</details><div class="gm-actions"><button type="submit" class="btn" id="gmSave">Salvar perfil e parâmetros</button><span id="gmDirty" class="gm-help"></span></div></form>'+
      '<section class="gm-section"><h3>4. Fechamento e confirmação da evolução</h3><div id="gmEvidence"></div><div class="gm-grid">'+
      select('gmReviewStatus','Resultado da revisão','confirmed',[['confirmed','Dados confirmados'],['corrected','Dados corrigidos e confirmados'],['insufficient','Informações insuficientes']])+
      text('gmReviewNotes','Leitura do mês, correções e motivo das decisões','')+
      '</div><div class="gm-checks">'+check('gmTechnique','Execução conferida e adequada',false)+check('gmEffort','Esforço compatível com o planejado',false)+check('gmTarget','Metas de desempenho cumpridas',false)+check('gmClinical','Mudanças de saúde e orientações revisadas',false)+'</div>'+
      check('gmReadaptation','Confirmei a readaptação após a pausa',false)+check('gmInitialAdoption','Primeira adoção do gerador para treino anterior: revisei a situação inicial e descrevi o motivo; sem progressão automática',false)+check('gmExtraordinary','Esta é uma revisão extraordinária por saúde ou mudança relevante; descrevi o motivo',false)+check('gmDataConfirmed','Conferi as informações usadas neste fechamento',false)+
      '<div class="gm-actions"><button type="button" class="btn sec" id="gmValidate">Validar fechamento</button><button type="button" class="btn" id="gmGenerate">Gerar próxima etapa</button></div></section>'+
      '<section class="gm-section"><h3>5. Conferir a proposta</h3><div id="gmProposal"></div></section>'+
      '<details class="gm-section"><summary>Catálogo, regras e referências</summary><div id="gmCatalog"></div><div id="gmReferences"></div></details>'+
      '<div id="gmActiveActions"></div><details class="gm-section"><summary>Histórico de etapas e decisões</summary><div id="gmHistory"></div></details>'+
      '<p id="gmStatus" role="status" aria-live="polite" tabindex="-1">'+esc(message)+'</p>';
    var dr=drafts[identity];
    if(dr&&!force){base=dr.base;dirty=dr.dirty;Object.keys(dr.values).forEach(function(id){var el=$(id)||Array.from($('gmForm').querySelectorAll('[data-gm-config]')).find(function(x){return x.dataset.gmConfig===id;});if(el){if(el.type==='checkbox')el.checked=dr.values[id];else el.value=dr.values[id];}});}
    $('gmForm').addEventListener('input',function(){dirty=true;$('gmDirty').textContent='Alterações ainda não salvas';});
    $('gmForm').addEventListener('change',function(){dirty=true;});
    $('gmForm').onsubmit=function(e){e.preventDefault();run(saveForm);};
    $('gmReload').onclick=function(){delete drafts[identity];refresh(true);status('Dados atuais carregados.');};
    if($('gmExtraordinaryStart'))$('gmExtraordinaryStart').onclick=function(){run(function(){guard(false);$('gmPeriodEnd').value=today();$('gmNextStart').value=today();$('gmNextEnd').value=editor.active.end>=today()?editor.active.end:dayAfter(addMonth(today()),-1);$('gmExtraordinary').checked=true;dirty=true;$('gmDirty').textContent='Datas de revisão extraordinária ainda não salvas';status('Revise o perfil e salve as datas. Depois confirme a revisão extraordinária, descreva o motivo e confira as orientações. A etapa vigente continua preservada até aplicar.');});};
    if($('gmRequestReview'))$('gmRequestReview').onclick=function(){run(function(){var o=guard(true);o.a.geradorMensal.reviewRequested=true;write(o);status('Solicitação preparada. Publique no app para liberar o envio antecipado do fechamento.');});};
    $('gmImportProfile').onclick=function(){run(function(){var o=guard(false),an=(o.a.retorno||{}).anamnese||o.a.anamnese||{},p=an.geradorMensal;if(!p)throw Error('Ainda não há relato estruturado do aluno. Preencha e revise o perfil nesta tela.');var g=clone(o.a.geradorMensal||editor),old=clone(g.perfil);g.perfil=Object.assign({},old,clone(p),{reviewedAt:null,source:'relato_para_revisao'});g.perfil.guidance=Object.assign({},old.guidance,{reviewed:false});g.perfil.conditions=(old.conditions||[]).concat((p.conditions||[]).filter(function(c){return !(old.conditions||[]).some(function(v){return v.id===c.id;});}));g.perfil.functional=g.perfil.functional||{};g.perfil.functional.unavailable=Array.from(new Set((old.functional&&old.functional.unavailable||[]).concat(g.perfil.functional.unavailable||[])));g.validation=null;g.proposal=null;g.approvedProposal=null;g.audit=g.audit||[];g.audit.push({action:'reported_profile_loaded',at:new Date().toISOString(),previousProfile:old,reportedAt:p.reportedAt});o.a.geradorMensal=g;write(o);delete drafts[identity];refresh(true);status('Relato carregado sem aprovação. As restrições anteriores foram preservadas para sua revisão.');});};
    $('gmValidate').onclick=function(){run(validate);};$('gmGenerate').onclick=function(){run(generate);};
    renderEvidence(st,id);renderProposal(st,id);renderCatalog();renderHistory(a);
    if(dirty)$('gmDirty').textContent='Alterações ainda não salvas';
  }
  function run(fn) { try { fn(); } catch(e) { status(e.message||'Não foi possível concluir. Confira os dados.',true); } }
  function guard(requireSaved) {
    if(ctx.allowed && !ctx.allowed())throw Error('Esta conta não tem permissão para prescrever treinos.');
    if(!ctx||identity!==key())throw Error('A conta ou o aluno mudou. Recarregue os dados.');
    if(requireSaved&&dirty)throw Error('Salve as alterações do perfil e dos parâmetros antes de continuar.');
    var st=ctx.load(), a=person(st,current());
    if(!a)throw Error('O aluno não está disponível.');
    if(JSON.stringify(a.geradorMensal||null)!==base)throw Error('Os dados foram alterados em outra sessão. Recarregue antes de continuar; seus campos permanecem nesta tela.');
    return {st:st,a:a,id:a.id};
  }
  function write(o) { if(ctx.write(o.st)===false)throw Error('Não foi possível salvar. Os campos continuam disponíveis para tentar novamente.');base=JSON.stringify(o.a.geradorMensal||null); }
  function input(o) { return A().build(o.st,o.id); }
  function value(id) { return $(id).value.trim(); }
  function number(id,nullable) { var t=value(id),n=Number(t.replace(',','.'));if(nullable&&!t)return null;if(!t||!Number.isFinite(n))throw Error('Confira o campo '+$(id).closest('label').textContent.trim()+'.');return n; }
  function saveForm() {
    if(!$('gmForm').reportValidity())return;
    var o=guard(false),gm=clone(editor),p=gm.perfil, now=new Date().toISOString(), author=value('gmAuthor');
    p.age=number('gmAge',true);p.level=value('gmLevel');p.objective=value('gmObjective');p.secondaryObjective=value('gmSecondary');p.minutes=number('gmMinutes');p.priorities=list(value('gmPriorities'));p.days=[0,1,2,3,4,5,6].filter(function(d){return $('gmDay'+d).checked;});
    p.equipment=Array.from($('gmForm').querySelectorAll('[id^="gmEq_"]:checked')).map(function(el){return el.id.slice(5);});
    p.returning=$('gmReturning').checked;p.preferences={prefer:list(value('gmPrefer')),avoid:list(value('gmAvoid'))};p.recovery=Object.assign({},typeof p.recovery==='object'?p.recovery:{},{notes:value('gmRecovery')});p.physiology=Object.assign({},typeof p.physiology==='object'?p.physiology:{},{notes:value('gmPhysiology'),pregnant:$('gmPregnant').checked,postpartum:$('gmPostpartum').checked,requiresProtocol:$('gmRequiresProtocol').checked});
    p.healthStatus=value('gmHealth');p.conditions=list(value('gmConditions')).map(function(n,i){var old=(p.conditions||[]).find(function(v){return ((v.name||v.id||'')+(v.details?' — '+v.details:''))===n;});return old||{id:'condition-'+i,name:n,details:''};});
    p.functional=Object.assign({},p.functional,{available:list(value('gmFunctionalAvailable')),unavailable:list(value('gmFunctionalUnavailable')),notes:value('gmFunctionNotes')});
    var limits={};[['maxLoadKg','gmMaxLoad'],['maxSets','gmMaxSets'],['maxReps','gmMaxReps'],['minRestSeconds','gmMinRest']].forEach(function(v){var n=number(v[1],true);if(n!=null)limits[v[0]]=n;});
    p.guidance=Object.assign({},p.guidance,{author:value('gmGuidanceAuthor'),date:value('gmGuidanceDate'),expiresAt:value('gmGuidanceExpires'),scope:value('gmGuidanceScope'),executionNotes:value('gmExecutionNotes'),reviewed:$('gmGuidanceReviewed').checked,allowedExerciseIds:list(value('gmAllowed')),blockedExerciseIds:list(value('gmBlocked')),blockedPatterns:list(value('gmPatterns')),limits:limits});
    p.reviewedAt=$('gmProfileConfirmed').checked?now:null;p.source='personal';p.reviewedBy=author;
    gm.period={start:value('gmPeriodStart'),end:value('gmPeriodEnd')};gm.nextPeriod={start:value('gmNextStart'),end:value('gmNextEnd')};
    $('gmForm').querySelectorAll('[data-gm-config]').forEach(function(el){var v=Number(el.value.replace(',','.'));if(!el.value.trim()||!Number.isFinite(v))throw Error('Confira os parâmetros numéricos.');set(gm.config,el.dataset.gmConfig,v);});
    gm.config.loadIncrements={};list(value('gmLoadIncrements')).forEach(function(line){var pair=line.split('=').map(function(x){return x.trim();}),n=Number((pair[1]||'').replace(',','.'));if(pair.length!==2||!A().build(o.st,o.id).catalog.some(function(e){return e.id===pair[0];})||!Number.isFinite(n)||n<=0)throw Error('Informe os degraus como ID do catálogo = kg.');gm.config.loadIncrements[pair[0]]=n;});
    gm.config.author=author;gm.config.date=today();gm.config.approved=$('gmConfigApproved').checked;
    if(gm.config.approved&&!author)throw Error('Informe o personal responsável pelos parâmetros.');
    gm.updatedAt=now;gm.updatedBy=author;gm.validation=null;gm.proposal=null;gm.approvedProposal=null;
    gm.audit=gm.audit||[];gm.audit.push({action:'profile_saved',at:now,author:author,account:account()});
    o.a.geradorMensal=gm;write(o);dirty=false;delete drafts[identity];refresh(true);status('Perfil e parâmetros salvos. Confira e valide o fechamento.');
  }
  function validate() {
    var o=guard(true);if(!$('gmDataConfirmed').checked)throw Error('Confirme a conferência das informações do fechamento.');
    var gm=o.a.geradorMensal;if(!gm)throw Error('Salve o perfil antes de validar.');
    var review={author:gm.config.author,at:new Date().toISOString(),status:value('gmReviewStatus'),notes:value('gmReviewNotes'),techniqueConfirmed:$('gmTechnique').checked,effortConfirmed:$('gmEffort').checked,targetMet:$('gmTarget').checked,clinicalReviewed:$('gmClinical').checked};
    if(review.status==='corrected'&&!review.notes)throw Error('Descreva as correções realizadas.');
    if(review.status==='insufficient'){gm.validation=null;gm.proposal=null;gm.approvedProposal=null;gm.audit=gm.audit||[];gm.audit.push({action:'insufficient_data',at:review.at,author:review.author,notes:review.notes});write(o);renderEvidence(o.st,o.id);renderProposal(o.st,o.id);status('Pendência registrada. Complete as informações antes de gerar outra etapa.');return;}
    var health=Array.from($('gmEvidence').querySelectorAll('[data-gm-health]:checked')).map(function(el){return el.dataset.gmHealth;});
    if(health.length && (!review.clinicalReviewed || !review.notes))throw Error('Descreva a revisão das mudanças de saúde e confirme as orientações.');
    gm.healthReviewedRevisionIds=Array.from(new Set((gm.healthReviewedRevisionIds||[]).concat(health)));
    gm.sessionReviews=gm.sessionReviews||{};
    $('gmEvidence').querySelectorAll('[data-gm-session]').forEach(function(el){if(el.value==='unreviewed')return;gm.sessionReviews[el.dataset.gmSession]={reviewed:true,status:el.value,recordsComplete:el.closest('tr').querySelector('[data-gm-complete]').checked,author:review.author,at:review.at};});
    gm.manualReview={readaptationConfirmed:$('gmReadaptation').checked,initialAdoptionConfirmed:$('gmInitialAdoption').checked,initialAdoptionReason:$('gmInitialAdoption').checked?review.notes:'',extraordinaryConfirmed:$('gmExtraordinary').checked,extraordinaryReason:$('gmExtraordinary').checked?review.notes:'',author:review.author,at:review.at,notes:review.notes};
    var r=C().validate(input(o),review);
    if(!r.ok)throw Error(showIssues(r.issues)||'Confira as pendências antes de validar.');
    gm.validation=r.validation;gm.proposal=null;gm.approvedProposal=null;gm.audit=gm.audit||[];gm.audit.push({action:'data_validated',at:review.at,author:review.author,validation:clone(r.validation)});
    write(o);renderEvidence(o.st,o.id);renderProposal(o.st,o.id);status('Fechamento validado. Gere a proposta da próxima etapa.');
  }
  function generate() {
    var o=guard(true),gm=o.a.geradorMensal;if(!gm||!gm.validation)throw Error('Valide o fechamento antes de gerar.');
    var r=C().generate(input(o),gm.validation);if(!r.ok)throw Error(showIssues(r.issues)||'Não foi possível montar uma proposta compatível.');
    gm.proposal=r.proposal;gm.approvedProposal=null;write(o);renderProposal(o.st,o.id);status('Proposta gerada. Confira as mudanças antes de aprovar.');
  }
  function renderEvidence(st,id) {
    var a=person(st,id),gm=a.geradorMensal||{}, data=A().build(st,id), prep=C().prepare(data), m=prep.metrics||{};
    $('gmEvidence').innerHTML='<div class="gm-metrics">'+Object.keys(m).filter(function(k){return typeof m[k]==='number'||m[k]===null;}).map(function(k){return '<div><small>'+esc(labels[k]||k)+'</small><strong>'+esc(m[k]==null?'Não disponível':Number(m[k].toFixed?m[k].toFixed(2):m[k]))+'</strong></div>';}).join('')+'</div>'+
      (prep.issues&&prep.issues.length?'<p class="gm-note">'+esc(showIssues(prep.issues))+'</p>':'')+
      '<details class="gm-source"><summary>Dados do fechamento</summary><div class="gm-readable"><h4>Relato do aluno</h4>'+readable(data.training&&data.training.monthReport||{})+'<h4>Indicadores</h4>'+readable(m)+'<h4>Avaliações</h4>'+readable(data.assessments||[])+'</div></details>'+
      '<div class="gm-health-reviews">'+((data.training.monthReport||{}).allRevisions||[]).filter(function(r){return (data.training.monthReport.pendingHealthRevisionIds||[]).includes(r.id);}).map(function(r){return '<div class="gm-note"><p>Mudança de saúde relatada em '+esc(r.createdAt)+'</p>'+readable(r.data)+'<label class="gm-check"><input type="checkbox" data-gm-health="'+esc(r.id)+'">Revisei este relato e atualizei as orientações necessárias no perfil</label></div>';}).join('')+'</div>'+
      '<details class="gm-source"><summary>Conferir presença, pausas e registros por sessão</summary><p class="gm-help">Ausência de registro continua desconhecida. Marque pausa somente quando autorizada; ela sai do denominador da adesão.</p><div class="gm-table-wrap"><table><thead><tr><th>Data / sessão</th><th>Revisão do personal</th><th>Registros completos</th></tr></thead><tbody>'+(data.training.plannedSessions||[]).map(function(s){return '<tr><td>'+esc(s.date)+'<small>'+esc(s.type+' '+s.fichaId)+'</small></td><td><select aria-label="Situação '+esc(s.date)+'" data-gm-session="'+esc(s.id)+'">'+[['unreviewed','Sem revisão ('+s.status+')'],['completed','Realizada'],['missed','Não realizada'],['unknown','Desconhecida'],['paused','Pausa autorizada']].map(function(v){return '<option value="'+v[0]+'"'+(s.review&&s.review.reviewed&&s.status===v[0]?' selected':'')+'>'+esc(v[1])+'</option>';}).join('')+'</select></td><td><input aria-label="Registros completos '+esc(s.date)+'" type="checkbox" data-gm-complete'+(s.recordsComplete?' checked':'')+'></td></tr>';}).join('')+'</tbody></table></div></details>'+
      '<p class="gm-help">'+(gm.validation?'Última validação: '+esc(gm.validation.author||gm.config.author)+' · '+esc(gm.validation.at||gm.validation.validatedAt||''):'Este fechamento ainda não foi validado.')+'</p>';
  }
  function readable(o) {
    if(o==null)return '<span>Não informado</span>';
    if(Array.isArray(o))return o.length?'<ul>'+o.map(function(v){return '<li>'+readable(v)+'</li>';}).join('')+'</ul>':'<span>Nenhum registro disponível</span>';
    if(typeof o==='object')return '<dl>'+Object.keys(o).filter(function(k){return !['raw','snapshot','versions','revisions'].includes(k);}).map(function(k){return '<dt>'+esc(labels[k]||k)+'</dt><dd>'+readable(o[k])+'</dd>';}).join('')+'</dl>';
    if(typeof o==='string'&&/^https:\/\//.test(o))return '<a href="'+esc(o)+'" target="_blank" rel="noopener noreferrer">Consultar fonte</a>';
    return esc(typeof o==='boolean'?(o?'Sim':'Não'):o);
  }
  function renderProposal(st,id) {
    var a=person(st,id),gm=a.geradorMensal||{},p=gm.approvedProposal&&gm.approvedProposal.proposal||gm.proposal;
    if(!p){$('gmProposal').innerHTML='<p class="muted">A proposta aparecerá aqui depois da validação e da geração.</p>';return;}
    var cat=A().build(st,id).catalog||[];
    $('gmProposal').innerHTML='<p><strong>'+esc((p.period||{}).start)+' a '+esc((p.period||{}).end)+'</strong></p>'+
      '<p class="gm-note">'+esc(p.scope)+'</p><div class="gm-readable">'+readable(p.notes||[])+'</div>'+
      '<p class="gm-help">Duração estimada por sessão: '+(p.fichas||[]).map(function(f){return esc(f.titulo)+': '+esc(f.estimatedMinutes)+' min';}).join(' · ')+'</p><details class="gm-source"><summary>Volume semanal por músculo primário</summary>'+readable(p.weeklyPrimarySets||{})+'</details>'+
      '<div class="gm-readable">'+readable(p.justifications||[])+'</div>'+
      (p.fichas||[]).map(function(f){return '<details class="gm-source" open><summary>'+esc(f.titulo||f.name)+'</summary><div class="gm-table-wrap"><table><thead><tr><th>Exercício</th><th>Séries</th><th>Repetições</th><th>Carga</th><th>Descanso</th></tr></thead><tbody>'+(f.itens||[]).map(function(it){var ex=cat.concat(st.exercicios||[]).find(function(e){return e.id===it.exId;})||{};return '<tr><td>'+esc(it.nome||ex.nome||ex.name||it.exId)+'</td><td>'+esc(it.series)+'</td><td>'+esc(it.reps)+'</td><td>'+esc(it.carga==null?'A definir':it.carga+' kg')+'</td><td>'+esc(it.descanso)+' s</td></tr>';}).join('')+'</tbody></table></div></details>';}).join('')+
      '<p class="gm-help">Para ajustar a proposta, altere o perfil ou os parâmetros e valide novamente. Aplicar organiza as sessões nos dias escolhidos dentro do período; outras modalidades são preservadas.</p>'+
      (!gm.approvedProposal?'<details class="gm-source"><summary>Ajustar exercícios e dose antes de aprovar</summary><p class="gm-help">As substituições e doses serão verificadas contra as restrições e limites aprovados.</p><div class="gm-table-wrap"><table><thead><tr><th>Ficha / exercício</th><th>Séries</th><th>Repetições</th><th>Carga (kg)</th><th>Descanso (s)</th></tr></thead><tbody>'+(p.fichas||[]).map(function(f){return (f.itens||[]).map(function(it,i){return '<tr data-gm-item="'+i+'" data-gm-ficha="'+esc(f.id)+'"><td><small>'+esc(f.titulo)+'</small><select data-gm-change="exId" aria-label="Exercício">'+cat.map(function(e){return '<option value="'+esc(e.id)+'"'+(e.id===it.exId?' selected':'')+'>'+esc(e.nome)+'</option>';}).join('')+'</select></td>'+['series','reps','carga','descanso'].map(function(k){return '<td><input type="number" step="'+(k==='carga'?'any':'1')+'" min="0" data-gm-change="'+k+'" aria-label="'+k+'" value="'+esc(it[k])+'"></td>';}).join('')+'</tr>';}).join('');}).join('')+'</tbody></table></div>'+text('gmRevisionReason','Motivo dos ajustes','')+'<button type="button" class="btn sec" id="gmRevise">Registrar ajustes e conferir limites</button></details>':'')+
      (gm.approvedProposal?'<p class="gm-note">Proposta aprovada por '+esc(gm.approvedProposal.author)+'. A aplicação permanece separada da publicação.</p><button type="button" class="btn" id="gmApply">Aplicar etapa aprovada</button>':
      check('gmApproveCheck','Conferi os exercícios, adaptações, parâmetros e a distribuição de sessões',false)+'<button type="button" class="btn" id="gmApprove">Aprovar proposta</button>')+
      '<button type="button" class="btn sec" id="gmDiscard">Descartar proposta</button>';
    var proposalDirty=false;$('gmProposal').addEventListener('input',function(e){if(e.target.matches('[data-gm-change],#gmRevisionReason'))proposalDirty=true;});
    if($('gmRevise'))$('gmRevise').onclick=function(){run(function(){var o=guard(true),g=o.a.geradorMensal,patches=[];document.querySelectorAll('#gmProposal [data-gm-item]').forEach(function(row){var f=g.proposal.fichas.find(function(f){return f.id===row.dataset.gmFicha;}),index=Number(row.dataset.gmItem),it=f.itens[index],changes={};row.querySelectorAll('[data-gm-change]').forEach(function(el){var k=el.dataset.gmChange,v=k==='exId'?el.value:el.value.trim()===''?null:Number(el.value);if(String(v)!==String(it[k]))changes[k]=v;});if(Object.keys(changes).length)patches.push({fichaId:f.id,itemIndex:index,changes:changes});});if(!patches.length)throw Error('Nenhum exercício ou dose foi alterado.');var r=C().reviseProposal(input(o),g.proposal,g.validation,patches,{author:g.config.author,at:new Date().toISOString(),reason:value('gmRevisionReason')});if(!r.ok)throw Error(showIssues(r.issues));g.proposal=r.proposal;write(o);renderProposal(o.st,o.id);status('Ajustes registrados e limites conferidos. Revise a proposta antes de aprovar.');});};
    if($('gmApprove'))$('gmApprove').onclick=function(){run(function(){if(proposalDirty)throw Error('Registre os ajustes da proposta antes de aprovar.');if(!$('gmApproveCheck').checked)throw Error('Confirme a revisão da proposta.');var o=guard(true),g=o.a.geradorMensal,r=C().checkProposal(input(o),g.proposal,g.validation);if(!r.ok)throw Error(showIssues(r.issues));g.approvedProposal={proposal:clone(g.proposal),validation:clone(g.validation),author:g.config.author,at:new Date().toISOString()};write(o);renderProposal(o.st,o.id);status('Proposta aprovada. Aplique no início da etapa e depois publique para o aluno.');});};
    if($('gmApply'))$('gmApply').onclick=function(){run(function(){var o=guard(true),g=o.a.geradorMensal,ap=g.approvedProposal,r=C().checkProposal(input(o),ap.proposal,ap.validation);if(!r.ok)throw Error(showIssues(r.issues));if(ap.proposal.period.start>today())throw Error('Esta etapa começa em '+ap.proposal.period.start+'. A proposta está aprovada; aplique a partir dessa data para preservar a etapa atual.');if(ap.proposal.period.end<today())throw Error('O período da proposta terminou. Revise as datas antes de aplicar.');ctx.apply(o.st,o.id,ap);write(o);delete drafts[identity];refresh(true);ctx.refresh(o.id);status('Etapa aplicada ao planejamento. Use “Publicar etapa no app” para liberar ao aluno.');});};
    $('gmDiscard').onclick=function(){run(function(){var o=guard(true);o.a.geradorMensal.proposal=null;o.a.geradorMensal.approvedProposal=null;write(o);renderProposal(o.st,o.id);status('Proposta descartada. O treino em execução foi preservado.');});};
  }
  function renderCatalog() {
    var cat=root.MT_GERADOR_MENSAL_CATALOGO||{};
    $('gmCatalog').innerHTML='<p class="gm-help">Use os identificadores abaixo nas orientações. Exercícios sem compatibilidade confirmada não entram por aproximação do nome.</p><div class="gm-table-wrap"><table><thead><tr><th>Exercício / ID</th><th>Padrão</th><th>Requisitos e equipamentos</th></tr></thead><tbody>'+(cat.exercises||[]).map(function(e){return '<tr><td>'+esc(e.nome||e.name)+'<small>'+esc(e.id)+'</small></td><td>'+esc(e.pattern||e.movementPattern||'')+'</td><td>'+esc([].concat(e.requires||e.requirements||[],e.equipment||[]).join(', '))+'</td></tr>';}).join('')+'</tbody></table></div>';
    $('gmReferences').innerHTML='<p class="gm-help">Os metadados do catálogo são descrições estruturais iniciais do produto. A adequação individual depende da conferência do personal; não houve revisão clínica externa do catálogo.</p><h4>Os 17 grupos de parâmetros</h4><ol>'+(C().PARAMETERS||[]).map(function(p){return '<li>'+esc(p.label)+'</li>';}).join('')+'</ol><h4>Fontes e limites das regras</h4>'+readable(C().EVIDENCE||{});
  }
  function renderHistory(a) {
    var gm=a.geradorMensal||{};
    $('gmHistory').innerHTML=(gm.history||[]).length?'<div class="gm-readable">'+readable((gm.history||[]).map(function(v){return {period:v.period||{start:v.start,end:v.end},author:v.author||v.approvedBy,status:v.status,summary:v.summary};}))+'</div>':'<p class="muted">As etapas aprovadas e suas decisões serão preservadas aqui.</p>';
    if(gm.active)$('gmActiveActions').innerHTML='<div class="gm-active-actions"><p>Etapa aplicada: '+esc(gm.active.start)+' a '+esc(gm.active.end)+'</p><button type="button" class="btn sec" id="gmPublish">Publicar etapa no app</button><button type="button" class="btn sec" id="gmOpenTraining">Abrir fichas</button></div>';
    if($('gmPublish'))$('gmPublish').onclick=function(){run(function(){guard(true);ctx.publish(current());});};
    if($('gmOpenTraining'))$('gmOpenTraining').onclick=function(){ctx.openTraining(current());};
  }
  function packet(st,id) {
    var a=person(st,id),gm=a&&a.geradorMensal,active=gm&&gm.active;if(!active)return null;
    if(!isCurrent(st,id))throw Error('A ficha ou agenda mensal foi alterada após a aprovação. Revise e aprove a proposta no Gerador mensal antes de publicar.');
    return {version:1,active:{id:active.id,start:active.start,end:active.end,summary:active.summary||'Etapa mensal acompanhada pelo seu personal.',watch:active.watch||[],approvedAt:active.approvedAt},reviewRequested:gm.reviewRequested===true};
  }
  function prescriptionHash(t,active,exercises) {
    if(!A().date(active.start)||!A().date(active.end)||active.start>active.end||Date.parse(active.end)-Date.parse(active.start)>62*86400000)return 'invalid-period';
    var plan=t&&t.plano||{},schedule={};
    for(var date=active.start;date<=active.end;date=dayAfter(date)){
      var dw=new Date(date+'T12:00:00').getDay(),raw=Object.prototype.hasOwnProperty.call(plan.datas||{},date)?plan.datas[date]:(plan.dias||{})[String(dw)];
      schedule[date]=(Array.isArray(raw)?raw:raw?[raw]:[]).filter(function(r){return r.tp==='ficha';});
    }
    var used={};(t&&t.fichas||[]).forEach(function(f){(f.itens||[]).forEach(function(it){used[it.exId]=true;});});
    return C().hash({fichas:t&&t.fichas||[],schedule:schedule,exercises:(exercises||[]).filter(function(e){return used[e.id];}).sort(function(a,b){return a.id.localeCompare(b.id);})});
  }
  function clinicalHash(a) {function fields(p){p=p||{};return {age:p.age,birthDate:p.birthDate,healthStatus:p.healthStatus,conditions:p.conditions,functional:p.functional,guidance:p.guidance,physiology:p.physiology,healthDetails:p.healthDetails};}function legacy(an){an=an||{};var out={};['lesoes','doencas','meds','parq1','parq2','parq3','parq4','parq5','parq6','parq7'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(an,k))out[k]=an[k];});return out;}return C().hash({birthDate:a.nasc,reviewed:fields(a.geradorMensal&&a.geradorMensal.perfil),reported:fields((a.retorno&&a.retorno.anamnese||a.anamnese||{}).geradorMensal),legacy:legacy(a.anamnese),reportedLegacy:legacy(a.retorno&&a.retorno.anamnese)});}
  function isCurrent(st,id) { var a=person(st,id),gm=a&&a.geradorMensal,active=gm&&gm.active;return !active||(active.prescriptionHash===prescriptionHash((st.treinosV2||{})[id],active,st.exercicios)&&active.clinicalHash===clinicalHash(a)&&!A().build(st,id).training.monthReport.pendingHealthReview); }
  function applyState(st,id,approved) {
    var a=person(st,id),gm=a&&a.geradorMensal,p=approved&&approved.proposal;
    if(!gm||!p)throw Error('Não há proposta aprovada para este aluno.');
    var checked=C().checkProposal(A().build(st,id),p,approved.validation);
    if(!checked.ok)throw Error(showIssues(checked.issues));
    if(p.period.start>today()||p.period.end<today())throw Error('Aplique a etapa dentro do período aprovado.');
    if((gm.history||[]).some(function(h){return h.proposal&&h.proposal.id===p.id;}))throw Error('Esta etapa já foi aplicada.');
    st.treinosV2=st.treinosV2||{};var t=st.treinosV2[id]||{fichas:[]};
    var prior=clone(t),now=new Date().toISOString(),oldIds=(t.fichas||[]).map(function(f){return f.id;});
    st.exercicios=st.exercicios||[];
    (p.exercises||[]).forEach(function(ex){var ix=st.exercicios.findIndex(function(e){return e.id===ex.id;});if(ix<0)st.exercicios.push(clone(ex));else if(JSON.stringify(st.exercicios[ix])!==JSON.stringify(ex))st.exercicios[ix]=clone(ex);});
    t.fichas=clone(p.fichas);t.objetivo=gm.perfil.objective;t.validade=p.period.end;
    t.plano=t.plano||{};t.plano.dias=t.plano.dias||{};t.plano.datas=t.plano.datas||{};
    function rows(x){return Array.isArray(x)?x:x?[x]:[];}
    function other(x){return rows(x).filter(function(r){return r.tp!=='ficha'||!oldIds.includes(r.id);});}
    Object.keys(t.plano.dias).forEach(function(d){t.plano.dias[d]=other(t.plano.dias[d]);});
    Object.keys(t.plano.datas).filter(function(d){return d>=p.period.start;}).forEach(function(d){t.plano.datas[d]=other(t.plano.datas[d]);});
    for(var date=p.period.start;date<=p.period.end;date=dayAfter(date)){
      var dw=new Date(date+'T12:00:00').getDay(),scheduled=t.fichas.find(function(f){return f.day===dw;});
      var currentRows=Object.prototype.hasOwnProperty.call(t.plano.datas,date)?rows(t.plano.datas[date]):rows(t.plano.dias[String(dw)]);
      t.plano.datas[date]=clone(currentRows);if(scheduled)t.plano.datas[date].push({tp:'ficha',id:scheduled.id,h:''});
    }
    if(t.mes)delete t.mes.musculacao;delete t.geradaIA;
    gm.history=gm.history||[];gm.history.push({id:p.id,period:clone(p.period),status:'applied',author:approved.author,at:now,summary:'Etapa mensal aprovada',proposal:clone(p),validation:clone(approved.validation),previousTraining:prior,previousActive:clone(gm.active||null)});
    gm.active={id:p.id,start:p.period.start,end:p.period.end,summary:'Etapa mensal · '+(goals.find(function(v){return v[0]===gm.perfil.objective;})||[])[1],watch:clone(p.followUp||[]),approvedAt:approved.at,approvedBy:approved.author,appliedAt:now};
    gm.active.prescriptionHash=prescriptionHash(t,gm.active,st.exercicios);
    gm.active.clinicalHash=clinicalHash(a);
    gm.period=clone(p.period);var next=dayAfter(p.period.end);gm.nextPeriod={start:next,end:dayAfter(addMonth(next),-1)};
    gm.validation=null;gm.proposal=null;gm.approvedProposal=null;gm.reviewRequested=false;
    gm.audit=gm.audit||[];gm.audit.push({action:'stage_applied',at:now,author:approved.author,proposalId:p.id});st.treinosV2[id]=t;
    return st;
  }
  function init(hooks) {
    ctx=hooks;if(!$('gmAluno'))return;
    $('gmAluno').addEventListener('change',function(){refresh(false);});
    root.addEventListener('storage',function(e){if(e.key==='mtapp:ptStudio'&&$('gmRoot')&&!$('gmSection').hidden)status('Há dados atualizados em outra sessão. Recarregue para conferir antes de continuar.');});
    refresh(true);
  }
  root.MT_PERSONAL_GERADOR_MENSAL={init:init,render:refresh,packet:packet,applyState:applyState,isCurrent:isCurrent,estado:function(){return {identity:identity,dirty:dirty,base:base};}};
})(typeof self!=='undefined'?self:this);
