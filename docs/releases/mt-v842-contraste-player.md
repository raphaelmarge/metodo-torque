# mt-v842 — contraste seguro e player estável

O player continua usando exatamente a cor publicada pelo personal, mas o texto
das ações principais deixa de ser branco fixo. O pacote calcula se branco ou o
preto oferece maior contraste contra `--cor` e publica o resultado
em `--cor-on`. O botão “Registrar série” e a ação principal da revisão consomem
esse token.

As oito cores prontas passam a razão mínima de contraste WCAG AA para texto
normal. Cores personalizadas em hexadecimal usam o mesmo cálculo, nos temas
escuro e claro. O verde continua reservado aos estados positivos.

Também foi corrigido o race que derrubou o gate pós-merge da v841: o observador
responsivo do hero podia receber uma atualização enquanto `#blocoHoje` estava
sem primeiro filho e acessar `.style` de `null`. A guarda de existência impede
o erro sem alterar a geometria quando o conteúdo está presente.

## Verificação

- `tests/test-aluno-template-player.js` mede o contraste computado da ação de
  registro e da ação de revisão, além de validar as oito cores prontas.
- `tests/test-acompanhamento.js` mantém uma regressão explícita para a guarda do
  bloco vazio.
- As três demos do aluno carregam o mesmo skin e o mesmo runtime do builder.
