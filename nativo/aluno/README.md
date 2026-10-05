# Fundação experimental do app do aluno

Inspeção de base: `e11509237f9205e75db8d90565c5fb6db501252c` em 03/10/2026.
Escopo: aluno acompanhado pelo TORQUE PERSONAL. No catálogo `../produtos.json`,
esse cliente é a variante `aluno`, `com.torqueon.aluno`, entrada
`aluno-login.html`, marca atual **TORQUE ON Aluno**. A variante `personal` é o
painel profissional; `academia` é outro produto. Nenhuma marca foi alterada.

## Entrega desta fase

`sessao.js` é um núcleo JS independente de UI, servidor, sensores e relógio de
parede. `indexeddb.js` implementa armazenamento transacional de referência no
navegador. `ports.d.ts` descreve as portas futuras de sensores, alertas,
armazenamento e pareamento. **Não há implementação Swift/Kotlin, alvo de relógio,
integração ao builder ou sincronização de produção nesta entrega.**

O núcleo persiste o snapshot do plano e o diário ordenado de eventos na mesma
transação; oferece projeção, retomada pausada, fila pendente, recepção idempotente
e confirmação após commit. Uma exceção de gravação impede confirmação e deixa o
registro anterior intacto. Não há descarte automático nem limite silencioso.
O adaptador IndexedDB é uma referência para testes; a persistência no relógio
deverá usar armazenamento nativo transacional. O SO/navegador pode remover dados;
IndexedDB não comprova durabilidade nativa nem sobrevivência a falta de energia.
Esta referência revalida e regrava o diário inteiro por transação. Antes de usar
amostras de alta frequência ou sessões longas, implementar lotes/páginas e testar
memória, latência, quota e bateria no armazenamento nativo; não usar este formato
de gravação integral como promessa de desempenho no relógio.

O diretório `nativo/` é excluído por `copia-www.js`: esta biblioteca ainda não é
empacotada nem carregada pelo app existente. A suíte entra no glob `test-*.js` do
runner atual. Não foi necessário alterar versão, cache, demos ou produção.

## Contrato v1

- `header`: `v`, `scopeId` opaco, `sessionId`, `deviceId` executor e `plan`.
  O plano tem `id`, `revision`, `activity` e etapas expandidas com `id`, `label`,
  `durationMs`, `distanceM`. Ausência de alvo é `null`. Repetições devem ser
  expandidas pelo futuro mapeador; zonas/esforço e conclusão automática ainda
  exigem evolução do contrato. Não converter prescrições não suportadas perdendo dados.
- Para novas sessões nativas, o ID deve ser criado uma vez pelo executor, com UUID criptográfico,
  e persistido antes do início. A chave é `[scopeId, sessionId]`; todos os relays
  preservam o ID original. `scopeId` é identificador, **não autorização**.
- `events`: `v`, `id` único, `seq` contíguo desde 1, `deviceId`, `type`, `at`, `data`.
  A sequência determina a ordem; `at` serve à auditoria e não calcula duração.
  O único escritor é o dispositivo executor. Telefone/servidor apenas retransmitem.
  Transferência de execução entre dispositivos não é suportada na v1.
- Eventos: `start`, `pause`, `resume`, `interrupt`, `sample`, `gps`, `finish`.
  `sample` exige tempo ativo cumulativo observado em ms; distância cumulativa em
  metros e FC em bpm podem ser `null`. Não estimar métricas ausentes. Pontos de
  percurso têm latitude, longitude, precisão em metros e `segmentId`; uma lacuna
  de GPS exige novo segmento, sem ligar os trechos nem somar distância estimada.
  Filtragem por precisão/idade/saltos é responsabilidade do futuro adaptador.
- `finish` só aceita `partial` nesta fatia: não há motor de intervalos, metas ou
  certificação de conclusão. O snapshot já separa prescrição e execução.
- Mesmo evento/seq e conteúdo canônico: no-op. Conteúdo diferente: conflito,
  sem sobrescrita. Lacunas, ordem incorreta, outro executor ou versão desconhecida:
  rejeição atômica. Plano alterado sob mesma sessão: conflito, mesmo com revisão nova.
- `recover` projeta pausado se encontrou execução ativa e sinaliza
  `needsInterrupt`. O host deve persistir `interrupt` com `nextSeq` antes de
  aceitar `resume`; não inventar amostras durante a lacuna. Reconciliar primeiro
  com eventual sessão ativa do SO no adaptador nativo.

### Uso offline e sincronização

