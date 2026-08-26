#!/usr/bin/env node
/* Gera design/BRIEFING-CLAUDE-DESIGN.md a partir do repositório.
 *
 * Por que existe: o recado pro Claude Design era escrito à mão e envelhecia em
 * dias. Em 25/08 ele dizia "app em mt-v601" e o app já estava no v605; no dia
 * seguinte, no v633. Recado velho é pior que recado nenhum — o Claude Design
 * desenha em cima de uma foto do app que não existe mais.
 *
 * O que é lido do repo (nunca digitado): a versão (assets/versao.js), a lista
 * de lançamentos (assunto dos commits mt-vNNN) e em que versão cada arquivo do
 * visual encostou pela última vez. O resto do texto é prosa fixa aqui embaixo.
 *
 * Uso:  node tools/briefing-design/gera.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..", "..");
const SAIDA = path.join(RAIZ, "design", "BRIEFING-CLAUDE-DESIGN.md");
const QUANTOS = 15; // lançamentos listados na tabela

function git(args) {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();
}

// ---------- o que o repositório sabe ----------

function versaoAtual() {
  const txt = fs.readFileSync(path.join(RAIZ, "assets", "versao.js"), "utf8");
  const m = txt.match(/MT_VERSAO\s*=\s*"(mt-v\d+)"/);
  if (!m) throw new Error("não achei a versão em assets/versao.js");
  return m[1];
}

// Cada lançamento é um commit cujo assunto começa em "mt-vNNN:".
// Números REPETIDOS são normais aqui: quando duas conversas trabalham em
// paralelo, as duas numeram a partir do mesmo ponto. O briefing mostra isso em
// vez de esconder, senão o Claude Design confia num número que quer dizer duas
// coisas.
function lancamentos() {
  const linhas = git(["log", "--format=%s", "HEAD"]).split("\n");
  const lista = [];
  for (const l of linhas) {
    const m = l.match(/^(mt-v(\d+)):\s*(.+?)\s*(?:\(#(\d+)\))?$/);
    if (m) lista.push({ ver: m[1], n: Number(m[2]), texto: m[3], pr: m[4] || "" });
  }
  return lista; // já vem do mais novo pro mais velho
}

// em que versão este arquivo encostou pela última vez
function versaoDoArquivo(rel) {
  const sha = git(["log", "-1", "--format=%H", "--", rel]);
  if (!sha) return null;
  const assunto = git(["log", "-1", "--format=%s", sha]);
  const m = assunto.match(/^(mt-v\d+):/);
  return { ver: m ? m[1] : "(fora de um lote de versão)", assunto, data: git(["log", "-1", "--format=%ci", sha]).slice(0, 10) };
}

// ---------- montagem ----------

const versao = versaoAtual();
const lista = lancamentos();
const dataRepo = git(["log", "-1", "--format=%ci"]).slice(0, 10);
const commit = git(["log", "-1", "--format=%h"]);

const skin = versaoDoArquivo("app/aluno-skin.js");
const builder = versaoDoArquivo("app/aluno-builder.js");

const nAtual = Number(versao.replace("mt-v", ""));
const nSkin = skin && skin.ver.startsWith("mt-v") ? Number(skin.ver.replace("mt-v", "")) : null;
const atrasoSkin = nSkin === null ? null : nAtual - nSkin;

// números que aparecem mais de uma vez = trabalho em paralelo
const conta = new Map();
for (const l of lista) conta.set(l.ver, (conta.get(l.ver) || 0) + 1);
const repetidos = [...conta.entries()].filter(([, n]) => n > 1).map(([v]) => v)
  .sort((a, b) => Number(b.replace("mt-v", "")) - Number(a.replace("mt-v", "")));

const tabela = lista.slice(0, QUANTOS)
  .map((l) => `| ${l.ver} | ${l.texto}${l.pr ? ` ([#${l.pr}](https://github.com/raphaelmarge/metodo-torque/pull/${l.pr}))` : ""} |`)
  .join("\n");

const blocoRepetidos = repetidos.length
  ? `
## ⚠️ Número de versão NÃO serve como endereço

Estes números aparecem **mais de uma vez** no histórico, com conteúdos
diferentes: ${repetidos.join(", ")}.

Isso acontece quando duas conversas trabalham no mesmo repositório ao mesmo
tempo — as duas numeram a partir do mesmo ponto e chegam ao mesmo número
falando de coisas distintas. Nada se perdeu (as duas linhas foram juntadas),
mas o rótulo ficou ambíguo.

**Consequência prática:** não diga "volte pro jeito que estava no mt-v599".
Descreva a tela, ou aponte o commit. Um número pode significar duas coisas.
`
  : "";

const md = `# Recado pro Claude Design — estado do app do aluno

**Cole isto no começo da conversa em claude.ai/design.**

| | |
|---|---|
| App em | **${versao}** |
| Estado do repo em | ${dataRepo} (commit \`${commit}\`) |
| Repositório | \`raphaelmarge/metodo-torque\` |
| Lançamentos no histórico | ${lista.length} |

> 🤖 Este arquivo é **gerado** por \`tools/briefing-design/gera.js\`. Não edite à
> mão — rode o script de novo. A versão, a data e a tabela de lançamentos são
> lidas do próprio repositório, então elas nunca ficam desatualizadas.

---

## ⚠️ Não mande cópia do \`app/aluno-skin.js\`

O visual do app do aluno mora em \`app/aluno-skin.js\`. Ele encostou pela última
vez em **${skin ? skin.ver : "?"}**${skin ? ` (${skin.data})` : ""}, e o app está em **${versao}**${
  atrasoSkin && atrasoSkin > 0 ? ` — ou seja, **${atrasoSkin} versões** aconteceram depois disso` : ""
}.

Se você estiver com uma cópia desse arquivo de um pacote antigo, **ela está
velha** e copiá-la por cima apaga o que veio depois. Isso quase aconteceu de
verdade: um pacote de handoff sincronizado no mt-v597 mandava "copie por cima",
e o arquivo já tinha mudado quatro vezes desde então.

Se precisar mexer no visual: peça o arquivo **atual** ao Raphael, ou mande só o
trecho a mudar — nunca o arquivo inteiro.

O motor (\`app/aluno-builder.js\`) encostou em **${builder ? builder.ver : "?"}**${builder ? ` (${builder.data})` : ""}.
Esse **não é** território de design — sync, push, PIX, GPS e chat moram nele.
${blocoRepetidos}
## Últimos ${Math.min(QUANTOS, lista.length)} lançamentos

| Versão | O que entrou |
|---|---|
${tabela}

## 🚫 A tela do treino guiado saiu do mockup DE PROPÓSITO

O Raphael viu a tela implementada, disse **"tá muita informação"** e pediu mais
limpa. O resultado foi um vai-e-vem ao vivo, e ele **aprovou a versão enxuta**.

Ou seja: a tela no app hoje está **mais limpa que a do \`.dc.html\`**, e isso é
decisão dele, não erro de implementação. Se for redesenhar essa tela, parta do
que está no app, não do mockup.

O que mudou em relação ao mockup: o nome da ficha aparecia duas vezes (topo e
embaixo do 01/05) e ficou só uma; o card externo perdeu a moldura (era moldura
dentro de moldura dentro de moldura); os dois cronômetros foram morar juntos no
topo; e recado, dica, "na última vez" e "depois vem" adotaram um cinza só e um
tamanho só. **Nada foi removido** — só mudou o peso.

## Como mandar trabalho

Prefira **PR num branch \`design/...\`** em vez de arquivo solto no chat. Três
motivos:

1. As 20 suítes rodam **antes** de publicar.
2. O Git mostra conflito em vez de escondê-lo — que é exatamente o que quase
   aconteceu com o skin.
3. Merge na \`main\` publica o site **na hora** (GitHub Pages). Não existe
   rascunho: o que entra vai pro celular dos alunos.

## Regras que continuam valendo

- Visual do app do aluno mora em \`app/aluno-skin.js\`. **Não reescrever**
  \`app/aluno-builder.js\` (sync, push, PIX, GPS, chat) nem \`apps/store.js\`.
- Nenhum dado de aluno no builder: tudo entra pelo objeto \`D\`.
- Cores por variável (\`--cor/--cor2/--corc/--bg0…12\`) — cada studio tem a sua.
- Não converter estilo inline existente pra classe: o modo claro lê \`[style*=…]\`.
- Alvo de toque mínimo 44px; botão principal de largura cheia 58px.
- \`!important\` só onde o alvo tem estilo inline no HTML montado — senão o inline
  vence.

## O que ainda está aberto

- **Tela do "treino feito"** — a única das telas "direção final" que não foi
  conferida contra o app. Ela só aparece ao concluir um treino inteiro, e não
  existe caminho de teste que chegue lá sem simular o fluxo todo.
- **Paridade NUTRI × PERSONAL** — o app do paciente já tem XP, semana, medalhas
  e Comunidade; falta o painel (cadastro com anamnese, sub-abas, perfil).
`;

fs.writeFileSync(SAIDA, md, "utf8");
console.log(`briefing gerado: ${path.relative(RAIZ, SAIDA)}`);
console.log(`  versão ${versao} · ${lista.length} lançamentos · skin em ${skin ? skin.ver : "?"}`);
if (repetidos.length) console.log(`  números repetidos avisados: ${repetidos.join(", ")}`);
