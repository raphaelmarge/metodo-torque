# Corrida e conexões de saúde — mt-v866

Base inspecionada: `565f6ed`, Personal e aplicativo do aluno. Não altera o
produto Nutri, Auth, RLS, sincronização financeira nem APIs de fornecedores.

## Comparar a prescrição com a execução

`assets/corrida-analise.js` compara etapas pelos índices históricos. A fonte é
`registro.prescricao.blocos` (snapshot da sessão) ou os alvos já registrados em
`etapas[].alvoSegundos/alvoKm`. Não procura o treino atual pelo nome, não distribui
o tempo/distância totais por tiros e não atribui uma zona de FC sem medição.

Mostra prescrito, realizado, estado concluída/parcial/pulada/sem registro,
diferença e ritmo calculado a partir das duas medidas disponíveis. Zero realizado
é um valor observado; zero do alvo legado significa alvo não definido. Índices
duplicados são conflitos. Legados/GPX sem etapas mantêm seus totais e informam que
o detalhamento não está disponível.

Integração: `MT_CORRIDA_ANALISE.render(registro[, snapshotHistorico])` no perfil
do aluno do Personal. `MT_CORRIDA_EXPORT.student(C, A, E)` acrescenta comparação
ao histórico de corrida e exportação junto ao início do plano. Chamar `render()`
depois de `pintaCrHist`; funções puras `runtime()` podem ser incorporadas no
builder canônico. Ao salvar corrida nova, conservar `{blocos: cr.blocos}` em
`reg.prescricao`; não reconstruir snapshots de registros antigos.

## Exportar etapas

`app/corrida-export.js` gera **Training Center Database v2, Workouts**. Distância
em metros e duração em segundos são preservadas. A confirmação explica o formato
antes do download. Não é um arquivo de atividade concluída e não é envio direto
ao Garmin Connect, Strava ou Apple Watch.

O XSD oficial limita os IDs a 20 etapas e os alvos a 65535 segundos/metros
inteiros. Sequências maiores, valores fracionários ou término simultâneo por
tempo e distância são recusados com mensagem específica; não truncamos nem
mudamos silenciosamente a prescrição. Nomes completos e instruções ficam em
Notes; os campos curtos seguem o limite de 15 caracteres do XSD. Zonas/ritmo
ficam nas instruções, sem inventar limiares/alertas compatíveis com o relógio.

É preciso um dispositivo ou programa que aceite a seção **Workouts**. Upload de
atividades GPX/TCX em serviços de fitness não comprova aceitação de prescrição.
FIT e integração OAuth direta não foram implementados nesta entrega.

## Conexões de saúde

`app/saude-conexoes.js` oferece UI, adaptador Capacitor e armazenamento por escopo
de aluno. Não solicita permissão nem lê no boot. O aluno escolhe apenas treinos,
passos e/ou sono; solicita somente leitura e sincroniza explicitamente. Há
desconexão, indicação das permissões do aparelho e exclusão da cópia local.

No navegador, o fluxo explica a indisponibilidade nativa e oferece o importador
GPX/TCX já existente. Não substitui a ponte legada `MTNativo.saude` ou a conexão
Bluetooth de FC. O host precisa evitar montar a UI nova sobre uma ponte legada
que já tenha sua própria UI funcional; a implementação nova não é `MTNativo`.

Contrato do provider: `capabilities`, `request({read,write:[]})`,
`permissions({read})`, `read({kinds,start,end})` e `settings`. Cada leitura cobre
os últimos sete dias, confere novamente permissões e recusa lotes incompletos.
Respostas atrasadas após mudança de identidade, consentimento ou desconexão são
descartadas. Leituras têm timeout e não deixam o fluxo preso indefinidamente.

IDs do sistema + fonte + categoria identificam registros e recibos. O app pode
repetir importação após falha de gravação sem criar outra atividade. O callback
`importWorkout` deve preservar esse ID ao usar `Sv('ptcardio', ...)` e retornar
`true` somente após a gravação. Não aciona check-in/conclusão de um plano.
Não tenta adivinhar que um GPX legado corresponde à atividade do HealthKit:
esses formatos antigos não contêm o ID do provedor. Se data, modalidade,
tempo e distância conhecidos indicarem uma atividade semelhante, pede confirmação
antes de importar como outra atividade. A semelhança não é tratada como identidade.

