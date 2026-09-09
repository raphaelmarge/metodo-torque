# mt-v807 — Reliability Release

Escopo: confiabilidade, sem funcionalidade nova.

- CAS atômico de `mtapp:ptStudio` no navegador e no Postgres.
- Cliente público bloqueia `app_aluno.upsert` se o painel ainda não confirmou a revisão.
- `mustWrite()` interrompe helpers de salvamento quando a persistência local falha.
- Primeira correção da auditoria de `innerHTML`: filtro de contas do Fluxo usa DOM/textContent.
- Testes de duas sessões, conflito, edição em voo, rascunho, publicação e contrato SQL.

## Ordem de publicação

1. Aplicar `migrations/20260909_ptstudio_cas_v807.sql`.
2. Rodar `node tests/test-sync-cas.js`, `node tests/test-sync-cas-sql.js` e `node tests/test-versao.js`.
3. Publicar o cliente v807.
4. Validar Personal → aluno em dois dispositivos e offline/reconexão.

## Rollback

Reverter o cliente é seguro, mas clientes antigos não conseguem atualizar `ptStudio` enquanto o CAS do servidor estiver ativo. Não remover a proteção do servidor sem antes retirar clientes v807 e analisar conflitos pendentes.

## Pendência administrativa

A branch `main` estava sem proteção e sem checks obrigatórios em 09/09/2026. A conexão GitHub usada nesta revisão não expõe escrita de regras de branch; habilitar proteção/ruleset continua sendo uma configuração administrativa do repositório.
