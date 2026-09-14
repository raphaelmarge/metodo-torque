# mt-v834 — nome do profissional ou marca do estúdio

Complemento do PR de cancelamentos/devoluções, baseado em `ef61740d3bec28a5887b24e7da87eb32e4b798c6`. Não comprova deploy.

## Uso

Personalização → Identidade, cores e logo → Identidade da marca. Escolher Meu nome, Nome do estúdio/marca ou Marca + meu nome. Na opção combinada, escolher qual aparece maior. Nome curto (32 caracteres) e slogan (100) são opcionais; o nome principal comporta 120 caracteres. Prévia usa texto, cor e logo atuais; o botão Editar logo leva ao controle de upload já existente.

Salvar identidade grava no painel e marca os apps como pendentes. A atualização dos alunos segue o botão Publicar da Personalização e a publicação CAS existente; não existe publicação implícita ao digitar. Falha de armazenamento, alteração da identidade em outra sessão ou troca de conta impede aplicação silenciosa e preserva/descarta explicitamente o rascunho conforme o caso.

## Contrato

- `ptStudio.config.professor`: pessoa responsável, campo já existente.
- `ptStudio.config.identidadeMarca`: objeto versionado com modo, destaque, nomeEstudio, nomeCurto e slogan.
- `identidadeApp`: somente a identidade pública resolvida no pacote do aluno. `studio` continua recebendo o nome principal para compatibilidade.
- `config.nome`, identidade de login, recebedor/chave Pix, credenciais, campos fiscais, autoria/auditoria anterior e contratos assinados não são substituídos por um nome fantasia.
- Sem configuração explícita, o app mantém o comportamento anterior. Nenhuma migração por adivinhação ou alteração em massa de contas.

## Superfícies integradas

Cabeçalho normal e topo sobre a foto grande do aluno, nome no menu do acompanhamento, título do app, textos e compartilhamentos que usam a identidade do pacote, relatórios/recibos gerados pelo Personal e declaração de devolução. A opção combinada mostra a segunda identidade separada. Logo é da marca, não substitui a foto do aluno. Nomes longos quebram linha; o espaço do topo cresce quando necessário para não cobrir o treino.

O carregamento de `app/index.html` só mostra uma marca quando dispõe do pacote do token atual, nunca a partir de um parâmetro de nome não verificado. O login genérico antes de identificar o aluno permanece neutro. Títulos das notificações enviadas por `pushAluno` no painel recebem o nome curto; mensagens agendadas no servidor, e-mails transacionais e nomes/ícones instalados nas lojas não são reconfigurados nesta entrega.

## Armazenamento e segurança

Usa o JSON e as RPCs existentes de sincronização/publicação. Não requer nova tabela, migração SQL ou Edge Function. A permissão do editor reutiliza as regras organizacionais atuais da interface; isto não cria uma nova autorização de campo no servidor. Nenhum registro de aluno, dado bancário ou configuração de produção foi acessado/modificado para desenvolver/testar.

Textos são limitados, escapados no HTML e serializados pelo caminho canônico. Logo aceita imagens raster locais, sem SVG executável, URL remota ou HTML. Os novos arquivos estão nas caches do portal/app.

## Verificação

Adicionadas suítes de contrato e interface real: modos/destaques, legado, nome profissional/Pix preservados, prévia sem gravação, publicação pendente, erro de armazenamento, conflito, permissão, nomes longos, texto malicioso e 320/390/1280 pixels. Testes usam dados sintéticos e rede externa bloqueada. A demo deve ser regenerada pelo construtor canônico. O resultado das execuções consta nos checks e artefatos do PR; aprovação do PR e validação no iPhone físico são etapas distintas.
