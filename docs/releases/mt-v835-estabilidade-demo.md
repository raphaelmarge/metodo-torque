# mt-v835 — publicação, editor de questionários e demo com acesso direto

Base: `99f7d1378e08f40705c020c9c4a11a7223cb5d31` (main consultada em 15/09/2026).

## Primeiro lote da evolução solicitada

O run Pages `34999936539`, commit `ca962cad197d697fa63fd86331b0877fc1c08143`, falhou na suíte `test-questionarios-usabilidade.js`: o campo `qqNome` não ficou visível após a reabertura do editor. O deploy foi pulado. Merge e o commit automático de briefing não comprovavam publicação.

A camada de apresentação finalizava o salvamento do modelo num `setTimeout`, separado do handler canônico síncrono. A finalização agora é um listener posterior no mesmo clique: mantém a leitura de confirmação, ID, ordem e falhas de gravação, sem deixar um retorno antigo limpar ou fechar outro rascunho. Não altera o salvamento nem a RPC/CAS. Um cenário determinístico de salvar/reabrir no mesmo turno falha no código anterior e passa com a correção. O teste original não foi removido, relaxado nem ganhou repetição automática.

A demo principal e `demo-aluno-sem-cadastro.html` passam a abrir diretamente como aluno de demonstração. `demo-aluno-cadastro.html` preserva o primeiro acesso com questionário e contrato. As duas entradas são construídas por `__montaAppAluno`, com a mesma fixture e carimbo; somente o aluno fictício direto recebe `requerido: false`. Não se remove overlay por CSS e não se fabrica aceite ou pagamento concluído. O questionário normal de acompanhamento permanece nas duas entradas. O gerador bloqueia tráfego externo e exige servidor local.

As três demos são geradas juntas por `node tools/demo-aluno/regen-demo.js` ou pelo wrapper `regen-demos.js`; importar a função pura de títulos/validação não escreve arquivos. Atualização de versão nos três pontos de cache. Não há mudanças nas regras de entrada dos alunos reais, dados de clientes, estrutura do Supabase, financeiro ou identidade opcional.

## Verificação e publicação

Verificações locais: 51 da usabilidade, 39 da edição/concorrência de questionários, 17 de versão. Cenário novo também executado no código anterior, com falha esperada. Navegação HTTP do Chromium local bloqueada pelo ambiente; geração e teste de entrada dos HTMLs ficam para o CI, com dados fictícios e rede externa bloqueada. A suíte integral do HEAD final deve passar antes do merge, e o Pages deve confirmar o SHA servido antes de anunciar publicação.

Este documento descreve o escopo, não prova deploy. Resultados e estado final ficam no PR e nos runs correspondentes.
