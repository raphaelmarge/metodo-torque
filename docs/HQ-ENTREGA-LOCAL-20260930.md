# Central operacional Torque — entrega local

Base: `7019199b27d60068c581a8dd83c08a6df2d7f83d`. Checkout isolado `torque-hq-implementation`, branch `local/hq-operational-center`. Versão proposta do pacote unificado: **mt-v851**, ainda não publicada. O patch de vendas/indicações mt-v850 foi integrado integralmente e seus quatro pontos de entrada no HQ preservados.

## Escopo implementado

| Fase | Entrega local e limites |
|---|---|
| Fundamentos | Adaptador sem armazenamento no tenant, fontes independentes, estados de erro/indisponibilidade/desatualização, permissões verificadas pelo servidor, comandos com motivo e idempotência, SQL privado com RLS. Nenhuma migração aplicada. |
| Visão geral | Quatro cartões prioritários: caixa registrado, churn, AR/AP do dia. Gráficos de caixa/MRR, entradas/saídas e percentuais, ganhos/perdas de receita recorrente e jornada da coorte. Todos abrem registros; busca, filas e atalhos respeitam o perfil. |
| Operação | Comercial com etapa/motivo/próxima ação; contas e solicitações de cancelamento; títulos e despesas com baixas parciais; casos, notas, respostas em rascunho; incidentes com release/responsável; fontes e auditoria. |
| Relatórios | Catálogo de 15 relatórios com filtros, definições, cobertura, atualização, gráficos, tabelas paginadas, detalhes e CSV mínimo protegido. Indicações abre o módulo canônico existente. |
| Indicações e acesso do parceiro | Mesmo ledger de cupons/comissões/repasses; administração local de convite e revogação; portal próprio com agregados, comissões e histórico mínimo. Nenhum nome, contato ou dado de saúde dos clientes. Serviço de envio de convite e criação de Auth não implementados/ativados. |

Navegação: **Visão geral, Comercial, Clientes e assinaturas, Financeiro, Influenciadores, Atendimento, Saúde do produto, Relatórios, Administração**. Relatórios é a área adicional solicitada após as oito áreas do estudo.

## Prévia e execução

```powershell
node tools/hq-ops/serve.cjs
```

Abra `http://127.0.0.1:8873/apps/hq-ops-preview.html`. Cenário inteiramente fictício, isolado em memória, reiniciado ao recarregar. O seletor de papel é exclusivo da demonstração e não concede acesso. Nenhuma configuração de nuvem é carregada por esta rota.

`apps/hq.html` contém a integração real do shell, login existente e contratos RPC. Sem o novo backend instalado, só o administrador comprovado pode receber leituras legadas, e os novos indicadores/ações sem fonte ficam indisponíveis. `?legacy=1` preserva o HQ anterior para revisão e histórico; ainda tem as limitações de armazenamento e permissões binárias documentadas no estudo. A rota nova não carrega `apps/store.js`.

`apps/influencer.html` está desativado para uso real; `?demo=1` permite explorar o cenário fictício. A ativação futura requer bootstrap de autenticação revisado, ajuste deliberado da CSP e aplicação dos contratos. Não há segredo nem identificador de parceiro autorizador na URL.

O artefato HTML de Library é gerado por `node tools/hq-ops/build-preview.cjs`, a partir dos mesmos módulos da implementação. Inclui fontes e portal demonstrativo, bloqueia conexões e funciona sem servidor. A demonstração não simula gravações do ledger de comissões; o módulo real é validado por testes próprios e só monta sob autenticação administrativa.

## Semântica dos números

