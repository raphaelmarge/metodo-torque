# Vendas e indicações — implementação local para revisão

Base: `7019199b27d60068c581a8dd83c08a6df2d7f83d`. Branch local `local/vendas-indicacoes`.
Revisão local concluída, incluindo a extensão do HQ geral e a migração testada em banco descartável. Nenhum commit, push, merge, deploy, migração em produção, nova conta/credencial ou pagamento real. Os resultados atuais e os limites estão registrados abaixo.

## Estado comercial desta revisão

- Decidido: TORQUE PERSONAL por **4990 centavos/mês**, cartão recorrente no site, **14 dias grátis sem cartão**, opção **Assinar agora** além do trial.
- Comissão: base é o **preço cheio**, nunca o líquido efetivamente pago.
- **Confirmado por Raphael: 40% de desconto, 40% de comissão sobre o preço cheio, 10% de reserva operacional e 10% para o Torque.** A proposta 50/50 foi substituída e não deve orientar a oferta.
- Com preço cheio de 4990 centavos: desconto 1996, primeira cobrança 2994, comissão 1996, reserva 499 e parcela Torque 499. Reserva de 10% **não é uma tarifa confirmada do gateway**, nem os 499 centavos restantes são lucro garantido; custos reais precisam de apuração.
- **Campanha aprovada comercialmente e desligada operacionalmente.** A configuração local deve permanecer `approved: true`, `enabled: false`. Não há oferta promocional ativa, cupom validado no checkout real ou gateway integrado. Fixtures históricas não são cupons reais.
- Cupom só poderá descontar a primeira mensalidade. A partir da segunda, preço normal de 4990, sem outra comissão de aquisição.
- Pagamento antes de terminar o trial: decisão pendente. O core devolve `needs_review`; ele não presume direito de comissão nem tenta postergar cobrança. É preciso escolher entre manter os 14 dias antes de cobrar ou uma política explícita para compra antecipada.

## Implementação local anterior à extensão do HQ

1. Preço e metadados comerciais coerentes em `personal-vendas.html`, `app-personal-trainer.html`, `torqueon.html` e calculadora da landing. O trial de outros produtos não foi alterado.
2. CTAs de trial usam `personal.html?entrada=criar`; o módulo de conta só aplica essa intenção ao PERSONAL, após conferir sessão. Recuperação, sessão existente e opção explícita de entrar prevalecem. Não muda políticas de autenticação ou trial.
3. CTAs **Assinar agora** abrem `personal-assinatura.html`, com resumo de preço/trial/renovação e pagamento explicitamente indisponível. Não há adaptador de checkout, página de sucesso falsa ou gravação de acesso.
4. `assets/personal-sales-intent.js` preserva `cupom`/`ref` nos links próprios. Só grava em `sessionStorage` depois de ação explícita do visitante, com status `unverified`. Códigos com formato plausível continuam não validados; o preço não muda. Não há cookie automático, analytics, chamada externa ou reserva de benefício.
5. Core puro em `supabase/functions/_shared/personal-sales.mjs` modela política versionada, cotação em centavos, resolução em catálogo confiável, primeira mensalidade após trial e apuração/ajustes. Não é uma Edge Function publicada nem um endpoint HTTP.
6. Testes de comportamento para preços, política, atribuição, duplicações, trial, estornos/disputas; testes de intenção de cadastro; testes de navegador da nova rota e regressão da landing. O workflow seletivo da landing inclui os novos testes para uma futura PR.
7. Fechamento técnico: o trial vencido na web encaminha para a assinatura com `origem=trial-vencido`. A origem só ajusta a apresentação para retorno ao painel; não oferece outro trial nem altera elegibilidade. Backup, reconsulta e veredito do servidor permanecem. RevenueCat continua restrito ao ramo nativo.

## HQ geral — implementação local revisável

A extensão usa `apps/hq.html`, preservando o painel geral existente. O escopo é administrar parceiros e cupons, consultar o ledger de comissões e registrar repasse manual com confirmação e referência. O onboarding e a simplificação do primeiro treino continuam somente como desenho; checkout e gateway não fazem parte do que foi concluído localmente.

Contrato implementado e conferido entre frontend, ponte e RPCs locais:

