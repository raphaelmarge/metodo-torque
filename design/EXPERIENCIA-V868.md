# Experiência v868

Implementação dos seis mockups aprovados pelo Raphael: acesso, início do aluno,
registro do treino, evolução, prioridades do Personal e assinatura no site.
Base: `8c41c47e7eede6cef7552f0ac7db77dc76b23b58` (v867).

## Conteúdo, ação e alternativa

| Bloco | Fonte real | Ação existente | Sem dados ou sem acesso |
| --- | --- | --- | --- |
| Acesso por perfil | Produtos e rotas atuais | Login de aluno, Personal, Nutri ou academia | Convite continua abrindo o app diretamente; recuperação preservada |
| Início do aluno | `pintaHero`, `semProgCalc`, `acSyncPinta`, agenda e mensagens | Começar/retomar, carrossel, semana, hábitos e atalhos | Primeiro dia, descanso e falha de envio usam os estados atuais |
| Séries visíveis | `SR.registro`, `SR.indice`, `GP.feita` | Mesmo seletor e formulário, editar, desfazer, próximo exercício | Ausência permanece travessão; anotação não vira conclusão |
| Dias com treino | `ptfeitos`, datas válidas até hoje | Períodos de 7, 28 ou 90 dias; compartilhamento atual | Zero dias e explicação de comparação indisponível |
| Variação de carga | `__cgEvolucao.sessoes` sobre registros no período | Abrir Cargas | Exige dois dias; zero é carga válida; futuro e anotação não concluída não entram |
| Vídeos do Personal | Alunos ativos com `appTokenP` | `data-tecnica-aluno` e autorização do módulo privado | Não informa quantidade de pendências; pede publicação/login conforme o módulo |
| Retomar contato | Sessões concluídas na cópia local (`lastDone`) | Perfil existente do aluno | Sem histórico não é interpretado como ausência |
| Rever treino | Prescrição com fichas e data (`trainingStamp`) | Editor existente | Sem data não inventa idade da ficha |
| Assinatura | Contrato e status autenticado existentes | Consultar, contratar ou cancelar com confirmação | Indisponível, desconhecido, pendente e falha permanecem distintos |

## Preservação e limites

- A nova composição de foto em card substitui, por aprovação visual nesta tarefa,
  a orientação de topo full-bleed da v818. Preserva imagens, marca e cores do profissional.
- Nenhuma alteração de esquema, autenticação, pagamento, isolamento ou publicação
  de pacote. Mantém `{html, dados, ver, stamp}` e o builder canônico.
- Não implementa cartão mascarado, troca de cartão, recibos nem data de próxima
  cobrança: esses dados do mockup não fazem parte do contrato atual do checkout.
- A comparação usa maior carga por treino; não é cálculo de força máxima. A
  média representa dias por semana dentro do intervalo, não total de sessões.
- Os 18 destinos do Personal, Central Pro, Alimentação, conquistas, calendários,
  esforço opcional, variantes e histórico continuam acessíveis.
- A atualização do diário alimentar adia a repintura da lista de compras enquanto
  um campo está em edição. O valor continua sendo confirmado ao sair do campo;
  a troca de acesso limpa a tela imediatamente, sem gravar o rascunho anterior.
- Demos são geradas por `tools/demo-aluno/regen-demo.js`, com dados fictícios.
  Versão `mt-v868` nos três pontos do cache. Nova entrada e foto no precache.

## Verificação

`tests/test-experiencia-v868.js` cobre navegação por perfil e o resumo de dados:
carga zero, substituição de legado, anotação, futuro, período e leitura sem gravação.
As expectativas visuais do Início e o título do painel foram atualizados conforme
o desenho aprovado. As verificações funcionais das suítes existentes permanecem.
Executar `tests/run.sh` e conferir o CI do commit antes de publicar.
