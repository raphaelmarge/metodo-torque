from pathlib import Path
p=Path('app/aluno-builder.js')
s=p.read_text()
def replace(old,new,n=1):
 global s
 assert s.count(old)==n,(old[:90],s.count(old),n)
 s=s.replace(old,new)
# The publication already supports per-meal time, weekday, and plan validity.
# Keep these data contracts; only project that same plan into the calendars.
anchor="    window.__nutriAluno = api; return api;"
replace(anchor,"""    // Calendar projection is read-only: scheduling is not a food log or XP.
    api.programadas = function(d) {
      if (!ativo || !dataValida(d) || identidadePerdida) return [];
      return referenciasDia(d).map(function(r) {
        return {k:'refeicao',tp:'alimentacao',id:r.id,h:r.hora || '',tit:r.titulo || 'Refeição',sub:'Alimentação programada'};
      }).sort(function(a,b){return (a.h || '99:99').localeCompare(b.h || '99:99');});
    };
    api.abrirDia = function(d, id) {
      if (!dataValida(d) || !contextoAtual()) return false;
      if (edit) guardaEditor();
      porId('ntpData').value=d; filtroRefeicao='todas';porId('ntpBuscaRefeicao').value='';
      pinta();selecionaArea('ntpPlanoSec');
      if(window.__trocaSec)window.__trocaSec('alimentacao');
      var alvo=Array.from(box.querySelectorAll('[data-ntp-meal]')).find(function(el){return el.dataset.ntpMeal===id;});
      if(alvo){alvo.tabIndex=-1;alvo.focus({preventScroll:true});alvo.scrollIntoView({block:'center'});}
      return true;
    };
    window.__nutriAluno = api;
    // Calendars render early at boot; refresh once the nutritional API exists.
    setTimeout(function(){pintaSemana();pintaCal();pintaMapaMes();},0);
    return api;""")
