// These statuses describe this client's observations, not production health or
// successful delivery by an external integration.
export function settingsDiagnostics({state,databaseConfigured=false,queueCount=0}){
 const reading=state.demo?['demo','Demonstração','Os dados desta sessão são fictícios.']:state.loadError?['error','Falha na atualização','A última leitura completa foi preservada. Atualize antes de tomar decisões.']:state.loading?['pending','Atualizando','Aguarde a conclusão da leitura dos dados.']:state.offline?['pending','Última leitura salva','Sem leitura atual do servidor. Reconecte para atualizar os dados.']:databaseConfigured&&state.user&&state.clinic?.id?['available','Dados da sessão carregados','Esta é a leitura disponível nesta sessão; não comprova convites, recuperação ou integrações externas.']:['unconfigured','Acesso pendente','Entre na sua conta para carregar o consultório.'];
 const row=(id,title,stateCode,label,description)=>({id,title,state:stateCode,label,description});
 return [
  row('reading','Leitura do consultório',...reading),
  row('queue','Ações aguardando sincronização',queueCount?'pending':'available',queueCount?`${queueCount} ações na fila`:'Nenhuma ação na fila','A contagem refere-se à conta atual neste aparelho. Sincronizar a fila não confirma o recebimento de pagamentos.'),
  row('auth','Convite, confirmação e recuperação','pending','Validação necessária','Teste com contas próprias de teste se os links abrem o Torque Nutri e se a recuperação chega ao e-mail correto.'),
  row('manual-finance','Controle financeiro administrativo',state.demo?'demo':state.financeLedger?.available?'available':'pending',state.demo?'Demonstração':state.financeLedger?.available?'Recursos administrativos carregados':'Recursos avançados pendentes','Baixas manuais registram o que a profissional conferiu. Pagamentos, devoluções e pacotes têm suas próprias regras e histórico.'),
  row('gateway','Pix, cartão e repasses online','unconfigured','Não ativado','Recebedor, provedor e confirmação automática ainda precisam de contratação e homologação. Links externos não confirmam pagamento no Torque.'),
  row('messages','WhatsApp, e-mail e notificações externas','unconfigured','Não ativado','As regras do consultório preparam providências para revisão. O envio externo e as notificações com o app fechado exigem integração própria.'),
  row('ai','IA para prescrição','unconfigured','Não ativada','Prepare e revise o plano manualmente. Uma futura proposta de IA precisará de confirmação profissional.'),
  row('saas','Assinatura Torque','unconfigured','Cobrança automática não configurada','A assinatura do software é separada dos pagamentos dos pacientes.'),
  row('team','Equipe e prontuários','pending','Cadastro administrativo','Cadastrar cargo ou contato não concede acesso clínico. Funções e permissões por paciente precisam de configuração específica.'),
  row('page','Página profissional','pending','Prévia privada','A prévia disponível no consultório não é uma página pública. A publicação exige endereço externo verificável.')
 ];
}
export function createSettings(H,P){
 const {state,esc,heading,run,render}=H,q=selector=>document.querySelector(selector);
 function view(){
  const s=state(),pro=s.role==='nutri';let preference={};try{preference=JSON.parse(localStorage.getItem('torque-nutri-preferences')||'{}');}catch{}
  const section=(title,body,search='')=>`<section data-settings-section data-settings-keywords="${esc(title+' '+search)}">${P.card(title,body)}</section>`;
  let html=heading('Conta e plataforma',pro?'Configurações':'Ajustes e dados',pro?'Acesso, leitura dos dados e recursos do consultório.':'Seus ajustes de leitura e seus dados.')+`<label class="search">Buscar configuração<input id="settings-search" type="search" placeholder="Ex.: acesso, pagamentos ou texto maior"></label><p id="settings-empty" class="sub" hidden>Nenhuma configuração encontrada.</p>`;
  html+=section('Preferências',`<form id="x-preferences"><label class="check-label"><input id="x-large" type="checkbox" ${preference.large?'checked':''}> Texto maior</label><label class="check-label"><input id="x-water-reminder" type="checkbox" ${preference.waterReminder?'checked':''}> Mostrar lembrete de água ao abrir o app</label><button class="btn primary">Salvar ajustes</button></form><div class="actions">${P.btn('Alternar tema','theme')}${P.btn('Instalar aplicativo','install-app')}</div>`,'texto maior leitura água tema instalar');
  const status=settingsDiagnostics({state:s,databaseConfigured:!!H.database(),queueCount:H.queueCount()});
  const read=status.find(x=>x.id==='reading');
  html+=section('Dados e histórico',`<p class="sub">Exporte uma cópia dos dados disponíveis para sua conta, com data e versão do formato.</p><div class="actions">${P.btn('Baixar meus dados','export-data')}${pro?P.btn('Importar pacientes','import-patients'):''}</div><p><b>${esc(read.label)}</b></p><p class="sub">${esc(read.description)}</p><p id="offline-queue-count" class="sub"></p><div class="actions">${P.btn('Sincronizar fila','sync-queue')}${!s.demo?'<button class="btn ghost" data-settings-refresh>Atualizar leitura</button>':''}</div>`,'backup exportar importar offline conexão sincronização fila');
  if(pro){
   html+=section('Recursos e integrações',`<p class="sub">Os estados abaixo descrevem o que esta sessão pode observar. Configuração salva e conexão disponível não comprovam que uma integração foi homologada.</p>${status.filter(x=>!['reading','queue'].includes(x.id)).map(x=>`<details data-settings-section data-settings-keywords="${esc(x.title+' '+x.label+' '+x.description)}"><summary><b>${esc(x.title)}</b> · ${esc(x.label)}</summary><p class="sub">${esc(x.description)}</p></details>`).join('')}`,'cobrança Pix cartão financeiro acesso convite recuperação equipe integração IA assinatura repasse página');
   const ready=!s.loading&&!s.loadError&&!s.offline;
   const items=[['Cadastro de pacientes',(s.patients||[]).length>0,'patients','Confira os dados e o e-mail antes de convidar.'],['Contexto nutricional',(s.records||[]).some(x=>x.kind==='anamnesis'&&!x.data?.archived),'patients','Registre a anamnese e abra a consulta pela ficha.'],['Prescrição revisada',(s.plans||[]).some(x=>x.status==='published'),'plans','Salvar rascunho e publicar a prescrição são ações separadas.'],['Revisão do acompanhamento',false,'operations','Abra diário, questionários e retornos sugeridos na fila.']];
   html+=section('Primeiros passos',`<p class="sub">Use este roteiro para organizar o consultório. ${s.demo?'Os exemplos abaixo pertencem à demonstração.':!ready?'Atualize a leitura para conferir os registros disponíveis.':'As indicações consideram os registros carregados nesta sessão.'}</p>${items.map(([title,has,page,description])=>`<div class="patient-row"><div class="grow"><b>${title}</b><small>${ready&&has?'Há registro nesta sessão. ':''}${description}</small></div><button class="btn small ghost" data-page="${page}">Abrir</button></div>`).join('')}`,'começar ajuda anamnese rascunho plano publicar diário questionários retorno');
  }
  html+=section('Ajuda contextual',`<p class="sub">Consulte os passos de convite, rascunho e publicação, diário e pagamentos.</p><button class="btn ghost" data-page="support">Abrir ajuda</button>`,'suporte ajuda convite diário pagamentos');
  return html;
 }
 function bind(){
  const input=q('#settings-search');if(input)input.oninput=()=>{
   const term=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),sections=[...document.querySelectorAll('[data-settings-section]')];
   for(const section of sections){const label=(section.dataset.settingsKeywords||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();section.hidden=!!term&&!label.includes(term);if(section.tagName==='DETAILS')section.open=!!term&&!section.hidden;}
   // A child match keeps its enclosing resource section visible.
   for(const section of sections)if(!section.hidden){const parent=section.parentElement?.closest('[data-settings-section]');if(parent)parent.hidden=false;}
   const empty=q('#settings-empty');if(empty)empty.hidden=sections.some(section=>!section.hidden);
  };
  document.querySelectorAll('[data-settings-refresh]').forEach(button=>button.onclick=()=>run(async()=>{await H.loadData();render();}));
 }
 return {view,bind};
}