Carregar `sessao.js` e `indexeddb.js` num host de teste. Exemplo de fluxo (os
objetos seguem o contrato acima; fixtures completas estão na suíte):

```js
const store = TorqueSessionStore(indexedDB);
const journal = TorqueSessao.journal(store);
await journal.receive({ header, events: [] }); // plano disponível antes de sair
await journal.receive({ header, events: [startEvent] });
await journal.receive({ header, events: [observedSample] });
const recovery = await journal.recover(header);
// Mais tarde: transporte autenticado, ao telefone ou servidor compatível.
await journal.sync(header, batch => transport.send(batch));
```

`sync` envia somente o sufixo pendente e só avança o cursor após ACK do último
evento enviado. Exceções de transporte/gravação preservam pendências. Se o ACK
se perder, reenviar exatamente os mesmos eventos. O receptor devolve
`{scopeId, sessionId, through, eventId}` apenas após commit; ACK atrasado nunca
retrocede cursor nem confirma eventos novos que surgiram durante envio.
O destino deve conservar o diário e a identidade da sessão. Após perda/reset do
destino, renegociar replay completo; o sufixo sozinho não reconstrói prefixo perdido.
O cursor atual representa **um destino lógico durável**, não confirmações
independentes de telefone e nuvem. A estratégia de relay e custódia é decisão
pendente; não tratar ACK volátil do telefone como entrega final à nuvem.

Uma futura API deve vincular o escopo ao dispositivo autenticado e executar
merge/recibo numa transação, com unicidade por escopo/sessão/seq e ID de evento.
Conflitos devem ficar pendentes para diagnóstico, sem last-write-wins.
Nenhum endpoint, SQL ou autorização efetiva foi criado/alterado.

## Preservação da web

`app/aluno-builder.js` continua canônico. `runtimeCorridaSessao` já guarda
checkpoint `ptcorridaSessao:<escopo>` a cada >=5s, incluindo plano/etapas,
tempo/distância/rota/FC, retoma pausado e reutiliza `sid`/`sessionId` ao finalizar.
Isso continua sendo o único mecanismo ativo na web. O próximo adaptador deverá
reutilizar esse ID e converter unidades explicitamente (s→ms, km→m), com fixtures
de compatibilidade; não manter dois escritores/checkpoints em paralelo.

`app_aluno_devolve`, `ptcardio`, importação GPX/TCX e loader offline permanecem
intactos. Deduplicação aproximada de GPX/TCX por dia/tempo/distância não equivale
à identidade entre dispositivos e não deve receber estes eventos diretamente.
O GPS web usa `watchPosition` e pausa com `document.hidden`; o shell Capacitor
não transforma isso em execução autônoma de relógio.

## Próximas fases e gates

1. **Concluída nesta fatia:** diário offline e contratos testados isoladamente.
   Próxima extração: mapeador de plano/checkpoint canônico e motor puro de etapas,
   intervalos e alertas, com comparação de comportamento e unidades contra o builder.
2. **Gate inicial nativo:** antes de ampliar UI, executar treino baixado no relógio
   com telefone desligado, sem LTE e com tela inativa. Implementar sessão do SO,
   armazenamento nativo, timer de etapas e alertas locais. O JS é referência de
   contrato: watchOS não executará esse módulo automaticamente; compartilhar
   fixtures com implementações Swift/Kotlin.
3. **Entrega posterior:** pareamento revogável por dispositivo, transporte e
   receptor autenticado, integração ao histórico existente, testes físicos e
   somente então preparação para distribuição/lojas.

