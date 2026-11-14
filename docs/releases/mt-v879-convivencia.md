# mt-v879 — convivência de workers

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
- Os três marcadores de versão sobem juntos para mt-v879, incluindo o worker
  aluno para que seu precache receba o loader corrigido. Sem alterar esquemas,
  tokens, autorização remota, prescrições ou publicação de dados.

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

Validação local em 14/11/2026: 33 verificações de convivência e 17 de versão
passaram; o upgrade Chromium passou para portal e aluno nos caminhos
865 → 866 → 879 e 865 → 879, incluindo instalação interrompida e uso offline.
WebKit e a suíte completa ficam a cargo do CI; não foram executados localmente.

Não houve merge, publicação, alteração de banco ou validação de produção.
Instalações ainda controladas por um worker anterior precisam receber esta
versão online; a alteração no repositório não substitui o código já instalado.
Esta correção também não transfere tokens, não redireciona contas e não decide
a autoridade entre produtos. O corte do One requer sua homologação própria.
