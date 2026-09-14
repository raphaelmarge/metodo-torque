# mt-v834 — identidade do profissional ou estúdio no app do aluno

Complementa os cancelamentos e devoluções do PR #843. Este documento não comprova publicação.

## Caminho de uso

Personalização → Identidade, cores e logo → Identidade da marca. Escolher **Meu nome** ou **Nome do estúdio / marca** em **Nome em destaque**. A opção **Mostrar nome do personal abaixo da marca** é desligada por padrão. Quando o profissional é o destaque, o controle permite mostrar o estúdio abaixo. A combinação já salva é preservada; trocar o destaque desliga a segunda linha, que só volta por escolha explícita. Desligar remove a linha do template, sem deixar espaço vazio, e mantém o nome profissional nos registros e assinaturas. Nome curto (32 caracteres) e slogan (100) são opcionais; nome principal e profissional comportam 120 caracteres. A prévia usa texto, cor e logo atuais. **Editar logo** abre o controle de upload existente.

Digitar apenas atualiza a prévia. **Salvar identidade** grava a configuração, preservando a revisão lida pelo MTStore, e marca os apps dos alunos como pendentes no fluxo existente. O botão **Publicar** aplica a atualização pelo caminho canônico do Personal; o editor impede publicar uma prévia com campos ainda não salvos. Falha de gravação, permissão insuficiente ou identidade alterada em outra sessão não descarta silenciosamente o rascunho.

A interface usa um seletor de destaque e uma opção de segunda linha, sem um segundo seletor redundante. O modo `ambos` continua sendo o contrato interno; não foi criada configuração ou migração adicional.

## Dados e compatibilidade

- `ptStudio.config.professor`: pessoa responsável, campo já existente.
- `ptStudio.config.identidadeMarca`: `{v,modo,destaque,nomeEstudio,nomeCurto,slogan}`.
- `identidadeApp`: identidade pública resolvida no pacote do aluno. `studio` mantém o nome principal para compatibilidade com consumidores anteriores.
- `config.nome`, identidade do login, recebedor/chave Pix, credenciais, campos fiscais e registros anteriores não são substituídos pelo nome fantasia.
- Sem escolha explícita, o comportamento anterior permanece; não há renomeação em massa nem migração por inferência.

## Onde aparece

Identidade em destaque no cabeçalho e sobre o topo com foto, separada da saudação/nome do aluno. A opção combinada mantém a segunda identidade em outra linha. Logo da marca não substitui a foto do aluno. Menu lateral desktop, identificação do acompanhamento, título do documento e textos/compartilhamentos que usam `studio` recebem a escolha. Nomes longos quebram linha e o espaço do topo se adapta para não cobrir os controles do treino. A marca sobre a imagem mantém contraste nos temas claro e escuro.

Recibos/relatórios administrativos e a declaração de devolução usam a identidade comercial onde adequado, mantendo o profissional identificado separadamente. O recibo conserva a pessoa responsável na assinatura; a marca não é promovida a recebedor bancário.

O carregamento do app só mostra a identidade quando há um pacote do token atual, inclusive em cache. Trocar o token não reutiliza a identidade do aluno anterior. O login genérico antes de identificar o aluno continua neutro. Notificações enviadas pelo `pushAluno` do painel recebem o nome curto. Mensagens agendadas no servidor e e-mails transacionais não foram reconfigurados. O manifesto web gerado leva o nome/abreviação escolhidos; esta alteração não renomeia o aplicativo nas lojas nem garante atualização automática de um atalho já instalado, e não troca os ícones nativos.

## Segurança e armazenamento

Reutiliza o JSON e as RPCs existentes de sincronização/publicação; não requer tabela, migração SQL ou Edge Function. A verificação de permissão do editor usa o modelo atual do Personal; não cria autorização de campo nova no servidor. Textos são limitados e escapados/serializados pelo caminho canônico. O logo do novo cabeçalho aceita raster local (PNG/JPEG/WebP), não SVG executável nem URL remota. Nenhum dado de aluno, informação bancária ou configuração de produção foi consultado ou modificado para desenvolver/testar.

## Verificação

As suítes novas cobrem resolução/validação dos três modos, prioridades, legado, Pix preservado, prévia sem gravação, publicação pendente, erro de salvamento, conflito, permissão, nomes longos, caracteres maliciosos, 320/390/1280 px, menu desktop, manifesto, tema claro, recibo e abertura offline com isolamento entre tokens. As demonstrações canônica e com/sem cadastro são regeneradas pelos geradores existentes, não editadas como forks do app.

Durante a integração foram identificadas duas regressões anteriores do pacote de devoluções: o rótulo da ação quebrava no celular e o quadro financeiro havia perdido a identificação das entradas do dia. A ação agora mostra **Devolução**, preservando o nome acessível **Devolução / estorno**; **Movimento de hoje** discrimina **Entrou hoje**, **Devolvido hoje** e **Saldo líquido**, sem confundir saída com entrada. As asserções antigas do Personal/celular não foram removidas ou enfraquecidas.

Resultados e SHA revisado devem ser conferidos nos checks/artefatos do PR. Os testes de navegador usam Chromium no GitHub Actions e dados fictícios, não validam o iPhone físico do usuário. O ambiente local não permitiu navegação de navegador; validações de lógica/sintaxe locais não foram apresentadas como teste visual.
