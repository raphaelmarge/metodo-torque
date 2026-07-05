# Método Torque — Gestão de Academias de Alta Performance

Site e app (PWA) do curso **Método Torque**: 8 módulos sequenciais + bônus de expansão, com kit completo de ferramentas de implantação para gestores de academia.

## O que tem aqui

- **`index.html`** — página inicial do curso
- **`Apostilas - Índice.dc.html`** — índice central com todos os materiais
- **`Método Torque - Deck.dc.html`** — apresentação do curso
- **9 apostilas** — Módulos 1 a 8 + Bônus
- **16 ferramentas** — Diagnóstico 360, Planilha dos 7 Números, DRE, Calculadora de Precificação, Funil Comercial, Script de Vendas, Réguas de Cobrança e Retenção, Onboarding 90 Dias, Briefing de Delegação, Pauta da Reunião Semanal, Checklists de Abertura/Fechamento, Controle de Manutenção e Limpeza, Inventário de Equipamentos e Calendário Anual de Campanhas

## Site (GitHub Pages)

O deploy é automático: todo push na branch `main` publica o site via GitHub Actions (`.github/workflows/pages.yml`).

**Ativação (uma única vez):** no GitHub, vá em **Settings → Pages** e em *Build and deployment* selecione **Source: GitHub Actions**. Depois do primeiro deploy o site fica em `https://<seu-usuario>.github.io/metodo-torque/`.

## App (PWA)

O site é um Progressive Web App: pode ser instalado no celular e funciona **offline** (todo o conteúdo é pré-cacheado pelo service worker).

Como instalar:

- **Android (Chrome):** abrir o site → menu ⋮ → **Adicionar à tela inicial** (ou o banner "Instalar app")
- **iPhone (Safari):** abrir o site → botão Compartilhar → **Adicionar à Tela de Início**
- **Desktop (Chrome/Edge):** ícone de instalação na barra de endereço

Arquivos do app:

- `manifest.webmanifest` — nome, ícones e cores do app
- `sw.js` — service worker (cache offline; incremente `VERSION` ao publicar conteúdo novo)
- `app.js` — registro do service worker (injetado em todas as páginas)
- `icons/` — ícones do app

## Rodando localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```
