/* Training Center Database v2 Workouts. Arquivo de prescrição, não atividade
 * concluída. Não promete importação por serviços que só aceitam Activities. */
(function (root) {
  'use strict';
  function runtime() {
    function xml(v) { return String(v==null?'':v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c];}); }
    function short(v) { return String(v||'Treino').replace(/\s+/g,' ').trim().slice(0,15); }
    function tcx(plan) {
      plan=plan||{};
      var blocks=plan.bl || plan.blocos, notes=[], name=String(plan.n||plan.nome||'Treino Torque');
      if(!Array.isArray(blocks)||!blocks.length)throw new Error('Escolha um treino com etapas de tempo ou distância.');
      if(blocks.length>20)throw new Error('O formato TCX aceita até 20 etapas expandidas. Este treino tem '+blocks.length+'. A prescrição original foi mantida.');
      var steps=blocks.map(function(b,i){
        var s=b.s||0,k=b.km||0;
        if(typeof s!=='number'||typeof k!=='number'||!Number.isFinite(s)||!Number.isFinite(k)||s<0||k<0||(!s&&!k))throw new Error('Etapa '+(i+1)+': informe tempo ou distância.');
        if(s&&k)throw new Error('Etapa '+(i+1)+': TCX exige um único critério de término. Escolha tempo ou distância no plano.');
        var amount=s||k*1000;
        if(!Number.isInteger(amount)||amount<1||amount>65535)throw new Error('Etapa '+(i+1)+': TCX aceita de 1 a 65535 segundos ou metros inteiros.');
        notes.push((i+1)+'. '+String(b.n||'Etapa')+(b.d?' — '+b.d:''));
        return '<Step xsi:type="Step_t"><StepId>'+(i+1)+'</StepId><Name>'+xml(short(b.n))+'</Name><Duration xsi:type="'+(s?'Time_t':'Distance_t')+'"><'+(s?'Seconds':'Meters')+'>'+amount+'</'+(s?'Seconds':'Meters')+'></Duration><Intensity>'+(['l','vc','aq'].includes(b.k)?'Resting':'Active')+'</Intensity><Target xsi:type="None_t"/></Step>';
      });
      var mod=plan.m||plan.mod, sport=mod==='bike'?'Biking':mod==='corrida'?'Running':'Other';
      var text='<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Workouts><Workout Sport="'+sport+'"><Name>'+xml(short(name))+'</Name>'+steps.join('')+'<Notes>'+xml(name+'\n'+notes.join('\n')+'\nZonas e esforço estão nas instruções; não foram convertidos em alertas do relógio.')+'</Notes></Workout></Workouts></TrainingCenterDatabase>';
      return {text:text,filename:(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'treino')+'.tcx',mime:'application/vnd.garmin.tcx+xml',warning:'TCX de treino estruturado. Confira se seu dispositivo aceita Workouts; zonas e esforço seguem nas instruções, sem alertas automáticos.'};
    }
    function download(plan,host) {
      host=host||window;var file=tcx(plan),url=host.URL.createObjectURL(new host.Blob([file.text],{type:file.mime})),a=host.document.createElement('a');
      a.href=url;a.download=file.filename;host.document.body.appendChild(a);a.click();a.remove();host.setTimeout(function(){host.URL.revokeObjectURL(url);},1000);return file;
    }
    return {tcx:tcx,download:download};
  }
  function student(C,A,E) {
    function render() {
      if(!C.active())return;
      document.querySelectorAll('[data-cbstart]').forEach(function(b){if(b.parentElement.querySelector('[data-cr-export]'))return;var exp=document.createElement('button');exp.type='button';exp.className='btn sec';exp.dataset.crExport=b.dataset.cbstart;exp.textContent='Exportar etapas';exp.style.cssText='margin-top:8px;min-height:44px';b.insertAdjacentElement('afterend',exp);});
      var host=document.getElementById('crHist');if(!host||host.querySelector('[data-cr-analysis-list]'))return;
      var box=document.createElement('div');box.dataset.crAnalysisList='1';
      (C.records()||[]).slice(-5).reverse().forEach(function(r){var d=document.createElement('details'),s=document.createElement('summary');s.textContent=(r.d||'')+' · '+(r.n||'Corrida')+' — comparar etapas';s.style.cssText='padding:12px 0;cursor:pointer';d.appendChild(s);var body=document.createElement('div');body.innerHTML=A.render(r,C.snapshot?C.snapshot(r.id):null);d.appendChild(body);box.appendChild(d);});host.appendChild(box);
    }
    function click(e){var b=e.target.closest('[data-cr-export]');if(!b||!C.active())return;var p=(C.plans()||[]).find(function(x){return String(x.id)===b.dataset.crExport;});if(!p)return;try{var file=E.tcx(p);if(!window.confirm(file.warning+'\n\nBaixar arquivo?'))return;E.download(p);}catch(err){window.alert(err.message);}}
    document.addEventListener('click',click);render();return {render:render,dispose:function(){document.removeEventListener('click',click);}};
  }
  root.MT_CORRIDA_EXPORT=Object.assign({runtime:runtime,student:student},runtime());
  if(typeof module==='object'&&module.exports)module.exports=root.MT_CORRIDA_EXPORT;
})(typeof globalThis!=='undefined'?globalThis:this);
