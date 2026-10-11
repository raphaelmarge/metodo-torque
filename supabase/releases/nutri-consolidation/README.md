# Base estrutural do Torque Nutri

Snapshot de catálogo consultado em **11/10/2026**, exclusivamente no projeto
Supabase Nutri `mmdsmpetwhcfiyubhaah`, separado da academia e do Personal.
Foram lidos metadados, definições de funções, permissões e identificadores de
migração. Não foram lidas linhas de pacientes, transações ou usuários Auth.
Nenhuma alteração de banco, Auth, gateway ou configuração remota foi executada.

## Conteúdo e reprodução

- `snapshot.json`: 15 tabelas de `public`/`private`, 138 colunas, 110 constraints,
  58 índices, 43 policies, 44 funções, 21 triggers, grants de tabela/coluna,
  ACLs dos schemas/funções, default privileges, extensões e nove identificadores
  de migração. Todas as 15 tabelas observadas tinham RLS habilitada.
- `snapshot-query.sql`, `metadata-extra-query.sql`, `relations-query.sql`:
  consultas de catálogo somente leitura que documentam a captura. O histórico
  de migrações foi obtido pelo conector `list_migrations`; a última consulta
  de `relations-query.sql` documenta a consulta SQL equivalente.
- `replay-snapshot.cjs`: recompõe a estrutura com as definições coletadas,
  incluindo grants por coluna, ACLs das RPCs, RLS e triggers.
- `snapshot.sql`: saída determinística do gerador. É uma base estrutural para
  ambiente descartável, **não uma migração para aplicar sobre produção**.
- `tests/test-nutri-schema-isolation.js`: casos sintéticos executados sobre
  PostgreSQL/PGlite, sem conexão de rede ou dados reais.

Na raiz do repositório:

```sh
npm ci --prefix tests/runtime --ignore-scripts --no-audit --no-fund
node supabase/releases/nutri-consolidation/replay-snapshot.cjs > /tmp/nutri-snapshot.sql
cmp /tmp/nutri-snapshot.sql supabase/releases/nutri-consolidation/snapshot.sql
node tests/test-nutri-schema-isolation.js
```

O helper `createSnapshotDb()` prepara somente roles sintéticos, uma tabela
`auth.users` mínima, `auth.uid()`/`auth.jwt()` controladas pelo teste e pgcrypto.
Não copia o serviço Auth real. `snapshot.sql` depende desse preâmbulo ou de um
ambiente equivalente. O schema Nutri tem dependências entre funções/tabelas;
o gerador cria tabelas, funções, defaults, constraints, índices, triggers,
policies e grants nessa ordem, com `check_function_bodies=false` apenas durante
a construção. Os testes executam as funções relevantes após a montagem.

O snapshot não inclui dados, configurações HTTP/JWT/PostgREST, callbacks de Auth,
Storage, cron, variáveis, segredos nem código de Edge Functions. Os nomes das
migrações remotas documentam proveniência, mas não reconstituem suas versões
históricas. Default privileges e extensões gerenciadas foram inventariados,
mas não são reaplicados integralmente no banco de teste. O replay usa os grants
explícitos capturados dos objetos existentes. Nenhum histórico foi inventado.

## Resultado P0 e limites

**17 cenários locais passaram.** Cobrem dono/terceiro/paciente/anon, notas
clínicas privadas, FKs compostas, histórico por visibilidade, CAS de lançamento,
idempotência de diário, convite com email confirmado e expiração, revogação com
vínculo esperado e rejeição de replay depois da revogação.

Não foi encontrada autorização entre clínicas indevida nos casos exercitados.
A combinação de `clinics.owner_id UNIQUE`, FK `(clinic_id, owner_id)` e FK
`(patient_id, owner_id)` fecha também o vínculo financeiro com a clínica atual.
Isso não certifica todos os fluxos: metadata e PGlite não homologam produção,
email, recuperação de sessão, URL de callback, assinatura JWT, concorrência de
duas conexões reais, restauração de backup, nem todos os comandos da comunidade,
prescrição, questionários, avaliação e agenda.

