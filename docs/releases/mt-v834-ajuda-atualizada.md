# mt-v834 — Dúvidas, novidades e orientações do Personal

Pedido: atualizar a aba de dúvidas com as novidades e mudanças do sistema, preservando uma apresentação simples. Base de implementação: `5fd170ad3ca7fecd3c102b4315262b602934490a` do PR #843. Este documento não comprova merge nem implantação.

## Escopo

A aba existente **Ajuda** passa a abrir com o título **Dúvidas e novidades**. Os 16 tópicos anteriores são preservados e revistos; entram oito tópicos de novidades, sincronização, sessão presencial, marca, cancelamentos/devoluções, automações, nutrição e medalhas. O catálogo totaliza 24 tópicos e 105 perguntas/seções. Não é uma nova Central Pro nem outro destino do menu.

O índice exibe cartões simples e a busca existente. As respostas aparecem no tópico, com apenas a primeira aberta inicialmente. O suporte continua acessível inclusive quando a busca não encontra resultados. Palavras-chave incluem nome fantasia, template, estorno/extorno, nuvem/celular e alimentação. A busca ignora acentos e exige todos os termos digitados, sem executar o texto como HTML.

## Fontes e rastreabilidade editorial

| Orientações | Fonte executada conferida |
| --- | --- |
| Próxima melhor ação, Aluno 360°, frequência da agenda, sessão, busca e providências | `assets/personal-fluxo.js`, funções `bestAction`, `weekBins`, `finishFlowSession`, `extendUniversalSearch`, `activatePresets`, `completeQueue` |
| Conflito, cópia e recuperação | `apps/store.js`, `resolveConflito`, `preservaRascunho`, UI `mtSyncConflito`; release mt-v832 |
| Nome em destaque e segunda linha opcional | `personal.html#marcaForm`, `assets/personal-marca.js`, `assets/identidade-marca.js`; release mt-v834-identidade-marca |
| Cancelamento, pedido/registro de devolução e caixa | `assets/personal-estornos-core.js`, `assets/personal-estornos.js`, helpers e Financeiro de `personal.html`; release mt-v834-cancelamentos-estornos |
| Planejamento por data, cópia, corrida por etapas e recebimentos | `assets/relatorio-0809.js`, editores e publicação de `personal.html`; releases mt-v822, mt-v826 e mt-v827 |
| Modelos/perguntas, edição, respostas e entrada opcional | handlers `montaPayloadQuest` e questionários em `personal.html`, `assets/personal-questionarios*`, contrato de entrada; release mt-v826 e notas v811/v812 em `CLAUDE.md` |
| Plano alimentar, rascunho, aplicação, publicação e acompanhamento | `assets/personal-nutricao.js`, `assets/nutricao-core.js`, `design/NUTRICAO-V814-CONTRATO.md` |
| Trilhas e aparência das medalhas | editor e pacote `medalhasApp`, `app/aluno-builder.js`; releases mt-v828 e mt-v829 |
| Demais tópicos, navegação, figuras e suporte | catálogo e handlers já existentes em `personal.html`, `assets/personal-ferramentas.js` |

A história das versões aparece apenas no tópico Novidades; não cria indicadores de produção, avisos de lançamento ou garantias de que um aparelho já atualizou. Esta ajuda acompanha as funções do mesmo PR, evitando apresentar na main atual instruções de uma funcionalidade que ainda não foi mesclada.

## Correções de orientação

- Salvar localmente, sincronizar o Personal e publicar conteúdo do aluno são etapas distintas.
- Não promete funcionamento integral offline, combinação automática de edições ou recuperação de cada campo de uma sessão não finalizada.
- Não recomenda apagar dados do navegador, recriar alunos ou restaurar backup antigo para forçar sincronização.
- A frequência do Aluno 360° identifica as sessões feitas na agenda como fonte, não todas as atividades realizadas pelo aluno.
- Cancelar sessão, cancelar atendimento, anular recebimento, cancelar solicitação e registrar devolução são operações distintas. Desfazer presença não envia dinheiro.
- Estorno manual não envia Pix/refund; solicitação pendente não reduz caixa; saída usa a data de devolução. Declaração administrativa e referência não viram comprovante bancário ou upload de anexo.
- Encerramento não revoga automaticamente acesso nem cancela links/agendamentos externos; assinatura exige confirmação no fluxo do provedor.
- Marca não substitui login, dados fiscais, recebedor Pix ou autoria. Nome secundário desligado por padrão e slogan opcional.
- IA é proposta revisável; providência concluída não é mensagem enviada. Modelo editado não reescreve respostas de questionários anteriores.

## Preservação e verificação

Alterações funcionais restritas à renderização/busca da ajuda, sem mudança de cadastros, pagamentos, templates, banco, políticas, credenciais ou rotinas de publicação. Não é necessário SQL nem republicar pacotes para atualizar as instruções do painel. A versão permanece mt-v834, ainda não publicada na base consultada; não reutilizar esta decisão para uma versão já implantada.

`tests/test-ajuda-atualizada-core.js` verifica estrutura, cobertura, links internos, avisos e rótulos contra o código. `tests/test-ajuda-atualizada-ui.js` exercita o painel real com dados fictícios: busca/aliases, retorno, acordeões, teclado, suporte, preservação de estado, entrada especial, temas e 320/390/1280 px. A suíte anterior de ferramentas permanece intacta.

Os resultados efetivos de preparação/CI ficam no PR e nos artefatos correspondentes. Testes sintéticos não equivalem a validação em contas reais ou iPhone físico. Publicação depende dos checks do HEAD final e de autorização de implantação.
