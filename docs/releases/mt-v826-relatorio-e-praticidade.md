# mt-v826 — Recebimentos, calendário mensal e editores

Base: `fac57f5724f7c06bf1a528533fc1306ecfe7c3db`, posterior à publicação mt-v825. Implementa as lacunas identificadas ao comparar o relatório de 08/09 com o código e a demo atuais.

## Comportamento entregue

- Financeiro: cobrança coletiva obedece à dívida real; anotar um recebimento não o transforma em serviço. Natureza dos legados é conservada. Edição/anulação têm snapshots, motivo e auditoria, preservam eventoId e falham sem fechar o rascunho. Anulados permanecem no histórico/CSV e são excluídos de receita, quitação e carteira. Operações não emitem reembolso externo nem desfazem quantidades de aulas. Recebimentos manuais semelhantes exibem confirmação de possível duplicidade.
- Planejamento: calendário mensal com atividades salvas, editor do dia, várias atividades/horários, descanso e volta à semana recorrente. Cópia de 1–12 semanas compara origem/destinos com a prévia, preserva ajustes por padrão e exige confirmação para substituir. Os formatos `plano.dias` e `plano.datas` permanecem.
- Corrida: editar, duplicar e mover blocos; editar/duplicar zonas por pace, velocidade ou FC. O treino salva uma cópia da zona e não muda quando a biblioteca é atualizada. Rascunhos separados por conta e aluno, com erros e conflitos explícitos.
- Questionários: editar e renomear o modelo existente, ordenar perguntas, pesquisar título/enunciado e conferir a prévia. Cópias reutilizam as perguntas por ID na ordem escolhida. Questionários já enviados e respostas permanecem intactos. Mudança de conta bloqueia gravação de modelo/pergunta e retornos tardios de confirmação.

## Preservação e integração

As 18 áreas e subabas do Personal, musculação, nutrição, atendimento, séries detalhadas, dados e fluxos do app do aluno permanecem. As três demos do aluno são geradas pelo script canônico. Assets novos usam os tokens reais e constam no precache. Versões sincronizadas em assets/versao.js, sw.js e app/app-sw.js.

Nenhuma alteração de schema, RPC, credencial ou dado real. Publicar o código não publica automaticamente prescrições dos profissionais. A aplicação da antiga migração de modalidade em produção não foi objeto desta entrega.

## Validação

- Recebimentos: 40 verificações de regras/DOM e 2 de transporte CAS, com anulação, auditoria, conflito, falha, permissão, CSV e carteira.
- Calendário: 79 verificações, incluindo transições de mês/ano, bissexto, datas locais, cópia, concorrência, CAS durante confirmação, múltiplas atividades e layouts 320/390/1440.
- Corrida: 55 verificações no painel local com ordem, snapshots, isolamento, falhas e ambos os temas.
- Questionários: 39 verificações do editor e 43 da usabilidade existente, com criação inline, retorno tardio, ordem, cópia, modelo concorrente e larguras móveis.
- Integração anterior do relatório: 38 verificações de painel/app gerado; core: 17 regras executáveis.

Testes usam dados sintéticos, serviços simulados ou banco local isolado. Não representam homologação em iPhone físico ou transações reais. O workflow oficial descobre todas as suítes e a publicação depende de sua aprovação no mesmo commit.

## Reversão

Reverter por novo commit e versão de cache superior, preservando os dados. Não excluir auditoria ou registros anulados. Um código antigo que ignora anulação não deve ser republicado: passaria a contar esses recebimentos novamente. A semana e as prescrições antigas permanecem compatíveis.