- Intervalos de datas são inclusivos na apresentação, com limite final exclusivo no cálculo e fuso explícito (Brasília por padrão). Pendências usam o dia atual da fonte; gráficos usam o período selecionado.
- Entradas/saídas de contas usam eventos confirmados e base inicial de contas. Churn usa perdas da base pagante existente no início, dividido por essa base. Quem entrou depois não inflaciona esse numerador. Base zero significa sem percentual comparável.
- Caixa usa movimentos confirmados, separados de competência, projeção e MRR contratual. AR/AP mostram saldo após baixas parciais, sem transferir dinheiro. Valores são centavos inteiros.
- MRR ganho/perdido é variação contratual, não lucro. R$ 4,99 da regra de indicação é saldo alocado à Torque, não lucro líquido.
- A janela analítica de conversão é de 30 dias por coorte. Ela não muda o trial comercial de 14 dias. Coortes imaturas e marcos não sequenciais são identificados.
- Fonte ausente/falha não gera zero nem curva. Atualizações indicam registros novos apenas quando IDs de fontes autorizadas e prontas são comparáveis. Dados antigos ficam marcados como desatualizados e não autorizam gravações.
- O atendimento da nova central cobre apenas `torque_hq.cases`. `saas_tickets` e `suporte_chamados` ainda não foram incorporados. Dashboard, seções, relatórios e CSV indicam a cobertura parcial; nenhum chamado antigo foi marcado como lido.

## Segurança e efeitos

O servidor decide papéis e escopo. Menus, buscas, contagens, detalhes e exportação usam o mesmo contrato. Troca de usuário, redução de permissões e autorização negada limpam a tela e diálogos. O financeiro manual não representa confirmação do gateway. Respostas de atendimento ficam `not_sent`; cancelamento fica `requested`, sem mexer no acesso; registrar repasse não efetua transferência.

As propostas SQL não cadastram administradores/staff nem concedem acesso a uma pessoa real. Não foi criado usuário, segredo, credencial ou convite real. O portal liga o e-mail confirmado e a sessão Auth ao convite e ao parceiro, e lê os mesmos registros do ledger. Cadastro de dados de recebimento permanece indisponível nesta entrega.

## Pendências externas e decisões para lançamento

1. Revisão/aplicação autorizada dos contratos, homologação HTTP/Auth/PostgREST, sessões concorrentes PostgreSQL, política de MFA, restauração e teste com volume. Os testes PGlite não comprovam concorrência entre conexões reais.
2. Integração Pagar.me (Asaas como alternativa), assinatura e idempotência de webhooks, conciliação, estornos e ligação a acesso/assinatura. Não conectar por suposição de pagamento.
3. Definir compra antes dos 14 dias, janela e finalização auditada da atribuição, pagamento tardio e operação de repasses. Campanha permanece **inativa**.
4. Homologar envio de convite por mecanismo oficial de Auth e onboarding de e-mail confirmado, sem criar tokens próprios em URL. Definir coleta mínima/proteção dos dados de repasse antes de habilitá-la.
5. Integrar histórico de suporte, leads e recebimentos com reconciliação; completar eventos de uso humano e histórico de vigência. Não inferir atividade apenas de login ou cadastro.
6. Evoluir paginação no servidor, retenção e auditoria de exportações antes de ampliar volume/equipe. A primeira proposta usa snapshot completo das coleções autorizadas.

O código local cobre todas as fases implementáveis sem serviços externos. Isso não equivale a painel ativo em produção. A meta 21/10 depende dessas homologações e decisões. Não houve push, merge, deploy ou migração remota.

## Revisão e testes

As suítes novas cobrem métricas e fuso; adapter; formulários; relatórios/CSV; RLS e comandos SQL; navegação desktop/mobile; revogação e mudança de papel; portal influencer e integração conjunta dos schemas. Foram reexecutadas também as regressões do patch de vendas/indicações, ledger, trial e cache. A evidência consolidada acompanha o pacote local.

Não foi executada a suíte completa histórica do monorepositório nem CI remoto. Não foi aberto PR nesta entrega.

A execução inicial de `tests/test-saas.js` interrompeu-se no marcador simulado do login do aluno. A comparação equivalente base/candidato identificou interferência do service worker com `page.route`, e a correção ficou restrita ao isolamento da suíte. O arquivo corrigido passou integralmente, sem alterar o fluxo do aluno. Detalhes e matriz em `docs/HQ-VALIDACAO-BASELINE-20260930.md`.

A prévia entregue está na Library sob `libfile_7adca2eda5a481918c02ae68fdaeb2c2`, versão 1. O relatório do estudo anterior permanece com a identidade `libfile_1bca59581164819183cf87ebf149b95b`, versão 1; a documentação desta implementação complementa o estudo.
