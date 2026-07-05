# Método Torque — Portal do Aluno (site + app)

Portal web do curso **Método Torque · Gestão de Academias de Alta Performance**, gerado a partir do material original do curso. É ao mesmo tempo:

- **Site** — landing page + área do aluno com todo o material navegável;
- **App** — PWA instalável no celular e no computador, que funciona **offline** depois da primeira visita.

## O que tem dentro

| Grupo | Conteúdo |
|---|---|
| Começo | Apresentação do método (deck com 20+ slides) e índice das apostilas |
| Apostilas | Módulos 1–8 + Módulo Bônus (Expansão) |
| Planilhas interativas | 7 Números, Diagnóstico 360, DRE, Calculadora de Precificação, Funil Comercial — calculam em tempo real e salvam os dados no navegador |
| Modelos e rotinas | Script de Vendas, Réguas de Cobrança/Retenção WhatsApp, Onboarding 90 Dias, Checklists, Manutenção, Inventário, Pauta Semanal, Briefing de Delegação, Calendário de Campanhas |

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

Depois de instalado, o app abre em janela própria e funciona sem internet (o service worker pré-carrega todos os 26 materiais).

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
  *.html                ← os 26 materiais originais (renomeados p/ URLs limpas)
  support.js, doc-page.js, image-slot.js, deck-stage.js  ← runtime dos documentos
```

Os documentos em `docs/` preservam o formato original do material (runtime `dc`), com dois patches: fontes e bibliotecas apontam para cópias locais (funciona offline e sem CDN) e os links entre documentos usam os novos nomes de arquivo.
