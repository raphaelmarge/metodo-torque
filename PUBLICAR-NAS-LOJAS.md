# 📱 Como colocar os apps na Google Play e na Apple App Store

Os três produtos já são PWAs prontos pra empacotar. Cada um vira **um app separado** na loja:

| App | Endereço (URL) | Pacote Android sugerido |
|---|---|---|
| 🏢 TORQUE ON (academia) | `https://raphaelmarge.github.io/metodo-torque/` | `com.torqueon.academia` |
| 💪 TORQUE PERSONAL | `https://raphaelmarge.github.io/metodo-torque/personal.html` | `com.torqueon.personal` |
| 🥗 TORQUE NUTRI | `https://raphaelmarge.github.io/metodo-torque/nutricao.html` | `com.torqueon.nutri` |

**O que já está pronto no site** (você não precisa mexer): manifests com nome/descrição/categorias, ícones próprios de cada app (roxo com haltere, verde com folha), ícones maskable, funcionamento offline (service worker) e a página de política de privacidade: `https://raphaelmarge.github.io/metodo-torque/privacidade.html` — as lojas pedem esse link.

**Custos**: Google Play = US$ 25 (paga UMA vez, vale pra sempre). Apple = US$ 99 POR ANO + precisa de um Mac com Xcode.

---

## PARTE 1 — Google Play (faça primeiro: mais fácil e barato)

### Passo 1 · Criar a conta no Google Play Console (~15 min)
1. Abra **play.google.com/console** e entre com sua conta Google.
2. Escolha **"Você mesmo"** (conta pessoal) ou **"Uma organização"** (se tiver CNPJ — recomendado pra vender).
3. Pague os **US$ 25** com cartão e preencha seus dados. O Google verifica a identidade (pode pedir foto de documento; leva de horas a poucos dias).

### Passo 2 · Gerar o pacote Android no PWABuilder (~10 min, grátis)
1. Abra **pwabuilder.com** no computador.
2. Cole a URL do app (comece pelo da academia: `https://raphaelmarge.github.io/metodo-torque/`) e clique **Start**.
3. Ele dá uma nota do seu PWA → clique **Package for stores** → **Android** → **Generate package**.
4. Na tela de opções preencha:
   - **Package ID**: `com.torqueon.academia`
   - **App name**: TORQUE ON
   - **Signing key**: deixe **"Create new"** (o PWABuilder cria a chave de assinatura pra você). ⚠️ **GUARDE o arquivo de chave e as senhas que vierem no download** — sem eles você nunca mais consegue atualizar o app.
5. Baixe o **.zip**. Dentro vem: o **`.aab`** (o app que sobe na loja), a chave de assinatura e um **`assetlinks.json`**.

### Passo 3 · Subir na Play Console (~30 min)
1. Na Play Console: **Criar app** → nome "TORQUE ON — Gestão de Academias", idioma Português (Brasil), tipo **App**, **Gratuito**.
2. Menu **Testes → Teste interno** (recomendo começar aqui) → **Criar versão** → arraste o arquivo **`.aab`** → salvar e avançar.
3. Preencha a **Ficha da loja**: descrição curta e longa (pode copiar do manifest/site), **ícone 512×512** (use `assets/icons/icon-512.png` do repositório — baixe do GitHub), e **prints de tela**: abra o app no seu celular e tire 4–8 capturas (obrigatório: pelo menos 2).
4. Em **Política do app**: cole o link da privacidade `https://raphaelmarge.github.io/metodo-torque/privacidade.html`, responda os questionários (classificação: Livre; sem anúncios; coleta de dados: nome/e-mail para login, criptografados).
5. Quando o teste interno estiver ok, promova para **Produção** → o Google revisa (1–7 dias) → app no ar. 🎉

### Passo 4 · Tirar a barra do navegador (assetlinks) — IMPORTANTE
Sem este passo o app abre com a barra de endereço em cima (feio). Com ele, abre em tela cheia como app de verdade.
1. Na Play Console: **Configurações → Integridade do app → Assinatura de apps** → copie a **impressão digital do certificado SHA-256** (começa com letras/números separados por `:`).
2. No GitHub, crie um repositório novo chamado **exatamente** `raphaelmarge.github.io` (Settings → Pages já ativa sozinho nesse nome).
3. Nesse repositório novo, crie o arquivo **`.well-known/assetlinks.json`** copiando o modelo que está neste repositório em `.well-known/assetlinks.json` e trocando os textos `COLE_AQUI_...` pelas impressões SHA-256 de cada app.
4. Confira abrindo `https://raphaelmarge.github.io/.well-known/assetlinks.json` no navegador — tem que aparecer o JSON.

### Passo 5 · Repetir pros outros dois
Repita os passos 2–4 com:
- `https://raphaelmarge.github.io/metodo-torque/personal.html` → pacote `com.torqueon.personal` → nome "TORQUE PERSONAL"
- `https://raphaelmarge.github.io/metodo-torque/nutricao.html` → pacote `com.torqueon.nutri` → nome "TORQUE NUTRI"

---

## PARTE 2 — Apple App Store

**O que precisa**: conta **Apple Developer** (developer.apple.com, US$ 99/ano, pode usar seu Apple ID `raphael_marge@icloud.com`) + **um Mac com Xcode instalado** (não dá pra fazer só do iPhone/Windows).

1. **developer.apple.com** → Account → Enroll → pague os US$ 99/ano (verificação pode levar 1–2 dias).
2. No **pwabuilder.com**, mesmo caminho: cole a URL → **Package for stores** → **iOS** → baixe o projeto.
3. No Mac: abra o projeto no **Xcode** → em *Signing & Capabilities* escolha seu time (sua conta Developer) → Product → **Archive** → **Distribute App** → App Store Connect.
4. Em **appstoreconnect.apple.com**: crie o app, preencha ficha (nome, descrição, prints do iPhone, link de privacidade `https://raphaelmarge.github.io/metodo-torque/privacidade.html`) e envie pra revisão (1–3 dias).

⚠️ **Sendo honesto com você**: a Apple às vezes recusa apps que considera "só um site empacotado" (diretriz 4.2). Os nossos têm boas chances porque funcionam offline, têm login, notificações e muita função — mas se recusarem, responde a revisão destacando isso, que normalmente passa na segunda. E lembra: **no iPhone o app já funciona hoje sem loja** — o cliente abre o link e usa "Adicionar à Tela de Início" (custo zero). A loja é vitrine e credibilidade, não é obrigação técnica.

---

## Ordem que eu recomendo
1. ✅ Play Console (US$ 25) → TORQUE ON academia no teste interno ainda esta semana.
2. ✅ assetlinks (Passo 4) pra ficar tela cheia.
3. ✅ Personal e Nutri na Play.
4. 🍎 Apple por último (precisa do Mac e custa mais).

Qualquer tela que travar, me manda print que eu te guio clique a clique.