Achados concretos de contrato:

1. **`financial_entries.note` não é um campo interno.** O paciente tem SELECT
   da receita vinculada a ele, incluindo essa coluna; o teste reproduz a leitura.
   A interface deve dizer “Observação visível ao paciente”. Separar notas
   internas exige outra estrutura/permissão, não só esconder o campo na tela.
2. **O financeiro legado não impõe máquina de estados no servidor.** O dono
   pode reabrir `paid` para `pending` com `paid_on=null` por UPDATE direto. O
   trigger incrementa a versão e arquiva o snapshot anterior, mas não exige um
   comando de estorno, motivo ou chave idempotente. O teste registra esse limite
   explicitamente; não o apresenta como comportamento de segurança desejável.
3. **CAS legado é responsabilidade do comando do cliente.** O guard incrementa
   `version`; atualizar com `WHERE version=esperada` e conferir a linha retornada
   impede sobrescrita por aquela UI. Um cliente que omite a condição ainda pode
   atualizar. Ledger, parciais e correções contábeis precisam de RPC transacional
   e bloqueio das gravações diretas, acompanhados de migração e testes próprios.
4. **Nota clínica de `patients.notes` tem proteção distinta.** SELECT direto é
   negado; `clinician_patient_details` autoriza somente o dono. Não confundir
   esse campo com a observação financeira acima.

Nenhum erro de autorização do conector ocorreu nas consultas efetivamente
executadas. Não foram realizados ataques contra registros reais nem mudanças
temporárias de policies para testar a produção.

## Frontend atual versus migração

Cabem no contrato instalado: filtros de vencimento e caixa (`paid_on`, que é
DATE), estados pending/paid/void, registro manual integral, conferência de CAS,
recibo administrativo, CSV com campos permitidos, e rótulos corretos para notas.

Exigem contrato de banco adicional: competência explícita, pagamentos parciais,
parcelas geradas atomicamente, devoluções registradas sem apagar o recebimento,
saldo calculado por eventos, correção com motivo e idempotência, e acesso de
leitura ao histórico financeiro. Uma proposta local de migração e seus testes
podem acompanhar esta pasta; sua existência não comprova instalação remota.
O cliente deve detectar a capacidade de forma explícita e manter o fluxo legado
enquanto ela estiver ausente. Não usar recursos genéricos JSON como livro-caixa.

Na proposta financeira local, sete cenários adicionais de concorrência passaram
em PostgreSQL 17.11 descartável com duas conexões e `pg_blocking_pids()`. O runner
`tests/test-nutri-finance-concurrency.js` usa o snapshot e a migração desta pasta;
os detalhes e limites estão em [FINANCE-CONTRACT.md](FINANCE-CONTRACT.md).

A proposta isolada está descrita em [FINANCE-CONTRACT.md](FINANCE-CONTRACT.md),
com SQL, assinaturas, transições, testes próprios e condições de instalação.
Ela permanece local; os 17 cenários acima descrevem somente o baseline.

Gateway/PIX/cartão, SMTP/Resend, cobrança externa, alteração das URLs Auth e
homologação com contas reais não fazem parte da captura. Não há efeito econômico
ou mensagem externa neste pacote.

## Referências consultadas

- [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Privilégios por coluna](https://supabase.com/docs/guides/database/postgres/column-level-security)
- [Changelog consultado](https://supabase.com/changelog)
- [PostgreSQL 15.19/17.11: alterações de setembro/2026](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

O servidor observado é PostgreSQL 17.11. O aviso de setembro trata de índices
ltree/btree_gist e cifras legadas do pgcrypto; não foi identificada dependência
dessas funções nos metadados públicos/privados aqui capturados. pgcrypto é usado
para UUID, bytes aleatórios e hash; isso não equivale a auditoria dos dados
criptografados de toda a infraestrutura.
