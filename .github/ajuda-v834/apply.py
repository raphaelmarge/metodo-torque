from pathlib import Path
import json, hashlib, subprocess
root=Path('.')
assert hashlib.sha256((root/'personal.html').read_bytes()).hexdigest()=='60d7ea1748e5ac22713fa6b5cf1f23cd4fde01541b434eaf96b912dfc5bfec5f', 'Fonte do Personal mudou'
extract="const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('personal.html','utf8'),c={};vm.runInNewContext(h.slice(h.indexOf('  function ajBt('),h.indexOf('  var ajAberto = null;')),c,{timeout:2000});process.stdout.write(JSON.stringify(c.AJUDA_PT));"
original=json.loads(subprocess.check_output(['node','-e',extract],text=True))
topics={t['id']:t for t in original}
def sub(t,*p,**kw): return dict(t=t,p=list(p),**kw)
def change(id,subs=None,**kw):
 topics[id].update(kw)
 if subs is not None: topics[id]['subs']=subs
 return topics[id]
def keep(id,n): return topics[id]['subs'][n]
def new(id,t,d,subs,k=''):
 topics[id]={'id':id,'t':t,'d':d,'ic':"<path d='M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'/>",'subs':subs,'k':k}
 return topics[id]
def guide(topic,label): return "<button type='button' class='btn sec mini' data-ajtopico='"+topic+"'>"+label+"</button>"
# A ajuda e as funções pertencem à mesma release; não é uma declaração de deploy.
new('novidades','Novidades e mudanças','O que mudou e onde encontrar cada recurso',[
 sub('Nesta versão: identidade e devoluções',
     '<b>mt-v834:</b> escolha o nome que aparece em destaque no app do aluno e registre cancelamentos e devoluções no Financeiro.',
     'O nome do personal abaixo da marca é <b>opcional e desligado por padrão</b>. Cancelamento e devolução continuam sendo operações diferentes; o aplicativo não transfere dinheiro.',
     guide('marca','Como escolher a identidade')+' '+guide('cancelamentos','Como cancelar e registrar uma devolução')),
 sub('Fluxo do dia e Aluno 360°',
     '<b>mt-v833:</b> o Início reúne Próxima melhor ação, Iniciar sessão, Busca universal e Automações. O Aluno 360° fica no Resumo da ficha.',
     'A sessão presencial permite registrar o atendimento pelo nome do aluno, inclusive com envio posterior quando estiver sem conexão. Os atalhos usam as áreas existentes, sem criar outra central.',
     guide('presencial','Como registrar uma sessão')),
 sub('Sincronização e retirada da Central Pro',
     '<b>mt-v832:</b> um salvamento sem alterações deixou de gerar uma pendência artificial. A recuperação da nuvem passou a preservar o rascunho antes de aplicar a versão atual.',
     'A Central Pro foi retirada do painel. A sessão presencial e as automações agora ficam integradas ao Início e à ficha; não procure esse menu antigo.',
     guide('sincronizacao','Resolver dúvidas de sincronização')),
 sub('Corrida por etapas e medalhas',
     '<b>mt-v827 a mt-v829:</b> a corrida aceita etapas com distâncias ou durações diferentes. As medalhas mostram o nível alcançado e o próximo objetivo, com visual em relevo.',
     'O personal escolhe as trilhas de medalhas e publica a seleção. As metas usam os registros disponíveis; não representam certificação de competições.',
     guide('treinos','Ver planejamento e corrida')+' '+guide('medalhas','Configurar medalhas')),
 sub('Planejamento, recebimentos e questionários',
     '<b>mt-v822 a mt-v826:</b> modalidade de atendimento separada da cobrança, calendário por data, várias atividades no dia e cópia de semanas com revisão dos destinos.',
     'Recebimentos ganharam edição e anulação com motivo e histórico. Questionários permitem editar modelos, ordenar perguntas e conferir a prévia sem alterar respostas já recebidas.',
     'As telas continuam organizadas nas áreas do Personal. Alterar um rascunho, salvar no painel e publicar para o aluno são etapas distintas.'),
 sub('Nutrição, entrada opcional e foto no topo',
     'A <b>Nutrição</b> está integrada ao Personal, com plano revisável e registros de alimentação. A entrada do aluno pode exigir ou dispensar questionário e contrato por aluno.',
     'O topo do app do aluno preserva a foto grande e os controles de treino. Há demonstrações com e sem cadastro inicial, sem alterar contas reais.',
     guide('nutricao','Usar a nutrição integrada')+' '+guide('quest','Configurar a entrada do aluno')),
], 'novidade novidades mudanças atualizações release versão mt-v834 mt-v833 mt-v832 dúvidas duvidas')
change('comeco',subs=[
 sub('O caminho inteiro em 4 passos',
     'Em <b>Alunos → + Novo aluno</b>, cadastre o aluno e confira nome, contato e e-mail. O e-mail será usado no acesso dele.',
     'Em <b>Treinos</b>, escolha esse aluno e monte uma ficha com os exercícios.',
     'Revise e use <b>Salvar e publicar</b>. Salvar apenas um rascunho não atualiza o app do aluno.',
     'No perfil, confira <b>App e acesso</b> e envie o acesso pelo fluxo disponível. Confirme a publicação e o envio antes de orientar o aluno a entrar.',fig=keep('comeco',0)['fig']),
 sub('O que precisa de conta e internet?',
     'O painel mantém dados locais neste aparelho. Para sincronizar com outro dispositivo, publicar para alunos ou usar serviços online, entre na sua conta.',
     'Use a <b>mesma conta e o mesmo espaço de trabalho</b> no computador e no celular. Registros em modo sem conta não aparecem automaticamente em outro aparelho.',
     'Sem internet, trabalhe somente com o que já estiver carregado e confira o resultado do salvamento. Não presuma que chat, IA, envio de convite ou cobrança funcionem offline.'),
 keep('comeco',2),
 sub('Onde encontro uma função?',
     'A <b>Busca universal</b> do topo encontra alunos, telas, exercícios, questionários e fichas pelo nome. Para orientações, use a busca desta <b>Ajuda / Dúvidas</b>.',
     'No celular, abra o menu para acessar as áreas que não aparecem na barra inferior. A navegação existente foi preservada; não é necessário procurar uma Central Pro.')
])
new('sincronizacao','Sincronização e atualizações','Computador, celular, rascunhos e versão da nuvem',[
 sub('Cadastrei no computador e não apareceu no celular',
     'Confirme a mesma conta e o mesmo espaço de trabalho nos dois aparelhos. Mantenha a conexão e confira se o salvamento no aparelho de origem terminou.',
     'No outro aparelho, abra o painel conectado e observe os avisos. Uma alteração no cadastro do Personal não é a mesma coisa que publicar o app do aluno.',
     'Se houver aviso de conflito, preserve o rascunho e siga a recuperação abaixo. <b>Não recrie o aluno</b> nem restaure um backup antigo para forçar a atualização.'),
 sub('Outro aparelho alterou este painel: o que fazer?',
     'O aviso existe para evitar que uma versão antiga substitua dados mais novos. Use <b>Salvar cópia do rascunho</b> para guardar o que está neste aparelho.',
     'Depois de conferir o que precisa preservar, use <b>Carregar versão da nuvem</b>. O sistema tenta guardar uma cópia do rascunho antes de aplicar os dados remotos.',
     'Carregar a nuvem <b>não combina automaticamente</b> todas as edições locais. Compare a cópia preservada antes de refazer o que ainda faltar.',
     '<b>Fechar aviso</b> oculta a mensagem, mas não desativa a proteção. Um aviso fechado não prova que os dados foram sincronizados.'),
 sub('Carregar versão da nuvem não concluiu',
     'Leia a mensagem de erro: conexão, gravação em andamento, falta de espaço ou alteração durante a recuperação podem impedir a operação.',
     'Mantenha a página e a cópia do rascunho. Aguarde um salvamento em andamento terminar, confira a conexão e tente novamente sem editar ao mesmo tempo.',
     'Se persistir, abra <b>Falar com o suporte</b> e informe a versão, o aparelho e os passos. <b>Não limpe os dados do navegador</b> e não reinstale como tentativa de recuperação.'),
 sub('Salvar no painel e publicar no app são a mesma coisa?',
     '<b>Não.</b> Salvar registra a alteração no Personal; a sincronização compartilha esse estado entre seus aparelhos quando a conta está conectada.',
     '<b>Publicar</b> prepara e envia o conteúdo destinado ao app de cada aluno. Confira o status; uma falha deixa a publicação pendente.',
     'Uma atualização do código do sistema não publica por conta própria um treino ou uma marca que você ainda está editando.'),
 sub('Como conferir uma atualização com segurança?',
     'Salve as edições em andamento e confira avisos de sincronização/publicação antes de sair.',
     'Reabra o app com internet para buscar a atualização. Informe a versão exibida ao suporte se continuar vendo uma tela antiga.',
     'A confirmação de publicação do sistema não comprova que um aparelho offline já recebeu a versão. Preserve os dados locais até resolver a divergência.')
], 'sincronização sincronizacao nuvem conflito rascunho pc mobile celular safari cache atualização aluno sumiu dados desapareceram central pro')
change('inicio',d='Próxima ação, agenda, busca e providências',subs=[
 sub('Próxima melhor ação',
     'No <b>Início</b>, o quadro <b>Próxima melhor ação</b> sugere uma tarefa usando os registros disponíveis: revisar um relato, preparar uma sessão, montar ou revisar uma ficha e acompanhar frequência ou avaliação.',
     'Toque na ação indicada ou em <b>Aluno 360°</b>. A sugestão não faz diagnóstico, não envia mensagem e não altera o treino sozinha.',
     'Use <b>Atualizar</b> para recalcular o quadro. A ausência de um alerta não garante que todos os dados do aluno estejam completos.'),
 sub('Resolver hoje',
     'O bloco <b>Resolver hoje</b> reúne pendências operacionais, como mensagens, cobranças e fichas a revisar.',
     'Abra a ação indicada e confira o registro antes de concluir. Esse bloco permanece junto do fluxo do dia.',fig=keep('inicio',0)['fig']),
 sub('Seu dia hoje',
     'Veja as sessões agendadas e abra a ficha do próximo aluno. A presença pode ser registrada na agenda.',
     'Para anotar exercícios, cargas e repetições do atendimento, use <b>Iniciar sessão</b>. Marcar uma presença não substitui o registro dos exercícios.'),
 sub('Busca universal',
     'Digite pelo menos duas letras na busca do topo para procurar exercício, questionário ou treino. Os resultados informam o tipo e, quando aplicável, o aluno.',
     'Toque no resultado para abrir a área correspondente. A busca do topo encontra registros; a busca da Ajuda encontra instruções.'),
 sub('WhatsApp e providências não são a mesma fila',
     'A fila de WhatsApp prepara mensagens para revisão e envio pelo canal configurado.',
     '<b>Automações e providências</b> organiza tarefas de acompanhamento. Marcar uma providência como concluída não comprova que uma mensagem foi enviada.',
     guide('automacoes','Entender as automações'))
])
change('alunos',subs=[
 keep('alunos',0),keep('alunos',1),
 sub('A ficha e o Aluno 360°',
     'Toque no <b>nome do aluno</b> para abrir o perfil e entre em <b>Resumo → Aluno 360° / Visão completa</b>.',
     'Consulte fichas, última sessão, avaliação, linha do tempo e <b>Frequência · 8 semanas</b>. Esse gráfico usa as sessões marcadas como feitas na agenda do Personal; não significa todo exercício praticado fora do app.',
     'Quando conectado e com acesso do aluno vinculado, o quadro pode mostrar atualizações do app. As outras abas do perfil continuam disponíveis.',
     'Os atalhos <b>Iniciar sessão, IA do treino, Semana, Questionário, Avaliação e Nutrição</b> abrem os fluxos existentes.',fig=keep('alunos',2)['fig']),
 sub('Atendimento presencial, online ou híbrido',
     'Confira a modalidade de atendimento no cadastro. Ela é separada do plano de cobrança: mensalidade, pacote ou sessão.',
     'A consultoria online não deve ser usada para criar agendamentos presenciais nos fluxos de agenda. Alterar a modalidade não apaga sessões e recebimentos anteriores.'),
 keep('alunos',3),
 sub('Entrada com ou sem questionário e contrato',
     'Configure a entrada em <b>Questionários → Criar e organizar</b> e confira a exigência de cada aluno em <b>App e acesso</b>.',
     'O questionário, o documento e a exigência de entrada seguem a publicação do aluno. Dispensa não significa apagar aceites anteriores.',
     guide('quest','Ver entrada e questionários')),
 keep('alunos',5),
 sub('Encerrar atendimento sem apagar o histórico',
     'No perfil, abra <b>Financeiro → Cancelar atendimento</b> e revise o motivo e os efeitos antes de confirmar.',
     'A nova operação preserva recebimentos e registros anteriores. Devolução do dinheiro e revogação do acesso ao app são decisões separadas.',
     'Quando houver assinatura automática, use primeiro o cancelamento no fluxo do provedor. Encerrar somente o cadastro não é confirmação de fim das cobranças.',
     guide('cancelamentos','Ver cancelamento e devolução'))
])
agenda=keep('agenda',2)
change('agenda',subs=[keep('agenda',0),keep('agenda',1),
 sub('Feita, Faltou ou Cancelou',
     'Toque na sessão para abrir as ações <b>Feita, Faltou e Cancelou</b>. Revise o aluno e a data antes de confirmar.',
     'Feita registra a presença; pacotes e cobranças por sessão seguem as regras do plano. Faltou registra a ausência; Cancelou desmarca a sessão.',
     '<b>Desfazer Feita</b> corrige a presença conforme o fluxo da agenda. Isso <b>não envia dinheiro</b> ao aluno e não é o registro de uma devolução financeira.',
     'Para encerrar todo o acompanhamento e avaliar devolução, use <b>Financeiro → Cancelar atendimento</b> na ficha, não apenas Cancelou na agenda.',fig=agenda['fig']),
 keep('agenda',3),
 sub('Sessão presencial integrada',
     'Abra <b>Iniciar sessão</b> no Início ou no Aluno 360° e escolha o aluno pelo nome.',
     'Ao finalizar, o sistema procura uma sessão pendente desse aluno no dia para marcar como feita. Se houver mais de um horário, confira o registro na Agenda.',
     'Esse registro não cria por si só um reembolso nem confirma um pagamento externo.')
])
new('presencial','Sessão presencial','Registrar o atendimento pelo nome do aluno',[
 sub('Iniciar e registrar o que foi feito',
     'Use <b>Início → Iniciar sessão</b> ou o mesmo botão no <b>Aluno 360°</b>. Escolha o aluno pelo nome e a ficha, ou uma sessão livre.',
     'Preencha a observação inicial e toque em <b>Iniciar sessão</b>. Use <b>+ Exercício</b> para incluir o registro.',
     'Anote exercício, repetições, carga e percepção de esforço. O campo de esforço oferece <b>Leve, Na medida e Pesado</b>.',
     'Revise os registros e toque em <b>Finalizar e salvar</b>. Fechar a janela não equivale a finalizar o atendimento.'),
 sub('Registrar sem internet',
     'Com o painel e os dados necessários já carregados, a sessão concluída pode ficar salva neste aparelho para envio posterior.',
     'Mantenha o mesmo aparelho e a mesma conta até a sincronização. Ao voltar a conexão, o painel tenta enviar a fila.',
     '<b>Salvo neste aparelho</b> não é confirmação de recebimento na nuvem. Não apague os dados do navegador e não troque de conta para tentar destravar um envio.',
     'Evite fechar o atendimento ainda em edição: finalize e confira a mensagem de salvamento. Não há garantia de recuperação de cada campo não finalizado.'),
 sub('O que acontece na Agenda?',
     'Ao finalizar, uma sessão pendente do mesmo aluno no dia pode ser marcada como feita. Confira a Agenda, especialmente quando houver dois atendimentos no mesmo dia.',
     'O registro de exercícios, a presença e o recebimento financeiro são informações distintas. Confira cada uma no seu fluxo.')
], 'modo presencial central pro aula atendimento reps carga esforço rpe offline nome aluno')
change('treinos',d='Fichas, séries, calendário, corrida por etapas e IA',subs=[keep('treinos',0),
 sub('Gerar com IA sem perder a revisão',
     'Em <b>Gerar com IA</b> ou <b>IA do treino</b> no Aluno 360°, escolha o aluno e confira os dados usados na proposta.',
     'Preencha <b>Sua leitura</b> com a orientação do profissional. Revise exercícios, séries e planejamento antes de aplicar.',
     'O resultado da IA é uma proposta. Aplicar e publicar continuam sendo ações do responsável; não há aprovação automática por um alerta do painel.'),
 sub('Semana recorrente e calendário por data',
     'Abra <b>Semana do aluno</b> para montar a rotina recorrente. O calendário mensal permite conferir uma data específica e suas atividades.',
     'No editor do dia, escolha as atividades do próprio aluno e, quando necessário, seus horários. Um dia pode ter mais de uma atividade.',
     'Marque descanso explicitamente ou volte à semana recorrente. Uma exceção por data é diferente de modificar a rotina semanal inteira.',
     'Salve e publique para o app receber a organização. O aluno continua com o treino e os registros anteriores preservados.'),
 sub('Copiar semanas sem sobrescrever ajustes por engano',
     'No planejamento, use a cópia de semanas e confira a origem, o período de destino e a prévia.',
     'A cópia aceita de <b>1 a 12 semanas</b> e preserva os ajustes existentes por padrão. Substituir requer confirmação.',
     'Se a origem ou o destino mudou enquanto a prévia estava aberta, confira novamente antes de salvar.'),
 keep('treinos',3),keep('treinos',4),
 sub('Detalhar as séries e preservar registros',
     'No editor do exercício, revise séries, repetições, carga, descanso e observações. Use o detalhamento por série quando disponível.',
     'No app do aluno, anotar carga e confirmar uma série realizada são ações diferentes. Não trate uma anotação como prova de que todas as séries foram feitas.'),
 sub('Corrida por etapas',
     'No editor de corrida, adicione e ordene os trechos. Cada etapa pode usar <b>metros, quilômetros, minutos ou segundos</b>, sem precisar repetir o mesmo tamanho.',
     'O menu da etapa permite editar, duplicar, mover ou remover. O resumo soma apenas distâncias e durações conhecidas.',
     'Esforço, ritmo, velocidade, frequência cardíaca ou zona são orientações opcionais revisadas pelo profissional. A biblioteca de zonas não altera silenciosamente uma prescrição já salva.',
     'Revise, salve e publique. As orientações exibidas pelo player não significam comparação automática com sensores.')
])
change('financeiro',d='Recebimentos, correções, cancelamentos e devoluções',subs=[keep('financeiro',0),
 sub('Cobrança integrada e recebimento manual',
     'O financeiro diferencia o registro manual de uma cobrança emitida por integração. Confira em <b>Configurações → Receber dos alunos</b> o provedor e a situação da conexão.',
     'Para um pagamento integrado, confira o status retornado pelo provedor. Registrar manualmente um recebimento não faz a transferência bancária.',
     'Não registre outra entrada apenas porque a atualização ainda não apareceu. Recebimentos manuais semelhantes podem gerar aviso de possível duplicidade.'),
 keep('financeiro',2),
 sub('Editar, anular ou devolver: qual a diferença?',
     '<b>Editar</b> corrige dados do recebimento com motivo e histórico. <b>Anular</b> retira um lançamento incorreto dos totais, preservando o registro.',
     '<b>Devolução</b> registra dinheiro devolvido ao cliente, total ou parcialmente, vinculado ao pagamento original. Não use anulação para esconder uma devolução.',
     'Um recebimento com histórico de devolução tem edição e anulação bloqueadas nesses controles. Confira o histórico antes de confirmar qualquer operação.',
     guide('cancelamentos','Passo a passo das devoluções')),
 sub('Bruto, devolvido, líquido e Movimento de hoje',
     '<b>Bruto</b> é o total de recebimentos válidos. <b>Devolvido</b> considera as devoluções confirmadas manualmente. <b>Líquido</b> desconta essas saídas.',
     'Uma solicitação pendente reserva o saldo disponível para devolver, mas ainda não é uma saída de caixa realizada.',
     'A devolução aparece na <b>data informada para a devolução</b>, sem reescrever o mês da venda. No dia, confira <b>Entrou hoje, Devolvido hoje e Saldo líquido</b>.',
     'As despesas continuam separadas. Receita líquida de devoluções não é, sozinha, lucro do negócio.')
])
new('cancelamentos','Cancelamentos e devoluções','Encerrar o atendimento e registrar estorno total ou parcial',[
 sub('Cancelar o atendimento, com ou sem devolução',
     'Abra o aluno pelo nome e vá a <b>Financeiro → Cancelar atendimento</b>. Informe o motivo e revise os efeitos.',
     'O cancelamento encerra acompanhamento, contratos ativos e renovação local do pacote. Sessões futuras não realizadas são arquivadas; aulas feitas, faltas, treinos, avaliações e recebimentos ficam preservados.',
     'Escolha cancelar sem devolução ou criar uma <b>devolução pendente</b> ligada a um recebimento. Confira cliente e valor antes da confirmação.',
     'O aplicativo não calcula automaticamente multa, proporcionalidade ou direito ao reembolso. Informe o valor acordado e não confunda esta operação com a assinatura do próprio Torque Personal.'),
 sub('E as próximas cobranças e o acesso ao app?',
     'Se houver assinatura automática vinculada, o cancelamento do atendimento é bloqueado. Cancele primeiro pelo fluxo de cobrança existente e <b>aguarde a confirmação do provedor</b>.',
     'O cancelamento local <b>não cancela links de pagamento já emitidos nem agendamentos externos</b>. Confira esses canais separadamente.',
     'Também <b>não revoga automaticamente o acesso ao app</b> e não envia mensagem de cancelamento. Revise App e acesso e comunique o aluno pelo seu canal quando necessário.'),
 sub('Pedir devolução total ou parcial',
     'No recebimento do aluno, toque em <b>Devolução</b>. Confira o valor original e o saldo disponível.',
     'Informe o valor total ou parcial e o motivo. Use até duas casas decimais, sem separador de milhares.',
     'O limite desconta devoluções já realizadas <b>e pendentes</b>, impedindo novo registro acima do saldo. É possível registrar mais de uma devolução parcial.',
     'Ao salvar, a situação fica <b>Pendente</b>. Isso não significa que o dinheiro saiu da conta.'),
 sub('Confirmar uma devolução já feita pelo personal',
     '<b>Esta função não envia Pix, não faz transferência e não estorna cartão automaticamente.</b> Registre a conclusão somente depois de ter realizado e conferido a devolução fora do aplicativo.',
     'Na solicitação pendente, toque em <b>Já devolvi o dinheiro</b>. Informe data, forma da devolução e referência do comprovante ou recibo.',
     'Confirme a declaração de que o dinheiro já foi devolvido. Se o pagamento veio de integração, confira também o provedor para não devolver duas vezes.',
     'Revise o aluno e o valor na confirmação final. A situação passa a <b>Devolvido manualmente</b>; não é confirmação bancária automática.'),
 sub('Desistir de uma solicitação ou conferir o histórico',
     'Uma solicitação ainda <b>Pendente</b> pode ser cancelada com motivo. Isso libera o saldo reservado e mantém a trilha do pedido.',
     'Uma devolução marcada como realizada não pode ser editada por esse fluxo. Pagamento original, motivos, responsáveis e transições ficam no histórico administrativo.',
     'Se houver conflito, erro de gravação ou valor inconsistente, pare e confira o registro atual. Não repita a operação para tentar forçar o salvamento.'),
 sub('Declaração e comprovante',
     'Depois do registro, use a declaração disponível para baixar e imprimir a identificação da devolução e a referência informada.',
     'A declaração é um <b>registro administrativo: não é comprovante bancário nem confirmação de estorno no cartão</b>.',
     'Nesta versão, o app guarda a referência do comprovante, <b>não o anexo</b>. Conserve o comprovante original pelo procedimento do seu negócio.'),
 sub('Quando a devolução entra no caixa?',
     'Somente a devolução confirmada manualmente gera a saída, na sua data. O recebimento original permanece no histórico.',
     'Confira os totais bruto, devolvido e líquido e o <b>Movimento de hoje</b>. Uma solicitação pendente não reduz a receita realizada.',
     'Cancelar atendimento, cancelar uma solicitação de devolução e anular um recebimento são três operações diferentes.')
], 'estorno extorno reembolso devolução devolucao parcial total pix cartão dinheiro cancelamento cancelou pendente comprovante')
new('marca','Nome, marca e aparência do aluno','Seu nome ou o estúdio em destaque, sem poluir o topo',[
 sub('Escolher o nome em destaque',
     'Abra <b>Personalização → Identidade, cores e logo → Identidade da marca</b>.',
     'Em <b>Nome em destaque</b>, escolha <b>Meu nome</b> ou <b>Nome do estúdio / marca</b> e preencha o nome correspondente.',
     'A escolha controla a identidade comercial exibida no template. Ela não troca o nome nem a foto do aluno.'),
 sub('Mostrar o nome do personal abaixo é opcional?',
     '<b>Sim. Mostrar nome do personal abaixo da marca vem desligado por padrão.</b> Deixe desligado para aparecer somente o nome principal, sem segunda linha nem espaço vazio.',
     'Ative apenas se desejar a identificação menor abaixo. Quando o profissional é o destaque, a opção permite mostrar o estúdio na segunda linha.',
     'Uma combinação já salva é preservada ao reabrir. Trocar o nome principal desliga a segunda linha, para você decidir novamente.'),
 sub('Nome curto, slogan, cores e logo',
     '<b>Nome curto e slogan são opcionais.</b> Para um topo mais simples, mantenha o slogan vazio e o nome secundário desligado.',
     'A prévia usa as cores e o logo já configurados. <b>Editar logo</b> abre o controle existente; não é necessário cadastrar outra marca em outro menu.',
     'Confira nomes longos na prévia do celular. O nome curto é usado nos espaços reduzidos; o nome principal continua identificado na configuração.'),
 sub('Salvar identidade e publicar para os alunos',
     'Digitar altera <b>somente a prévia</b>. Toque em <b>Salvar identidade</b> e confira a mensagem de salvamento.',
     'Depois use <b>Publicar</b>, no topo da Personalização, para atualizar os apps. Campos ainda não salvos impedem essa publicação.',
     'Se outra sessão alterou a marca ou houve falha, mantenha o rascunho e confira os campos atuais. Salvo no painel não significa publicado na nuvem do aluno.'),
 sub('O que muda e o que não muda?',
     'A identidade segue para o cabeçalho do aluno e para os textos, compartilhamentos e documentos que usam a marca do acompanhamento. Nos recibos, a pessoa responsável continua identificada na assinatura.',
     '<b>Nome de login, dados fiscais, recebedor/chave Pix e registros anteriores não são substituídos</b> pelo nome fantasia.',
     'Antes de identificar o aluno, o login genérico permanece neutro. Notificações agendadas no servidor, e-mails transacionais, ícones e nomes nas lojas não são renomeados por essa configuração.',
     'Um atalho já instalado pode conservar o nome antigo. Essa preferência não garante renomear o ícone do app no sistema do celular.')
], 'nome fantasia marca identidade branding personalização personalizacao template estúdio estudio logo nome personal secundário abaixo opcional poluição visual')
new('automacoes','Automações e providências','Acompanhar tarefas sem confundir com envios automáticos',[
 sub('Onde ficam as automações?',
     'No <b>Início</b>, toque em <b>Automações</b> ou abra <b>Automações e providências</b>. A Central Pro não é necessária.',
     'Entre na sua conta e mantenha a conexão para carregar as automações compartilhadas e a fila.',
     'O quadro apresenta as regras cadastradas e as providências pendentes disponíveis para a sua conta.'),
 sub('O que faz Ativar automações recomendadas?',
     'O botão cadastra as recomendações que ainda não existem: <b>Revisar questionário respondido, Acompanhar novo aluno e Recuperar sessão cancelada</b>.',
     'Essas regras organizam tarefas de acompanhamento. A fila depende dos eventos recebidos pela integração; ativar regras não recria todos os eventos antigos.',
     'Não confunda o cadastro de uma regra com execução de contato, diagnóstico ou mudança automática de prescrição.'),
 sub('Atualizar fila e concluir uma providência',
     'Use <b>Atualizar fila</b> para consultar novamente. Revise o aluno e realize a tarefa necessária no fluxo correspondente.',
     'Toque em <b>Concluir</b> somente depois de conferir a providência. O botão marca a tarefa como concluída; <b>não envia mensagem nem altera o treino</b>.',
     'As mensagens preparadas para WhatsApp e as notificações são outros fluxos. Confira o status de cada canal, não apenas o estado da providência.')
], 'automação automacao automacoes providência providencia fila gatilho central pro novos alunos questionario sessão cancelada')
change('quest',d='Modelos, banco de perguntas, respostas e entrada opcional',subs=[
 sub('Criar, editar e organizar questionários',
     'Abra <b>Questionários → Criar e organizar</b>. Use os modelos existentes ou monte um novo com as perguntas do banco.',
     'Você pode renomear o modelo, ordenar perguntas, pesquisar por título/enunciado e conferir a prévia.',
     'Usar um modelo preenche o rascunho; confirme o salvamento. Editar o modelo <b>não reescreve os questionários já enviados nem as respostas recebidas</b>.'),
 sub('Perguntas de nota, carinhas e texto livre',
     'Escolha o tipo de resposta e confira a configuração da pergunta. Notas e carinhas usam a pontuação e o sentido definidos.',
     '<b>Texto livre não é uma nota</b>. Um campo de pontuação vazio não deve ser tratado como zero.',
     'Perguntas já usadas mantêm sua identificação. Confira possíveis códigos duplicados e a seleção antes de salvar.'),
 sub('Enviar e acompanhar respostas',
     'Escolha o questionário e os destinatários no fluxo de envio. Confira as opções de repetição e publicação.',
     'Em <b>A semana</b> e nas respostas do aluno, revise quem respondeu e o conteúdo. Falta de resposta não prova falta de treino.',
     'O botão de cobrança prepara o contato com quem ainda não respondeu; confira o envio no canal usado. Respostas com nota podem alimentar os gráficos de Check-ins.'),
 sub('Questionário e contrato na entrada do aluno',
     'Configure a entrada em <b>Criar e organizar</b>. No cadastro ou em <b>App e acesso</b>, escolha exigir ou dispensar o preenchimento para aquele aluno.',
     'Publique a configuração. O aluno com entrada exigida responde, confere os dados e confirma o documento no fluxo correspondente.',
     'A confirmação depende do servidor; uma falha de conexão não equivale a aceite concluído. Aceites anteriores permanecem no histórico quando houver nova solicitação.',
     'O texto comercial é editável e deve ser conferido pelo responsável. A ajuda não define multas nem condições legais do contrato.'),
 sub('Posso ver os dois fluxos sem usar uma conta real?',
     'As demonstrações do aluno têm versões <b>com cadastro inicial</b> e <b>sem cadastro inicial</b>. Use-as para entender a diferença.',
     'São dados fictícios: respostas e aceites da demonstração não configuram um aluno real nem comprovam a publicação do seu cadastro.')
],k='questionário questionario formulário modelo perguntas carinhas checkin check-in onboarding contrato aceite cadastro inicial dispensa')
new('nutricao','Nutrição integrada','Planejar, revisar, publicar e acompanhar alimentação',[
 sub('Onde fica a alimentação do aluno?',
     'No Personal, abra <b>Nutrição</b> ou o atalho do Aluno 360°. Escolha o aluno antes de editar.',
     'O fluxo permanece no mesmo acompanhamento. Ele não cria automaticamente um paciente no módulo separado Torque Nutri.'),
 sub('Rascunho, revisão, aplicar e publicar',
     'Monte o plano no editor ou solicite uma proposta da IA quando o serviço estiver disponível. A proposta precisa de revisão do responsável.',
     'Confira refeições, dados, alternativas e vigência antes de <b>aplicar</b>. Depois <b>publique</b> pelo fluxo do aluno.',
     'Duplicar ou restaurar uma versão cria conteúdo para revisão. Não confunda rascunho com plano já disponível no app.'),
 sub('Biblioteca, receitas e registros',
     'Use as áreas <b>Plano, Biblioteca e Registros</b> para organizar o conteúdo e conferir o acompanhamento.',
     'Dados nutricionais ausentes não significam zero. Confira as informações do alimento ou receita antes de usar.',
     'Comentários e marcações de revisão dependem do registro efetivamente consultado. Uma edição do registro pode exigir nova revisão.'),
 sub('Foto da refeição e confirmação do aluno',
     'No app, <b>Alimentação</b> permite consultar o plano publicado e registrar o acompanhamento. Uma análise de foto é uma estimativa para conferir, não um registro automaticamente confirmado.',
     'O aluno confirma o registro; abrir a tela ou analisar uma foto não gera, por si só, confirmação ou pontos.',
     'Registro local pendente precisa ser sincronizado. Planos pausados preservam a consulta ao histórico; novos registros dependem da situação do plano.')
], 'nutrição nutricao alimentação alimentacao plano alimentar refeição refeicao receita biblioteca diário diario revisão rascunho')
change('avaliacoes',subs=[
 sub('Registrar e revisar uma avaliação',
     'Em <b>Avaliações</b>, escolha o aluno e registre as medidas e observações disponíveis.',
     'Confira os valores medidos e os resultados calculados antes de salvar, imprimir ou compartilhar. Estimativas do aplicativo não devem ser apresentadas como medições diretas.'),
 sub('Avaliação postural e recursos de imagem',
     'Use o fluxo de avaliação postural disponível na área de Avaliações e confira as imagens e observações antes de concluir.',
     'Medidas estimadas pela câmera são um recurso opcional. Revise o resultado; uma estimativa visual não é um diagnóstico.',
     'Preserve a autoria e a identificação do aluno ao compartilhar um relatório.'),
 keep('avaliacoes',2)
])
new('medalhas','Medalhas e evolução no app','Selecionar conquistas e acompanhar o próximo objetivo',[
 sub('Escolher medalhas para os alunos',
     'Abra <b>Personalização → Medalhas</b>. Pesquise ou filtre as trilhas por modalidade e selecione as que deseja usar.',
     'Confira nomes, critérios e metas antes de salvar. A seleção precisa ser publicada para atualizar o app dos alunos.',
     'A criação de conquistas por total de treinos continua disponível. Personalizar o título não muda automaticamente o critério da medalha.'),
 sub('O que o aluno vê?',
     'Cada trilha mostra o nível alcançado e o próximo objetivo. O aluno pode fixar uma meta e expandir a lista de medalhas.',
     'O visual em relevo e o compartilhamento usam os registros disponíveis. Abrir ou girar uma medalha não registra atividade nem aumenta pontos.',
     'Metas e resultados da demonstração são fictícios. Conquistas do aplicativo não certificam provas ou benchmarks oficiais; históricos limitados não são totais vitalícios.')
], 'medalha medalhas conquista conquistas evolução evolucao objetivo próxima meta 3d relevo ranking')
change('appaluno',subs=[
 sub('Salvar conteúdo, publicar e receber atualizações',
     'Use <b>Salvar e publicar</b> no treino ou <b>Publicar</b> na Personalização, conforme a mudança. Confira a conclusão e eventuais pendências.',
     'Atualização do sistema e publicação do conteúdo do aluno são diferentes. Uma marca ou prescrição salva apenas no painel não chega ao aluno só porque o site ganhou versão nova.',
     'Para buscar a atualização, reabra o app conectado depois de preservar as edições. Não apague os dados do navegador como primeira tentativa.'),
 sub('Nome do personal ou estúdio no template',
     'Escolha em <b>Personalização → Identidade, cores e logo → Identidade da marca</b>. O nome menor abaixo é opcional e começa desligado.',
     'Salvar a identidade não publica automaticamente os apps. Confira a prévia, salve e use Publicar.',
     guide('marca','Configurar nome e marca')),
 sub('Foto grande, capas e aparência',
     'A foto no topo do aluno permanece grande no celular, com os controles sobrepostos. A identidade não substitui o nome ou a foto do aluno.',
     'Em <b>Personalização</b>, escolha cores, logo e fotos por tipo de treino. No banco de <b>Imagens</b>, use a galeria existente para reutilizar as fotos.'),
 sub('Clube de vantagens',
     'Em <b>Personalização → Benefícios e loja → Clube de vantagens</b>, cadastre nome, benefício, cupom e link do parceiro.',
     'Confira e publique antes de orientar o aluno a usar o cartão do benefício. A disponibilidade da oferta é definida pelo parceiro.'),
 sub('Loja no app',
     'Cadastre os produtos ou serviços no controle de loja da Personalização e confira como a compra será atendida.',
     'Sem integração de pagamento, a ação pode encaminhar o contato pelo WhatsApp. Com integração, confira o fluxo e a confirmação do provedor.',
     'O registro de devolução manual no Financeiro não é um estorno automático dessa compra.'),
 keep('appaluno',4),
 sub('Revogar o acesso é uma operação separada',
     'Abra a ficha e confira <b>App e acesso</b> para usar o controle de revogação.',
     '<b>Cancelar atendimento não revoga automaticamente o app</b>. Confirme cada ação separadamente.',
     'A revogação depende da atualização do acesso e da comunicação com o servidor. Ela não é uma promessa de apagar remotamente dados já baixados em aparelhos offline.')
])
change('relatorios',subs=[keep('relatorios',0),
 sub('Radar de acompanhamento e retenção',
     'Use o Radar para revisar frequência registrada, check-ins e contatos. Os sinais ajudam a escolher quem acompanhar.',
     'Uma indicação de ausência de registros não comprova que o aluno parou de se exercitar. Confira os dados e faça o contato pelo fluxo apropriado.'),
 sub('Receita, devoluções e quanto vale sua hora',
     'Os relatórios diferenciam recebimentos válidos, devoluções realizadas e saldo líquido; uma devolução pendente ainda não é saída realizada.',
     '<b>Sua hora rendeu</b> usa os movimentos vinculados às aulas e as sessões dadas; serviços avulsos permanecem separados.',
     'Confira o período e a data da devolução antes de comparar meses. Saldo líquido de recebimentos não substitui a análise das despesas.'),
 keep('relatorios',3)
])
change('assessoria',subs=[sub('Acompanhar consultoria online',
     'A aba <b>Assessoria</b> reúne os alunos acompanhados a distância e os registros disponíveis no app.',
     'Confira a frequência registrada, os questionários e as mensagens antes de decidir o próximo contato. Sem registro não significa necessariamente sem atividade.',
     'Atendimento online é separado da forma de cobrança. Treinos e alterações no planejamento continuam precisando ser salvos e publicados.'),
 sub('Atalhos de acompanhamento',
     'Abra a ficha do aluno e use o <b>Aluno 360°</b> para chegar ao treino, questionário, avaliação ou nutrição.',
     'Os atalhos não enviam automaticamente uma orientação. Revise antes de aplicar, publicar ou entrar em contato.')])
