# Recado pro Claude Design — estado do app do aluno

**Cole isto no começo da conversa em claude.ai/design.**
Atualizado em 2026-08-25 · app em **mt-v601** · repo `raphaelmarge/metodo-torque`

---

## Onde o app está agora

O pacote de handoff que você montou está **todo aplicado**. Os três passos
mecânicos do `PATCH-APLICAR.md` (skin copiado, replace no builder, include antes
do builder) foram conferidos no repo, e as **4 receitas entraram** — a última, o
check-in da semana em uma pergunta por tela, entrou no mt-v600.

Não precisa mandar nada disso de novo.

## ⚠️ O app mudou depois do mt-v597 — não mande cópia do skin

O pacote trazia um `app/aluno-skin.js` sincronizado no **mt-v597**. De lá pra cá o
arquivo mudou quatro vezes. **Copiar aquela cópia por cima apagaria tudo abaixo:**

| Versão | O que entrou |
|---|---|
| mt-v598 | Treino guiado mais limpo: fim do nome da ficha duplicado, card externo virou fundo, roxo só no botão e no progresso |
| mt-v599 | Segunda volta do guiado: cronômetros juntos no topo, apoio num cinza e num tamanho só, tiles maiores, séries em pastilhas de 26px |
| mt-v600 | Check-in da semana vira fluxo de uma pergunta por tela (`#ckFluxo`, rascunho em `ptckdraft`) |
| mt-v601 | Alvos de toque abaixo de 44px fechados nas telas 44–51 (`.crModBt`, `#crMetaBtn`, `#avBtn2`) |

Se precisar mexer no skin, peça o arquivo **atual** ao Raphael ou mande só o
trecho a mudar — nunca o arquivo inteiro de uma cópia antiga.

## 🚫 A tela 47 (treino guiado) saiu do mockup DE PROPÓSITO

O Raphael viu a tela implementada, disse **"tá muita informação"** e pediu mais
limpa. As versões v598 e v599 são o resultado desse retorno ao vivo, e ele
**aprovou a versão enxuta**.

Ou seja: a tela no app hoje está **mais limpa que a 47 do `.dc.html`**, e isso é
a decisão dele, não um erro de implementação. Se for redesenhar essa tela, parta
do que está no app, não do mockup antigo.

O que mudou em relação ao mockup, resumido: o nome da ficha aparecia duas vezes
(topo e embaixo do 01/05) e ficou só uma; o card externo perdeu a moldura (era
moldura dentro de moldura dentro de moldura); os dois cronômetros foram morar
juntos no topo; e recado, dica, "na última vez" e "depois vem" adotaram um cinza
só e um tamanho só. **Nada foi removido** — só mudou o peso.

## Como mandar trabalho (pedido do CLAUDE.md)

Prefira **PR em branch `design/...`** em vez de arquivo solto no chat. Assim as 20
suítes rodam antes de publicar, e o Git mostra conflito em vez de esconder —
que é exatamente o que quase aconteceu com o skin.

Merge na `main` publica o site na hora (GitHub Pages), então tudo que entra passa
pelos testes.

## Regras que continuam valendo

- Visual do app do aluno mora em `app/aluno-skin.js`. **Não reescrever**
  `app/aluno-builder.js` (sync, push, PIX, GPS, chat) nem `apps/store.js`.
- Nenhum dado de aluno no builder: tudo entra pelo objeto `D`.
- Cores por variável (`--cor/--cor2/--corc/--bg0…12`) — cada studio tem a sua.
- Não converter estilo inline existente pra classe: o modo claro lê `[style*=…]`.
- Alvo de toque mínimo 44px; botão principal de largura cheia 58px.
- `!important` só onde o alvo tem estilo inline no HTML montado — senão o inline
  vence. (Foi o que os três botões de modalidade da corrida precisaram.)

## O que ainda está aberto

- **Tela 48 (treino feito)** — a única das telas "direção final" que não foi
  conferida contra o app. Ela só aparece ao concluir um treino inteiro, e não
  existe caminho de teste que chegue lá sem simular o fluxo todo.
- **Paridade NUTRI × PERSONAL** — o app do paciente já tem XP, semana, medalhas e
  Comunidade; falta o painel (cadastro com anamnese, sub-abas, perfil).

## Conferido no app real em 2026-08-25 (telas 44–51)

Medido no DOM, não a olho: `--cor` #7c3aed, `--bg0` #0d0c10 e fonte Archivo nas
sete telas capturadas, zero erro de JS, botão principal de largura cheia em 58px
e — depois do mt-v601 — zero alvo de toque abaixo de 44px.
