# Novo Personal com produto canônico — 06/10/2026

A RPC `public.criar_personal(p_nome_academia text, p_nome_membro text)` cria, na mesma transação, a conta, o membro dono e `saas_clientes.tipo='personal'`. Retorna o mesmo JSON de `criar_academia`: `academia_id`, `nome` e `codigo_equipe`. O cadastro começa como trial, sem assinatura ou cobrança, e não depende de `ptStudio`, primeiro aluno ou treino.

A função exige usuário autenticado com `session_id` válido em `auth.sessions`. A linha da sessão permanece protegida contra remoção durante a criação. Uma trava por usuário serializa chamadas concorrentes; qualquer membresia existente impede criar outra ilha por essa RPC. Não recebe identificador de academia, não faz upsert de tipo e não altera clientes existentes. Uma falha na inserção do produto desfaz também a conta e o vínculo recém-criados.

`assets/modulo-conta.js` escolhe essa RPC exclusivamente quando `cfg.marca === 'PERSONAL'`, configuração fixa declarada em `personal.html`. O Nutri declara `NUTRI` e continua usando `criar_academia`; o cadastro genérico da academia permanece intacto. Perfil do usuário, parâmetros da URL e presença de blobs não decidem a classificação. Contas com vínculo existente seguem o fluxo anterior, sem reclassificação.

## Ordem de implantação

Aplicar `20261006163141_personal_signup_product.sql` antes de publicar o novo `modulo-conta.js`. O arquivo foi criado pela CLI Supabase 2.118.0 e depois movido para o pacote opcional; não depende de credenciais Pagar.me nem habilita pagamentos. Emite a notificação de atualização do schema do PostgREST. Não há fallback para o cadastro sem produto se essa RPC estiver ausente.

Contas antigas sem classificação canônica não são automaticamente convertidas pelo conteúdo de `ptStudio`. A elegibilidade de contratação é verificada separadamente pelo backend. Contas Gym/Nutri existentes permanecem com seu produto original.

## Evidência local

- `tests/test-personal-signup-product.js`: 12 grupos com o módulo real de cadastro em adaptadores isolados e SQL em PGlite, incluindo conta sem aluno/documento, ausência de reclassificação, sessão expirada/revogada/de outra identidade, anon/service, rollback integral e retentativa após rollback.
- Intenção de cadastro: 15 cenários; recuperação/autenticação: 13 cenários.
- Fluxo de primeiro cadastro extraído da suíte original `test-personal.js`: 8 verificações no Chromium, rede externa bloqueada e compras nativas apenas simuladas. Não representa homologação de loja.
- A verificação HTTP com Auth real em Supabase local é mantida separadamente pelo teste independente. PGlite e os adaptadores não substituem essa prova.

Nenhuma conta real foi criada e nenhuma migração remota foi aplicada nesta validação.
