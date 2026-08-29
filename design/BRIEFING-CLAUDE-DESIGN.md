# Recado pro Claude Design — estado do app do aluno

**Cole isto no começo da conversa em claude.ai/design.**

| | |
|---|---|
| App em | **mt-v656** |
| Estado do repo em | 2026-08-29 (commit `e597290`) |
| Repositório | `raphaelmarge/metodo-torque` |
| Lançamentos no histórico | 118 |

> 🤖 Este arquivo é **gerado** por `tools/briefing-design/gera.js`. Não edite à
> mão — rode o script de novo. A versão, a data e a tabela de lançamentos são
> lidas do próprio repositório, então elas nunca ficam desatualizadas.

---

## ⚠️ Não mande cópia do `app/aluno-skin.js`

O visual do app do aluno mora em `app/aluno-skin.js`. Ele encostou pela última
vez em **mt-v601** (2026-08-25), e o app está em **mt-v656** — ou seja, **55 versões** aconteceram depois disso.

Se você estiver com uma cópia desse arquivo de um pacote antigo, **ela está
velha** e copiá-la por cima apaga o que veio depois. Isso quase aconteceu de
verdade: um pacote de handoff sincronizado no mt-v597 mandava "copie por cima",
e o arquivo já tinha mudado quatro vezes desde então.

Se precisar mexer no visual: peça o arquivo **atual** ao Raphael, ou mande só o
trecho a mudar — nunca o arquivo inteiro.

O motor (`app/aluno-builder.js`) encostou em **mt-v645** (2026-08-27).
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
| mt-v656 | NUTRI — filtros Sumindo/Encerrados e o importador de pacientes |
| mt-v655 | moderação da Comunidade no NUTRI — fecha o risco do feed sem controle |
| mt-v654 | régua do teste grátis — 4 e-mails automáticos (dia 1, 3, 7 e 12) |
| mt-v653 | fechamento do mês por e-mail, sozinho — e o e-mail de acesso sem var() |
| mt-v652 | Importar lista — a carteira inteira de alunos numa colada |
| mt-v651 | primeiro dia guiado no Início — 3 passos até ver o app com a própria marca |
| mt-v650 | Baixar em Excel (CSV) ao lado do backup — alunos e pagamentos legíveis |
| mt-v649 | o vídeo explicativo entra na página de vendas |
| mt-v648 | organograma enxuto — os departamentos viram carrossel de telas do painel |
| mt-v647 | vitrine do app vira celular de arrastar, com treino guiado e circuito |
| mt-v646 | página de vendas nova — o sistema que te oferece tempo, o personal como empresa |
| mt-v645 | o mapa da corrida segue o aluno, e a bolinha vira seta |
| mt-v644 | prepara a chave do CARTO (o mapa vinha carimbado "API KEY REQUIRED") |
| mt-v643 | o trajeto da corrida em 3D (MapLibre) — e a rota passa a ser guardada |
| mt-v642 | o mapa da corrida estava morto desde a v602 (nome de funcao repetido) |

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