| Componente | Responsabilidade e limite |
|---|---|
| `supabase/migrations/20260930193716_hq_referrals_ledger.sql` | Gerada com Supabase CLI 2.118.0 e executada somente em PGlite descartável. Nenhuma aplicação em produção. |
| `hq_referrals_snapshot`, `hq_referrals_save_partner`, `hq_referrals_save_coupon` | Leitura e manutenção administrativa do catálogo; exigem autorização HQ no servidor. Nenhuma dessas RPCs ativa a campanha. |
| `hq_referrals_review`, `hq_referrals_record_payment` | Revisão de comissão e registro de repasse manual, com versão esperada, motivo/referência e auditoria. Registrar pagamento não executa transferência. |
| `hq_referrals_load_customer`, `hq_referrals_commit_customer` | Acesso exclusivo do serviço para integração do core e persistência; não ficam disponíveis ao navegador nem ao admin como ingestão financeira manual. |
| `supabase/functions/_shared/hq-referrals-store.mjs` | Coordena o core puro com persistência e controle de versão (CAS). Não é endpoint HTTP nem adaptador de gateway. |
| Ledger | Estados `pending`, `eligible`, `paid`, `suspended`, `reversed`; pagamentos e eventos de auditoria são registros sem edição destrutiva. |

O registro exige a versão esperada: uma tela desatualizada deve recarregar em vez de sobrescrever uma alteração concorrente. Confirmação explícita e referência do repasse são evidência administrativa, não comprovam por si sós que o provedor recebeu a primeira mensalidade. A integração financeira deve consultar e validar a fonte antes de alimentar o ledger.