Passos/sono só aceitam totais agregados. Não somamos amostras brutas sobrepostas
do relógio e do telefone. Dados manuais de hábitos, peso e treino são preservados.
Desconectar não retira permissões do SO automaticamente; esse limite aparece na
UI. Apagar a cópia de saúde não apaga treinos já importados. O snapshot retornado
ao host só contém categorias com consentimento local ativo. Na integração atual,
passos e sono permanecem no aparelho; apenas as atividades consentidas entram em
`ptcardio`. Não converte passos ou sono em check-in nem os envia ao Personal.

### Plugin nativo implementado, ainda não homologado

`nativo/aluno/health-plugin` contém código Swift para HealthKit e Kotlin para
Health Connect, com dependência local no shell Capacitor 7. A implementação é
somente leitura, em primeiro plano, com pedidos granulares. Não depende de
contas Strava ou Garmin. Não há app de relógio nem GPS em segundo plano.

- iOS: `HKWorkout` de corrida/caminhada/bike; duração registrada pelo HealthKit,
  distância somente se fornecida; passos via estatística cumulativa; sono via
  união de intervalos de sono (exclui acordado/na cama). A Apple não revela
  permissão de leitura negada; a UI informa isso e nunca chama sucesso do pedido
  de “conectado com acesso concedido”.
- Android: `ExerciseSessionRecord` dessas modalidades; duração decorrida entre
  início e fim marcada como tal; distância ausente continua `null`. Não pede
  localização, rota, FC, peso ou distância. Passos e sono usam a agregação do
  Health Connect. Permissões são verificadas novamente antes de cada lote.

Para compilar, preparar a variante **aluno**, instalar as dependências em
`nativo`, sincronizar Capacitor e abrir o projeto nativo. No iOS é necessário
ativar a capability HealthKit no target e adicionar a descrição de uso de leitura
no Info.plist (`NSHealthShareUsageDescription`). Não solicitar permissão de
escrita (`NSHealthUpdateUsageDescription`). Android inclui as três permissões
read-only e Activity de justificativa no manifesto do plugin; Health Connect
precisa estar disponível/atualizado. A política de privacidade e as declarações
das lojas precisam ser revisadas antes de qualquer distribuição.

**Bloqueios exatos:** este ambiente não tem Java/Gradle/Android SDK, Swift ou
Xcode; não foram compilados APK/IPA nem testados sensores ou permissões em
aparelhos. O usuário informou que ainda não tem contas Apple/Google/Strava/Garmin.
Nenhuma conta foi criada, nenhuma credencial foi solicitada e nenhum app foi
publicado. A presença do código não comprova uma conexão operacional no site.

## Verificação executada

- `tests/test-corrida-saude-v866.js`: 74 verificações, incluindo Chromium real,
  comparação em viewport 360 px, XML parseável, download `.tcx`, fluxo web sem
  conexão falsa, isolamento por aluno, consentimento mínimo, revogação, resposta
  atrasada, repetição idempotente, persistência com falha e ausência de métricas.
- `tests/test-corrida-saude-integracao-v866.js`: 14 verificações no aplicativo
  montado pelo builder e no Personal real, com dados sintéticos. Inclui os dois
  pontos de download, comparação dentro do perfil, modal de saúde, ausência de
  gravação privada no demo e viewport de 390 px sem transbordamento.
- Regressões existentes `test-corrida-etapas-aluno.js` e
  `test-corrida-etapas-personal.js`: 74 e 62 verificações, respectivamente.
- Regressões `test-corrida-retomada.js` e `test-corrida-gps-confiavel.js`:
  65 e 44 verificações, respectivamente. Mantêm o tratamento de perda de sinal,
  identidade, persistência com falha e retomada sem inventar tempo ou distância.
- TCX de quatro etapas validado por `System.Xml.XmlReader` contra o XSD Garmin
  oficial obtido em 17/10/2026. Sem erros. O schema foi usado como dependência de
  verificação temporária, não empacotado em runtime.
- `node --check` nos três módulos e `git diff --check`: sem erros.
- Nenhum teste de dispositivo, conta de fornecedor, CI remoto ou produção foi
  feito por esta etapa. Os testes JS não certificam a compilação Swift/Kotlin.

Fontes primárias consultadas em 17/10/2026:

- https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
- https://developer.garmin.com/fit/articles/file-types/workout.html
- https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- https://developer.android.com/health-and-fitness/health-connect/read-data
- https://developer.android.com/health-and-fitness/health-connect/aggregate-data
- https://developer.android.com/jetpack/androidx/releases/health-connect

O plugin Capgo v7.2.15 foi inspecionado: não expõe sono/treinos/agregados.
Por isso não foi instalado, nem o shell foi migrado incidentalmente para
Capacitor 8. As três categorias usam o plugin local descrito acima.
