/* Corrida: a prescrição histórica é a única referência; nunca cruza pelo nome
 * com o plano atual nem distribui o total entre etapas sem medição. */
(function (root) {
  'use strict';
  function runtime() {
    function number(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null; }
    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function duration(v) { if (v == null) return 'Não registrado'; v = Math.round(v); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); }
    function distance(v) { return v == null ? 'Não registrado' : v.toLocaleString('pt-BR', {maximumFractionDigits:3}) + ' km'; }
    function pace(s, km) { return s > 0 && km > 0 ? duration(s / km) + ' /km' : '—'; }
    function compare(record, snapshot) {
      record = record || {};
      var plan = snapshot || record.prescricao || {}, blocks = Array.isArray(plan.blocos) ? plan.blocos : [], byIndex = {}, duplicates = {};
      (Array.isArray(record.etapas) ? record.etapas : []).forEach(function (step) {
        if (!step || !Number.isInteger(step.indice) || step.indice < 0 || step.indice >= 60) return;
        if (byIndex[step.indice]) { duplicates[step.indice] = true; return; }
        byIndex[step.indice] = step;
      });
      var ids = Array.from(new Set(blocks.slice(0,60).map(function (_, i) { return i; }).concat(Object.keys(byIndex).map(Number)))).sort(function (a,b) { return a-b; });
      var rows = ids.map(function (i) {
        var actual = duplicates[i] ? null : byIndex[i], target = blocks[i] || {}, embedded = actual || {};
        var goalS = number(target.s != null ? target.s : embedded.alvoSegundos), goalKm = number(target.km != null ? target.km : embedded.alvoKm);
        // Zero is the legacy sentinel for "no target", but is an observed value.
        if (!goalS) goalS = null; if (!goalKm) goalKm = null;
        var seconds = actual ? number(actual.segundos) : null, km = actual ? number(actual.km) : null;
        return {index:i, name:String(target.n || embedded.nome || 'Etapa ' + (i+1)), status:duplicates[i]?'conflito':actual?(['completo','pulado','parcial'].includes(actual.status)?actual.status:'parcial'):'sem-registro', targetSeconds:goalS, targetKm:goalKm, seconds:seconds, km:km, deltaSeconds:seconds!=null&&goalS!=null?seconds-goalS:null, deltaKm:km!=null&&goalKm!=null?km-goalKm:null, targetPace:pace(goalS,goalKm), pace:pace(seconds,km), instruction:String(target.d || '')};
      });
      return {rows:rows, name:String(record.n || 'Corrida e bike'), source:record.origemCorrecao==='manual'?'Corrigido manualmente':record.origem==='manual'?'Distância informada manualmente':record.origem==='gps'?'Distância registrada por GPS':'Origem da medição não informada', empty:!rows.length};
    }
    function render(record, snapshot) {
      var c = compare(record, snapshot);
      if (c.empty) return '<p class="cr-analysis-empty">Este registro não tem medições por etapa. O total foi preservado.</p>';
      var states = {completo:'Concluída',parcial:'Parcial',pulado:'Pulada','sem-registro':'Sem registro',conflito:'Registros conflitantes'};
      function values(s,k) { return (s!=null?duration(s):'') + (s!=null&&k!=null?' · ':'') + (k!=null?distance(k):''); }
      return '<div class="cr-analysis"><p>'+esc(c.source)+'</p><ol style="list-style:none;padding:0;margin:0">'+c.rows.map(function (r) {
        var delta = r.deltaKm != null ? (r.deltaKm>=0?'+':'') + (Math.round(r.deltaKm*1000)) + ' m' : r.deltaSeconds != null ? (r.deltaSeconds>=0?'+':'') + Math.round(r.deltaSeconds) + ' s' : '';
        return '<li style="padding:12px 0;border-top:1px solid var(--pt-borda,var(--bg11,#444));overflow-wrap:anywhere"><strong>'+esc((r.index+1)+'. '+r.name)+'</strong> · '+states[r.status]+'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:8px"><div><small>Prescrito</small><br>'+esc(values(r.targetSeconds,r.targetKm)||'Não disponível')+'</div><div><small>Realizado</small><br>'+esc(values(r.seconds,r.km)||'Não registrado')+'</div></div><small>Ritmo: '+esc(r.pace)+(delta?' · Diferença: '+esc(delta):'')+'</small>'+(r.instruction?'<p>'+esc(r.instruction)+'</p>':'')+'</li>';
      }).join('')+'</ol></div>';
    }
    return {compare:compare,render:render};
  }
  root.MT_CORRIDA_ANALISE = Object.assign({runtime:runtime},runtime());
  if (typeof module === 'object' && module.exports) module.exports = root.MT_CORRIDA_ANALISE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