O modelo reaproveita `saas_admins`/`hq_sou_admin()` como autoridade existente, sem cadastrar administradores. Tabelas expostas precisam de RLS e grants mínimos; RPCs privilegiadas precisam de guarda interna, `search_path` restrito e execução revogada para papéis não autorizados. `service_role` fica exclusivamente no servidor. RLS ativada ou botão oculto não comprovam isolamento: os testes devem negar acesso a anônimos, usuários comuns e escrita direta, inclusive onde o admin só pode agir por RPC. [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase — funções e privilégios](https://supabase.com/docs/guides/database/functions#function-privileges).

**Verificação local concluída:** 15 grupos no navegador, 29 testes da ponte e 28 verificações SQL. As suítes da ponte e SQL passaram também em revisão independente. O SQL foi exercitado pelas RPCs reais da migração através da ponte, em PGlite 0.5.8. Isso não homologa PostgREST/JWT, gateway nem corridas entre múltiplas conexões PostgreSQL.

## Contrato do core e limite de confiança

`createPolicySnapshot(config)` exige aprovação, versão, campanha, ativação e percentuais explícitos em basis points. O rateio confirmado fecha 100%; preço/trial são fixos e a base da comissão é `full_price`. Aprovação comercial não ativa a campanha: a configuração local permanece desligada até resolver os bloqueios de integração e elegibilidade.

`resolveAttribution(input, catalog, serverNow)` só aceita catálogo do servidor. Código explícito validado prevalece sobre link. Código desconhecido não aproveita outro parceiro como fallback. Link sozinho é provisório e não ativa desconto/comissão. O catálogo persistente está no escopo da nova rodada; a ligação de conta autenticada, trial canônico, atribuição e checkout ainda depende do adaptador futuro. Janelas, titularidade do parceiro e antifraude exigem regra operacional e verificação.

`quoteFirstMonth(policy, attribution)` sem cupom validado retorna 4990; com atribuição por código, exige política aprovada e habilitada e usa centavos inteiros e snapshot. A cotação não comprova elegibilidade financeira: essa análise ocorre ao processar o pagamento com o contexto canônico da conta. A reserva é contábil, não uma tarifa presumida. `applySalesEvent` recebe contexto do cliente e eventos normalizados/verificados pelo futuro adaptador, além do horário do servidor. Modela apuração pendente e ajustes; nunca ordena transferência ou libera assinatura.

Os campos `trusted` e `verified` documentam fronteiras do módulo puro. **Não autenticam JSON.** Nunca repassar corpo de webhook ou dados do navegador diretamente ao core. O adaptador precisará validar origem e consultar o provedor, resolver a conta Torque, histórico da primeira cobrança, identidade do recebedor, assinatura, fatura, tentativa e moeda. O preço recebido do browser não é autoridade.

`customerId` no contrato deve representar o **cliente adquirido no Torque**, de forma estável inclusive entre gateways e assinaturas. IDs de clientes do gateway exigem mapeamento próprio. Criar outra assinatura/conta artificial não pode tornar um cliente antigo elegível. A identidade econômica e a prevenção de autoindicação continuam gates de servidor.

## Persistência e integração ainda necessárias

Antes de habilitar desconto, comissão ou checkout real:

- Conta/produto do provedor homologados; oferta recorrente mensal e desconto de apenas um ciclo realmente suportados. Não usar desconto no plano permanente por engano. O checkout recorrente hospedado Pagar.me não oferece split; não derivar repasse diretamente desse mecanismo. [Referência oficial](https://docs.pagar.me/reference/criar-link).
- Endpoint autenticado para criar/retomar intenção: preço no servidor, conta autorizada, política/cupom válidos e idempotência. Em timeout, reconciliar antes de repetir. Volta do checkout permanece “confirmando” até confirmação financeira.
- Persistir conta, cliente do provedor, assinatura, fatura/ciclo, tentativas e snapshot de atribuição/política. Conectar a indicação ao cadastro autenticado: a intenção em `sessionStorage` **ainda não faz essa associação** e não garante tracking entre aparelhos.
- A persistência local já compara revisões e serializa eventos, clientes e parceiros; comprovantes e auditoria são preservados. Antes de produção, homologar concorrência entre sessões PostgreSQL reais e a integração HTTP. O reducer em arrays isolado não protege concorrência distribuída.
- A fila local conserva eventos pendentes e fatos fora de ordem, inclusive na repetição do mesmo evento. A resolução dos bloqueios e a conciliação com o provedor continuam pendentes; nenhum botão libera automaticamente uma pendência financeira.
- Banco/RPCs locais foram testados com RLS/grants e casos negativos. Falta aplicação autorizada e homologação no ambiente de destino. Esta comissão SaaS não altera o split dos pagamentos dos alunos.
- Converter estado confirmado de assinatura no acesso canônico. O encaminhamento do trial vencido web foi corrigido, mas a página de destino continua sem checkout: não existe conversão financeira ou desbloqueio novo. Preservar eventuais assinaturas reais de lojas.
- Cancelamento, atualização de cartão, estorno, contestação e conciliação reais dependem do gateway. A nova tela registra repasse manual confirmado com referência; não transfere dinheiro. Lote e repasse automáticos continuam fora do escopo.
- Datas: o core exige 14 dias completos desde timestamp do servidor. A integração deve reconciliar esse término com a regra existente de trial/carência, sem confundir os três dias de carência com novo benefício.
- Termos comerciais/privacidade e política de app nativo revisados. Não transformar código público do influenciador em autorização de acesso nem compartilhar dados de alunos.

## Cache e publicação

Este patch é uma revisão local **não pronta para deploy comercial**. A versão foi incrementada localmente para `mt-v850` em `sw.js`, `app/app-sw.js` e `assets/versao.js`, conforme a rodada adicional autorizada. O número deverá ser reconciliado com o HEAD integrado se outro trabalho ocupar a mesma versão; não representa release publicada.

O precache inclui a página estática da assinatura, seu CSS e o script de intenção. Respostas de pagamento/autenticação não entram nessa lista. Os workers consultam seus caches da versão atual para não reutilizar JS antigo do cache preservado de outro produto. A limpeza fica restrita aos caches de código versionados do próprio worker, preservando dados e caches independentes. O worker do aluno só conclui a instalação após obter o esqueleto completo; falha não pode ativar uma versão incompleta e apagar a cópia anterior.

O teste real encontrou `personal.html` repetido na junção de CORE e páginas do catálogo, o que fazia `cache.addAll` rejeitar a instalação. A lista agora é deduplicada antes de instalar. A versão anterior permanece utilizável se um recurso do novo precache falhar.

O diálogo web apresenta R$49,90 e encaminha para a página web; o diálogo nativo conserva R$49 e a contratação RevenueCat existentes. Não alterar preço nativo sem validar catálogo/assinantes das lojas. Estados de assinatura `atrasada`/`bloqueada` fora do trial ainda usam a gestão existente de loja; adaptá-los exige distinguir assinantes antigos de futuras assinaturas web. Não há novo tratamento financeiro desses estados nesta rodada.

## Ambiente e comandos de verificação

As regressões de vendas, trial, autenticação, landing e cache foram reexecutadas nesta rodada. Os testes específicos do HQ, da ponte e do SQL têm evidências adicionais na seção de controles entregues.

Ambiente: Windows, Node 24.18.0, Playwright 1.63.0 do lock `tests/ci`, Chrome instalado, servidor em `127.0.0.1:8807`. CI usa Node22/Linux; não foi executado nesta tarefa.

Comandos:

```text
node tests/test-personal-sales-core.js
node tests/test-personal-sales-intent.js
node tests/test-conta-recuperacao.js
node tests/test-versao.js
node tests/test-personal-sales-browser.js
node tests/test-personal-sales-trial.js
node tests/test-personal-sales-cache.js
node tests/test-landing-v2.js
git diff --check
```

Os testes de navegador usam `BASE_URL`/`CHROMIUM_PATH` e `NODE_PATH` do processo. Evidências locais em `tests/out/sales` e `tests/out/landing-sales` (ignoradas pelo Git). Nova rota verificada em 320, 390, 768 e 1440 px; landing em 320, 375, 390, 430, 768 e 1440 px. Rede externa bloqueada nos testes da contratação; nenhuma operação financeira simulada foi apresentada como real.

A suíte integral de CI, WebKit/Safari, PostgREST e PostgreSQL com múltiplas sessões não foi executada. Os testes locais não homologam gateway, produção ou lojas. PGlite executa a migração e as operações SQL, mas não substitui o servidor Supabase completo.

## Regressões reexecutadas nesta rodada

- 36 testes do núcleo, 15 de intenção de cadastro, 13 de recuperação/autenticação e 17 de versão passaram; 11 grupos da nova rota no navegador e regressão da landing também passaram.
- Cinco grupos de regressão do trial web/nativo cobrem tela vencida em celular/desktop, download real de backup local, navegação e retorno sem mudar assinatura/dados, reconsulta sem rede, ausência de veredito, acesso vitalício e cancelamento de compra nativa em iOS/Android com plugin fictício. Rede externa bloqueada; nenhuma compra real. A expectativa antiga de WhatsApp em `test-personal.js` foi atualizada para a rota web; essa suíte integral não foi executada.
- Nove cenários de cache passaram, incluindo revisão/execução independente. O teste instala os workers atuais reais sobre uma fixture simplificada de worker/caches `mt-v849`, simula falha e sucesso no upgrade para `mt-v850` e confere os bytes atuais de `personal.html`, módulo de conta e versão. Preserva localStorage, caches de dados/mapa/visão e o cache do outro produto; a rota de assinatura funciona offline com pagamento desativado. Endpoints locais fictícios de pagamento/autenticação e o core financeiro não ganham cache ou resposta offline. O servidor de teste é efêmero, somente loopback, com navegação externa bloqueada. Não é teste em uma instalação de produção.
- `state.holds` conserva estorno/disputa recebidos antes da comissão e impede lançamento posterior até reconciliação. Ajuste de uma tentativa de cobrança desconhecida exige revisão. Ainda não existe resolvedor de bloqueios: liberar um exige confirmação do provedor e trilha administrativa.
- A primeira mensalidade efetivamente paga em ciclo posterior retorna `needs_review/first_payment_on_later_cycle_requires_policy`. Não é aprovação nem rejeição definitiva. O novo armazenamento deve conservar pendências e eventos de origem; sua integração ao adaptador e à conciliação continua pendente.
- Arredondamento usa inteiros: desconto e comissão têm prioridade; eventual centavo excedente reduz a reserva, e o saldo recebe o residual. O cenário 40/40/10/10 fecha exatamente sem ajuste.
- Plano atualizado de jornada, primeiro uso, HQ, apuração, fontes e cronograma: [PLANO-VENDAS-PRIMEIRO-USO-20260930.md](PLANO-VENDAS-PRIMEIRO-USO-20260930.md).


## Controles do HQ entregues

- Catálogo com parceiros e cupons únicos, revisão otimista de alterações e bloqueio de troca de titular/código após uso. A campanha possui bloqueio de ativação no banco; não existe botão de ativar.
- Registro de indicação durante o trial sem inventar IDs de gateway. O primeiro evento confiável pode vincular provedor, conta recebedora e assinatura uma única vez. O cliente continua identificado pela conta Torque canônica, nunca pelo ID de cliente do gateway.
- Livro com pendente, elegível, pago, suspenso e estornado. Valores a pagar, já pagos, em disputa e a recuperar são separados por pessoa. Disputa aberta é risco provisório; estorno/perda confirmados geram recuperação. Não há compensação automática nem operação de cobrança/devolução.
- Registro manual em duas etapas, referência obrigatória, confirmação explícita, UUID de operação e revisão dos itens. Cada lote admite até 100 comissões; o restante continua a pagar. Saldo a conciliar do parceiro bloqueia outro registro. Nenhum pagamento real foi registrado ou transferido.
- Eventos repetidos e operações repetidas são idempotentes; payload conflitante é rejeitado. CAS impede sobrescrever estado antigo. Locks de parceiro coordenam ajustes e repasses. Histórico financeiro não é apagado; auditoria inclui valores e deltas sem expor payloads do gateway.
- Tabelas privadas com RLS e sem acesso direto de API. As RPCs administrativas usam a autoridade HQ existente; ingestão fica restrita ao serviço. Nenhum administrador ou segredo foi criado. Ausência de backend/rede aparece como indisponível, nunca como saldo zero.
- Logout remove os dados do DOM e respostas tardias não os restauram. Testes cobrem 390/1440 px, temas claro/escuro, XSS, dados vazios/falhas, confirmação manual e lote de 100. As capturas usam exclusivamente dados fictícios identificados.

O snapshot administrativo desta versão lê o conjunto completo, sem truncar silenciosamente os totais. Paginação/agregação para grandes volumes, resolução de bloqueios, retorno de repasse e uma operação financeira homologada ficam para a próxima etapa. A data mínima do livro é baseada no pagamento/trial; não foi inventada uma retenção comercial de 30 dias.

O cache final inclui HTML/JS/CSS do HQ e passou nos nove cenários de upgrade/offline. A chamada RPC financeira não é armazenada. A versão continua localmente em mt-v850, referente ao patch completo ainda não publicado.

Comandos novos executados:

```text
node tests/test-hq-referrals-browser.js
node tests/test-hq-referrals-store.js
node tests/test-hq-referrals-sql.js
```

Os 28 checks SQL incluem permissões negativas, campanha OFF, trial sem gateway, vínculo canônico, atribuição incompleta, CAS, fila persistente, recibo repetido/alterado, revisão, confirmação/referência, repasse idempotente, disputa e estorno após repasse, auditoria monetária e histórico imutável. O teste de ponte usa memória; o SQL usa a ponte com funções da migração em PGlite. Revisão de locks não é prova experimental de corrida entre sessões.

Prévia final na Library, versão 1:

| Captura fictícia | Library ID |
|---|---|
| HQ desktop / parceiros | `libfile_74b4affe18f0819189fdce31b0c671a2` |
| HQ celular / comissões | `libfile_9abad48faf848191b83d4d7406b1b94f` |
| Confirmação do registro manual | `libfile_f37e39935d588191887a2b7699bf92e7` |

O checkout continua indisponível. A captura da intenção no navegador ainda precisa ser vinculada à conta por um endpoint autorizado; a ponte local não autentica webhooks, não consulta o provedor e não libera assinatura. Atribuição entre aparelhos não é garantida.

A atribuição, o cupom e a política ficam imutáveis após a captura canônica. Não foi implementada uma operação de finalização/troca de atribuição: registrar agora um link provisório ou ausência de cupom não permite trocá-los silenciosamente por um cupom informado no checkout. A integração deverá resolver a escolha explícita antes da captura definitiva ou implementar finalização auditada com as janelas aprovadas. Esse é um bloqueio de integração, não uma promessa de atribuição completa já disponível.

## Pendências de política e liberação comercial

1. Definir se Assinar agora preserva o fim do trial ou cobra imediatamente e, nesse caso, a elegibilidade antes de 14 dias. Até lá, manter revisão e campanha desligada.
2. Fechar janela de atribuição/observação, calendário e responsáveis pelo repasse; definir primeira cobrança paga em ciclo posterior. A proposta de 30 dias de observação não elimina chargeback posterior.

O percentual 40/40/10/10 já está confirmado. Disponibilidade/homologação do gateway, conexão dos eventos e revisão das lojas são verificações técnicas/operacionais pendentes, sem nova escolha de percentual. Nenhuma ação nesta rodada cria credencial ou amplia acesso persistente; nenhum pagamento foi realizado.
