# v822 — Alimentação nos calendários do aluno

## Comportamento

Minha semana (Início), Agenda e calendário mensal da Evolução compartilham a
projeção diária de `agItensDia`. Roxo indica treino/sessão programada; verde
indica que há refeições do plano naquela data. Quando existem os dois, são
mostradas duas bolinhas abaixo do número. Legenda e descrição acessível
acompanham os marcadores. Os estados visuais das sessões e o histórico de
execução continuam separados da programação.

Tocar em uma data da Evolução abre a Agenda daquele dia. Início e Agenda
mostram as refeições junto aos treinos, em ordem de horário. A refeição abre
Alimentação na data e no cartão corretos. Sem horário definido, ela fica ao
final do dia, identificada como "Sem horário" — não se inventa meia-noite.

## Configuração do profissional

Nutrição → aluno → editar plano: cada refeição conserva os campos de horário
e dias. Os dias ficam abertos, com atalhos Todos os dias, Dias úteis e Fim de
semana. "Ordenar por horário" altera somente o rascunho, preservando os IDs.
É preciso revisar, aplicar e publicar pelo fluxo existente para atualizar o
pacote do aluno. A vigência (início/fim) do plano continua sendo respeitada.

## Segurança e compatibilidade

- A projeção usa `nutricaoApp` e `MT_NUTRICAO.refeicoesDia`, com vigência,
  dias da semana e estado ativo. Plano ausente, pausado, expirado ou sem itens
  não inventa alimentação programada. Formatos antigos sem dias/limites
  continuam representando todos os dias, conforme o contrato existente.
- A bolinha verde significa programação, não consumo. Navegar e consultar
  dias futuros não grava diário, fila, treino feito, hábitos ou XP.
- Datas futuras podem ser consultadas, mas os controles de consumo e o novo
  registro ficam indisponíveis. Os limites de data do editor são mantidos.
- Abrir o plano pelo calendário não substitui nem fecha um rascunho de
  refeição em andamento. Título/ID são escapados no HTML; a seleção do cartão
  usa comparação exata de dataset, não interpolação em seletor CSS.
- Não há tabela, RPC, migração ou alteração de dados reais no Supabase.
  Persistência, snapshots, publicação CAS e autenticação não são alterados.
- Histórico anual e heatmap de treinos mantêm suas regras. O mensal ganha
  botões de data; sua navegação anterior e o limite de mês futuro permanecem.

## Validação

`test-calendario-alimentacao.js` exercita o builder real com dados fictícios,
relógio fixo, armazenamento em memória e rede bloqueada: três calendários,
limites de vigência, horários, ausência de plano, rascunho, consulta futura,
consumo confirmado, zero escritas de navegação, escaping, temas e larguras
320–1280px. `test-calendario-alimentacao-editor.js` exercita o módulo real do
editor com ponte de persistência/publicação simulada e verifica o DTO.

As três demos devem ser regeneradas pelo gerador canônico. Também conferir
as suítes de navegação/nutrição, Evolução, Início, CAS, identidade e versão.
Testes em Chromium não representam validação em iPhone/Safari físico.

## Fechamento e conciliação — mt-v822

A numeração mt-v821 foi usada pela avaliação postural publicada em paralelo.
Esta entrega é mt-v822 e preserva todos os arquivos, caches e permissões daquela
publicação. Não reaplicar suas migrações. O nome deste documento conserva a
referência original do PR.

- Foco preservado ao navegar com teclado nas setas da Agenda e da Evolução,
  inclusive na repintura do dia selecionado; não rouba foco de outras áreas.
- Cabeçalho sem sessão presencial usa "Sua programação", evitando anunciar
  "Nada marcado" quando há refeições ou treinos do plano.
- A suíte geral mede células e marcadores pelos atributos semânticos novos,
  sem deixar de verificar a contagem, o histórico anual ou o contraste.
- A prova de assiduidade usa um cenário local isolado: presença100% com uma
  sessão feita, uma sem registro e uma falta futura; presença50% após uma falta
  passada explícita. Restaura os dados fictícios ao terminar e não depende de
  "amanhã" calculado quinze minutos antes, que podia mudar na meia-noite.
- Não há alteração de cálculos nutricionais, consumo registrado, treino, hábitos,
  sincronização, banco ou dados reais nesta conciliação.
