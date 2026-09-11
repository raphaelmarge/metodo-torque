# Alimentação e calendários — integração v825

Base: main a0071b6 (v824). A integração reaproveita o calendário do PR822
(64696b3) e somente a apresentação, os filtros e os atalhos do PR825
(a28a709). O nome deste documento preserva a referência dos PRs anteriores.

## Comportamento

- Início, Agenda e calendário mensal da Evolução compartilham `agItensDia`.
  Roxo indica treino/sessão programada; verde indica refeição do plano.
  Programação não significa consumo, treino realizado ou XP.
- Refeições seguem horário, dias e vigência do plano. Refeições vazias,
  planos pausados e datas fora da vigência não geram marcadores.
- A data da Evolução abre a Agenda; a refeição abre a Alimentação no dia e
  cartão correspondentes. O foco é preservado na navegação mensal.
- Consultar uma data futura não permite registrar consumo antecipado.
  O editor mantém sua própria data e o limite de hoje.
- A Alimentação conserva Refeições, Diário e Planejar. Busca por refeição ou
  alimento e filtros Todas/Sem registro/Registradas consultam os mesmos dados.
  Atalhos de foto e repetição reutilizam o editor, sem confirmação automática.
- O destaque da próxima refeição usa somente o horário publicado. Ausência de
  registro é descrita como tal, sem concluir que o aluno deixou de comer.
- Abrir uma refeição pelo calendário limpa filtros que poderiam escondê-la,
  dá foco ao cartão correto e conserva o rascunho aberto e salvo no aparelho.
- No profissional, horário, dias úteis/fim de semana e ordenação por horário
  afetam somente o rascunho até revisão, aplicação e publicação explícitas.

## Preservações

Há apenas uma API de calendário alimentar: `agenda` e `abrirPlano` em
`window.__nutriAluno`; os eventos usam `data-al-ref` e `data-cal-dia`.
Não há segundo calendário, migração ou nova RPC.

Permanecem os calendários mensal/anual separados, o carrossel e fotos da Home,
a semana acima dos hábitos, o player com reps antes da carga, treino por datas
específicas, corrida por blocos/zonas e restrições presencial/online da v823.
A estabilidade dos registros, expansão/foco da revisão nutricional v824,
rascunhos, snapshots, CAS, isolamento por token e revogação permanecem ativos.

## Validação

Testes específicos: `test-calendario-alimentacao.js`,
`test-calendario-alimentacao-editor.js`, `test-nutricao-tech.js` e
`test-nutricao-navegacao.js`. A cobertura inclui consulta futura sem escrita,
foco/teclado, filtros, rascunhos, horários/dias/vigência, refeições vazias,
programação por data, atendimento online e telas de320 a1280px nos dois temas.

Conferir também as suítes de nutrição integrada, registros estáveis, evolução,
início, player e publicação. As três demos devem ser regeneradas a partir das
fontes atuais; não reutilizar as demos nem versões v821/v822 dos PRs antigos.
Testes locais não são confirmação de publicação nem de Safari físico.
