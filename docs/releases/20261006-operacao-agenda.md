# Operação e pedidos do aluno — revisão de 6/10/2026

Base revisada: `fd215666`. Implementação local, com instalação remota a cargo da
integração da release. Não habilita equipe, pagamentos, campanhas ou mensagens.

## Alterações

- Automações: erros resolvidos pelo cliente Supabase e respostas nulas não são
  listas vazias. A tela distingue consulta, falha com recarga e resultado válido,
  informa horário da consulta e o limite de 40 automações/30 providências.
- HQ: trial sem status/prazo, acesso desconhecido, fonte ausente ou explicitamente
  incompleta não produzem contagem zero. Valores financeiros ausentes não tornam
  títulos quitados. A consulta confirmada e a tentativa posterior são distintas.
- Trial usa `academias.assinatura_vence` apenas quando o estado de assinatura é
  trial e o prazo é finito. Não deduz vencimento a partir de cadastro comercial.
- Exportação: antes de baixar o CSV, registra no servidor ator, relatório,
  filtros mínimos, corte, número de linhas e SHA-256 do arquivo. Falha na
  autorização/auditoria impede o download. O registro atesta a solicitação, não
  que o aparelho terminou o download. Não armazena conteúdo do CSV nem PII.
- Agenda: chamadas concorrentes ao mesmo token serializam com revogação e com
  o limite de dez pedidos. Token/dia/hora já pedido ou confirmado retorna o
  mesmo ID sem alterar observações. Recusa permite nova solicitação. Formatos
  `9:00` e `09:00` têm a mesma intenção; hora inválida é recusada. Legado sem
  hora continua aceito, sem reescrever registros anteriores.

## Instalação explícita

Migrations criadas com Supabase CLI 2.118.0 `migration new`:

1. `supabase/migrations/20261006144200_agenda_aluno_idempotente.sql`
2. `supabase/migrations/20261006144202_hq_operacao_estados_exportacao.sql`
3. `supabase/migrations/20261006145701_hq_suporte_legado_leitura.sql`

Aplicar somente esses arquivos após CI da integração; não executar `db push`.
HQ pressupõe OPS administrativo previamente instalado. Assinaturas das RPCs
existentes são preservadas. Nova RPC de auditoria exige `authenticated`, o
porteiro administrativo existente e permissão do relatório; anon/service_role
não recebem EXECUTE. O schema privado continua sem acesso direto.

`supabase-setup.sql` acompanha a nova RPC da agenda em instalações novas.
Rollback: restaurar apenas as definições anteriores de `app_agenda_pede` e
`hq_ops_snapshot`; reverter frontend para não exigir auditoria. Preservar
`torque_hq.audit`, `commands` e todos os pedidos; nenhum backfill ou exclusão.

## Evidência local

- `test-operacao-prioridades-sql.js`: 37 verificações PGlite, inclusive ACL,
  isolamento por token, revogação, reenvio, limite, preservação e auditoria.
- `test-agenda-aluno-concorrencia-pg.js`: 5 grupos em PostgreSQL 17.11 real,
  conexões independentes e espera por locks observada no servidor. Um pedido,
  dez no máximo e revogação sem inserção tardia.
- `test-operacao-estados-browser.js`: 12 verificações Chromium isolado,
  erros/recarga/zero verdadeiro e download condicionado à auditoria.
- Regressões existentes: métricas, seções, dados, relatórios e HQ browser.
  Dados sintéticos; nenhum envio, cobrança ou registro de cliente alterado.

## Limites

O suporte legado passa a ter consulta administrativa paginada e somente leitura
na mesma área de atendimento. A terceira migração não chama as funções antigas
que marcam leitura, nem importa mensagens como casos. SQL13 e browser14 cobrem
paginação com empates, filtro, escopo administrativo, recarga, XSS, preservação
integral de linhas e telas 320/390/768/1440 sem overflow. A entrega externa
continua sem confirmação: uma resposta armazenada não comprova recebimento.
Pedido de cancelamento permanece solicitação administrativa; não cancela no
provedor nem revoga acesso. Suporte continua distinguindo nota interna e
rascunho não enviado. `staff_enabled=false` é preservado.

O snapshot operacional ainda reúne coleções completas para que totais e
históricos permaneçam consistentes. Paginação dessas fontes exige RPCs de
agregação e detalhe com o mesmo corte, autorização e filtros; não se deve
substituir por `limit` e apresentar subtotal como total. Antes de ampliar a
operação, medir latência/tamanho com volume sintético e definir limiar para
migrar a consulta (meta a validar: p95 abaixo de 2s e resposta abaixo de 2 MiB).
Isso é evolução de escala, não evidência de falha atual em produção.
