# mt-v859 — Torque Nutri no ecossistema

## Mudança

Adiciona a plataforma estática em `https://www.torqueon.com.br/nutri/`, com as
áreas do nutricionista e paciente. As duas entradas Nutri em `torqueon.html`
abrem o acesso do profissional. O sitemap inclui a nova rota; o aplicativo tem
link de retorno ao ecossistema.

O código anterior em `nutricao.html`, os aplicativos da academia e do Personal
e seus bancos não são migrados nem substituídos. A versão compartilhada passa
a mt-v859 nos três arquivos de controle de atualização.

## Dados e acesso

O Supabase separado é `mmdsmpetwhcfiyubhaah` (Torqueon Org, sa-east-1), criado
com o custo mensal autorizado pelo proprietário. A última consulta confirmou
nove migrações registradas nesse projeto. A migração
`20261008060212 torque_nutri_care_workflows` foi aplicada externamente, não por
esta sessão. Os checks de banco usam transações com rollback.
Esta publicação de arquivos não aplica DDL ao banco original.

`nutri/config.js` contém a URL do projeto, a chave publicável e o endereço do
ecossistema. Os dados de pacientes dependem de sessão Auth e RLS; não há dados
clínicos ou chaves privilegiadas no pacote estático. A demonstração usa dados
fictícios em memória e não grava no Supabase.

A confirmação e recuperação de e-mail ainda precisam destas configurações no
dashboard Auth, sem desabilitar a confirmação de e-mail:

- Site URL: `https://www.torqueon.com.br/nutri/`
- Redirect allowlist: `https://www.torqueon.com.br/nutri/**`
- Manter a URL do Site privado anterior na allowlist se ele continuar em uso.

Depois do ajuste, validar confirmação e recuperação com uma conta real. As
regressões automatizadas não enviam e-mails nem comprovam o envio real.

## Plataforma e limites

O profissional tem cadastro e prontuário, avaliações, planos e versões,
bibliotecas de alimentos e receitas, agenda, financeiro manual, questionários,
conversas, documentos e confirmação de leitura, comunidade, tarefas, relatórios,
gamificação e marca. O paciente tem plano, diário, refeições, água, hábitos,
conquistas, avaliações, questionários, consultas, documentos e perfil.

Não há geração de planos por IA, liquidação automática de cobrança, WhatsApp,
assinatura eletrônica certificada ou assinatura SaaS provisionada. Equipe é
cadastro administrativo e não concede acesso clínico. A página profissional
permanece uma prévia; esta publicação não cria uma landing individual pública.

## Isolamento da rota e verificação

Os assets, manifest, ícones, registro do worker, convites e callbacks usam o
diretório da aplicação. O worker da raiz ignora `/nutri/`. O worker Nutri tem
namespace de cache por diretório e allowlist de arquivos públicos; não guarda
respostas de Auth com parâmetros privados nem responde outras rotas/APIs.
Snapshot e rascunhos privados são limpos no logout; a fila offline continua
isolada e preservada por usuário. A revogação de acesso confirmada online
invalida o cache privado, com tratamento de falha ao remover o armazenamento.

`tests/test-nutri.js` executa as regressões reais de Auth e de assets/worker em
VM e verifica a exclusão da rota pelo worker da raiz. Ele é incluído pelo glob
existente de `tests/run.sh`. O workflow Pages só empacota o commit depois de
todas as suítes passarem e confirma o commit efetivamente servido.

Este documento descreve o conteúdo da release. A conclusão do run de Pages e
o commit publicado são evidências separadas da revisão e dos checks locais.

## Estado em 8 de outubro de 2026

Preparado localmente sobre `657bb78b73a885e03ceb9bdc806af2b5674177ae`. Após a
aprovação de rede, a branch `claude/torque-nutri-ecossistema` foi criada no
GitHub. O envio por PR, CI completo e deploy está em andamento; a conclusão do
PR, CI, merge e deploy desta release permanece pendente.
Seguir o fluxo do repositório e confirmar o sucesso do Pages antes de anunciar
o novo endereço como publicado.

## Revisão do app do paciente e avaliação corporal

O início incorpora a estrutura visual do Personal v818, capa configurável, calendário selecionável, hábitos, próxima refeição e renderer original de medalhas. A evolução integra circunferências, dobras, bioimpedância, composição segmentar, comparação por data, gráfico, relatório com proveniência, histórico de check-ins e fotos por ângulo com comparador. Registros privados, dados não informados e versões são preservados. Não há cálculo clínico por foto nem valores corporais presumidos.

Passaram 61 checks locais: 21 de acesso, 16 de assets/worker, 16 de avaliação e 8 de integração da plataforma, executados também por `tests/test-nutri.js`. As regressões de acesso incluem invalidação do cache após revogação confirmada online e falha de `removeItem`, preservando a fila por usuário.

A revisão real no navegador por CUA cobriu o início do paciente em 390 × 844 nos temas escuro e claro; avaliação e medidas em 1280 × 900; evolução em 390 × 844 com texto ampliado; estado vazio de Fotos por ângulo; e navegação Menu/Ajustes. O registro de 250 ml foi confirmado via WebMCP. O contraste do tema claro foi corrigido e confirmado na página.

Essa revisão não comprova o fluxo completo ponta a ponta, confirmação/recuperação por e-mail nem o ambiente de produção. A branch foi criada; PR, CI completo, merge e deploy permanecem pendentes.
