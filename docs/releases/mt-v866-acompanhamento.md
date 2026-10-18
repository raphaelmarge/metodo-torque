# mt-v867 — Acompanhamento do Personal e do aluno

A integração com o PR #888 usa **mt-v867**. O nome deste arquivo preserva a referência original do PR; consulte `mt-v867-integracao.md`.

Implementação incremental sobre mt-v865, preservando as áreas existentes e o
construtor canônico do aplicativo. Não altera Academia nem o Nutri independente.

## Recursos

- **Correção de execução:** o aluno envia vídeo vinculado à ficha/exercício/série.
  O professor responde em um ponto do vídeo com texto, marcações e áudio. Estados
  de envio, resposta e leitura, exclusão e acesso pela ficha e pelo menu do aluno.
  Arquivos privados, URLs temporárias, validação de identidade em cada operação,
  limites atômicos e reenvios idempotentes. Demos usam somente memória/fixtures.
- **Versões do treino:** curta, casa e viagem, editadas e aprovadas pelo professor.
  O aluno escolhe antes de começar; a retomada usa a prescrição daquela sessão.
- **Progressão por série:** proposta com evidências de duas datas, RPE e cargas
  realizadas; aprovação individual, justificativa e histórico da decisão.
- **Jornadas:** etapas por dia, gatilhos de treino/check-in, pausa e retomada na
  Central Pro. São jornadas assistidas, avaliadas ao abrir a área. Não enviam
  mensagens automaticamente nem executam prescrições sem revisão.
- **Compras:** planejamento por dia com substituições já aprovadas, abatimento da
  despensa, cópia do que falta e dificuldades vinculadas a refeições registradas.
  A lista rápida com marcações continua disponível ao lado do planejamento.
- **Corrida:** comparação por etapa usando a prescrição histórica, exportação TCX
  estruturada no Personal e no aluno. Importação GPX/TCX existente preservada.
- **Saúde:** adaptador com consentimento por categoria, escopo do aluno e
  deduplicação. Plugin local Capacitor 7 para HealthKit/Health Connect preparado.

## Limites reais

A sincronização nativa ainda exige homologação em aparelhos, capabilities/permissões
e as contas necessárias às lojas. A correção de compilação Android e suas
variantes estão em `mt-v867-android.md`. Swift/iOS e relógios não foram
homologados. Strava/Garmin OAuth não está conectado. No
navegador, o app oferece importação de arquivos sem anunciar conexão ativa.

O vídeo tem limite de 25 MB no servidor e no Storage; duração de até dois minutos
é verificada no navegador. Não há transcodificação ou inspeção de duração no
servidor. Links de leitura duram cinco minutos. Uploads assinados já emitidos
exigem limpeza posterior ao vencimento; o expurgo usa fila e worker periódico.

## Operação e dados

Variantes/progressão usam a entidade `treinosV2` e publicação existentes. Jornadas
usam `personal_automacoes` com `ativa=false` e ação própria; não entram no motor de
mensagens automáticas. Compras/despensa ficam no aparelho por aluno/plano. Relatos
de dificuldade seguem a fila de sincronização de refeições existente. Passos e
sono permanecem locais e opcionais; não são enviados ao professor por este lote.

Vídeos exigem as migrações `20261017180206_tecnica_video_privada.sql`,
`20261017182409_tecnica_video_agendamento_privado.sql` e
`20261017183412_tecnica_video_dispatch_http_privado.sql`, as funções `tecnica-video`
e `tecnica-limpeza`, e a ativação da configuração do agendador somente após
conferir o worker no projeto correto. O segredo é gerado no Vault sem expô-lo e o
job nasce inativo. A terceira migração evita enviar a credencial pela fila pública
do pg_net, cuja permissão não pode ser revogada pelo papel postgres neste projeto.
Não modifica acesso público ao Storage nem utiliza service_role no cliente.

## Verificação

Foram executados testes dos novos núcleos e interfaces, SQL local em PGlite,
integração Personal → pacote → player, recarga durante treino, separação de dados,
reenvios com resposta perdida, revogação e exclusão, geometrias móveis, downloads
TCX e preservação da lista de compras anterior. A seleção de regressão abrangeu
20 suítes de versão/cache, histórico, séries, player, offline, loader, início,
evolução, alimentação, Central Pro e demos. Falhas iniciais de dependência no
Windows foram resolvidas com o caminho explícito do Playwright; as verificações
funcionais não foram afrouxadas. A revisão adicional cobriu o retry após upload
confirmado pelo Storage com HTTP 400 Duplicate, a seleção do exercício original
após uma variante e os contadores de exercícios com nomes repetidos.

Testes adicionais: `test-evolucao-bundle-v866.js`,
`test-evolucao-integracao-v866.js`, `test-evolucao-menu-compras-v866.js`,
`test-tecnica-video-*`, `test-jornadas-*`, `test-nutricao-semana-v866.js`,
`test-treino-evolucao-*` e `test-corrida-saude-*`.

A validação local não substitui CI, publicação nem teste nativo. O backend de
vídeos foi implantado e sua limpeza autenticada foi verificada em 17/10/2026 no
projeto de produção do Personal; evidências e limites estão em
`mt-v866-tecnica-expurgo.md`. A publicação do frontend é registrada separadamente
na entrega e no pull request, depois dos checks do commit final.
