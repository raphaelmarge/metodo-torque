# Recado pro Claude Design — estado do app do aluno

**Cole isto no começo da conversa em claude.ai/design.**

| | |
|---|---|
| App em | **mt-v640** |
| Estado do repo em | 2026-08-26 (commit `b9f9906`) |
| Repositório | `raphaelmarge/metodo-torque` |
| Lançamentos no histórico | 102 |

> 🤖 Este arquivo é **gerado** por `tools/briefing-design/gera.js`. Não edite à
> mão — rode o script de novo. A versão, a data e a tabela de lançamentos são
> lidas do próprio repositório, então elas nunca ficam desatualizadas.

---

## ⚠️ Não mande cópia do `app/aluno-skin.js`

O visual do app do aluno mora em `app/aluno-skin.js`. Ele encostou pela última
vez em **mt-v601** (2026-08-25), e o app está em **mt-v640** — ou seja, **39 versões** aconteceram depois disso.

Se você estiver com uma cópia desse arquivo de um pacote antigo, **ela está
velha** e copiá-la por cima apaga o que veio depois. Isso quase aconteceu de
verdade: um pacote de handoff sincronizado no mt-v597 mandava "copie por cima",
e o arquivo já tinha mudado quatro vezes desde então.

Se precisar mexer no visual: peça o arquivo **atual** ao Raphael, ou mande só o
trecho a mudar — nunca o arquivo inteiro.

O motor (`app/aluno-builder.js`) encostou em **mt-v638** (2026-08-26).
Esse **não é** território de design — sync, push, PIX, GPS e chat moram nele.

## ⚠️ Número de versão NÃO serve como endereço

Estes números aparecem **mais de uma vez** no histórico, com conteúdos
diferentes: mt-v601, mt-v600, mt-v599, mt-v598.

Isso acontece quando duas conversas trabalham no mesmo repositório ao mesmo
tempo — as duas numeram a partir do mesmo ponto e chegam ao mesmo número
falando de coisas distintas. Nada se perdeu (as duas linhas foram juntadas),
mas o rótulo ficou ambíguo.

**Consequência prática:** não diga "volte pro jeito que estava no mt-v599".
Descreva a tela, ou aponte o commit. Um número pode significar duas coisas.

## Últimos 15 lançamentos

| Versão | O que entrou |
|---|---|
| mt-v640 | prints da landing do Personal saem do v601 e voltam pro sistema de hoje |
| mt-v639 | a IA passa a obedecer as diretrizes do professor ([#628](https://github.com/raphaelmarge/metodo-torque/pull/628)) |
| mt-v638 | os graficos do app do aluno voltaram (paleta e cor de SVG) ([#627](https://github.com/raphaelmarge/metodo-torque/pull/627)) |
| mt-v637 | um calendario so na Agenda + sub-menus em fita de sublinhado ([#626](https://github.com/raphaelmarge/metodo-torque/pull/626)) |
| mt-v634 | escolher exercicio virou tela a parte (uma coisa por vez) ([#623](https://github.com/raphaelmarge/metodo-torque/pull/623)) |
| mt-v633 | montar ficha — a gaveta cobria a ficha e havia 4 jeitos de editar ([#620](https://github.com/raphaelmarge/metodo-torque/pull/620)) |
| mt-v632 | habitos viram media no perfil + montar ficha sem o velho e o novo juntos ([#619](https://github.com/raphaelmarge/metodo-torque/pull/619)) |
| mt-v631 | corrida continua E intervalada no mesmo treino + o quadro do trajeto ([#618](https://github.com/raphaelmarge/metodo-torque/pull/618)) |
| mt-v630 | questionario respondido vira metrica no perfil do aluno ([#617](https://github.com/raphaelmarge/metodo-torque/pull/617)) |
| mt-v629 | a camada de baixo do painel (o que fazia tudo continuar diferente) ([#616](https://github.com/raphaelmarge/metodo-torque/pull/616)) |
| mt-v628 | seis defeitos de computador que o handoff revelou ([#615](https://github.com/raphaelmarge/metodo-torque/pull/615)) |
| mt-v627 | montar treino no celular (tela 20) — a ultima das sete ([#614](https://github.com/raphaelmarge/metodo-torque/pull/614)) |
| mt-v626 | Financeiro e Chat no celular (telas 21 e 22 do handoff) ([#613](https://github.com/raphaelmarge/metodo-torque/pull/613)) |
| mt-v625 | ficha do aluno e Agenda no celular (telas 18 e 19 do handoff) ([#612](https://github.com/raphaelmarge/metodo-torque/pull/612)) |
| mt-v624 | tokens do handoff + as telas 02 e 17 (Inicio e Alunos no celular) ([#611](https://github.com/raphaelmarge/metodo-torque/pull/611)) |

## 🚫 A tela do treino guiado saiu do mockup DE PROPÓSITO

O Raphael viu a tela implementada, disse **"tá muita informação"** e pediu mais
limpa. O resultado foi um vai-e-vem ao vivo, e ele **aprovou a versão enxuta**.

Ou seja: a tela no app hoje está **mais limpa que a do `.dc.html`**, e isso é
decisão dele, não erro de implementação. Se for redesenhar essa tela, parta do
que está no app, não do mockup.

O que mudou em relação ao mockup: o nome da ficha aparecia duas vezes (topo e
embaixo do 01/05) e ficou só uma; o card externo perdeu a moldura (era moldura
dentro de moldura dentro de moldura); os dois cronômetros foram morar juntos no
topo; e recado, dica, "na última vez" e "depois vem" adotaram um cinza só e um
tamanho só. **Nada foi removido** — só mudou o peso.

## Como mandar trabalho

Prefira **PR num branch `design/...`** em vez de arquivo solto no chat. Três
motivos:

1. As 20 suítes rodam **antes** de publicar.
2. O Git mostra conflito em vez de escondê-lo — que é exatamente o que quase
   aconteceu com o skin.
3. Merge na `main` publica o site **na hora** (GitHub Pages). Não existe
   rascunho: o que entra vai pro celular dos alunos.

## Regras que continuam valendo

- Visual do app do aluno mora em `app/aluno-skin.js`. **Não reescrever**
  `app/aluno-builder.js` (sync, push, PIX, GPS, chat) nem `apps/store.js`.
- Nenhum dado de aluno no builder: tudo entra pelo objeto `D`.
- Cores por variável (`--cor/--cor2/--corc/--bg0…12`) — cada studio tem a sua.
- Não converter estilo inline existente pra classe: o modo claro lê `[style*=…]`.
- Alvo de toque mínimo 44px; botão principal de largura cheia 58px.
- `!important` só onde o alvo tem estilo inline no HTML montado — senão o inline
  vence.

## O que ainda está aberto

- **Tela do "treino feito"** — a única das telas "direção final" que não foi
  conferida contra o app. Ela só aparece ao concluir um treino inteiro, e não
  existe caminho de teste que chegue lá sem simular o fluxo todo.
- **Paridade NUTRI × PERSONAL** — o app do paciente já tem XP, semana, medalhas
  e Comunidade; falta o painel (cadastro com anamnese, sub-abas, perfil).
