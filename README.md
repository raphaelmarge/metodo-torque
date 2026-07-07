# Método Torque — Portal do Aluno (site + app)

Portal web do curso **Método Torque · Gestão de Academias de Alta Performance**, gerado a partir do material original do curso. É ao mesmo tempo:

- **Site** — landing page + área do aluno com todo o material navegável;
- **App** — PWA instalável no celular e no computador, que funciona **offline** depois da primeira visita.

## O que tem dentro

| Grupo | Conteúdo |
|---|---|
| **Programas do dia a dia** | 🎯 Metas de Vendas (meta por vendedora, ranking, projeção) · 🔧 Central de Manutenção (aparelhos/predial/limpeza com fotos e agendamentos) · ✅ Checklist do Dia (responsável + hora limite + cobrança via WhatsApp) · 📺 Modo TV (painel para o telão) |
| Começo | Apresentação do método (deck com 20+ slides) e índice das apostilas |
| Apostilas | Módulos 1–9 (incluindo CT Low Cost) + Módulo Bônus (Expansão) |
| Planilhas interativas | 7 Números, Diagnóstico 360, DRE, Calculadora de Precificação, Funil Comercial — calculam em tempo real e salvam os dados no navegador |
| Modelos e rotinas | Script de Vendas, Réguas de Cobrança/Retenção WhatsApp, Onboarding 90 Dias, Checklists, Manutenção, Inventário, Pauta Semanal, Briefing de Delegação, Calendário de Campanhas |

### Programas do dia a dia

- **🏋 Gestão de Alunos** — o coração estilo EVO: cadastro completo de alunos, planos configuráveis (recorrente, à vista, agregador Gympass/TotalPass), matrícula que gera as mensalidades do contrato automaticamente, baixa de pagamento, congelamento/cancelamento, check-in da recepção com **bloqueio automático a partir de 15 dias de atraso** (regra D+15 do curso) e integração de mão dupla com a régua de cobrança: mensalidade vencida entra sozinha na Inadimplência, pagamento em qualquer um dos dois reflete no outro.
- **🎯 Metas de Vendas** — cadastre vendedoras, defina metas mensais (matrículas e receita), lance cada venda em segundos e acompanhe ranking + projeção do fim do mês.
- **🔧 Central de Manutenção** — chamados de aparelhos, predial e limpeza com foto (tirada na hora pelo celular), prioridade, agendamento de conserto/retorno e alerta de atraso.
- **✅ Checklist do Dia** — abertura e fechamento com os itens do Módulo 6 já carregados; cada tarefa tem responsável e hora limite, e item atrasado gera **mensagem de cobrança pronta no WhatsApp**.
- **🧲 Funil Comercial** — leads em kanban (novo → conversa → aula agendada → visitou), cada um com data de follow-up; contato atrasado fica vermelho com mensagem pronta no WhatsApp. Taxas de conversão do mês em cada etapa.
- **🗓 Aulas Experimentais** — agenda das aulas grátis com confirmação por WhatsApp, presença, remarcação de falta e conversão em matrícula. Integrado ao funil: agendar pelo funil cria a aula, e a matrícula volta sincronizada.
- **💰 Controle de Inadimplência** — a Régua de Cobrança do Módulo 2 integrada: cada devedor mostra o passo atual (D+1, D+5, D+10 ligação, D+13/15 bloqueio, D+30 acordo) com a mensagem oficial do curso pronta no WhatsApp, e o histórico de envios registrado.
- **📈 Diário do Curso** — cada módulo é preenchível e mensurável (status, autoavaliação 0–10 e os KPIs do módulo: churn, CAC, margem, conversão…). O Relatório Final cruza tudo com os dados vivos dos programas e gera: pontos positivos, pontos de atenção e conselhos com as referências do curso — mais um prompt completo para colar numa IA (Claude/ChatGPT) e receber o relatório aprofundado com plano de 90 dias e prioridades de investimento.
- **📺 Modo TV** — abra `apps/tv.html` no navegador da TV/telão: painéis de metas, manutenção e checklist giram em tela cheia e se atualizam sozinhos.

### TORQUESYS — o sistema completo estilo EVO (`apps/sistema.html`)

Réplica funcional do EVO construída a partir de 127 capturas reais de tela, com **50 páginas** organizadas no mesmo menu (CRM 2.0, CRM, Financeiro, Gerencial, Treinos, Dados de saúde, Administrativo):

| Área | Páginas |
|---|---|
| **Operação diária** | Tarefas do Dia (ligações a fazer) · Controle de Entradas (catraca virtual com bloqueios) · Log de Acessos · Caixa do Dia · Agenda · Grade de horários |
| **Clientes** | Gestão de Alunos (planos/contratos/mensalidades/check-in) · **Perfil do Aluno estilo EVO** (herói com foto, alertas de bloqueio, 7 seções com sub-abas, risco de abandono) · Importar CSV |
| **CRM / Comercial** | Funil de Vendas · Aulas Experimentais · Metas de Vendas · Renovação e Rematrícula · Radar de Retenção (faltantes/aniversários/vencimentos/avaliações) · Timeline · Segmentação · Indicações · NPS · Convênios · Vouchers · Clube de Recompensas (TorqueCoins) · Página de Vendas · Cartão do Aluno |
| **Financeiro** | A Receber · Contas a Pagar · Inadimplência (régua D+1…D+30) · Reajuste de Contratos · **DRE Automático** · **Fluxo de Caixa 8 Semanas** · Planos e Preços |
| **Gerencial** | Resumo Gerencial · Crescimento e Cancelamentos · Presenças e Ocupação · Comissões · Carteiras por Consultor(a) · Diário & Relatório IA · Modo TV |
| **Treinos & Saúde** | Prescrição de Treinos (com envio da ficha pelo WhatsApp) · Central de Treinos com IA · Treino Padrão · Exercícios · WOD · Turmas · Avaliação Física · PAR-Q Digital |
| **Administrativo** | Colaboradores e Cargos · Personal Trainers · Fornecedores · Produtos e Vendas · Recibos e Contratos · Locação de Armários |

