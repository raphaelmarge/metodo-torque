# Conciliação dos PRs históricos — 22/09/2026

Pedido do responsável: mesclar todos os PRs pendentes do `metodo-torque`.
Base conferida: `c1b783b81a00aa71ed7a9f4a5ed858edceb48517`, runtime mt-v843.

## Por que a resolução preserva o código atual

Os quatro PRs ainda abertos apresentam conflitos porque partem de versões
anteriores. Sua integração funcional já foi entregue no commit
`a07fb759bd3c9629427527d4d21ac9be35d6f369` (mt-v825), com as adaptações
documentadas em `docs/releases/mt-v825-integracao-correcoes.md` e evoluções
posteriores. Reaplicar literalmente os patches antigos reintroduziria código
substituído e versões antigas dos caches.

| PR e head conciliado | Resolução já presente na main |
| --- | --- |
| #752 — `6c3366412c0d7002c0f77c9b49d7a1690a0ea5da` | Oferta nativa de R$ 49/mês, teste correspondente e guia de assinatura. |
| #807 — `c31b5a53d3027a704aec516c8ab6ab27bfdc10d8` | Proteções de gravação adaptadas ao retorno de `MTStore.write`, preservação dos formulários, filtro seguro e testes do protocolo canônico de concorrência/publicação. A migração e o protocolo antigos não são reaplicados. |
| #822 — `64696b33af392164bd6f4c9bb5a777f85c238090` | Implementação canônica de refeições nos calendários, por horário, vigência e dias; editor e testes correspondentes. |
| #825 — `a28a709560e6ad8484797dc4361fda706a306e32` | Busca, filtros, próxima refeição e atalhos de alimentação. O calendário alternativo foi substituído pelo de #822 na integração mt-v825. |

O merge histórico usa a estratégia `ours`, com os quatro heads como pais,
para registrar explicitamente essa resolução. A árvore resultante antes deste
documento é idêntica à base: `bfd9560a7382fb97ba681f509cab21ed9edd400a`.
O único arquivo novo desta conciliação é este registro. Runtime, testes,
workflows, demos, migrações e os três arquivos de versão/cache permanecem
idênticos ao mt-v843. Não há alteração de banco ou de dados de usuários.

## Validação e merge

- Conferidos os heads e as quatro discussões de revisão, sem threads pendentes.
- Conferidos o release mt-v825, a integração no histórico e os trechos atuais
  de oferta nativa, gravação e testes de alimentação/calendário.
- `git diff --exit-code` confirmou árvore idêntica antes deste documento;
  o diff final deve conter somente este arquivo.
- A suíte completa do CI deve passar no head final antes do merge deste PR.
- Usar **merge commit**, preservando a ancestralidade dos quatro heads;
  squash ou rebase perderiam o objetivo desta conciliação histórica.
- Depois do merge, conferir os quatro PRs originais, a main e o workflow Pages.

O aceite físico no iPhone do mt-v843 permanece pendente. Esta conciliação
também não confirma preços configurados nas lojas/RevenueCat nem substitui
validação de contas reais.