Apple: [HealthKit HKWorkoutSession](https://developer.apple.com/documentation/healthkit/hkworkoutsession)
para execução; [WatchConnectivity](https://developer.apple.com/documentation/watchconnectivity)
para troca posterior com iPhone, nunca dependência de conectividade durante treino.
Android: [Health Services ExerciseClient](https://developer.android.com/reference/kotlin/androidx/health/services/client/ExerciseClient)
no Wear OS. [Health Connect](https://developer.android.com/health-and-fitness/health-connect)
é troca/armazenamento de dados de saúde, não motor de captura do relógio.
As receitas em `../SAUDE.md` não comprovam plugins instalados nem autonomia.

Decisões pendentes: app próprio watchOS versus alternativa WorkoutKit no app
Treino Apple (não adotada), plataformas/versões mínimas, custódia telefone/nuvem,
política de retenção/compactação e edição/correção de registros. Pareamento inicial
pode usar telefone; autonomia da corrida não exige login standalone no relógio.
O token URL atual de `aluno_login` não deve ser copiado ao relógio. Futuro vínculo
revogável usa Keychain/Keystore, sem segredos em eventos. GPS/FC devem ser opcionais,
com pedido contextual mínimo; peso e demais permissões não entram por padrão.

Aceite físico obrigatório: telefone desligado; relógio sem LTE; tela inativa;
GPS negado/perdido/recuperado; pausa/interrupção/reabertura; armazenamento cheio;
reenvio após perda de ACK; treino alterado após download; resultado parcial e
alertas de intervalos locais. Registrar percurso está no alvo; navegação/mapas
offline completos ficam fora do escopo. Nada disso foi comprovado em aparelhos.

## Verificação local

`node --test tests/test-aluno-sessao-offline.js` usa fixtures sintéticas e Chromium
via Playwright, sem rede externa. Testa versões, snapshot/revisão, conflitos,
repetição, transições, métricas ausentes, retomada e IndexedDB real com conexões
concorrentes e rollback. Falta de espaço é injetada no contrato de armazenamento;
não equivale a encher fisicamente o relógio. Não valida sensores ou autonomia.

Revisão de persistência/sync: registros inválidos (inclusive valores falsy) são
recusados sem sobrescrita; entradas não JSON são recusadas. O teste injeta quota
excedida no `put` do IndexedDB tanto ao salvar evento quanto ao salvar o ACK;
em ambos os casos a transação aborta e a tentativa posterior recupera o fluxo.
Duas conexões com eventos conflitantes confirmam somente um conteúdo. Repetições
de eventos já recebidos podem chegar em outra ordem; eventos novos com lacunas
ou fora de ordem são rejeitados integralmente. Escopos diferentes com o mesmo
ID de sessão não compartilham diário. ACK atrasado não retrocede o cursor.

Executado neste ambiente com `CHROMIUM_PATH=/usr/bin/chromium`:

- Nova suíte: 4 testes passaram, incluindo armazenamento real offline.
- `tests/test-corrida-retomada.js`: 56 verificações passaram.
- `tests/test-corrida-gps-confiavel.js`: 44 verificações passaram.
- `tests/test-corrida-etapas-aluno.js`: 74 verificações passaram.
- Sintaxe dos dois módulos JS e `git diff --check`: sem erros.

As regressões iniciais usaram servidor local em `127.0.0.1:8792`, fixtures
sintéticas e bloqueio de rede externa. Na revisão, os quatro testes focados
passaram novamente com o Playwright 1.63.0 fixado em `tests/ci`.

Também executado o runner completo:

```sh
CHROMIUM_PATH=/usr/bin/chromium \
TORQUE_PLAYWRIGHT=/workspace/metodo-torque/tests/ci/node_modules/playwright \
PORT=8793 bash tests/run.sh
```

Resultado: **159 suítes invocadas, 133 passaram, 26 falharam** (exit 26):

- 18 exigem o caminho fixo `/opt/node22/lib/node_modules/playwright`, ausente.
- 5 exigem executáveis Chromium/WebKit empacotados ausentes, apesar do Chromium
  do sistema disponível. O download tentado de Chromium recebeu HTTP 403.
- 2 exigiam PostgreSQL local (`PGTESTURL`), ainda não preparado nessa execução.
  Foram repetidas depois com PostgreSQL 17.11 em contêiner descartável, tmpfs e
  porta restrita a `127.0.0.1`: **47 verificações de sync e 86 de concorrência
  passaram**. O contêiner foi encerrado; não houve SQL remoto ou dados reais.
- `test-personal.js`: duas asserções do fluxo tour → perguntas → push falharam.
  O bloco v775 original, sem alteração de asserts, foi executado isoladamente
  no checkout-base `e115092` e reproduziu exatamente as duas falhas. A causa
  desse comportamento legado não foi corrigida nem atribuída ao núcleo novo.

Dependências dos três lockfiles de teste foram instaladas com `npm ci` usando
cache em `/tmp`. Ambiente: Node 24.19.0 e Chromium 151.0.7922.173, diferente do
Node 22 e navegadores preparados pelo CI. Não há `sudo`; o setup dos navegadores
do CI não foi reproduzido integralmente. Docker estava disponível e permitiu
resolver as duas lacunas de PostgreSQL. Considerando essas repetições, há 135
suítes aprovadas, 23 bloqueadas pela preparação dos navegadores e uma com as
duas falhas preexistentes reproduzidas; o runner inteiro não foi repetido.
Nenhum teste foi enfraquecido
para contornar esses limites. Os testes focados foram repetidos após a última
mudança de código; a execução ampla não certifica CI, produção ou aparelhos.
