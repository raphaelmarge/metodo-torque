# Financeiro manual Nutri — proposta local v1

**Não aplicado ao Supabase.** A migration está isolada do diretório de
migrações da academia/Personal:
[20261011184245_nutri_manual_finance_ledger.sql](supabase/migrations/20261011184245_nutri_manual_finance_ledger.sql).
Foi criada com `supabase migration new nutri_manual_finance_ledger`, CLI
oficial fixada em `2.81.3`, usando esta pasta como `--workdir`.

O alvo previsto é exclusivamente Nutri `mmdsmpetwhcfiyubhaah`, sobre o
[snapshot estrutural](README.md). O SQL registra fatos manuais confirmados;
não executa cobrança, transferência, estorno bancário ou devolução de dinheiro.

## API e autorização

As três RPCs públicas usam `SECURITY INVOKER` e são executáveis somente por
`authenticated`. As implementações privilegiadas ficam em `private`, com
`search_path=''`, autenticação por `auth.uid()` e checagem de propriedade.

- `nutri_finance_capabilities()` → `{version:1,manual:true,installments:true,
  partial_payments:true,refunds:true,competency:true,idempotent:true}`.
- `nutri_finance_snapshot()` → `{version:1,entries:[],events:[]}`. O dono lê
  seu consultório; o paciente lê somente receitas vinculadas à sua conta.
- `nutri_finance_command(p_operation_id uuid,p_command jsonb)` →
  `{version:1,operation_id,entry_ids:[],entries:[],events:[]}`. Somente o dono
  do consultório grava. A resposta contém as entradas afetadas e os eventos
  criados pela operação, sem substituir os demais eventos do cliente.

O paciente recebe somente eventos `opening`, `payment` e `refund`; a RPC
remove `reason`, `operation_id`, `previous_snapshot`, `owner_id` do evento e
`note`/`owner_id` do snapshot. A revogação do vínculo remove essas leituras.
**A coluna legada `financial_entries.note` continua visível ao paciente pela
API direta**, conforme a policy capturada. Não deve ser rotulada como interna.

## Comandos

Os valores são inteiros em centavos, positivos, até 1.000.000.000 por
lançamento e por criação conjunta de parcelas. Datas usam `YYYY-MM-DD`.
`competency_on` é opcional/nula; ausência significa desconhecida, sem inferir
competência pelo vencimento. São permitidas até 60 parcelas por criação.

| `action` | Campos |
| --- | --- |
| `create` | `clinic_id`, `patient_id` opcional, `kind` (`income`/`expense`), `title`, `amount_cents`, `due_on`, `competency_on` opcional, `method`/`note` opcionais. |
| `create` com parcelas | Mesmos dados comuns, `amount_cents` como total e `installments:[{amount_cents,due_on,competency_on}]`. A soma deve corresponder ao total. O servidor cria todas ou nenhuma. |
| `correct` | `entry_id`, `expected_version`, `reason` obrigatório; campos opcionais `title`, `amount_cents`, `due_on`, `competency_on`, `method`, `note`. Campos omitidos são preservados; `competency_on:null` limpa a competência. |
| `pay` | `entry_id`, `expected_version`, `amount_cents`, `occurred_on`, `method` opcional, `reason` opcional. |
| `refund` | `entry_id`, `expected_version`, `amount_cents`, `occurred_on`, `reason` obrigatório, `method` opcional. |
| `void` | `entry_id`, `expected_version`, `reason` obrigatório. |

O cliente gera uma operação UUID por intenção do usuário e conserva exatamente
o mesmo UUID e payload ao reenviar depois de falha ambígua de rede. Mesmo dono,
UUID e payload retornam a resposta original sem novo evento, antes da checagem
de versão. Reutilizar o UUID com dados diferentes falha (`22023`). Outro dono
tem um espaço de operações próprio, sem acesso à resposta alheia.

Alterações bloqueiam a entrada com `FOR UPDATE` e exigem a versão corrente.
Versão desatualizada falha (`40001`); o cliente deve atualizar e pedir nova
revisão, sem reaplicar silenciosamente a ação. Operações idempotentes usam
trava transacional por dono/UUID. Falhas desfazem entrada, eventos e registro
da operação conjuntamente.

## Projeção e auditoria

`entries` conserva os campos legados e acrescenta `competency_on`,
`installment_group_id`, `installment_index`, `installment_count`,
`ledger_managed:true` e estes totais:

| Campo | Significado |
| --- | --- |
| `received_cents` | Soma bruta de pagamentos e abertura legada paga. Para despesa, é o valor pago pelo consultório. |
| `refunded_cents` | Soma das devoluções confirmadas manualmente. |
| `net_paid_cents` | Bruto menos devoluções. |
| `balance_cents` | Valor contratado menos bruto; zero se cancelado. Devolução não recria dívida. |

