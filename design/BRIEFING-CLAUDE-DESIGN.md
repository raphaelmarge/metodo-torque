# Recado pro Claude Design — estado do app do aluno

**Cole isto no começo da conversa em claude.ai/design.**

| | |
|---|---|
| App em | **mt-v762** |
| Estado do repo em | 2026-09-03 (commit `b9b1579`) |
| Repositório | `raphaelmarge/metodo-torque` |
| Lançamentos no histórico | 223 |

> 🤖 Este arquivo é **gerado** por `tools/briefing-design/gera.js`. Não edite à
> mão — rode o script de novo. A versão, a data e a tabela de lançamentos são
> lidas do próprio repositório, então elas nunca ficam desatualizadas.

---

## ⚠️ Não mande cópia do `app/aluno-skin.js`

O visual do app do aluno mora em `app/aluno-skin.js`. Ele encostou pela última
vez em **(fora de um lote de versão)** (2026-09-02), e o app está em **mt-v762**.

Se você estiver com uma cópia desse arquivo de um pacote antigo, **ela está
velha** e copiá-la por cima apaga o que veio depois. Isso quase aconteceu de
verdade: um pacote de handoff sincronizado no mt-v597 mandava "copie por cima",
e o arquivo já tinha mudado quatro vezes desde então.

Se precisar mexer no visual: peça o arquivo **atual** ao Raphael, ou mande só o
trecho a mudar — nunca o arquivo inteiro.

O motor (`app/aluno-builder.js`) encostou em **mt-v755** (2026-09-02).
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
| mt-v762 | o vitalício é grudado — nenhum caminho derruba mais |
| mt-v761 | a trava do teste vencido e o acesso vitalício |
| mt-v760 | o painel que avisa o dono, e a régua contra construir no escuro |
| mt-v759 | o WhatsApp parou de pedir Supabase ao professor |
| mt-v758 | redundância, organização e testes — o fim da varredura por área |
| mt-v757 | pt-push e pt-app-conta — publicar num caminho só, chat honesto |
| mt-v756 | o apagão do estúdio de um professor — três travas |
| mt-v755 | as sobras entre territórios da revisão (6 itens) |
| mt-v754 | revisão por área — Configurações/Avaliação e o resto do app do aluno (69 itens) |
| mt-v753 | teto de uso da IA por academia + prompt de corrida coerente |
| mt-v752 | revisão por área — Montar treino e IA (pt-treinos, pt-ia, 27 itens) |
| mt-v751 | revisão por área — Financeiro e Relatórios (pt-fin, pt-rel, 26 itens) |
| mt-v750 | revisão por área — ficha do aluno e Agenda (pt-perfil, pt-agenda, 33 itens) |
| mt-v749 | revisão por área — app do aluno (app-html, app-core, 29 itens) |
| mt-v748 | revisão por área — infra, funções e SQL (43 itens) |

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
