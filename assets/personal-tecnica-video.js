(function(root){'use strict';
 var ui=null,installed=false,generation=0,unsubscribe=null;
 function dispose(){generation++;if(unsubscribe){unsubscribe();unsubscribe=null;}if(ui){ui.destroy();ui=null;}}
 function demoCloud(cloud){try{return localStorage.getItem('mtapp:ptDemo')==='1'&&localStorage.getItem('mtapp:ptDemoNuvem')==='1'&&cloud&&cloud.aid==='demo-studio'&&root.__demoNuvem&&cloud.client===root.__demoNuvem.cliente;}catch(_){return false;}}
 function owner(){try{return JSON.parse(localStorage.getItem('mtsync:identidade'))||{};}catch(_){return {};}}
 async function open(studentId){
  dispose();var tick=generation,S=root.MTStore,cloud=S&&S.cloud&&S.cloud(),demo=!!demoCloud(cloud);
  if(!demo&&(!cloud||!cloud.client||!cloud.aid)){alert('Entre na sua conta para consultar vídeos privados.');return;}
  var client=cloud&&cloud.client,aid=cloud&&cloud.aid,session=!demo&&client&&client.auth&&await client.auth.getSession(),user=session&&!session.error&&session.data&&session.data.session&&session.data.session.user;
  if(tick!==generation)return;
  if(!demo&&!user){alert('Entre novamente na sua conta.');return;}
  var own=owner();if(!demo&&(own.user_id!==user.id||own.academia_id!==aid)){alert('Aguarde a sincronização da sua conta e abra o aluno novamente.');return;}
  var state=S&&S.read('ptStudio',{}),student=state&&(state.alunos||[]).find(function(a){return a.id===studentId;});
  if(!student||!student.appTokenP){alert('Publique o app deste aluno para receber vídeos de execução.');return;}
  var identity=user&&user.id,token=student.appTokenP;
  function current(){if(tick!==generation)return false;var c=S.cloud(),s=S.read('ptStudio',{}),a=(s.alunos||[]).find(function(a){return a.id===studentId;}),o=owner();return !!(c&&c.client===client&&c.aid===aid&&a&&a.appTokenP===token&&(demo?demoCloud(c):o.user_id===identity&&o.academia_id===aid));}
  if(!current())return;
  if(!demo&&typeof client.auth.onAuthStateChange==='function'){var sub=client.auth.onAuthStateChange(function(event,s){if(event==='SIGNED_OUT'||s&&s.user&&s.user.id!==identity)dispose();});unsubscribe=function(){var subscription=sub&&sub.data&&sub.data.subscription;if(subscription)subscription.unsubscribe();};}
  if(!current())return;
  ui=root.MT_TECNICA_VIDEO.runtime({personal:true,token:token,academia:aid,url:client&&client.supabaseUrl,key:client&&client.supabaseKey,demo:demo,isCurrent:current,auth:async function(){var x=await client.auth.getSession(),s=x.data&&x.data.session;if(x.error||!current()||!s||s.user.id!==identity){dispose();throw Error('A conta mudou. Abra a análise novamente.');}return s.access_token;}});
  await ui.open();
 }
 function init(){if(installed)return;installed=true;root.addEventListener('mt:conta-divergente',dispose);root.addEventListener('storage',function(e){if(e.key==='mtsync:identidade'||e.key==='mtapp:ptStudio'||e.key==='mtapp:ptDemo')dispose();});document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-tecnica-aluno],#pfTecnicaVideo');if(!b)return;var id=b.dataset.tecnicaAluno||(root.__perfilAtualPT&&root.__perfilAtualPT());open(id).catch(function(){alert('Não foi possível abrir as análises agora. Tente novamente.');});});}
 root.MT_PERSONAL_TECNICA={init:init,open:open,destroy:dispose};
})(window);
