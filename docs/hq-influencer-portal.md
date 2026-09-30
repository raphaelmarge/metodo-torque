# Portal de influencers — implementação local para revisão

O portal reutiliza o livro de indicações de `hq_referrals_private`. Esta rodada não cria outro cálculo de comissão, altera o gateway ou ativa a campanha. O código e a proposta SQL são locais; nenhuma migração, credencial, convite por e-mail, publicação ou transferência foi realizada.

## O que pode ser revisado localmente

- `apps/influencer.html` abre em estado de preparação, sem login ou conexão externa. `?demo=1` abre uma demonstração explicitamente fictícia. A CSP contém `connect-src 'none'`; não carrega SDK ou configuração da produção.
- O extrato mostra apenas a própria parceria: cadastros atribuídos agregados, primeiros pagamentos pós-trial agregados, cupons, saldos, comissões e repasses registrados. Comissões e repasses exibem até 100 registros recentes, com quantidade total informada.
- O administrador pode preparar um vínculo de convite e revogar o acesso por RPC. Preparar grava um convite pendente; não cria usuário Auth nem envia mensagem. A interface mantém “Enviar convite” desabilitado.
- Um usuário Auth já existente, com e-mail confirmado e sessão válida, pode aceitar o convite preparado para aquele mesmo e-mail. O aceite resolve o parceiro no servidor. Não há `partnerId` arbitrário no endpoint do portal, token de parceiro na URL ou autoinscrição.
- Nomes, contatos, identificadores e conteúdo dos clientes indicados não chegam ao portal. A referência livre do comprovante administrativo também não chega: ela pode conter dados bancários ou pessoais. O extrato usa somente o identificador interno do repasse.

## Contrato de integração

O script exporta `window.HQInfluencerPortal` e CommonJS:

```js
HQInfluencerPortal.mount(root, { enabled: false }); // preparação e demonstração
HQInfluencerPortal.mount(root, { enabled: true, client: supabaseClient });
HQInfluencerPortal.mountAdmin(root, supabaseClient); // { reload, dispose }
HQInfluencerPortal.createClient(supabaseClient);
HQInfluencerPortal.demoSnapshot();
HQInfluencerPortal.renderSnapshot(snapshot, true); // HTML escapado + aviso de demo
HQInfluencerPortal.validateSnapshot(snapshot); // whitelist estrita, retorna cópia
```

`mount(..., {enabled:true})` destina-se a integração controlada futura. A rota estática entregue não o habilita; para produção será necessário configurar cliente Auth, CSP e publicação revisados. Não remover essas barreiras para fazer a prévia “funcionar” contra a produção.

RPCs propostas:

| RPC | Autoridade e efeito |
|---|---|
| `hq_influencer_admin_snapshot()` | Admin HQ, sessão ativa e e-mail confirmado. Retorna parceiros ativos mínimos e até 200 convites recentes. |
| `hq_influencer_prepare_invite({partnerId,email,expiresAt,reason})` | Admin HQ. Normaliza e-mail, exige parceiro ativo, motivo e validade futura de até 30 dias. Retorna `delivery: unavailable`, `authUserCreated: false`. |
| `hq_influencer_revoke_access({inviteId,reason})` | Admin HQ. Revoga convite e vínculo; preserva comissões, pagamentos e auditoria. |
| `influencer_accept_invite()` | Usuário Auth com e-mail confirmado, sessão ativa e convite pendente correspondente. Não recebe parceiro ou e-mail do navegador. |
| `influencer_portal_snapshot()` | Vínculo ativo derivado de `auth.uid()`, convite aceito, e-mail ainda correspondente e parceiro ativo. Sem argumentos. |

O adaptador JS usa `{p_input: input}` nas RPCs com entrada. Não faz consultas diretas a tabelas. O snapshot v2 contém somente `version`, `asOf`, `partner`, `campaign`, `counts`, `firstPayments`, `balances`, `coupons`, `commissions`, `payments`, `limits` e `availability`. Campos extras ou capacidades inesperadas são recusados antes da renderização.

`counts.firstPaymentsAfterTrial` conta fatos históricos de primeiro recebimento confirmado após o trial, exclusivamente para as indicações do parceiro. Reutiliza `hq_referrals_private.first_payment_json(customers)` de `supabase/hq-referrals-payment-contract-proposal.sql`: histórico canônico verificado e evento de recebimento corroborado. Não conta linhas de comissão ou repasse nem aceita `firstPaidAt` isolado como prova. Um recebimento comprovado pode existir com campanha inativa e sem comissão. O fato histórico é distinto de assinatura ativa, conversão, MRR, receita líquida e elegibilidade de comissão; ajustes não são recalculados no portal.

`firstPayments` contém `status`, `scope: historical_first_payment`, `source`, `verifiedAfterTrialCount` e `unknownCount`. A fonte é `verified_ledger_events`; sem helper é `unavailable`; ao receber v1, é `legacy_unverified`.

| Cobertura | Contador e apresentação |
|---|---|
| `ready` | Todas as indicações têm fato classificável; contador total igual ao número pós-trial comprovado. Consulta pronta com conjunto vazio confirma zero. |
| `partial` | Total `counts.firstPaymentsAfterTrial: null`; quantidade comprovada exibida como “N confirmados”, com número de indicações sem prova suficiente. |
| `unavailable` | Total e quantidade comprovada `null`; mostra “Indisponível”. Ausência de helper ou de qualquer prova válida não vira zero. |

