# TORQUESYS — Briefing de Design (para redesenho da interface)

> Cole este documento inteiro na ferramenta de design. Ele descreve o produto, a
> identidade atual, os tokens, os componentes e TODAS as telas — e no fim as
> regras técnicas que o redesign precisa respeitar para nada quebrar.

---

## 1. O produto

**TORQUESYS** é o sistema de gestão da academia **TORQUE FIT** (Raphael Marge).
É um PWA 100% estático (HTML/CSS/JS puros, sem frameworks), offline-first
(localStorage + fotos em IndexedDB), com sincronização em nuvem (Supabase) e
publicação automática no GitHub Pages. Concorre com o EVO/W12, Tecnofit,
Glofox e Mindbody — e o objetivo visual é parecer **mais premium** que todos.

**Tom da marca:** direto, forte, "de treino" — mas o sistema é operado o dia
inteiro por recepcionistas, então precisa ser limpo, legível e rápido de usar.
Textos em pt-BR, informais na medida ("Bora?", emojis pontuais 💜💪).

---

## 2. Identidade visual atual

### Fontes
- **Archivo** (variável, self-hosted em `assets/fonts/`) — títulos em 800,
  interface em 400–700. Fallback: `system-ui, sans-serif`.
- O app do aluno usa `system-ui` puro (peso leve para celular).

### Paleta — tema claro (sistema interno, "programas")
| Token CSS | Valor | Uso |
|---|---|---|
| `--roxo` | `#7c3aed` | cor primária (botões, destaques, links ativos) |
| `--roxo-2` | `#6d28d9` | hover do primário |
| `--lilas` | `#a78bfa` | kickers, detalhes sobre fundo escuro |
| `--escuro` | `#121016` | topo das páginas, superfícies escuras |
| `--texto` | `#131118` | texto principal |
| `--cinza` | `#6e6a78` / `--cinza-2` `#8a8695` | texto secundário |
| `--fundo` | `#f5f4f7` | fundo da página |
| `--card` | `#ffffff` | cartões |
| `--linha` | `#e2e0e8` | bordas e divisores |
| `--ok` | `#16a34a` | sucesso / positivo |
| `--alerta` | `#d97706` | atenção (horista, avisos) |
| `--erro` | `#dc2626` | erro / negativo / lotado |

### Paleta — superfícies escuras (totem, TV, matrícula pública, app do aluno)
- Fundo `#121016` (totem/TV) ou `#0d0c10` (app do aluno)
- Cartões `#1c1826` / `#1d1a24`, bordas `#2c2739` / `#322e3d`
- Texto `#fff` + secundário `#a9a4b5` / `#b9b3c6`
- Primário continua o roxo `#7c3aed` com lilás `#a78bfa` de apoio
- App do aluno tem **cor personalizável** (`--cor`, padrão roxo) e um
  **tema claro opcional** (`body.claro`).

### Assinaturas visuais que valem manter/evoluir
- Kicker com traço roxo antes ("`— PROGRAMA · GERENCIAL`") no topo escuro.
- Títulos de card em caps pequenas espaçadas (`letter-spacing .14em`).
- Botões retos (sem raio) no sistema interno; raio generoso (10–16px) nas
  superfícies escuras voltadas ao aluno.
- Etiquetas/tags coloridas de status (ATIVO verde, HORISTA laranja, etc.).

---

## 3. Componentes compartilhados (apps/apps.css)

- **`.topo`** — faixa escura no topo de cada programa: kicker + h1 + descrição
  + logo da academia (`#logoCliente`).
- **`.corpo`** — container central `max-width: 1280px`.
- **`.card`** — cartão branco com borda; `h2` interno em caps pequenas.
- **`.btn`** (primário roxo), **`.btn.sec`** (contorno), **`.btn.perigo`**,
  **`.btn.whats`** (verde WhatsApp), **`.btn.mini`**.
- **`.tag`** — pílula de status: `.ok` verde, `.roxo`, `.neutro`, `.erro`.
- **`.tabela`** — tabela densa com cabeçalho em caps; rola lateral no celular.
- **`.grid-2` / `.grid-3`**, **`.linha-flex`**, **`.campo`+`label`** — layout
  de formulários.
- **`dialog`** — modais nativos com um `.card` dentro.
- **`.abas`** — abas retangulares, ativa em roxo (padrão repetido em várias
  telas).
- **`.stats`** — fileira de cartões de KPI (número grande 26px + legenda).
- **Kanban** (funil): colunas com cartões arrastáveis.
- **Canvas de chatbot** (chat.html): balões arrastáveis + linhas bezier
  animadas (SVG) + zoom — o visual "fluido e animado" deve ser preservado.
- **Impressão**: várias telas têm `@media print` (fechamento, recibos,
  contratos) — o redesign não pode quebrar a versão impressa.

---

## 4. Inventário de telas

### 4.1 Portal do método (index + portal.html)
SPA com os 10 módulos do curso "Método Torque" + modelos preenchíveis +
acesso aos programas. Visual escuro com roxo.

### 4.2 Sistema da Academia (apps/sistema.html) — o "EVO killer"
Shell com **menu lateral retrátil** (mobile-ready), busca no menu, header
escuro com busca global de alunos, atalhos (+cadastro, venda, check-in) e
Home com "Hoje na academia". O menu é filtrado por perfil de permissão
("🔐 Menu filtrado pelo perfil X"). Grupos do menu:

1. **(topo, sem grupo)** Home · Dashboard · Clientes · Perfil do Aluno ·
   Grade · Agenda · Tarefas do Dia · Totem · Controle de Entradas ·
   Biometria e Catraca · Níveis e Graduação · Log de Acessos
