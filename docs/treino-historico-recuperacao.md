# Histórico integrado — recuperação de 04/10/2026

Implementação local sobre o head `b2e306736ae5dd86a6daebb988578f82418a9457`
do draft [PR #867](https://github.com/raphaelmarge/metodo-torque/pull/867).
Branch exclusiva: `codex/history-players-recovery-20261004`.
O PR #867 e sua branch não foram modificados. Publicação cabe ao coordenador.
Não houve push, criação de PR remoto, merge, deploy, SQL remoto ou alteração de permissões.

## Comportamento implementado

- Os players de musculação, corrida e circuito capturam a prescrição antes da
  execução e registram resultados no journal preparado no PR #867.
- A seleção/edição de série na musculação mantém o original e as revisões.
  As confirmações e o rollback de contador mantêm journal e fluxo do player
  coerentes; correção não inicia outro descanso nem outra conclusão.
- Em Treinos, **Consultar e corrigir treino por data** mostra as sessões,
  prescrição capturada, resultados, original e revisões com horário e motivo.
  O editor modifica reps/carga/RPE na musculação; tempo/distância e etapas
  efetivamente registradas na corrida; resultado, reps por rodada, carga,
  duração e observação no circuito. Não reconstrói etapas a partir do plano.
- A correção pelo editor grava somente um evento de revisão. Não chama rotinas
  de conclusão, XP, check-in ou placar. Campos não editados são preservados,
  incluindo rota, FC e `tempoBase: 'ativo'` quando recebido do PR #870.
- As coleções de compatibilidade são lidas com a revisão projetada quando
  possuem a identidade da sessão. A gravação original permanece no journal.
  O resumo textual antigo do circuito é identificado como resumo do encerramento;
  não é tratado como um recálculo dos valores corrigidos.
- Legado é exibido a partir dos valores realmente armazenados. A ação de
  corrigir primeiro preserva esse original numa sessão explicitamente legada,
  com ID determinístico SHA-256. A prescrição fica vazia, sem usar a ficha atual.
- Removidos os cortes automáticos de 600 registros nos dois caminhos de série
  e de 20 resultados nos caminhos encontrados de circuito/livre. Quota passa
  a ser uma falha explícita, sem descarte automático de resultados anteriores.
- Os controles de réguas, os campos principais +/− e RPE foram preservados.

## Escrita, recuperação e sincronização

A API síncrona do núcleo só escreve sob uma concessão exclusiva de Web Lock
por identidade. Usa o mesmo nome de lock de `createLocked`. O armazenamento
protegido confere a concessão e a identidade em cada escrita, inclusive depois
de respostas de rede. Uma segunda aba pode consultar; precisa fechar a primeira
aba e tocar em **Habilitar edição** para assumir a escrita. Navegadores sem
Web Locks falham explicitamente; não há fallback para CAS fictício.

O início da musculação persiste primeiro a identidade, depois o snapshot: uma
falha entre essas etapas reutiliza o mesmo ID no retry. Resultado/revisão e
coleções legadas não são uma transação única. O journal conserva os eventos já
confirmados, e a repetição da finalização não substitui uma correção posterior.
O rollback do contador também é uma revisão, sem apagar o evento anterior.

As três modalidades usam UUIDs por execução. Na musculação, a chave ficha/data
é apenas um apontador local para a execução selecionada, nunca a identidade do
histórico. **Novo treino desta ficha** cria outra execução e zera somente seus
contadores; retomar/revisar mantém o UUID. Duplo toque é bloqueado. Uma operação
pendente persiste o novo UUID antes de preparar snapshot/apontador/contadores;
quota e reload repetem a mesma operação sem apagar a anterior.

Registros de série são distinguidos por sessão + slot, inclusive nas coleções
compatíveis. O volume soma os valores efetivamente registrados de cada execução,
sem colapsar slots iguais nem consultar a ficha atual para os eventos capturados.
Uma ficha alterada só entra por uma nova execução explícita. As sessões anteriores
mantêm seus snapshots, inclusive duas ou mais na mesma data. Corrida/circuito
mantêm seus IDs por execução. **Revisar registros** pausa o player, captura somente
valores observados e abre a correção por data durante o treino. A revisão é
registrada antes de aplicar os ajustes ao checkpoint; um recibo local permite
retomar/reaplicar a mesma revisão após falha entre essas etapas, sem outra
conclusão. Corrida preserva etapas/rota; circuito transporta reps/carga corrigidas
para seu placar final. A retomada continua explicitamente pausada.

O transporte do PR #867 foi conectado às RPCs propostas, com paginação, ACK,
identidade e retry já testados. Sem as RPCs disponíveis, o histórico permanece
local. HTTP 401/403 ou `sem_acesso` são negação de acesso; rejeição do fetch é
falha de rede; 404/PGRST202 sinalizam RPC indisponível. Falha de servidor e JSON
inválido têm categorias distintas. Nenhuma dessas falhas avança cursor/ACK ou
permite envio depois de leitura recusada. Não foi feita consulta à RPC remota:
a situação de acesso em produção não foi inferida desses testes sintéticos. **Restauração entre aparelhos depende da
instalação/homologação separada dessas RPCs; não está comprovada em produção.**
Não houve backfill remoto, alteração do merge geral nem migração aplicada.

`tools/treino-historico/regen-runtime.js` incorpora as três fontes de histórico
no builder. O HTML gerado continua autossuficiente/offline, sem novo carregamento
externo. `test-treino-historico-bundle.js` exige igualdade exata com as fontes.
As três demos devem ser regeneradas depois de cada alteração nesse runtime.
A versão de release e os checks do commit publicado pertencem ao coordenador.

## Referência visual bloqueada

Foi usada a skill oficial Library para o arquivo
`libfile_c5e713d7e9d48191b9712a1e29210636`, `IMG_0514.jpeg`, com destino próprio
`/workspace/torque-history-reference/IMG_0514.jpeg`. O download oficial falhou
na tentativa e na única repetição. O arquivo não ficou legível neste executor.
Nenhum pixel foi presumido; a remoção dos sliders **não foi feita**.
A captura de evidência da nova tela usa exclusivamente dados sintéticos.

## Verificação local

As verificações iniciais usaram Node 24.19.0. A continuação prepara Node
**22.22.0**, Playwright **1.63.0** do lock e PostgreSQL **17.11** descartável em
`127.0.0.1:55439`, em `/tmp`. Nenhuma instalação ou consulta de banco remoto.
Chromium do sistema **151.0.7922.173** foi usado para os testes disponíveis.
O download oficial do Chromium 153.0.8010.12/v1243 e do WebKit 26.6/v2359
retornou **HTTP 403, Domain forbidden**, inclusive nas tentativas automáticas do
instalador. Não foi classificado como falha de rede, nem contornado por outro
canal. A equivalência exata dos browsers do CI continua pendente.
O servidor das verificações dirigidas usa porta 8894; o lote completo local usa
porta 8895, com Node 22 e o PostgreSQL acima.

As dependências foram instaladas com `npm ci --ignore-scripts`, usando um cache
em `/tmp`, sem alterar lockfiles. Testes com caminho absoluto legado de
Playwright usaram um preload local que redireciona apenas esse caminho para a
mesma versão instalada e o executável Chromium do sistema. Assertions intactas.

| Suíte | Evidência local |
| --- | --- |
| Histórico core | 19 cenários aprovados |
| Histórico sync | 7 cenários aprovados |
| Histórico SQL PGlite | 9 cenários aprovados |
| Histórico browser | 6 cenários aprovados, duas abas reais |
| PostgreSQL real | 3 cenários aprovados com duas conexões e observador: lock/idempotência, revisões concorrentes e revogação |
| Múltiplas sessões | 32 verificações aprovadas: várias execuções na mesma data nas três modalidades, edição offline, nova prescrição e recuperação após quota |
| HTTP/replay | 7 cenários aprovados: negação/rede/RPC/servidor/JSON e replay de seis execuções na mesma data |
| Bundle incorporado | igualdade exata aprovada |
| Histórico players/editor | 41 verificações aprovadas: consulta meses depois, revisão durante os três players, original, XP/conclusão, etapas, carga/reps, quota, recuperação após falha entre revisão/checkpoint, rascunho obsoleto, legado, `tempoBase` e duas abas |
| Player experiência | 63 verificações aprovadas, incluindo rollback e retry |
| Séries práticas | 50 verificações aprovadas |
| Corrida retomada | 56 verificações aprovadas |
| Circuito retomada | 43 verificações aprovadas |
| Template player | 136 verificações aprovadas, múltiplas larguras/temas |
| Infra | 74 aprovadas, incluindo regra `BASE_URL` |

O teste `test-treino-historico-browser.js` agora usa `BASE_URL` para a origem da
fixture, sem mudar suas assertions. A regra que bloqueava o CI do PR #867 passou
localmente em `test-infra.js`; não foi solicitado rerun ou alteração daquele PR.

### Gates pendentes — sem fullpass

1. O gate de PostgreSQL real anteriormente bloqueado foi resolvido localmente:
   os três cenários passaram no PostgreSQL 17.11, sem substituir por PGlite.
2. `bash tests/run.sh` foi iniciado com Node 22 e PostgreSQL local. O resultado
   final do lote deve ser anexado antes de qualquer alegação de fullpass.
   Não foi disparado CI remoto nem declarada validação de produção.
3. Os navegadores exatos do CI estão bloqueados pelo HTTP 403 acima. Os testes
   com Chromium do sistema são evidência adicional, não equivalência desse gate.
4. RPCs/proposta SQL do PR #867 precisam de aprovação e homologação próprias.
   Nenhuma chamada ao serviço remoto foi feita para testar token/acesso.
5. A alteração visual dos sliders continua pendente; as duas falhas oficiais da
   Library não foram repetidas na continuação.

## Proposta de draft separado

Título: **Aluno: integrar players e editor por data ao histórico de sessões**

Base de revisão: PR #867 no SHA `b2e3067`. Ao abrir contra `main`, declarar que
o diff contém a dependência #867; ao empilhar, usar a branch desse PR como base,
sem modificá-la. Não marcar como pronto para merge antes dos gates acima.

Descrição sugerida: o aluno pode consultar a prescrição capturada e os resultados
por data e corrigir registros mantendo original/revisões. Os três players gravam
no journal; o editor não chama conclusão, XP ou check-in. A integração preserva
`tempoBase` do PR #870. Demos regeneradas; sliders preservados porque a referência
não foi materializada. Listar a matriz de testes e os gates pendentes desta nota.
