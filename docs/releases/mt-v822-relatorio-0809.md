# mt-v822 — relatório Torque Personal de 08/09

## Base preservada e revisão

A integração parte de `4d4e91be7fb16af905f933096d26d4445d8b8adc` (main), preservando a publicação de avaliação postural do PR #824. A versão mt-v821 já estava em produção e não foi reutilizada.

Árvore funcional validada: `d02f59c616b24c790ed54722671f8a11cf0b07fa`. Este documento acrescenta somente instruções de liberação e dispara novamente as suítes completas sobre o head final do PR #823. Os antigos wrappers globais e o carregamento de interface por versao.js foram substituídos por integrações explícitas nas funções reais do painel e do construtor do app do aluno. Os arquivos temporários de preparação não fazem parte da árvore final.

## Alterações

- Recebimentos: edição no histórico real, competência opcional e auditoria de antes/depois, sem alterar cobranças externas. Revisões concorrentes do mesmo recebimento são recusadas; alterações em outros recebimentos são preservadas.
- Pacote pré-pago com saldo e sem contrato mensal ativo não gera mensalidade fictícia. Contrato mensal ativo continua sujeito às regras anteriores.
- Atendimento explícito presencial, consultoria online ou híbrido, separado do modo de cobrança. Bloqueios de novas sessões presenciais e de pedidos de agenda para consultoria online, incluindo recorrência. Sessões e recebimentos históricos não são apagados.
- Planejamento opcional por data: várias atividades, horário, descanso explícito, retorno à semana recorrente e detecção de edição concorrente. Só as fichas do aluno escolhido são oferecidas. O publicador e o app consomem as datas, sem perder a semana ao salvá-la.
- Biblioteca individual de zonas por pace, velocidade ou frequência cardíaca. Estruturas de aquecimento, atividade, repetição de esforço/recuperação e recuperação final usam cópias das zonas; editar a biblioteca não muda silenciosamente um treino salvo. O player usa a estrutura prescrita e não a substitui por treino simples quando o pacote é inválido.
- Contraste da videoteca no tema claro e preservação do tema escuro. Demos regenerados pelo gerador canônico. Questionários e alterações visuais já publicadas são preservados.

## Evidências anteriores ao head final

GitHub Actions, execução `34564145592` (Relatorio integration preparation), validou a árvore acima: testes executáveis de regras, SQL em PGlite isolado, navegação pelo painel real e app gerado, sintaxe do builder, consistência das três versões, sincronização CAS, isolamento de identidade e variantes dos demos. Logs e capturas com dados exclusivamente sintéticos estão no artefato `report-integration-results` dessa execução. Os testes de navegador cobrem larguras 390 e 1280 px; não representam uma homologação em iPhone físico.

## Portões de publicação

1. Aguardar os workflows completos do head final; não reutilizar o verde dos heads anteriores.
2. Conferir se main e head continuam sendo os revisados. Não rebaixar a versão nem sobrescrever trabalhos paralelos.
3. Aplicar `migrations/20260911_agenda_modalidade_v822.sql` ao projeto Supabase correspondente ao app. A mesma definição está espelhada no setup. A migração substitui somente `app_agenda_pede`, preservando assinatura, privilégios, validade do token, validação de data e limite de pedidos. Não contém atualização ou exclusão de dados históricos.
4. Ler a definição e os privilégios de volta. Para verificar o bloqueio sem inserir pedidos, usar token online válido com data nula (retorno atendimento_online); token presencial com data nula deve continuar retornando dia_invalido. Não registrar aulas ou pagamentos reais para testar.
5. Mesclar o PR #823 com expected_head_sha e conferir o Pages do commit publicado. Conferir mt-v822 em assets/versao.js, sw.js e app/app-sw.js.

## Uso após a liberação

Reabrir o app online para receber o código atualizado. Alterações de atendimento, datas ou treinos continuam seguindo o fluxo normal do painel: salvar o rascunho e publicar para atualizar o pacote do aluno. A migração protege também os clientes antigos contra pedidos presenciais quando o cadastro canônico já é online.

## Reversão

Não restaurar dados históricos. Uma eventual reversão de código deve ser feita por novo commit, preservando PR #824 e usando número de versão superior para renovar os caches. Reavaliar a definição da RPC separadamente; não executar um setup antigo inteiro.