2. **🧲 CRM 2.0** — Automação de Mensagens · Funil de Vendas · Aulas
   Experimentais · Metas de Vendas · Renovação e Rematrícula · Convênios ·
   Vouchers · Clube de Recompensas · Copiloto IA (churn) · Chat & IA (inbox
   WhatsApp/Instagram + chatbot canvas)
3. **💬 CRM** — NPS · Aniversariantes · Indicações · Segmentação
4. **💲 Financeiro** — Caixa do Dia · Contas a Pagar · A Receber ·
   Movimentação · DRE · Fluxo de Caixa · Comissões · Inadimplência ·
   Centros de custo/receita · Vencimentos
5. **📊 Gerencial** — Resumo Gerencial (com Metas do mês & projeção) ·
   Crescimento (com cohort de retenção) · **Ocupação e Horários (heatmap)** ·
   Cancelamentos · Carteiras · Turmas · Agregadores/Wellhub · Aulas
   Experimentais · Log Geral
6. **⏱ Treinos** — Prescrição · Treinos Padrão · Exercícios (com vídeo) ·
   Execução dos alunos (via app) · **Videoteca** · WOD do dia · Central de
   Treinos com IA · Aulas de Personal (com pacotes)
7. **🫀 Dados de saúde** — Avaliação Física (medidas, fotos antes/depois,
   comparador) · PAR-Q Digital
8. **🗄 Administrativo** — **Colaboradores** (etiquetas HORISTA/SALÁRIO FIXO,
   folha separada, escala, ponto) · Ficha do colaborador · Cargos ·
   **Horários de Funcionamento** (dias + feriados especiais) · Fornecedores ·
   Recibos e Contratos (com assinatura digital) · Locação de Armários ·
   Manutenção · Checklist do dia · Auditoria e Saúde (trilha + erros JS)
9. **⚙️ Configurações** — Permissões (perfis + vínculos) · Config Financeiro ·
   Config Avançado (LGPD, backup) · Campos obrigatórios · Áreas · Atividades ·
   Página de Vendas (matrícula online) · Importar CSV

### 4.3 Superfícies escuras (público/aluno)
- **Totem de autoatendimento** (`apps/totem.html`) — tela cheia: relógio
  gigante, "🕐 Hoje: 06:00–23:00", busca por nome + leitor de QR, resultado
  ✅/🚫 enorme, WOD do dia e avisos.
- **Modo TV** (`apps/tv.html`) — painéis rotativos para o telão: metas,
  manutenção, checklist e 🏅 Destaques da semana (recordes dos alunos).
- **Matrícula online pública** (`matricula.html`) — landing dark de conversão:
  escolha de plano, formulário mínimo, sucesso com Pix + WhatsApp; suporta
  `?ind=CÓDIGO` (indicação de amigo).
- **App do Aluno** (gerado por `apps/app-aluno.html`, hospedado em `app/`) —
  PWA mobile (máx 480px): Início (horário de hoje, favoritos, desafio do mês,
  evolução/medalhas/ranking, programa de indicação, lojinha, WOD, horários),
  Timeline social (curtidas/comentários), Wod, Grade (agendar/lista de
  espera/minha agenda), Perfil (carteirinha com QR, planos, sessões,
  🏅 recordes/PRs com celebração, 🤝 indique um amigo, 🎥 aulas gravadas,
  treino interativo com séries/cargas/cronômetro, avaliação com fotos,
  push). Cor de destaque personalizável pela academia.

---

## 5. Regras técnicas do redesign (OBRIGATÓRIAS)

1. **Não mudar HTML/JS, só estilo.** Todo o comportamento está amarrado a
   IDs e classes existentes (`#lista`, `.card`, `.btn`, `data-*`). O
   redesign ideal entrega: novo `apps/apps.css` + ajustes nos blocos
   `<style>` de cada página, mantendo TODOS os seletores atuais.
2. **Sem dependências externas.** Nada de CDN, Google Fonts, Tailwind ou
   ícones remotos — o sistema roda offline (PWA). Fontes: usar os arquivos
   locais de `assets/fonts/` (Archivo). Ícones: emojis ou SVG inline.
3. **Responsivo real**: recepção usa desktop (1280–1440px), o dono usa
   celular. Breakpoints atuais: 760px (sistema) e 700px (grids). Tabelas
   largas rolam horizontal dentro do card, nunca a página.
4. **Tema claro no sistema interno, escuro nas superfícies do aluno** —
   manter essa separação (ou entregar dark mode opcional do sistema como
   extra, via `prefers-color-scheme`, sem quebrar o claro).
5. **Acessibilidade de toque**: botões ≥ 40px de altura no mobile; inputs
   com `font-size: 16px` no celular (evita zoom do iPhone).
6. **Impressão**: manter/estilizar `@media print` (recibos, contratos,
   fechamento do mês, grade impressa).
7. **Estados**: todo componente tem estados vazios ("Nenhum X ainda — …"),
   de alerta e de sucesso — desenhar os três.
8. **O canvas do chatbot** (chat.html) e as animações (linhas tracejadas
   animadas, barra de desafio, celebração de PR 🎉) devem continuar fluidos.
9. **Performance**: CSS puro, sem imagens pesadas; o app do aluno é um
   único HTML gerado — estilos dele ficam inline no gerador.

---

## 6. O que pedir à ferramenta de design

"Redesenhe a identidade visual deste sistema mantendo os tokens como base
(roxo #7c3aed como primária, Archivo, claro no admin / escuro no aluno),
elevando para um acabamento premium: hierarquia tipográfica mais clara,
espaçamento mais generoso, cantos e sombras consistentes, tags e KPIs mais
sofisticados, microinterações sutis — respeitando as 9 regras técnicas da
seção 5 e todas as telas da seção 4."