replace("porId('ntpData').max = isoHj();", "porId('ntpData').removeAttribute('max');")
replace("porId('ntpProx').disabled = dia >= isoHj();", "porId('ntpProx').disabled = false;\n      porId('ntpNovo').hidden = !ativo || dia > isoHj();")
replace("porId('ntpAtalhos').hidden = !ativo || id === 'ntpRecursos';", "porId('ntpAtalhos').hidden = !ativo || porId('ntpData').value > isoHj() || id === 'ntpRecursos';")
replace("if (s <= isoHj()) { porId('ntpData').value = s; pinta(); }", "if (dataValida(s)) { porId('ntpData').value = s; pinta(); }")
replace("if (!dataValida(this.value) || this.value > isoHj())", "if (!dataValida(this.value))")
replace("if (!ativo || !pendentes.length) return null;", "if (!ativo || !pendentes.length || dia > isoHj()) return null;")
replace("(ativo ? '<div class=\"ntp-meal-actions\">'", "(ativo && dia <= isoHj() ? '<div class=\"ntp-meal-actions\">'")
replace("'<p class=\"ntp-help\">Plano em modo consulta</p>'", "'<p class=\"ntp-help\">'+(dia>isoHj()?'Programada · consulte os alimentos e registre no dia da refeição.':'Plano em modo consulta')+'</p>'")
replace("      r = registroValido(r); if (!r)", "      if (r && r.d > isoHj()) { aviso('Refeição futura é programação, não registro. Registre no dia da refeição.'); return false; }\n      r = registroValido(r); if (!r)")
# A single read-only source feeds the three calendar views.
replace('"return out.sort(function(a9,b9){if(a9.h===b9.h)return 0;', '"if(window.__nutriAluno && window.__nutriAluno.programadas)out=out.concat(window.__nutriAluno.programadas(iso));" +\n      "return out.sort(function(a9,b9){if(a9.h===b9.h)return 0;')
# Runtime helpers are serialized with the builder and use only runtime globals.
helper=r'''  function runtimeCalendarioAlimentacao() {
    function esc(v){return String(v==null?'':v).replace(/[<>&"']/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c];});}
    window.__nutriCal = {
      pontos:function(iso){
        var itens=agItensDia(iso), treino=itens.some(function(i){return i.k!=='refeicao' && i.status!=='recusado';}), refeicao=itens.some(function(i){return i.k==='refeicao';});
        return '<span class="mt-dia-pontos" role="img" aria-label="'+(treino?'Treino ou agenda programados. ':'')+(refeicao?'Alimentação programada.':'')+(!treino&&!refeicao?'Sem programação.':'')+'">'+(treino?'<i class="mt-ponto-treino" aria-hidden="true"></i>':'')+(refeicao?'<i class="mt-ponto-alimentacao" aria-hidden="true"></i>':'')+'</span>';
      },
      legenda:function(){return '<div class="mt-cal-legenda"><span><i class="mt-ponto-treino"></i>Treino / agenda</span><span><i class="mt-ponto-alimentacao"></i>Alimentação</span></div>';},
      refeicao:function(it,iso){return '<button type="button" class="mt-cal-refeicao" data-nutri-dia="'+esc(iso)+'" data-nutri-ref="'+esc(encodeURIComponent(it.id))+'"><time>'+esc(it.h||'Sem hora')+'</time><span><strong>'+esc(it.tit)+'</strong><small>Alimentação programada · ver plano</small></span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="5"/><path d="M3 3v6m3-6v6M3 6h3M4.5 9v12M21 3v18m0-18c-4 3-4 9 0 9"/></svg></button>';}
    };
    document.addEventListener('click',function(e){
      var ref=e.target.closest && e.target.closest('[data-nutri-dia]');
      if(ref && window.__nutriAluno){window.__nutriAluno.abrirDia(ref.dataset.nutriDia,decodeURIComponent(ref.dataset.nutriRef));return;}
      var dia=e.target.closest && e.target.closest('[data-agenda-iso]');
      if(dia){AGSEL=dia.dataset.agendaIso;AGMES=new Date(AGSEL+'T12:00:00');pintaCal();if(window.__trocaSec)window.__trocaSec('agenda');document.getElementById('agDia').scrollIntoView({block:'nearest'});}
    });
    document.addEventListener('keydown',function(e){
      if((e.key==='Enter'||e.key===' ') && e.target.matches('[data-agdia]')){e.preventDefault();e.target.click();}
    });
  }
'''
replace('  // Resumo da evolução: move os controles existentes e conserva seus eventos.', helper+'  // Resumo da evolução: move os controles existentes e conserva seus eventos.')
# Start the helper before the first weekly calendar paint, after data variables exist.
replace('      "function pintaSemana(){', '      "(" + runtimeCalendarioAlimentacao.toString() + ")();" +\n      "function pintaSemana(){')
# Week: retain the workout background, but two independent dots represent programming.
old=next(line for line in s.splitlines() if '"(temAg?' in line)
replace(old,'      "(window.__nutriCal?window.__nutriCal.pontos(iso):\\\"<span style=\'height:8px;display:block\'></span>\\\")+" +')
replace("document.getElementById('diasSem').innerHTML=html;pintaSemDia();", "document.getElementById('diasSem').innerHTML=html;var leg=document.getElementById('semLegenda');if(!leg){leg=document.createElement('div');leg.id='semLegenda';document.getElementById('diasSem').after(leg);}leg.innerHTML=window.__nutriCal?window.__nutriCal.legenda():'';pintaSemDia();")
replace('"(itens.length?itens.map(function(it){" +', '"(itens.length?itens.map(function(it){if(it.k===\'refeicao\'&&window.__nutriCal)return window.__nutriCal.refeicao(it,SEMSEL);" +')
replace('"agItensDia(AGSEL).map(function(it){" +', '"agItensDia(AGSEL).map(function(it){if(it.k===\'refeicao\'&&window.__nutriCal)return window.__nutriCal.refeicao(it,AGSEL);" +')
# Agenda monthly calendar: preserve selected/status styling and replace only the dot row.
old=next(line for line in s.splitlines() if '"(st2||((AGSEL' in line)
replace(old,'      "(window.__nutriCal?window.__nutriCal.pontos(iso):\\\"<span style=\'height:8px;\'></span>\\\")+\'</div>\';}" +')
replace('"h+=\\\"<div data-agdia=', '"h+=\\\"<div role=\'button\' tabindex=\'0\' data-agdia=')
replace("h+='</div>';el.innerHTML=h;", "h+='</div>';el.innerHTML=h+(window.__nutriCal?window.__nutriCal.legenda():'');")
# Evolution month: retain history shading, add programming and an accessible agenda link.
replace('"cels+=\\\"<div style=\'aspect-ratio:1;', '"cels+=\\\"<button type=\'button\' data-agenda-iso=\'\\\"+iso+\\\"\' style=\'padding:0;border:0;font-family:inherit;cursor:pointer;flex-direction:column;aspect-ratio:1;')
replace('+d+\'</div>\';}" +', '+d+(window.__nutriCal?window.__nutriCal.pontos(iso):\'\')+\'</button>\';}" +')
replace("'</span></div>'+corpo+mapLegenda();", "'</span></div>'+corpo+mapLegenda()+(window.__nutriCal?window.__nutriCal.legenda():'');")
replace('      pintaResumo(dia, rs, alimentos); pintaRecentes(); pintaMissoes();','      pintaResumo(dia, rs, alimentos); pintaRecentes(); pintaMissoes(); selecionaArea(areaNutri);')
replace("if(!fut){el.textContent='Nada marcado';sub.textContent='pede um horário aqui embaixo';bts.innerHTML='';return;}","if(!fut){el.textContent=window.__nutriAluno?'Treino + alimentação':'Nada marcado';sub.textContent=window.__nutriAluno?'Toque em um dia para consultar os horários.':'pede um horário aqui embaixo';bts.innerHTML='';return;}")
p.write_text(s)
# Scoped design tokens: small independent marks, readable timeline, light theme.
p=Path('app/aluno-skin.js');s=p.read_text();marker='  var js = "";';assert s.count(marker)==1
css=""".mt-dia-pontos{display:flex!important;justify-content:center;align-items:center;gap:4px;height:9px;min-height:9px;margin-top:2px}.mt-ponto-treino,.mt-ponto-alimentacao{display:inline-block;width:5px!important;height:5px!important;min-width:5px;border-radius:50%;background:var(--corc,#b395ff);box-shadow:0 0 0 1px rgba(0,0,0,.2)}.mt-ponto-alimentacao{background:var(--one-ok,#91e9b6)}.mt-cal-legenda{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0 4px;color:var(--one-muted,#989baa);font-size:11px}.mt-cal-legenda>span{display:flex;align-items:center;gap:6px}.mt-cal-refeicao{display:grid;grid-template-columns:56px minmax(0,1fr) 20px;gap:10px;align-items:center;width:100%;min-height:64px;margin:8px 0;padding:12px;border:1px solid rgba(145,233,182,.24);border-radius:14px;background:var(--one-card,var(--bg4));color:var(--one-text,#f3f3f6);text-align:left;font-family:inherit;cursor:pointer}.mt-cal-refeicao time,.mt-cal-refeicao svg{color:var(--one-ok,#91e9b6)}.mt-cal-refeicao time{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}.mt-cal-refeicao strong{display:block;font-size:14px;overflow-wrap:anywhere}.mt-cal-refeicao small{display:block;margin-top:3px;font-size:11px;color:var(--one-muted,#989baa)}.mt-cal-refeicao:focus-visible,[data-agenda-iso]:focus-visible,[data-agdia]:focus-visible{outline:2px solid var(--corc);outline-offset:2px}body.aluno-v793 #evResumo #mapaAno button[data-agenda-iso]{min-width:0!important;min-height:44px!important}html.claro .mt-ponto-alimentacao{background:#16864a}html.claro .mt-cal-refeicao time,html.claro .mt-cal-refeicao svg{color:#16864a}"""
import json
s=s.replace(marker,'  /* Scheduled meals and training: separate indicators, no completion implied. */\n  css += '+json.dumps(css,ensure_ascii=False)+';\n'+marker);p.write_text(s)
# Expose the existing schedule controls in the professional editor.
p=Path('assets/personal-nutricao.js');s=p.read_text()
s=s.replace('<details class="pn-details pn-days"><summary>', '<details class="pn-details pn-days" open><summary>')
s=s.replace('Horário<input type="time"', 'Horário<input type="time" step="60"')
old="+'</div></details><div class=\"pn-items\">'";assert s.count(old)==1
new="+'</div><div class=\"pn-tools\"><button type=\"button\" class=\"btn sec mini\" data-pn-dias-todos=\"'+ri+'\">Todos os dias</button></div><small>Horário e dias aparecem no calendário do aluno após publicar o plano.</small></details><div class=\"pn-items\">'"
s=s.replace(old,new)
anchor="    $('pnRefeicoes').addEventListener('change',function(e)";assert s.count(anchor)==1
s=s.replace(anchor,"""    $('pnRefeicoes').addEventListener('click',function(e){var b=e.target.closest('[data-pn-dias-todos]'),d=atual();if(!b||!d)return;var ri=+b.dataset.pnDiasTodos;if(!d.plano.refeicoes[ri])return;d.plano.refeicoes[ri].dias=[];var box=b.closest('.pn-days');box.querySelectorAll('input[type=checkbox]').forEach(function(c){c.checked=true;});box.querySelector('summary').textContent=diasTexto([]);mutou();});
"""+anchor)
p.write_text(s)

p=Path("tests/test-aluno-evolucao-experiencia.js");s=p.read_text().replace('#mapaAno div[style*="aspect-ratio"]',"#mapaAno [data-agenda-iso]");p.write_text(s)
