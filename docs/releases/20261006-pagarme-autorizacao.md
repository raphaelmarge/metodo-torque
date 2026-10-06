# Pagar.me legado — autorização das cobranças de alunos

Revisão de 6 de outubro de 2026. O código publicado da função `pagarme` v8,
`verify_jwt=false`, foi comparado à base `fd215666`: diferença somente de uma
linha vazia final após normalizar LF. A correção abaixo exige deploy separado
da Edge Function; o commit do site não instala o backend.

## Problema e correção

A autenticação anterior comprovava o usuário, mas consulta/cancelamento aceitavam
IDs do navegador sem verificar a academia do objeto no Pagar.me. A criação
etiquetava o primeiro vínculo encontrado, sem distinguir dono de colaborador.

- A identidade continua validada em `/auth/v1/user`, sem decodificação local
  de JWT ou confiança em `user_metadata`. Auth anônimo também é recusado.
- Toda ação financeira lê os vínculos atuais `membros.papel=dono`. Falha no
  banco responde indisponibilidade (503), sem seguir para o gateway.
- A criação usa a academia validada no servidor. Com mais de uma academia
  própria, requer `academiaId` (ou `academia_id`) explícito e validado; não
  escolhe o primeiro resultado arbitrariamente. O cliente legado sem escolha
  recebe 409 nessa situação.
- Consulta e cancelamento fazem GET autenticado do objeto no gateway e
  conferem ID e `metadata.academia_id` contra os vínculos de dono. Não usam a
  metadata recebida do navegador como prova. A resposta não entrega dados de
  outro profissional.
- O cancelamento repete a leitura do vínculo após o GET e só então faz DELETE.
  Remoção do dono durante a espera, falha de banco e ausência da etiqueta impedem
  o DELETE. Falha na consulta/cancelamento não anuncia sucesso.
- Objetos/pedidos com `product=torque_personal_saas` são recusados. Esta função
  permanece dedicada às cobranças dos alunos; não ativa assinatura do Personal.
- Novos objetos ganham `product=torque_aluno` e a academia validada. Objetos
  legados com academia canônica e sem marcador de produto continuam aceitos.
  Objetos sem academia na metadata são negados e exigem conciliação manual.

Não há migração, alteração de preço, cartão bruto, segredo no frontend, novo
fluxo SaaS ou chamada ao gateway real. Aliases com hífen, `tokenCartao`, payloads
de sucesso, vencimento e métodos de pagamento existentes foram preservados.

## Verificação

- `tests/test-pagarme-autorizacao.js`: 34 cenários aprovados, executando o handler
  TypeScript real com `fetch` substituído. Dois profissionais/academias, dono,
  colaborador, ausência/erro de vínculo, multiacademia, metadata manipulada,
  objeto alheio/sem vínculo/SaaS, aliases e falhas de GET/DELETE.
- `tests/test-web-security.js`: 4 cenários aprovados.
- `tests/test-infra.js`: 74 verificações aprovadas.

O teste não substitui homologação com uma conta Pagar.me e credenciais de teste.
Não foram criadas, cobradas ou canceladas assinaturas reais. Uma alteração de
permissão que aconteça depois da última checagem e antes da requisição externa
não pode ser atomicamente coordenada com o gateway por esta API legada.

Referências conferidas: [changelog Supabase](https://supabase.com/changelog.md),
[autenticação em Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt)
e [service role e RLS](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z).
Nenhuma mudança incompatível do changelog consultado se aplica a este handler
HTTP sem dependências do SDK.
