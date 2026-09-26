/* Saúde, histórico e acessos. Dados reais apenas da conta ativa; sem envios externos. */
(function(root){
  'use strict';
  var S=root.MTStore,host=document.getElementById('ptConfiabilidade');if(!S||!host)return;
  function el(tag,text,cls){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(text,fn){var b=el('button',text,'btn sec mini');b.type='button';b.onclick=async function(){b.disabled=true;try{await fn();}catch(e){status.textContent=e.message||'Não foi possível concluir. Tente novamente.';}finally{b.disabled=false;}};return b;}
  function section(title){var d=el('details');d.style.marginTop='14px';d.appendChild(el('summary',title));host.appendChild(d);return d;}
  function stamp(s){var d=new Date(s);return isNaN(d.getTime())?'Data indisponível':d.toLocaleString('pt-BR');}
  function cloud(){var c=S.cloud();if(!c)throw Error('Entre na sua conta para consultar a nuvem.');return c;}
  function identity(){return localStorage.getItem('mtsync:identidade')||'';}
  function ensure(c,id){var now=S.cloud();if(!now||now.client!==c.client||now.aid!==c.aid||identity()!==id)throw Error('A conta mudou. Consulte novamente.');}
  var status=el('p','','muted');status.id='ptConfiabilidadeStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  host.appendChild(el('h3','Segurança e manutenção'));host.appendChild(status);
  var health=el('p','','muted');health.id='ptSaude';host.appendChild(health);
  var actions=el('div',undefined,'linha-flex');actions.style.cssText='gap:8px;flex-wrap:wrap';host.appendChild(actions);
  actions.appendChild(button('Conferir sincronização',async function(){await S.sincronizaAgora();renderHealth();}));
  actions.appendChild(button('Baixar diagnóstico',function(){
    var info=S.saude(),data={versao:root.MT_VERSAO||'indisponivel',gerado:new Date().toISOString(),online:navigator.onLine,
      navegador:navigator.userAgent,sincronizacao:info};
    var url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');
    a.href=url;a.download='torque-diagnostico.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},60000);
  }));
  function renderHealth(){
    var h=S.saude(),problems=Object.keys(h.falhas||{}),text;
    if(!h.ativa)text='Dados neste aparelho. Entre na conta para conferir a nuvem.';
    else if(h.conflitos)text='Há um conflito para revisar. O rascunho local foi preservado.';
    else if(problems.length)text='Atenção: falha em '+problems.map(function(k){return {sincronizacao:'salvar na nuvem',consulta:'consultar a nuvem',publicacao:'publicar o app'}[k]||k;}).join(', ')+'. Confira a conexão e tente novamente.';
    else if(h.pendentes)text=h.pendentes+' alteração(ões) aguardando confirmação'+(h.desde&&Date.now()-h.desde>=60000?' há mais de um minuto. Mantenha esta página aberta e confira a conexão.':'.');
    else if(!h.reconciliou)text='Conferindo os dados da conta…';
    else text='Sincronização confirmada'+(h.ultima?' em '+stamp(h.ultima):'')+'.';
    health.textContent=text;health.setAttribute('role',problems.length||h.conflitos?'alert':'status');
  }
  root.addEventListener('mt:sync-saude',renderHealth);root.addEventListener('online',renderHealth);root.addEventListener('offline',renderHealth);
  setInterval(function(){if(!document.hidden)renderHealth();},15000);renderHealth();

  var devices=section('Aparelhos conectados'),deviceList=el('div');
  devices.appendChild(el('p','Veja as sessões da sua conta. O navegador pode identificar vários aparelhos com o mesmo nome.','muted'));
  async function loadDevices(){
    var c=cloud(),id=identity(),r=await c.client.rpc('personal_sessoes');ensure(c,id);if(r.error)throw Error('Não foi possível consultar as sessões.');
    deviceList.replaceChildren();
    if(!Array.isArray(r.data)||!r.data.length){deviceList.appendChild(el('p','Nenhuma sessão ativa foi confirmada. Entre novamente.'));return;}
    r.data.forEach(function(x){var p=el('p');p.appendChild(el('strong',x.atual?'Este aparelho':'Outra sessão'));p.appendChild(el('br'));p.appendChild(el('span',(x.navegador||'Navegador não informado')+' · Última atualização: '+stamp(x.atualizada_em||x.criada_em)));deviceList.appendChild(p);});
  }
  devices.appendChild(button('Consultar aparelhos',loadDevices));
  devices.appendChild(button('Sair dos outros aparelhos',async function(){
    var c=cloud(),id=identity();
    if(!confirm('Encerrar as outras sessões da SUA conta? Este aparelho continuará conectado.'))return;
    var r=await c.client.auth.signOut({scope:'others'});ensure(c,id);if(r.error)throw Error('A nuvem não confirmou o encerramento.');
    status.textContent='Outras sessões encerradas. Novas consultas do painel serão bloqueadas. Outros serviços podem aceitar o acesso anterior até ele expirar.';
    await loadDevices();
  }));devices.appendChild(deviceList);

  var access=section('Acessos dos alunos'),students=el('select');students.id='ptSegAluno';students.setAttribute('aria-label','Aluno para revisar acesso');students.style.cssText='width:100%;margin:10px 0;max-width:460px';
  var accessInfo=el('p','','muted');
  function fillStudents(){
    var old=students.value;students.replaceChildren();var option=el('option','Selecione um aluno');option.value='';students.appendChild(option);
    ((S.read('ptStudio',{})||{}).alunos||[]).filter(function(a){return a.appTokenP;}).forEach(function(a){var o=el('option',(a.nome||'Aluno sem nome')+(a.appRevogadoEm?' · acesso revogado':''));o.value=a.id;students.appendChild(o);});students.value=old;
  }
  access.addEventListener('toggle',function(){if(access.open)fillStudents();});access.appendChild(students);
  access.appendChild(button('Conferir último acesso',async function(){
    var a=((S.read('ptStudio',{})||{}).alunos||[]).find(function(x){return x.id===students.value;});if(!a)throw Error('Selecione um aluno.');
    if(a.appRevogadoEm){accessInfo.textContent='Acesso revogado em '+a.appRevogadoEm+'.';return;}
    var c=cloud(),id=identity(),r=await c.client.rpc('app_alunos_vistos',{p_tokens:[a.appTokenP]});ensure(c,id);
    if(r.error)throw Error('Não foi possível conferir o acesso.');
    var x=(r.data||[]).find(function(v){return v.token===a.appTokenP;});
    accessInfo.textContent=x&&x.visto_em?'Último acesso registrado: '+stamp(x.visto_em)+'. O registro é periódico, não acompanha cada abertura.':'Nenhum acesso confirmado nesta consulta.';
  }));
  access.appendChild(button('Revogar acesso do aluno',async function(){
    var a=((S.read('ptStudio',{})||{}).alunos||[]).find(function(x){return x.id===students.value;});if(!a)throw Error('Selecione um aluno.');
    if(!confirm('Revogar o acesso de '+(a.nome||'este aluno')+'? O link e o login serão bloqueados na nuvem. O histórico de treinos será preservado.'))return;
    await S.revogaAcessoSeguro(a.id);fillStudents();accessInfo.textContent='Acesso revogado e registrado no histórico. Cópias já baixadas podem continuar no aparelho do aluno.';
  }));access.appendChild(accessInfo);

  var history=section('Histórico de alterações'),list=el('div'),more,offset=0,historyIdentity='';
  history.appendChild(el('p','Alterações registradas a partir desta atualização. Recupere um item somente se ele não tiver mudado de novo. Apps já publicados precisam ser publicados novamente.','muted'));
  function label(path){var st=S.read('ptStudio',{})||{},id=path[1],a=(st.alunos||[]).find(function(x){return x.id===id;});return path[0]==='alunos'?'Cadastro · '+(a&&a.nome||id||'lista de alunos'):path[0]==='treinosV2'?'Treino · '+(a&&a.nome||id)+(path[3]?' · ficha '+path[3]:''):'Configuração · '+path.join(' / ');}
  function masked(v){if(!v||typeof v!=='object')return v;if(Array.isArray(v))return v.map(masked);var o={};Object.keys(v).forEach(function(k){o[k]=/token|senha|secret|api.?key/i.test(k)?'[oculto]':masked(v[k]);});return o;}
  function historyItem(row,c,id){
    var item=el('details');item.style.cssText='padding:10px 0;border-bottom:1px solid var(--tk-bd4)';
    item.appendChild(el('summary',label(row.caminho)+' · '+stamp(row.criado_em)));
    item.appendChild(el('p',(row.autor_nome||row.autor_id||'Sistema')+(row.origem==='restauracao'?' · recuperação':' · edição'),'muted'));
    var detail=el('div');item.appendChild(detail);
    item.appendChild(button('Ver antes e depois',async function(){
      ensure(c,id);var r=await c.client.from('personal_alteracoes').select('antes,depois').eq('academia_id',c.aid).eq('id',row.id).single();ensure(c,id);
      if(r.error||!r.data)throw Error('Não foi possível abrir esta alteração.');detail.replaceChildren();
      ['antes','depois'].forEach(function(k){detail.appendChild(el('strong',k==='antes'?'Antes':'Depois'));var pre=el('pre',JSON.stringify(masked(r.data[k]),null,2));pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;font-size:12px';detail.appendChild(pre);});
    }));
    item.appendChild(button('Recuperar este item',async function(){
      ensure(c,id);if(!confirm('Recuperar a versão anterior de '+label(row.caminho)+'? Se houver uma edição posterior neste item, a recuperação será recusada.'))return;
      await S.restauraAlteracao(row.id);status.textContent='Item recuperado e nova alteração registrada. Confira o resultado antes de republicar o app.';await loadHistory(true);
    }));return item;
  }
  async function loadHistory(reset){
    var c=cloud(),id=identity();if(reset||historyIdentity!==id){offset=0;list.replaceChildren();historyIdentity=id;}
    var r=await c.client.from('personal_alteracoes').select('id,autor_id,autor_nome,criado_em,caminho,origem').eq('academia_id',c.aid).order('criado_em',{ascending:false}).order('id',{ascending:false}).range(offset,offset+29);ensure(c,id);
    if(r.error||!Array.isArray(r.data))throw Error('Não foi possível consultar o histórico.');
    if(!offset&&!r.data.length)list.appendChild(el('p','Nenhuma alteração registrada após esta atualização.'));
    r.data.forEach(function(row){list.appendChild(historyItem(row,c,id));});offset+=r.data.length;more.hidden=r.data.length<30;
  }
  history.appendChild(button('Consultar histórico',function(){return loadHistory(true);}));history.appendChild(list);more=button('Carregar mais',function(){return loadHistory(false);});more.hidden=true;history.appendChild(more);

  var copies=section('Cópias anteriores à restauração'),copiesList=el('div');
  copies.appendChild(el('p','Antes de restaurar um arquivo, os dados e imagens atuais são preservados neste aparelho. Baixe uma cópia para guardá-la fora do navegador.','muted'));
  copies.appendChild(button('Consultar cópias preservadas',async function(){
    var id=identity(),rows=await S.copiasAnteriores();if(identity()!==id)throw Error('A conta mudou. Consulte novamente.');copiesList.replaceChildren();
    if(!rows.length)copiesList.appendChild(el('p','Nenhuma restauração foi realizada neste aparelho.'));
    rows.forEach(function(row){copiesList.appendChild(button('Baixar cópia de '+stamp(row.em),function(){if(identity()!==id)throw Error('A conta mudou.');return S.copiasAnteriores(row.id);}));});
  }));copies.appendChild(copiesList);
  root.addEventListener('mt:sessao-caiu',function(){deviceList.replaceChildren();list.replaceChildren();copiesList.replaceChildren();students.replaceChildren();accessInfo.textContent='';status.textContent='Entre novamente para consultar esta conta.';});
})(window);
