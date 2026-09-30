# Fluxos operacionais do HQ

Implementação local das seções em `assets/hq-ops-sections.js`. O arquivo não cria cliente de rede, não chama provedor de pagamento, não envia mensagem e não altera armazenamento diretamente. Toda mutação passa por `ctx.command`, com permissão no executor, motivo e chave de idempotência.

## Contrato de integração

```js
window.HQOpsSections.render(area, snapshot, ctx); // HTML escapado
window.HQOpsSections.bind(container, ctx); // devolve função de limpeza
```

Áreas: `sales`, `customers`, `finance`, `support`, `health`, `admin`. Visão geral e indicações/influencers pertencem ao shell e ao módulo existente. Não há cópia da implementação de cupons nesta seção.

`ctx` fornece:

- `snapshot`, com arrays normalizados e `sources` por domínio;
- `filters`, `now` opcional, `currentUserId` opcional;
- `can(permission)`, cuja resposta controla a interface; o servidor continua responsável pela autorização;
- `command({type, payload, reason, idempotencyKey})`, assíncrono;
- `navigate(area, filters)`, `openDetail(kind, id)` e `notify(message)`;
- `money(cents)` opcional. O valor recebido é em centavos.

`snapshot.operators` contém apenas `{id,name}` para os responsáveis permitidos. A UI nunca envia nome livre como identidade de autorização. Ausência do diretório oferece apenas o usuário atual, quando conhecido, o responsável já atribuído e a opção sem responsável.

O shell deve fornecer o `snapshot` atualizado ao refazer o bind após cada comando. O bind remove os listeners da ligação anterior no mesmo elemento. Os formulários usam elementos DOM e `textContent`; os dados nas tabelas passam por escape próprio, incluindo atributos. Nenhum link arbitrário é formado com dado de cliente.

## Do número à ação

### Comercial

Contagem da etapa → lista filtrada → Organizar → responsável, etapa, próxima ação e motivo → `lead.update` → resultado confirmado e auditoria do executor.

A criação usa `lead.create`. Etapas canônicas: `novo`, `contato`, `demo`, `proposta`, `fechado`, `perdido`. Oportunidades em andamento precisam de próxima ação; perdas precisam de motivo. Marcar uma oportunidade como fechada não registra pagamento nem ativa assinatura.

### Clientes e assinaturas

Conta → detalhe do shell → estado do cadastro, assinatura e acesso em colunas separadas. O prazo de teste vem do cadastro ou da assinatura vinculada, sem substituir um pelo outro.

Solicitar cancelamento → motivo → `subscription.requestCancel`. O comando registra um pedido. A interface não afirma que cobrança foi cancelada no provedor ou que acesso foi revogado. A permissão é `customers.write`, independente da leitura de clientes.

### Financeiro

Saldo/vencimento → A receber ou A pagar → cobrança/despesa → registro manual do movimento já ocorrido → referência, data, valor e motivo → comando → auditoria.

- Criar compromisso: `invoice.create` ou `expense.create`.
- Registrar movimento: `invoice.recordPayment` ou `expense.recordPayment`.
- São exigidos valor positivo em centavos, vencimento e referência do movimento. A despesa exige favorecido.
- Movimento não pode exceder o saldo mostrado nem ter data futura.
- O saldo a receber desconta somente pagamentos confirmados e recompõe o saldo por estorno vinculado à fatura. Pagamento sem fatura não liquida compromisso por aproximação.
- Faturas/despesas canceladas não entram no saldo em aberto.
- Dados de pagamentos indisponíveis impedem o cálculo de saldo; isso não aparece como zero.
- Origem e confirmação são exibidas. Registro manual não representa liquidação bancária ou transferência executada.

As datas de vencimento são dias civis, apresentadas sem deslocamento de fuso. A referência de "hoje" respeita `ctx.filters.timeZone`, com `America/Sao_Paulo` como padrão, alinhada aos indicadores do shell. Competência é opcional e não é inferida da data do caixa.

### Atendimento

Fila → caso → Histórico / Organizar / Mensagem → responsável, prioridade, próxima ação ou registro de comunicação → auditoria.

`case.create/update` trabalham com `aberto`, `em_andamento`, `aguardando`, `resolvido`. O caso não resolvido exige próxima ação. É possível vinculá-lo a um incidente. A origem é definida na criação e preservada nas edições.

`case.message` distingue:

- `visibility: internal`: nota interna;
- `visibility: customer`: rascunho de resposta, com entrega `not_sent`.

O botão diz **Salvar sem enviar**. A confirmação também informa que não houve envio externo. Uma mensagem lida não encerra o caso; uma nota não conta como resposta ao cliente. Campos de prazo e responsabilidade pertencem ao caso e não ao estado de leitura da conversa.

