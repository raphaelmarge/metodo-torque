/* Saúde é opt-in por aluno e categoria. Não solicita autorização no boot e
 * nenhum dado do sistema é lido sem consentimento local vigente. */
(function(root){
  'use strict';
  function runtime(){
    var KINDS=['workouts','steps','sleep'];
    function create(C){
      if(!C||!C.scope||typeof C.active!=='function'||!C.storage)throw new Error('Escopo de saúde ausente.');
      var key='tqHealth:v2:'+encodeURIComponent(C.scope),epoch=0,busy=false,sessionEnabled=true;
      function deadline(p,ms){var timer;return Promise.race([p,new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error('A conexão de saúde demorou para responder. Tente novamente.'));},ms||30000);})]).finally(function(){clearTimeout(timer);});}
      function active(){if(!C.active())throw new Error('O acesso mudou. Reabra seu aplicativo.');}
      function read(){active();var raw=C.storage.getItem(key);if(!raw)return {v:2,enabled:[],records:{},applied:{},last:null};var d=JSON.parse(raw);if(!d||d.v!==2||!Array.isArray(d.enabled)||d.enabled.some(function(k){return !KINDS.includes(k);})||!d.records||typeof d.records!=='object'||Array.isArray(d.records)||!d.applied||typeof d.applied!=='object'||Array.isArray(d.applied))throw new Error('Registro de saúde inválido. Seus dados foram preservados.');return d;}
      function save(d){active();var text=JSON.stringify(d);C.storage.setItem(key,text);if(C.storage.getItem(key)!==text)throw new Error('Não foi possível salvar os dados de saúde.');if(C.changed)C.changed();}
      function current(e){active();if(e!==epoch||!sessionEnabled)throw new Error('Sincronização interrompida.');}
      async function capabilities(){active();if(!C.provider)return {available:false,kinds:[],reason:'A sincronização de saúde precisa da versão nativa compatível. No navegador, importe seu treino em GPX ou TCX.'};try{var v=await deadline(C.provider.capabilities());active();return {available:v.available===true,kinds:(v.kinds||[]).filter(function(k){return KINDS.includes(k);}),platform:v.platform||'',reason:v.reason||''};}catch(_){return {available:false,kinds:[],reason:'Não foi possível consultar a conexão de saúde.'};}}
      async function connect(kinds){
        active();var e=++epoch;sessionEnabled=true;var cap=await capabilities();current(e);if(!cap.available)throw new Error(cap.reason||'Saúde indisponível.');
        var selected=Array.from(new Set(kinds||[]));if(!selected.length||selected.some(function(k){return !cap.kinds.includes(k);}))throw new Error('Escolha somente os dados disponíveis que deseja conectar.');
        var request=await deadline(C.provider.request({read:selected,write:[]}),120000);current(e);if(request&&request.requested===false)throw new Error('O pedido de acesso não foi concluído. Tente conectar novamente.');
        var d=read();d.enabled=selected;d.connected=new Date().toISOString();save(d);return {requested:true,platform:cap.platform};
      }
      function date(v){var d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null;}
      function normalize(x){
        if(!x||!KINDS.includes(x.kind)||typeof x.id!=='string'||!x.id||x.id.length>300||typeof x.source!=='string'||!x.source||x.source.length>150)return null;
        var start=date(x.start),end=date(x.end);if(!start||!end||end<start)return null;
        var suppliedDay=typeof x.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.day)&&date(x.day+'T12:00:00Z')&&date(x.day+'T12:00:00Z').slice(0,10)===x.day?x.day:null;
        var base={id:x.id,source:x.source,kind:x.kind,start:start,end:end,day:suppliedDay||start.slice(0,10)};
        if(x.kind==='workouts'){
          if(!['corrida','caminhada','bike'].includes(x.mod)||typeof x.seconds!=='number'||!Number.isFinite(x.seconds)||x.seconds<=0||x.seconds>604800)return null;
          base.mod=x.mod;base.seconds=x.seconds;base.meters=typeof x.meters==='number'&&Number.isFinite(x.meters)&&x.meters>=0?x.meters:null;base.name=String(x.name||'Do relógio').slice(0,160);base.timeBasis=x.timeBasis==='elapsed'?'elapsed':'device';
        }else{
          if(typeof x.value!=='number'||!Number.isFinite(x.value)||x.value<0||x.value>(x.kind==='steps'?200000:86400))return null;
          // Totals must already be aggregated by the OS; raw overlapping
          // sources are never summed by the web client.
          if(x.aggregate!==true)return null;base.value=x.value;base.aggregate=true;
        }
        return base;
      }
      async function sync(){
        active();if(busy)return {busy:true};var d=read();if(!sessionEnabled||!d.enabled.length)return {connected:false};busy=true;var e=epoch;
        try{
          var cap=await capabilities();current(e);if(!cap.available)throw new Error(cap.reason||'Saúde indisponível.');
          var permissions=await deadline(C.provider.permissions({read:d.enabled}));current(e);
          var allowed=d.enabled.filter(function(k){return cap.kinds.includes(k)&&permissions&&(permissions[k]==='granted'||(cap.platform==='ios'&&permissions[k]==='unknown'));});
          if(!allowed.length)return {denied:true,count:0};
          var now=new Date(),since=new Date(now.getTime()-7*86400000).toISOString();
          var response=await deadline(C.provider.read({kinds:allowed,start:since,end:now.toISOString()}));current(e);
          if(!response||!Array.isArray(response.records)||response.records.length>10000||response.truncated)throw new Error('A leitura ficou incompleta. Tente sincronizar novamente.');
          var count=0;response.records.forEach(function(raw){var x=normalize(raw);if(!x||!allowed.includes(x.kind))return;var id=JSON.stringify([x.source,x.kind,x.id]);if(JSON.stringify(d.records[id])!==JSON.stringify(x)){d.records[id]=x;count++;}});
          d.last=now.toISOString();save(d);
          // Stable provider identity makes replay safe after a quota failure,
          // partial callback or app interruption between these two writes.
          if(C.importWorkout){for(var id of Object.keys(d.records)){current(e);var item=d.records[id];if(!item||item.kind!=='workouts'||!allowed.includes('workouts'))continue;var fingerprint=JSON.stringify(item);if(d.applied[id]===fingerprint)continue;var pace=item.meters>0?Math.round(item.seconds/(item.meters/1000)):null;var result=await C.importWorkout({id:'health:'+id,d:item.day,n:item.name,m:item.mod,s:item.seconds,k:item.meters==null?null:item.meters/1000,p:pace!=null?Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0'):null,origem:'saude',healthSource:item.source,healthId:item.id,healthStart:item.start,tempoBase:item.timeBasis==='elapsed'?'decorrido':'dispositivo'});current(e);if(result!==true)throw new Error('Leitura salva; falta concluir a importação do treino. Tente sincronizar novamente.');d.applied[id]=fingerprint;save(d);}}
          return {count:count,last:d.last,readStatus:cap.platform==='ios'?'unknown':'checked'};
        }finally{busy=false;}
      }
      async function disconnect(){active();epoch++;sessionEnabled=false;var d=read();d.enabled=[];save(d);return {systemPermissions:'unchanged'};}
      function clear(){active();epoch++;sessionEnabled=false;C.storage.removeItem(key);if(C.storage.getItem(key)!==null)throw new Error('Não foi possível apagar a cópia local de saúde.');if(C.changed)C.changed();}
      function snapshot(){var d=read();return {enabled:d.enabled.slice(),last:d.last,records:Object.values(d.records).filter(function(x){return x&&d.enabled.includes(x.kind);})};}
      function settings(){active();return C.provider&&C.provider.settings?C.provider.settings():Promise.resolve(false);}
      return {capabilities:capabilities,connect:connect,sync:sync,disconnect:disconnect,clear:clear,snapshot:snapshot,settings:settings,normalize:normalize};
    }
    function provider(host){
      host=host||window;var cap=host.Capacitor;
      if(!cap||!cap.isNativePlatform||!cap.isNativePlatform()||!cap.isPluginAvailable||!cap.isPluginAvailable('TorqueHealth'))return null;
      var native=cap.Plugins&&cap.Plugins.TorqueHealth;if(!native&&cap.registerPlugin)native=cap.registerPlugin('TorqueHealth');if(!native)return null;
      return {capabilities:function(){return native.capabilities();},request:function(o){return native.request(o);},permissions:function(o){return native.permissions(o);},read:function(o){return native.read(o);},settings:function(){return native.settings();}};
    }
    return {create:create,provider:provider};
  }
  function student(C,R){
    var host=document.getElementById('ajSaude');if(!host)return null;
    var service=R.create(C),panel=null;
    function node(tag,text,parent){var e=document.createElement(tag);if(text)e.textContent=text;if(parent)parent.appendChild(e);return e;}
    async function open(){
      if(!C.active())return;if(panel){panel.showModal();return;}
      panel=node('dialog',null,document.body);panel.style.cssText='width:min(520px,calc(100% - 24px));max-height:85dvh;box-sizing:border-box;overflow:auto;padding:22px;border:1px solid var(--bg11,#777);border-radius:18px;background:var(--bg,#14161c);color:var(--txt,inherit)';panel.setAttribute('aria-label','Relógio e saúde');
      node('h2','Relógio e saúde',panel);var info=node('p','Escolha o que quer trazer para o seu acompanhamento. A conexão é opcional.',panel),status=node('p','Consultando disponibilidade…',panel);status.setAttribute('role','status');
      var checks=node('div',null,panel),actions=node('div',null,panel);actions.style.cssText='display:grid;gap:10px';
      function button(label,fn){var b=node('button',label,actions);b.type='button';b.className='btn sec';b.style.minHeight='44px';b.onclick=async function(){b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;}
      var cap=await service.capabilities();if(!C.active()){panel.remove();panel=null;return;}status.textContent=cap.available?(cap.platform==='ios'?'A Apple não informa se a leitura foi negada. Se nada aparecer, confira suas permissões no app Saúde.':'Você pode alterar as permissões nos ajustes do aparelho.') : cap.reason;
      if(cap.available){var chosen=service.snapshot().enabled;[['workouts','Treinos de corrida, caminhada e bike'],['steps','Passos do dia'],['sleep','Duração do sono']].filter(function(k){return cap.kinds.includes(k[0]);}).forEach(function(k){var label=node('label',null,checks);label.style.cssText='display:flex;gap:12px;align-items:center;min-height:48px';var input=node('input',null,label);input.type='checkbox';input.value=k[0];input.checked=chosen.includes(k[0]);input.style.width='20px';node('span',k[1],label);});
        button('Conectar dados escolhidos',async function(){var selected=Array.from(checks.querySelectorAll('input:checked')).map(function(i){return i.value;});await service.connect(selected);status.textContent='Pedido enviado ao sistema. Toque em Sincronizar para consultar os dados disponíveis.';});
        button('Sincronizar agora',async function(){var r=await service.sync();status.textContent=r.denied?'A leitura não foi autorizada. Confira as permissões.':r.connected===false?'Escolha os dados e conecte primeiro.':r.busy?'Uma leitura já está em andamento.':r.count+' registro(s) atualizado(s).';show();});
        button('Permissões no aparelho',async function(){var result=await service.settings();if(!result||result.opened!==true)status.textContent='No iPhone, abra Saúde → seu perfil → Apps → TORQUE ON Aluno para alterar permissões.';});
        button('Desconectar',async function(){await service.disconnect();checks.querySelectorAll('input').forEach(function(i){i.checked=false;});status.textContent='Sincronização desativada neste aluno. Para retirar a permissão do sistema, use os ajustes de saúde do aparelho.';show();});
      }else{info.textContent='No navegador, você pode importar um treino exportado pelo relógio.';button('Importar GPX ou TCX',function(){panel.close();var input=document.getElementById('crImp');if(input)input.click();else status.textContent='Ative Corrida e bike no seu acompanhamento para importar.';});}
      var summary=node('div',null,panel);
      function show(){summary.replaceChildren();var s=service.snapshot(),items=s.records.filter(function(x){return x.kind==='steps'||x.kind==='sleep';}).sort(function(a,b){return b.day.localeCompare(a.day);}).slice(0,6);items.forEach(function(x){node('p',x.day+' · '+(x.kind==='steps'?x.value.toLocaleString('pt-BR')+' passos':Math.floor(x.value/3600)+' h '+Math.round(x.value%3600/60)+' min de sono'),summary);});}
      show();button('Apagar cópia local de saúde',function(){if(!window.confirm('Apagar os dados de saúde deste aluno neste aparelho? Treinos já importados permanecem no histórico.'))return;service.clear();status.textContent='Cópia local apagada. Treinos importados foram preservados.';show();});button('Fechar',function(){panel.close();});panel.addEventListener('close',function(){panel.remove();panel=null;});panel.showModal();
    }
    host.style.display='';host.onclick=open;var title=host.querySelector('.mgtit');if(title)title.textContent='Relógio e saúde';
    return {service:service,open:open,snapshot:service.snapshot};
  }
  root.MT_SAUDE_CONEXOES=Object.assign({runtime:runtime,student:student},runtime());
  if(typeof module==='object'&&module.exports)module.exports=root.MT_SAUDE_CONEXOES;
})(typeof globalThis!=='undefined'?globalThis:this);
