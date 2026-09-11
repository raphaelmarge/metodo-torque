# Concorrência do PostgreSQL real

`test-sync-postgres-real.js` usa duas conexões independentes e observa o bloqueio
efetivo com `pg_blocking_pids`, antes de liberar a transação vencedora. Não usa
PGlite, sleeps como prova de bloqueio, banco hospedado nem alunos reais.

Requisitos: Node.js e PostgreSQL 15 ou superior, em instância local descartável.
O CI pode fornecer o serviço PostgreSQL 17.11. O usuário SQL precisa de
`CREATEDB` e permissão para criar os papéis de teste `anon`/`authenticated`, caso
não existam. Nunca use túnel para um servidor remoto ou uma instância com dados
reais; loopback é uma restrição adicional, não prova de que o servidor é descartável.

```sh
npm ci --prefix tests/sql --ignore-scripts
PGTESTURL=postgresql://postgres:postgres@127.0.0.1:55432/postgres node tests/test-sync-postgres-real.js
```

O runner aceita somente endereço literal de loopback e conexão sem parâmetros
adicionais. Cria um banco `torque_sync_test_<nonce>`, lê os blocos canônicos de
`supabase-setup.sql`, adiciona apenas o substituto local de `auth.uid()` e fixtures
sintéticas. Ao terminar, fecha suas conexões e remove somente o banco que criou.
As funções CAS, políticas, triggers e histórico não são versões copiadas nos
testes. Os privilégios de tabela comuns ao esquema público do Supabase são
concedidos explicitamente na fixture; os grants/revokes das RPCs vêm do produto.

Sem `PGTESTURL` ou dependência instalada, o teste falha com instrução clara; não
declara aprovação nem substitui concorrência real por um mock. Também informa a
versão do servidor, os PIDs distintos e cada cenário. Nenhuma credencial é
impressa. A autenticação HTTP/JWT do Supabase e o estado instalado em produção
continuam fora do escopo: os testes exercitam o PostgreSQL com papéis e claims
controlados, incluindo RLS, cliente legado e publicação atômica.
