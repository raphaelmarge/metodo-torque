# Checkpoint de CI — calendário da Evolução

Complementa `CORRECOES-E-RETOMADA.md`, issue #826 e PR #827, em 11/09/2026.

## Falha confirmada, causa ainda em investigação

A suíte completa do head inicial `b28aca68bbea5f1274f988239f6e7aa3ca7f5e20`, run `34565450627`, terminou com **73 suítes e uma falha**. A falha foi `tests/test-aluno-evolucao-experiencia.js`, na exigência de alvos de 44 × 44 px nos botões do calendário, viewport de 320 px. O empacotamento foi corretamente pulado e as evidências foram guardadas. Não houve publicação.

Log recuperado do artefato `10186192566`; digest SHA-256 do ZIP confirmado: `20225a4100f81dd07f513450ed200ab3f991c77ff8cd3a3fc680d0b3fb4d4d33`.

Os questionários passaram na revisão isolada do head `f93c3b644053a001a930834149a73e25440d25fb`, run `34566704108`. Isso não aprova a suíte geral nem commits posteriores.

## Por que não mudar o CSS por suposição

O ensaio local offline da sequência completa, com armazenamento em memória e Chromium diferente do CI, passou nas 126 verificações e mediu os botões em 44 × 44 px nos dois temas e larguras testadas. A navegação HTTP do navegador local estava indisponível; portanto, esse ensaio não equivale à execução canônica do CI. Ele não encerra a falha remota.

O workflow `Evolução - diagnóstico de geometria` executa uma cópia instrumentada em memória da suíte canônica, com as mesmas dependências travadas e a mesma exigência de 44 px. Registra dimensões, posição, estilos e transformações dos ancestrais, além das capturas já previstas na fixture. Não modifica testes versionados, não altera dados reais e não reduz a exigência para produzir uma aprovação.

## Próximo passo

Consultar o run do head atual e seus artefatos `evolucao-geometria-*`. Separar tamanho efetivamente inadequado, transformação em curso e erro de precisão de medida. Só então corrigir a causa e executar novamente a suíte completa. Até essa confirmação, manter o PR em rascunho, sem merge e sem declarar o calendário corrigido.