change('zap',subs=[
 sub('Mensagens preparadas para WhatsApp',
     'Em <b>Configurações → WhatsApp</b>, confira as mensagens automáticas configuradas e a fila do Início.',
     'No fluxo que abre o WhatsApp, revise o destinatário e a mensagem e confirme o envio no próprio canal.',
     'Mensagem preparada, link aberto e mensagem recebida são etapas diferentes. Não trate um recibo preparado como entrega comprovada.'),
 sub('Integração oficial e tarefas de acompanhamento',
     'Quem utiliza a integração oficial deve conferir a configuração e o retorno do envio. Sem conexão ou confirmação, não presuma que a mensagem foi entregue.',
     '<b>Automações e providências</b> no Início é uma fila de tarefas. Concluir uma providência não dispara contato ou reembolso.',
     'Não cole senhas, tokens ou chaves privadas em conversas de suporte para relatar uma falha.')
])
change('conta',subs=[keep('conta',0),
 sub('Backup, exportação e restauração',
     'Em <b>Sua ilha</b>, use <b>Baixar backup (.json)</b> para guardar uma cópia e <b>Baixar em Excel (CSV)</b> para consultar os dados exportados.',
     'Confira o arquivo e o período antes de restaurar. Restaurar um backup antigo não é uma forma de atualizar dados de outro aparelho.',
     'Em um conflito, preserve o rascunho antes de carregar a nuvem. Não limpe o navegador para tentar resolver a divergência.'),
 keep('conta',2),
 sub('Assinatura do Torque Personal',
     'A assinatura do próprio sistema é gerida em <b>Sua ilha</b>; confira as condições e os valores apresentados no canal da contratação.',
     '<b>Cancelar atendimento</b> no Financeiro trata da relação com o aluno. Não cancela a assinatura do personal no Torque nem executa estorno bancário.'),
 sub('Relatar um problema sem perder dados',
     'Na Ajuda, abra <b>Falar com o suporte</b> e descreva o que tentou fazer, o resultado esperado, a mensagem de erro e a versão exibida.',
     'Use um print sem senhas ou dados bancários sensíveis. O chamado permite acompanhar o protocolo; não apaga o rascunho nem força sincronização.',
     'A ajuda pode ser consultada com o conteúdo já carregado. Abrir e acompanhar chamados depende da conta e da conexão.')
])
order=['novidades','comeco','sincronizacao','inicio','alunos','presencial','agenda','treinos','quest','nutricao','avaliacoes','marca','appaluno','medalhas','financeiro','cancelamentos','automacoes','chat','comunidade','relatorios','assessoria','zap','sitepro','conta']
result=[topics[k] for k in order]
assert set(t['id'] for t in original)<=set(order)
assert all(t['subs'] and all(s['p'] for s in t['subs']) for t in result)
p=root/'personal.html'; text=p.read_text(); start=text.index('  var AJUDA_PT = ['); end=text.index('  var ajAberto = null;',start)
text=text[:start]+'  // Guia funcional mt-v834. Atualizar com os fluxos da mesma release, não com promessas de roadmap.\n  var AJUDA_PT = '+json.dumps(result,ensure_ascii=False,indent=2)+';\n'+text[end:]
old='var conteudo = tp ? [tp.t, tp.d].concat(tp.subs.map(function (s) { return s.t + " " + s.p.join(" "); })).join(" ").replace(/<[^>]*>/g, " ") : "";\n      bt.hidden = !!busca && !alTextoBusca(conteudo).includes(busca);'
new_text='var conteudo = tp ? [tp.t, tp.d, tp.k || ""].concat(tp.subs.map(function (s) { return s.t + " " + s.p.join(" "); })).join(" ").replace(/<[^>]*>/g, " ") : "";\n      var normalizado = alTextoBusca(conteudo);\n      bt.hidden = !!busca && busca.split(/\\s+/).some(function (termo) { return !normalizado.includes(termo); });'
assert text.count(old)==1; text=text.replace(old,new_text)
old="<div class='alh'>Como usar cada área</div>"; assert text.count(old)==1; text=text.replace(old,"<div class='alh'>Dúvidas e novidades</div>")
old='Toque num tópico pra ver o passo a passo — com figuras mostrando onde tocar.'; assert text.count(old)==1
text=text.replace(old,'Veja o que mudou ou busque um passo a passo. Abra só o tópico que precisa; as ilustrações são orientativas.')
text=text.replace("placeholder='Ex.: cobrar, publicar treino, senha'","placeholder='Ex.: estorno, nome fantasia, aluno no celular'")
p.write_text(text)
assert hashlib.sha256(p.read_bytes()).hexdigest()=='0a488c7cf1cbbe9b9f831b017ae2a92f052d9a40a4d01d0d23c0d246452d79ed', 'O resultado divergiu do texto conferido'
print(len(result),'tópicos;',sum(len(t['subs']) for t in result),'perguntas/seções')
print('personal.html',hashlib.sha256(p.read_bytes()).hexdigest())
