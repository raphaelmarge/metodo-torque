# Versões do treino e revisão de evolução

Escopo: Personal e aplicativo do aluno; adição ao editor existente. A ficha
original, séries individualizadas, circuitos, corrida, agenda, registros de
execução e publicação permanecem nos fluxos canônicos.

## Personal

Em **Opções da ficha**, “Versões curta, casa e viagem” abre o editor de versões
com exercícios da biblioteca, repetições/tempo, carga, descanso, orientação,
adição/remoção de séries e reordenação de exercícios. A duração é uma estimativa
informada pelo professor. Não existe geração automática que encurte a sessão.

Salvar rascunho não torna uma opção elegível para o pacote. A aprovação explícita
gera um snapshot versionado; um novo rascunho preserva a versão aprovada anterior.
A alteração da ficha base exige revisar/reaprovar as alternativas. Retirar uma
aprovação preserva seu histórico e só afeta o aluno após nova publicação.

“Revisar evolução por série” mostra antes/depois e registros usados. A sugestão
de aumento de carga exige duas datas distintas nos últimos 45 dias, séries
concluídas, mesmo identificador de exercício/posição/série, carga prescrita
atingida, meta numérica de repetições atingida e RPE até 7 em ambas. Incremento
de 2,5%, arredondado a 0,5 kg e limitado a 0,5–2,5 kg. Faixas, tempos, carga nula
ou zero e evidência insuficiente ficam para revisão manual. Cada mudança exige
seleção e motivo do professor. Nenhuma prescrição ou publicação é automática.

O histórico de decisão conserva data, ID, série, exercício, antes/depois, motivo
e cópia dos registros utilizados; nunca modifica os registros de execução.
Novos registros recebidos enquanto o diálogo está aberto exigem nova revisão.

## Dados e execução do aluno

- Estado na entidade existente: `treinosV2[aluno].fichas[i].variantes` e
  `.evolucoes`. Não há tabela ou top-level novo.
- Variantes têm ID, rascunho, aprovação versionada e histórico de aprovações.
  O pacote contém somente versões aprovadas e com base atual, em
  `treinoVariantesApp`; não carrega histórico interno ou rascunhos do professor.
- O seletor do aluno aparece antes da primeira execução quando existem versões
  aprovadas. As mesmas funções de série, descanso e histórico executam a versão.
- O snapshot mantém `fichaId`, `varianteId`, `varianteVersao` e chaves de série
  próprias. Trocar de versão inicia outra sessão; uma sessão inacabada é retomada
  antes de permitir começar outra. Recarregar restaura o snapshot daquela sessão,
  inclusive se a alternativa deixou de existir no pacote mais recente.
  A serialização de variantes mantém a ordem do journal, preservando a assinatura
  do checkpoint no reload sem modificar a representação das fichas legadas.
- Uma versão retirada não pode originar novo treino. Os registros anteriores
  continuam ligados à versão executada. Reordenar fichas com uma sessão de
  variante ativa não reaplica o snapshot a outra ficha.
- O PATCH incremental existente trata a ficha inteira como entidade atômica:
  preserva os novos campos, incorpora outras fichas e recusa conflito da mesma.
- As telas comparam identidade, aluno e snapshot antes de salvar. Falha local
  mantém a edição e não confirma gravação. Nenhuma chamada externa é nova aqui.

## Integração e verificação

`assets/personal-treino-evolucao.js` contém o núcleo e o editor com callbacks
explícitos. `app/treino-evolucao.js` contém o runtime do seletor incorporável
pelo builder, sem monkeypatch de funções globais. O builder integra restauração,
abertura de sessão, nova sessão, identidade de registros e chaves do player.

Testes locais: `test-treino-evolucao-core.js` (34 cenários, incluindo histórico
canônico e PATCH incremental) e `test-treino-evolucao-browser.js` (editor real,
320 px, foco/Escape, decimal/zero, texto escapado, falha de gravação, conta
trocada, aprovação, histórico e seletor do aluno).

`test-evolucao-integracao-v866.js` executa 26 verificações no pacote real do
Personal e builder canônico: seleção de versão, anotação/conclusão de série com
RPE e metadados, retomada após reload com o mesmo descanso, conclusão, nova
sessão original e isolamento do histórico. Também cobre o fluxo sem variantes
e as alternativas aprovadas da demo regenerada. A demo usa armazenamento volátil;
o reload é exercitado em um app local gerado pelo mesmo builder, com armazenamento
persistente normal. `BASE_URL` seleciona o servidor local e `EVOLUCAO_SCREENSHOT`
permite salvar a captura do seletor em 390 px.

Dados inteiramente fictícios, sem rede externa. CI e publicação pertencem à
release agregada; estes testes não comprovam publicação em produção.
