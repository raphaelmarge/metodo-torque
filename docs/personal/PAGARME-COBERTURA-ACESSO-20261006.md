# Fronteiras da assinatura e operações do Personal

Esta lista acompanha a implementação SaaS separada do gateway de cobranças dos alunos. A existência do checkout não comprova que todas as operações do produto estejam condicionadas à mensalidade. A homologação da conta Pagar.me permanece obrigatória antes de habilitar novas contratações.

## Caminhos centrais

| Caminho | Evidência no código | Aceitação exigida |
|---|---|---|
| Consulta da vigência | `minha_assinatura()` e pacote `supabase/releases/personal-billing-optional` | Conta gerenciada tem prazo finito; pagamento/estorno altera a decisão canônica; ausência de webhook não prolonga prazo. Vitalícia, cortesia e contratos legados mantêm sua semântica explícita |
| Ficha e prescrição | `apps/store.js`: `dados_personal_patch`, `dados_cas`, `dados_grava`; registro `public.dados` com chave `mtapp:ptStudio` | Gravação direta e RPC não podem contornar uma assinatura expirada abrangida pelo guard. Leitura/backup continuam disponíveis |
| Publicação ao aluno | `apps/store.js`: `app_aluno_publica_cas` e `app_aluno_publica`; tabela `public.app_aluno` | Profissional sem acesso não publica treino novo; validação precisa cobrir chamadas diretas e as duas RPCs |
| Revogação de aluno | `personal_acesso_revoga`, `aluno_revoga_acesso` e atualização correspondente da ficha | Expiração comercial não impede encerrar acesso. A exceção permite somente a revogação comprovada e limpeza dos campos de publicação, sem inserir prescrição por esse caminho |
| Retorno do aluno | RPCs de token/sessão do aluno e histórico | O bloqueio comercial do profissional não deve apagar histórico ou bloquear indevidamente retorno já autorizado do aluno |
| Exclusão de conta | `excluir_minha_conta()` e vínculos financeiros isolados | Excluir dados da conta não pode falhar por FK nova nem deixar uma renovação silenciosa; cancelamento precisa de confirmação e recuperação após timeout |

Os testes do pacote devem identificar quais linhas acima foram executadas com PostgreSQL, Auth/PostgREST reais ou simulação de transporte. Uma fixture de sessão não é prova de login real.

## Operações adicionais: não declarar cobertura sem teste

| Área | Escrita observada | Limite a resolver antes de ampliar a cobrança |
|---|---|---|
| Atendimento presencial | `personal_sessoes` em `assets/personal-pro-suite.js` | Regras de acesso por vínculo existem; cobertura comercial específica não comprovada pelo guard de `ptStudio` |
| Importação | `personal_importacoes` | Uma importação em revisão é uma gravação separada da ficha |
| Automações | `personal_automacoes`, `personal_automacao_fila` | Criar/ativar regra e executar fila precisam de política própria; desativar uma regra deve permanecer possível |
| Agenda e créditos | `personal_lista_espera`, `personal_creditos`, `app_agenda` | Não confundir organização do profissional, solicitação do aluno e cancelamento de atendimento |
| Equipe | `personal_aluno_equipe` | Revogação de acesso é operação de segurança; não deve depender de pagamento |
| Avaliação postural | `personal_postural` e armazenamento de imagens | A autorização de membro não equivale a vigência comercial; exclusão de imagens precisa continuar possível |
| Página pública e mídia | `site_pro`, buckets de galeria/exercícios | Publicar e enviar novos arquivos são caminhos distintos da publicação do treino |
| Conversas e configuração | `app_chat`, `chat_config` | Leitura, suporte e exportação não devem ser confundidos com recursos pagos de criação |
| IA | `chat-envia` → `tetoIa()` → `ia_uso_conta` | O limitador existente permite continuar se a consulta falha. Uma quota não substitui controle comercial e não é prova de bloqueio financeiro no servidor |

O aplicativo também mantém dados locais para recuperação após falha de conexão. Nenhum controle no servidor apaga automaticamente cópias já presentes no aparelho. Não se promete bloqueio absoluto de uso offline.

## Evidência externa ainda necessária

- Provar tokenização, campos obrigatórios, início após os 14 dias completos e valores no sandbox da conta escolhida.
- Provar renovação, recusa, cancelamento, exclusão com criação em andamento, estorno e notificações repetidas/invertidas usando respostas reais saneadas.
- Configurar e monitorar a execução periódica do reconciliador; só receber webhooks não garante recuperação de eventos perdidos.
- Confirmar autenticação de webhook suportada pela conta. O suporte configurável a Basic não equivale a homologação no painel.
- Definir e homologar a recuperação de renovação recusada, incluindo atualização do cartão. A interface informa a recusa e preserva o período pago, mas não oferece troca de cartão nem uma segunda contratação para o contrato já vinculado. O encaminhamento ao suporte não substitui esse procedimento financeiro.
- Definir operação de retenção e remoção dos registros financeiros mínimos conforme obrigações aplicáveis, sem inventar prazo de retenção.

Campanha, cupom e repasse continuam desligados. A primeira versão do checkout valida a mensalidade integral de 4.990 centavos; não se anuncia desconto até integrar a atribuição protegida e a conciliação correspondente.