Trials e registros legados sem prova continuam desconhecidos. A UI aceita payload v1 para preservar comissões/repasses, mas descarta seu antigo contador derivado de comissões, normalizando-o para v2 indisponível. A demonstração v2 contém cobertura parcial sintética e continua identificada como fictícia. O agregado não expõe IDs, datas ou eventos individuais de clientes.

O helper complementar é opcional para a consulta geral, mas necessário para esse KPI. Sua ausência mantém a métrica indisponível. Nenhuma migration original foi alterada. Testes adicionais cobrem helper ausente, comissão/repasse “pago” sem prova, recebimento sem comissão e com campanha OFF, cobertura parcial/completa/vazia, recebimento anterior ao fim do trial, isolamento A/B, v1 com contador enganoso e cobertura v2 inconsistente.

## Autorização e limites

`supabase/hq-influencer-portal-proposal.sql` é uma proposta transacional para revisão, não uma migração registrada/aplicada. Depende do ledger final `20260930193716_hq_referrals_ledger.sql`, `hq_sou_admin`, `auth.users`, `auth.sessions`, `auth.uid()` e `auth.jwt()`.

O schema novo armazena apenas convites, vínculos e auditoria. Todas essas tabelas têm RLS sem acesso direto pelas funções da API. As funções privilegiadas têm `search_path` vazio e guardas internas; wrappers públicos exigem `authenticated`. Anônimo e `service_role` não recebem EXECUTE das RPCs do portal. A sessão precisa existir em `auth.sessions` e não estar além de `not_after`. Usuário apagado, banido, sem e-mail confirmado, com e-mail trocado ou sessão revogada não acessa o extrato.

A autorização não usa `user_metadata`. Códigos de cupom não são credenciais. Não há senha temporária produzida pelo HQ nem URL secreta de autenticação própria.

Há um vínculo ativo por usuário e por parceiro. Convites expirados permanecem no histórico como pendentes, mas não podem ser aceitos; antes de substituir um, o administrador o revoga explicitamente com motivo. Uma segunda tentativa de cadastro não deve sobrescrever silenciosamente o destinatário. Pausar o parceiro também bloqueia a consulta.

As regras comerciais permanecem: preço mensal R$49,90; trial de 14 dias; primeira mensalidade elegível com desconto de 40% = R$29,94; comissão única de R$19,96 sobre o preço cheio; reserva R$4,99; parcela Torque R$4,99 antes dos custos. Renovações não comissionam. Campanha inativa até integração financeira e políticas pendentes serem concluídas. Nenhuma regra de compra antecipada é criada pelo portal.

## Onboarding e recebimento ainda pendentes

O fluxo para uma pessoa sem conta Auth não está completo. A equipe deverá implementar e homologar o convite oficial server-side, a confirmação/definição segura de acesso e a recuperação de conta, com URLs autorizadas e prevenção de abuso. A autorização do preparo do convite não autoriza seu envio nesta rodada. Nenhum cliente de navegador deve receber chave administrativa.

Os métodos oficiais Auth são a referência para essa etapa: [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail). O controle por `session_id` corresponde ao mecanismo documentado de [sessões Supabase](https://supabase.com/docs/guides/auth/sessions). Grants, RLS e autorização interna devem ser revisados em conjunto: [documentação RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Não são coletados CPF, conta bancária, chave Pix ou documento no portal entregue. O cadastro de recebimento está indisponível. Se for necessário após existir comissão a pagar, implementar coleta mínima por finalidade em armazenamento restrito, com auditoria, retenção e processo de validação. Não acrescentar dados bancários ao snapshot público nem às referências livres do ledger. O portal não executa transferências.

## Verificação local

```text
node tests/test-hq-influencer-portal.js
```

O teste executa o SQL real em PGlite efêmero com papéis anônimo, usuário autenticado, administrador e service-role fictícios; utiliza usuários e sessões sintéticos. Cobre parceiros A/B, e-mail cruzado/não confirmado, metadata manipulada, ausência de login, convite expirado/revogado, sessão revogada/expirada, parceiro pausado, escrita direta negada, parâmetros extras e preservação do ledger.

O navegador usa servidor efêmero em loopback e mocks; conexões externas são bloqueadas. Cobre demonstração em 320 px, preparo administrativo sem envio, resposta atrasada após logout e troca de identidade A→B, inclusive a retirada do acesso administrativo. Troca de login, refresh de token e atualização de usuário limpam o DOM e invalidam respostas em voo antes de consultar a autorização novamente; chamadas Auth/RPC ficam fora do callback síncrono de Auth. Não é homologação de Supabase Auth hospedado, de SMTP/convite real, de concorrência entre conexões PostgreSQL, de gateway ou de produção. O changelog Markdown do Supabase não pôde ser lido pela ferramenta web nesta rodada; as páginas oficiais de sessões, convite e RLS foram consultadas.

Próximo gate: revisão do snapshot final, teste integrado de Auth em ambiente autorizado, aprovação da migração/deploy, processo oficial de convite e validação financeira. A prévia local não depende desses serviços e não demonstra que eles estejam implantados.
