# mt-v834 — Cancelamento e registro de devolução manual

Base: `33c77b0ca0e2fed1a5746994b84dd3baa25a2e8f`. A nova função pertence ao financeiro do **TORQUE PERSONAL**, não ao site de equipamentos ou à assinatura do próprio SaaS.

## Contrato funcional

O financeiro já possui recebimentos em `ptStudio.pagamentos`, contratos e integrações de cobrança. Esta implementação reutiliza esses recebimentos: não cria uma segunda base de pagamentos, nem migra a estrutura do Supabase.

- No perfil do aluno → Financeiro, **Cancelar atendimento** encerra o acompanhamento local, os contratos ativos e a renovação do pacote. Sessões futuras ainda não realizadas saem da agenda ativa e são arquivadas integralmente em `cancelamentosPT`. Aulas feitas, faltas, outros alunos, treinos, avaliações, quantidade original do pacote e pagamentos são preservados.
- É possível cancelar sem devolução ou criar uma **devolução pendente vinculada ao recebimento** no mesmo salvamento. Não existe cálculo automático de proporcionalidade, multa ou direito ao reembolso: o profissional informa o valor acordado.
- No recebimento → **Devolução / estorno**, registra-se uma devolução total ou parcial. O limite desconta tanto as pendentes quanto as devoluções já informadas como realizadas. Múltiplas devoluções parciais são permitidas, sem exceder o original.
- **Já devolvi o dinheiro** exige data, meio, referência do comprovante/recibo, declaração explícita do profissional e conferência final do cliente e valor. O status fica **Devolvido manualmente**, não “confirmado pelo banco”. Solicitações pendentes podem ser canceladas com motivo; devoluções realizadas não podem ser alteradas pela interface.
- A declaração para download é um HTML local imprimível, com identificação e referência do comprovante. Ela informa expressamente que **não é comprovante bancário nem confirmação de estorno no cartão**. Não há upload de anexos nesta versão.
- Pagamento original, dados da solicitação, responsáveis e transições permanecem no histórico. Editar/anular recebimentos com histórico de devolução é bloqueado na interface e no helper comum de edição.
- Caixa mensal, visão financeira, carteira por sessão, gráficos de movimento, relatórios e exportações passam a distinguir bruto, devolvido e líquido. As saídas pertencem à **data da devolução**, não reescrevem o caixa do mês da venda. A quitação histórica da mensalidade não é confundida com anulação de pagamento.

## Limites importantes

Esta versão **não movimenta dinheiro**, não envia Pix, não chama API de refund, não cancela links de pagamento já emitidos e não envia mensagens ao cliente. Um pagamento vindo de integração exige confirmação adicional de conferência externa antes de registrar uma devolução manual.

O cancelamento do acompanhamento é bloqueado enquanto houver `assinaturaAs` ou `assinaturaRec` vinculada. O profissional deve usar o cancelamento de assinatura já existente e aguardar a confirmação do provedor. Agendamentos externos e o acesso do aluno ao app não são revogados por esta operação. O aviso e a confirmação explicitam isso.

`pagamentos-webhook` e integrações reais de cobrança já existem; este PR não as reimplementa nem finge confirmar estornos de gateway. Automatizar o refund e reconciliar seus eventos exigirá uma entrega específica de backend, idempotência do provedor e homologação em ambiente de testes.

## Persistência e segurança

`estornosPT` e `cancelamentosPT` ficam no `ptStudio` existente, com o mesmo fluxo de backup e sincronização CAS. Valores novos são validados em centavos inteiros; campos monetários inválidos, excedentes, duplicidade da operação, alterações concorrentes do recebimento e perda de conta/permissão são recusados. Cada confirmação relê o mesmo objeto que será gravado pelo `MTStore`, sem clonar o painel e perder a revisão de leitura. Erros de gravação mantêm os campos da tela.

O histórico é **administrativo dentro do estado do aplicativo**, não um livro contábil imutável imposto pelo servidor. Restauração de backups, modificações fora do app ou clientes antigos não são convertidos por este PR em auditoria à prova de alteração. Nenhuma nova política de autorização do Supabase foi aplicada; a proteção existente foi preservada, não declarada como auditada integralmente.

Nenhum registro financeiro/cliente real foi lido ou alterado na implementação. Não há credenciais, IDs de clientes reais ou envio de dados de teste para produção. Não se executa `localStorage.clear()`.

## Verificação e entrega

- Testes puros de centavos, limites, transições, datas, caixa entre meses, carteira, preservação de histórico e concorrência.
- Teste de navegador do fluxo real: duas confirmações, falha de save, devolução parcial, desistência, concorrência, perda de permissão, assinatura automática, cancelamento com devolução, declaração, escape de conteúdo e geometria em 320/390/1280 px.
- Os testes de regressão existentes de recebimentos e de CAS permanecem; nenhuma asserção foi removida para acomodar a nova função.
- A execução local do Chromium foi bloqueada pelo ambiente (`ERR_BLOCKED_BY_ADMINISTRATOR`). A validação de navegador deve ser comprovada pelo CI do commit correspondente; teste automatizado não equivale a validação no iPhone físico.
- Versão e cache atualizados em `assets/versao.js`, `sw.js` e `app/app-sw.js`; os três assets novos entram no precache.

Esta nota **não comprova publicação**. Conferir os checks do HEAD, autorização de release e SHA servido pelo Pages antes do deploy.
