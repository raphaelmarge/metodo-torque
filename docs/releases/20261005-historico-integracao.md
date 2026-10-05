# Histórico do aluno — preparação da publicação integrada

Base desta verificação: `11fc25e` (PR #871, incluindo o PR #867).
Data: 05/10/2026. Esta nota registra verificações locais; não comprova deploy.

## Mudanças para integração

- A proposta de eventos foi promovida a
  `supabase/migrations/20261005150945_treino_historico_eventos.sql`, criada com
  `supabase migration new treino_historico_eventos` (CLI 2.117.0).
  O corpo SQL continua igual à proposta revisada. As duas suítes SQL agora
  executam a migração canônica; o caminho antigo contém somente a referência.
- A migração é aditiva e não converte registros antigos. Mantém RLS, nega
  acesso direto à tabela/sequence e autoriza apenas as duas RPCs pelo token
  ativo do app. O helper de validação não é público. `SECURITY DEFINER` atende
  ao contrato de aluno por token, sem JWT; todas as relações são qualificadas
  e `search_path` é vazio. O ID de autoria é declarado pelo aparelho.
- O gerador do runtime não reconhecia os marcadores em um checkout CRLF e
  podia inserir outra cópia do histórico. Agora compara em LF, preserva a
  quebra de linha do arquivo e recusa marcadores incompletos/duplicados.
  O teste confere idempotência LF/CRLF, substituição real de fonte e preservação
  do restante do builder. Nenhum builder ou demo foi regenerado nesta etapa.

## Verificação local efetiva

Ambiente: Node 24.18.0, Playwright do lock, Chromium 153.0.8010.12/v1243,
PostgreSQL 17.11 descartável em `127.0.0.1:55437`, HTTP em porta 8807.
Somente registros sintéticos. Nenhuma consulta ou escrita no Supabase remoto.

| Suíte | Resultado |
| --- | --- |
| Histórico core | 19 cenários |
| Transporte/sync | 7 cenários |
| HTTP e replay | 7 cenários |
| Migração PGlite | 9 cenários, incluindo isolamento/revogação/paginação |
| PostgreSQL real | 3 cenários de concorrência com duas conexões e observador |
| Histórico browser | 6 cenários, duas abas e 40 escritas concorrentes |
| Players/editor | 41 verificações, incluindo original/revisões, quota, tempoBase e ausência de nova recompensa |
| Múltiplas sessões | 32 verificações nas três modalidades, mesma data e recuperação |
| Concessão e loader | 13 verificações |
| Bundle/gerador | Fonte incorporada exata e regeneração LF/CRLF aprovadas |
| Infra | 74/74, incluindo uso de BASE_URL já corrigido no PR #871 |
| Alunos/interações | 66 verificações, incluindo Remarcar com clique real sem force |

O problema de Remarcar registrado no executor anterior não se reproduziu.
Nenhuma assertion ou clique desse teste foi alterado. Não há evidência para
atribuir aquela falha ao produto ou para declarar uma causa específica.

Os testes de SQL foram repetidos depois da promoção, usando o arquivo da
migração. O protocolo mantém ACK explícito, leitura paginada, isolamento por
token, rejeição de colisões, rollback do lote inválido e revogação concorrente.

## Gate de publicação

O coordenador precisa integrar com IDs de exercício (#869) e `tempoBase: 'ativo'`
(#870), regenerar runtime e três demos, executar o CI no SHA final e instalar
a migração antes de publicar o frontend. Revisar advisors e conferir os
contratos das RPCs após a implantação, sem usar registros de clientes.
WebKit e o conjunto completo continuam sendo responsabilidade desse CI final;
esta validação dirigida não os substitui. Histórico anterior não persistido
não pode ser reconstruído. Os controles visuais preservados no PR #871 não
foram removidos.

Documentação oficial consultada: [funções e privilégios](https://supabase.com/docs/guides/database/functions)
e [changelog](https://supabase.com/changelog). A alteração de PostgreSQL
15.19/17.11 trata extensões e operadores que esta migração não utiliza.
