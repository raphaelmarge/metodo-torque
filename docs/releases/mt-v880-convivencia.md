# mt-v880 — convivência de workers e adaptador de histórico

Base: `origin/main` consultada em 14/11/2026, commit
`3c5fa9cd59e0b771425c4191b30581e40221e0c3`. Os trechos de `sw.js`,
`assets/pwa-update.js` e `app/index.html` eram idênticos ao commit público
`5303ee4da711eb5eb46805f0e3d950af801bd1ba` (mt-v876).

## Correção

- A raiz não intercepta `/torque-one` nem seus descendentes, assim como já
  fazia com `/nutri`. Sem worker próprio e sem rede, a navegação falha de forma
  real em vez de abrir o portal ou uma cópia antiga de um recurso independente.
- `MT_ATUALIZA` remove somente caches de código `precache/runtime-mt-vN`.
  O desregistro exige scope exato do portal e URL de script correspondente ao
  seu `sw.js`, inclusive se ainda estiver instalando ou aguardando ativação.
  Outros workers, recursos de mapa/visão, dados e filas continuam preservados.
- A revogação do loader mantém a limpeza dos dados legados já existente.
  Apenas o desregistro fica limitado ao scope e script `app-sw.js` do loader;
  não remove workers do portal, One, Nutri independente ou aplicativos alheios.
- Os três marcadores de versão sobem juntos para mt-v880, incluindo o worker
  aluno para que seu precache receba o loader corrigido. Sem alterar esquemas,
  tokens, autorização remota, prescrições ou publicação de dados.

## Adaptador exportado de histórico

`createLocked` deixa de depender da visibilidade imediata de localStorage entre
abas. Mesmo com Web Locks, outra aba pode observar uma cópia atrasada. O
adaptador confirma leitura e operação na mesma transação IndexedDB e mantém o
espelho local após o commit. Eventos novos ficam em memória até a confirmação;
abortar não deixa um evento incompleto disponível para recuperação posterior.
Falhar ao atualizar o espelho após commit não transforma uma gravação durável
em erro; uma nova leitura recupera a versão confirmada.

O contrato exige a fábrica IndexedDB do namespace do produto, scope estável do
aluno/conta e guarda de identidade ativa. Uma limpeza deve remover o scope nas
duas cópias, com os writers parados. Não misturar `createLocked` e `create()` no
mesmo scope sem protocolo explícito de reconciliação. **O player atual continua
usando `create()` e uma concessão por sessão**; esta alteração não migra o
player para IndexedDB nem modifica sua fila ou seu fluxo de revogação.

O core foi portado isoladamente da correção revisada do One, incorporado pelo
gerador de runtime e pelas três demos canônicas do legado. Nenhum outro módulo
One substituiu Academia, Nutri independente ou seus dados. A fixture do recibo
de marca passou a usar a data local do app para continuar no período filtrado.

## Verificação

`tests/test-product-worker-isolation.js` executa os workers raiz/aluno,
atualizador e loader reais contra servidor local. Workers mínimos de fixture
representam os outros produtos e têm caches próprios. Cobre:

- entrada One sem worker próprio, com cópias antigas já presentes no cache da
  raiz, tanto online quanto com falha real do servidor local;
- atualização manual preservando outros scopes, caches, dados e filas;
- abertura One offline após a atualização do portal;
- falha da RPC local mantendo pacote/fila/worker do aluno;
- revogação explícita removendo dados e worker legados, preservando os demais.

O teste usa apenas dados sintéticos e rejeita requisições externas. O runner
de CI o descobre por `tests/test-*.js` e executa Chromium e WebKit. A suíte de
upgrade existente e `test-versao.js` verificam atualização entre versões,
instalação interrompida e coerência dos três marcadores de cache.

Validação local em 14/11/2026: 33 verificações de convivência, 17 de versão,
66 de identidade/marca; histórico core (20 cenários), browser (13), transporte
(8), bundle embarcado, concessão (16), players (49), múltiplas sessões (32),
variantes de demo (32) e entrada de demo (40). O upgrade Chromium verifica
portal e aluno nos caminhos 865 → 866 → 880 e 865 → 880, incluindo instalação
interrompida e uso offline. WebKit e a suíte completa ficam a cargo do CI.

Não houve merge, publicação, alteração de banco remoto ou validação de produção.
Instalações ainda controladas por um worker anterior precisam receber esta
versão online; a alteração no repositório não substitui o código já instalado.
Esta correção também não transfere tokens, não redireciona contas e não decide
a autoridade entre produtos. O corte do One requer sua homologação própria.