Pagamento parcial mantém `status:'pending'` e `paid_on:null`; quitação usa
`status:'paid'` e a data mais recente dos pagamentos efetivos, mesmo se a
última baixa digitada for retroativa. Caixa usa as datas dos eventos, não a
data de criação nem competência. Registro de pagamento no futuro falha.

Devolução exige pagamento líquido suficiente e não pode anteceder os
recebimentos positivos já registrados. Devolução integral conserva a
quitação e reduz o líquido a zero; não permite cobrar novamente. Para
cancelar um saldo com pagamento parcial, esta v1 não oferece perdão de dívida
ou baixa por perda: a correção auditada pode ajustar o valor para o total já
recebido, após revisão do profissional. Cancelamento `void` exige bruto zero.
Correção de valor abaixo do bruto recebido falha. Lançamento cancelado não
pode ser reaberto nesta v1.

Eventos contêm `id`, `entry_id`, `owner_id`, `operation_id`, `kind`, `source`,
`amount_cents`, `occurred_on`, `method`, `reason`, `entry_version`,
`entry_snapshot`, `previous_snapshot` quando aplicável e `created_at`.
`kind` admite `opening`, `create`, `correction`, `payment`, `refund`, `void`.
O snapshot conserva os dados do lançamento, nome do consultório, profissional,
CRN e paciente na data do registro. Um recibo de pagamento usa o valor/data do
evento e esses dados históricos, sem reescrever o original ao mudar cadastros.

A migração cria uma abertura `source:'legacy'` para cada entrada existente.
Se já estava paga, preserva `amount_cents` e `paid_on`; nos demais estados o
valor da abertura é zero. Isso registra proveniência do dado antigo, sem
afirmar confirmação bancária, recriar pagamentos parciais inexistentes ou
produzir um recibo novo. A competência antiga continua desconhecida.

`private.nutri_finance_events` e `private.nutri_finance_operations` têm RLS,
nenhum grant aos clientes e triggers que rejeitam UPDATE/DELETE/TRUNCATE.
Histórico de correção inclui antes/depois, inclusive competência isolada.
Administradores PostgreSQL continuam capazes de alterar o esquema; estes
controles não constituem proteção contra um administrador privilegiado.

## Verificação e aplicação futura

`node tests/test-nutri-finance-sql.js` passou **18 cenários** sobre o snapshot
recomposto em PostgreSQL/PGlite descartável: abertura, grants, roles, tenant,
parcelas atômicas, centavos, competência, CAS, retry, parciais, quitação,
devolução, cancelamento, snapshot histórico, data retroativa, paciente,
revogação e imutabilidade. Todos os dados de teste são sintéticos.

`node tests/test-nutri-finance-concurrency.js`, com `PGTESTURL` apontando para
PostgreSQL **17.11** local e descartável, passou **sete cenários adicionais**
em 11/10/2026. Duas conexões independentes (PIDs 80 e 81 nessa execução) e um
observador comprovaram os bloqueios com `pg_blocking_pids()` antes de liberar
COMMIT/ROLLBACK: retry idempotente concorrente, mesmo UUID com payload diferente,
CAS na mesma versão, versão antecipada sem pagamento excessivo, devoluções sem
líquido negativo, rollback sem evento órfão e isolamento entre donos. O teste
carrega o snapshot e esta migração, cria um banco aleatório e o remove ao final.

PGlite continua sendo a verificação funcional de uma conexão; o teste acima é
a evidência separada de concorrência real. PostgREST HTTP, cache de schema, JWT
real, backup/restauração, Supabase Advisors e aplicação remota não foram
homologados por esses testes locais. A revisão de Advisors e dos demais itens
operacionais continua necessária antes da instalação.

A aplicação **revoga INSERT/UPDATE/DELETE/TRUNCATE diretos de clientes**,
inclusive grants por coluna. Um cliente antigo aberto poderá ler, mas sua
gravação financeira será recusada. O frontend v1 compatível precisa estar
publicado e as sessões atualizadas antes de habilitar o banco. Conferir o
projeto exato, a versão instalada, a diferença contra este snapshot e um
backup recuperável antes de qualquer aplicação autorizada.

Durante a ausência das RPCs, o cliente mantém apenas o contrato legado. Falha
de rede/autorização ou erro do comando não autorizam contornar a RPC fazendo
UPDATE direto. A detecção de capacidade não grava dados.

Depois de eventos reais, não há rollback automático seguro que descarte o
ledger: restaurar grants antigos ou remover tabelas perderia o contrato de
auditoria. Correções posteriores exigem migração progressiva que preserve
eventos e operações. Reverter código não devolve dinheiro, desfaz cobrança ou
executa qualquer ação econômica.