Tudo integrado: contrato gera mensalidade, mensalidade vencida entra na régua e no saldo devedor do perfil, check-in alimenta presenças/radar/recompensas, cancelamento aparece no Crescimento e na Timeline.

Os dados dos programas ficam salvos **no navegador do dispositivo** (localStorage + IndexedDB para fotos), com **⬇ Backup / ⬆ Restaurar** e **sincronização automática entre aparelhos via Supabase** (login por academia, com isolamento multiacademia). O site **atualiza sozinho** quando sai versão nova (service worker com recarga automática).

Recursos do portal:

- **Progresso do curso**: marque cada apostila como concluída; a barra de progresso e os cartões refletem o avanço (salvo no navegador).
- **Continuar de onde parou** na home.
- **Busca** de materiais na barra lateral.
- **Imprimir / PDF** de qualquer material direto do visualizador.
- **100% estático e offline**: React, fontes (Archivo) e todo o conteúdo são servidos localmente — nenhuma CDN externa.

## Como rodar localmente

Não há build. Basta servir a pasta:

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

## Como publicar (GitHub Pages)

1. Faça merge deste branch na `main`.
2. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
3. O workflow `.github/workflows/pages.yml` publica o site automaticamente a cada push na `main`.

Qualquer hospedagem estática (Netlify, Vercel, Cloudflare Pages) também funciona — é só apontar para a raiz do repositório.

## Como instalar como app

Com o site aberto no navegador (Chrome/Edge/Safari):

- **Celular**: menu do navegador → “Adicionar à tela inicial” / “Instalar app”.
- **Desktop**: ícone de instalação na barra de endereço.

Depois de instalado, o app abre em janela própria e funciona sem internet (o service worker pré-carrega todos os materiais).

## Estrutura

```
index.html              ← app shell (landing + navegação + visualizador)
manifest.webmanifest    ← manifesto PWA
sw.js                   ← service worker (precache offline)
assets/
  app.css / app.js      ← estilo e lógica do shell
  content.js            ← catálogo dos materiais (fonte única p/ navegação e sw)
  fonts/                ← fonte Archivo local (@fontsource)
  vendor/               ← react, react-dom, babel (mesmas versões/hashes do original)
  icons/                ← ícones do app (svg + png)
docs/
  *.html                ← os 55 materiais originais (renomeados p/ URLs limpas)
  support.js, doc-page.js, image-slot.js, deck-stage.js  ← runtime dos documentos
```

Os documentos em `docs/` preservam o formato original do material (runtime `dc`), com dois patches: fontes e bibliotecas apontam para cópias locais (funciona offline e sem CDN) e os links entre documentos usam os novos nomes de arquivo.

## Controle de acesso (código + cadastro)

O portal pede **código de acesso + cadastro** (nome, e-mail, WhatsApp) na primeira visita de cada aparelho. Configuração em `assets/access-config.js`:

- `exigirCadastro: false` desliga a tela de entrada;
- `codigos`: lista de códigos válidos em SHA-256 — gere novos com `gerador-codigo.html` (abra no navegador, digite o código, cole a linha gerada);
- `notificarEmail`: preencha com seu e-mail para receber cada cadastro por e-mail (via formsubmit.co — confirme o e-mail de ativação no primeiro envio).

Código inicial: `TORQUE2026`. É uma proteção **leve** (o conteúdo continua tecnicamente público para quem souber as URLs).

## Login com senha + sincronização online (Supabase)

O portal tem um segundo modo, ativado por `assets/cloud-config.js`: **login com e-mail e senha** e **dados sincronizados na nuvem** entre todos os aparelhos da conta (recepção, celular, TV).

Como ativar (~10 minutos, gratuito):

1. Crie um projeto em [supabase.com](https://supabase.com);
2. No painel, abra **SQL Editor**, cole o conteúdo de [`supabase-setup.sql`](supabase-setup.sql) e clique em **Run**;
3. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public*;
4. Preencha os dois campos em `assets/cloud-config.js` e publique;
5. (Recomendado) Em **Authentication → Sign In / Up → Email**, desligue *Confirm email* para o aluno entrar direto após criar a conta.

Comportamento no modo nuvem (multi-academia):

- **Criar academia** (dono): exige o código de acesso do curso, cria a conta da academia e gera um **código da equipe** de 6 caracteres;
- **Sou da equipe** (funcionário): cria o próprio login com o código da equipe que o dono passou — cada pessoa tem seu e-mail e senha;
- **Isolamento total**: os dados sincronizam por academia, com regras no banco (RLS) — uma academia nunca enxerga a outra;
- **Painel 👥 Equipe** (barra lateral, só o dono vê): mostra o código da equipe, lista os funcionários e permite remover acessos;
- Programas e fichas preenchíveis sincronizam sozinhos entre todos da equipe (última alteração vence, por item); fotos da manutenção ficam locais nesta versão;
- Sem internet, tudo continua funcionando e sincroniza quando a conexão volta;
- Com `cloud-config.js` vazio, o portal opera no modo local (código de acesso), como antes.
