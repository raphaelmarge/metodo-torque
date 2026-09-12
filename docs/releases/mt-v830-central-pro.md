# mt-v830 — Central Pro do Torque Personal

## Objetivo

Adicionar cinco fluxos profissionais em uma camada isolada e moderna, sem remover ou renomear as 18 áreas existentes do Torque Personal e sem alterar prescrições já publicadas.

## Entregas

1. **Importar ficha** — lê CSV, JSON e TXT no navegador, mostra uma prévia e salva um rascunho para revisão. XLS/XLSX e PDF só são lidos quando seus parsers locais estiverem disponíveis; nesta entrega não há dependência nova remota, então a interface orienta exportar CSV/texto quando o parser não existe.
2. **Modo presencial** — o profissional abre uma sessão, registra exercício, repetições e carga e salva a sessão com autoria do profissional.
3. **Automações** — regras explícitas transformam um questionário respondido em uma providência. A automação cria fila de trabalho; não muda treino, alimentação ou prescrição automaticamente.
4. **Agenda inteligente** — lista de espera por dia/horário e saldo de créditos de sessões em estruturas próprias, sem substituir `app_agenda`.
5. **Equipe** — responsável e substituto autorizado por aluno, validados contra os membros da mesma academia.

## Interface

A Central Pro é carregada por `assets/personal-torque-one.js` e usa `assets/personal-pro-suite.css/js`. Ela abre em um painel independente, herda os tokens Torque One, mantém temas e marca personalizada e possui adaptação para desktop e celular. Falha ao carregar esse módulo não bloqueia as demais áreas do Personal.

## Banco

Migrações:

- `20260912120000_personal_pro_suite_v830.sql`
- `20260912120500_personal_pro_suite_v830_indexes.sql`

As sete tabelas novas têm RLS, políticas restritas a membros da academia, privilégios apenas para `authenticated` e revogação explícita de `anon`. A função do gatilho de questionário fica em `torque_private`, é `SECURITY DEFINER` apenas para a execução do trigger e tem `EXECUTE` revogado de `public`, `anon` e `authenticated`.

As migrações foram aplicadas ao projeto Supabase `metodo-torque`. O Database Advisor confirmou que as tabelas novas não aparecem no alerta de RLS sem política. A primeira leitura de performance sugeriu cinco índices de cobertura de FKs; a segunda migração adiciona esses índices. Alertas antigos de outras tabelas/funções do projeto não foram alterados neste lote.

## Preservação

- Não apaga ou migra dados existentes.
- Não altera `app_aluno`, `app_agenda`, `app_quest`, `dados`, histórico, nutrição, postural, medalhas ou cobrança.
- O único vínculo com `app_quest` é um trigger `AFTER INSERT`; sem automação ativa, ele não cria nenhuma providência.
- O trigger cria apenas itens de fila e nunca publica ou modifica prescrições.
- Nenhuma chave `service_role` entra no frontend.
- Versão/cache avançam para `mt-v830`, com os assets da Central Pro no precache da raiz.

## Testes

`tests/test-personal-pro-suite.js` verifica existência das cinco abas, uso das sete estruturas próprias, reutilização do cliente Supabase, ausência de `service_role`, isolamento das rotas `data-a`, herança visual, responsividade, RLS/grants, função privada de trigger, cache e sincronização de versão.

A publicação deve continuar condicionada à suíte oficial do repositório no commit exato do PR. Não declarar homologação física em iPhone/Android sem teste em hardware real.