Não se deve chamar `suporte_lista` ou `hq_suporte_lista` do legado para uma inspeção estritamente somente leitura: essas RPCs marcam mensagens como lidas. A união dos protocolos `suporte_chamados` e conversas `saas_tickets` pertence ao adaptador/contrato servidor, preservando IDs de origem.

Enquanto `sources.cases.scope` for `opsOnly`, Atendimento mantém o aviso de que a fila cobre somente casos da nova central. Histórico anterior não incorporado nunca é contado como zero. Apenas `admin` e `legacy_admin` recebem o link explícito para abrir o HQ legado; nenhuma RPC legada é chamada automaticamente pela seção.

Quando o perfil não recebe a fonte de incidentes, o formulário de atendimento omite o seletor e o campo do comando, preservando o vínculo atual. Em Clientes, uma fonte de assinaturas negada ou indisponível é apresentada como indisponível, não como ausência de assinatura.

### Problemas do app

Incidente → contas afetadas → responsável, severidade, estado e release → `incident.create/update` → evidência no motivo → auditoria.

Estados: `aberto`, `investigando`, `monitorando`, `resolvido`. A edição pode adicionar conta afetada sem apagar vínculos existentes. Integrações mostram a situação e o carimbo disponíveis na fonte, nunca uma promessa deduzida de lista vazia.

Erros recebidos não equivalem a disponibilidade. O coletor legado possui limite de eventos, depende de conexão e não cobre todas as jornadas. A central mantém esse limite explícito.

### Auditoria

Lista consultável por data, ator, ação, objeto, motivo e resultado. Não há botões de alteração ou exclusão. A UI não fabrica integridade: no modo local, os registros são simulação de sessão; em produção, o executor deve fornecer a trilha servidora e impedir alteração por clientes.

## Dados, falha e privacidade

- `sources[domínio].status` igual a `error`, `unavailable` ou `loading` bloqueia a apresentação de resultados que dependem daquela fonte. `stale` identifica a última consulta válida como desatualizada.
- Fontes ausentes do contrato de teste não são convertidas em erro automático; o adaptador real deve sempre informar `sources`.
- Motivos e mensagens permanecem no formulário se o comando falhar. Cliques duplicados durante a execução ficam bloqueados; uma nova tentativa do mesmo formulário reutiliza a chave de idempotência.
- Permissões de leitura são distintas das de escrita. Bloquear botão não substitui RLS e validação do executor.
- O diretório de responsáveis, contas e mensagens deve chegar já filtrado pela autorização do servidor.
- Esta UI não solicita backups de alunos, tokens, prontuários, fotos, informações de saúde ou credenciais.
- Nenhum conteúdo de referência do legacy é tratado como número atual de clientes ou como comprovante de integração funcionando.

## Verificação e aceite

Teste dedicado: `node tests/test-hq-ops-sections.js`, com fixtures fictícias e nenhuma requisição externa. Deve cobrir escape de atributos/texto, negação por perfil, filtros, saldo com confirmação e estorno, ordenação de assinatura, formulários e envelope de comando. Integração com o adaptador também deve validar as whitelists finais de payload.

Teste integrado: `node tests/test-hq-ops-workflows-browser.js`, usando o servidor local de `tools/hq-ops/serve.cjs`, Playwright e Chrome local. Exercita a prévia com o adaptador sintético real, bloqueia toda rede externa e observa criação/edição de oportunidades, casos, mensagens, incidentes, movimentos parciais e pedidos de cancelamento. Cobre também troca de perfil, falha de fonte, filtros entre áreas, cobertura parcial e data civil próxima à meia-noite. Não substitui homologação de backend, provedores ou produção.

Antes da ativação real até 21/10:

1. Atendimento criado no Personal aparece na fila correta, sem duplicar seu protocolo.
2. Ação de caso/financeiro/incidente registra autor, motivo, resultado e idempotência no servidor.
3. Cancelamento continua sendo pedido até confirmação específica do provedor.
4. Falha de fonte não cria zero, saúde verde ou confirmação de pagamento.
5. Resposta em rascunho não conta como entrega nem como primeira resposta efetiva.
6. Identidades sem permissão não consultam mensagens de outra conta nem executam comandos pela API.
7. Ensaio com pagamento recusado, estorno, atualização concorrente, falha de coleta e mensagem não enviada preserva estado e permite recuperação.

SLA sugerido para aprovação operacional, sem promessa ao cliente: incidente crítico de cobrança indevida, exposição de dados ou perda de acesso em massa recebe triagem imediata durante a cobertura definida; demais casos são ordenados pela próxima ação acordada. Horário de atendimento, responsáveis e prazo numérico ainda precisam de decisão do dono da operação. Ausência dessa decisão não é preenchida com SLA inventado.
