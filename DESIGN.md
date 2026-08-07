# 🎨 DESIGN.md — guia de design do TORQUE ON

Oi Raphael! Este arquivo é **seu painel de melhorias de design**. Ele serve pra duas coisas:

1. **Consultar** o padrão visual do sistema (cores, botões, telas) — assim tudo que a gente criar fica com a mesma cara.
2. **Pedir melhorias**: marque com `x` as caixinhas da lista lá embaixo (troque `[ ]` por `[x]`) e me diga: *"Claude, faz os itens marcados do DESIGN.md"*. Eu implemento, testo e publico.

Você também pode escrever ideias novas no fim do arquivo, do seu jeito, sem se preocupar com termo técnico.

---

## 1. Identidade visual atual (o padrão da casa)

| Item | Padrão | Onde usa |
|---|---|---|
| **Violeta TORQUE** | `#7c3aed` (escuro: `#6d28d9`, claro: `#a78bfa`) | Portal, Sistema da academia, TORQUE PERSONAL, app do aluno |
| **Verde Nutri** | `#16a34a` (claro: `#4ade80`) | TORQUE NUTRI e app do paciente |
| **Fundo escuro** | `#121016` (cards `#1d1a24`, bordas `#322e3d`) | Personal, app do aluno, quest.html, Modo TV |
| **Fundo claro** | branco/cinzas claros | Sistema da academia (apps/), Nutri |
| **Fonte** | Archivo (local, sem internet) | Tudo |
| **Tom dos textos** | pt-BR informal ("pra", emojis), direto | Toda a interface |
| **Marca** | TORQUE ON / TORQUE PERSONAL / TORQUE NUTRI | Nunca "TORQUESYS" |

**Regras de ouro:**
- Tudo funciona **offline**; recurso de nuvem avisa com honestidade ("Entre na sua conta…").
- O cliente pode personalizar **logo e cor** (tema) no Personal e no Nutri — o design precisa aguentar qualquer cor escolhida.
- Botões: `.btn` (cheio, cor do produto), `.btn sec` (contorno), `.btn mini` (pequeno), `.btn verde` (Nutri), `.btn whats` (WhatsApp).
- Toda página nova de produto entra no `sw.js` (precache) e a versão sobe +1.

## 2. Mapa das telas (onde cada coisa mora)

- **Portal / Sistema da academia** → `index.html` + `apps/*.html` (hub: `apps/sistema.html`)
- **TORQUE PERSONAL** → `personal.html` (app do aluno é gerado dentro dele)
- **TORQUE NUTRI** → `nutricao.html` (app do paciente idem)
- **Páginas de venda** → `personal-vendas.html`, `torqueon.html`
- **Páginas do aluno** → `aluno-login.html`, `quest.html`, `matricula.html`, `demo-aluno.html`
- **Modo TV** → `apps/tv.html`

---

## 3. ✅ Lista de melhorias de design (marque o que quiser)

### Primeiras impressões (o que o cliente vê primeiro)
- [ ] **Tela de login mais bonita** — foto/gradiente de fundo, logo maior, animação suave ao entrar (aluno-login.html e logins dos módulos)
- [ ] **Onboarding com passos visuais** — em vez de um card só, mostrar 3 passinhos ilustrados no primeiro uso do Personal e do Nutri
- [ ] **Telas vazias mais simpáticas** — quando não tem aluno/dieta/treino ainda, mostrar um desenho + botão grande do próximo passo (hoje é só um texto cinza)

### Aparência geral
- [ ] **Modo claro/escuro no Sistema da academia** — botão pra alternar (hoje o Sistema é só claro; Personal é só escuro)
- [ ] **Espaçamentos padronizados** — revisar cards e listas pra tudo respirar igual (hoje tem card apertado e card folgado)
- [ ] **Cantos e sombras consistentes** — mesmo raio de borda e mesma sombra em todos os cards e dialogs
- [ ] **Ícones consistentes** — hoje mistura emoji com SVG; escolher um padrão por contexto

### Celular (a maioria usa no celular!)
- [ ] **Tabelas viram cards no celular** — listas largas (financeiro, alunos) quebram feio em tela pequena; virar cartõezinhos empilhados
- [ ] **Botões maiores no celular** — área de toque mínima de 44px em todos os botões pequenos
- [ ] **Menu inferior no app do aluno** — barra fixa embaixo com os 4 atalhos principais (estilo Instagram), em vez de só o menu hambúrguer

### App do aluno / paciente (o cartão de visita do personal e da nutri)
- [ ] **Animação de conquista** — confete/vibração quando o aluno bate meta da semana ou fecha o desafio
- [ ] **Gráficos mais bonitos** — evolução de peso/cargas com gradiente e pontos destacados, no lugar das barras simples
- [ ] **Foto de capa personalizável** — o personal/nutri escolhe uma foto de capa pro app do aluno (além da logo e cor)

### Modo TV
- [ ] **Transições suaves** — troca de tela com fade em vez de corte seco
- [ ] **Relógio e clima maiores** — dar mais destaque no topo da TV

### Páginas de venda
- [ ] **Depoimentos com foto** — seção de prova social nas landings (personal-vendas.html e torqueon.html)
- [ ] **Vídeo de demonstração** — espaço pra um vídeo curto mostrando o sistema funcionando
- [ ] **Preços em cards comparativos** — tabela "o que tem em cada plano" com destaque no mais vendido

### Acessibilidade (todo mundo consegue usar)
- [ ] **Contraste revisado** — checar textos cinza sobre fundo escuro que ficam difíceis de ler
- [ ] **Fonte ajustável no app do aluno** — botão A+/A− pra quem enxerga menos

---

## 4. 💡 Suas ideias (escreva aqui embaixo do seu jeito)

> Exemplo: "quero que a tela de check-in fique roxa com a logo gigante"

- 

---

*Como pedir: marque as caixinhas com `[x]`, salve, e me diga "faz os itens marcados do DESIGN.md". Eu faço em lotes, testo tudo e publico como sempre.*
