# 📱 Lançar na Google Play e na App Store — o passo a passo

Três apps, cada um separado na loja:

| App | Pacote (appId) | Abre em |
|---|---|---|
| 🏢 TORQUE ON (academia) | `com.torqueon.academia` | `index.html` |
| 💪 TORQUE PERSONAL | `com.torqueon.personal` | `personal.html` |
| 🥗 TORQUE NUTRI | `com.torqueon.nutri` | `nutricao.html` |

**Custos:** Google Play US$ 25 (uma vez, vale pra sempre). Apple US$ 99 **por ano** + um Mac com Xcode.

---

## ✅ O que JÁ está pronto no repositório

| Exigência das lojas | Onde está |
|---|---|
| Política de privacidade | `privacidade.html` → www.torqueon.com.br/privacidade.html |
| **Exclusão de conta dentro do app** | Configurações → Excluir minha conta (Personal e Nutri) |
| **Exclusão de conta por link** (a Play recusa sem isso) | `excluir-conta.html` → www.torqueon.com.br/excluir-conta.html |
| Ícone 512 (Play) e 1024 sem transparência (Apple) | `assets/icons/loja/icone-<app>-512.png` e `-1024.png` |
| Gráfico de destaque 1024×500 (Play) | `assets/icons/loja/destaque-<app>.png` |
| Capturas de tela nos tamanhos certos | `node marketing/gera-lojas.js <pasta>` gera tudo |
| Textos da ficha, palavras-chave e categorias | `LOJAS-TEXTOS.md` |
| Respostas da Segurança dos dados / App Privacy | `LOJAS-TEXTOS.md` |
| Permissões de câmera e notificação (Android) | `node nativo/ajusta-nativo.js android` (o robô já roda) |
| Textos de permissão + PrivacyInfo (iOS) | `node nativo/ajusta-nativo.js ios` |
| App funcionando offline, com login e conta própria | o sistema inteiro |

## ⏳ O que só VOCÊ pode fazer

1. Criar a conta na **Google Play Console** (US$ 25) e na **Apple Developer** (US$ 99/ano).
2. Guardar a **chave de assinatura** do Android (instruções abaixo).
3. Ter um **Mac com Xcode** pro envio do iPhone — não existe contorno, é regra da Apple.
4. Rodar o SQL atualizado (www.torqueon.com.br/sql.html) pra criar a função `excluir_minha_conta`. **Sem isso o botão de excluir falha e a Play recusa.**

---

## PARTE 1 — Google Play (comece por aqui: mais barato e mais rápido)

### Passo 1 · Conta na Play Console (~15 min)
1. **play.google.com/console** → entre com sua conta Google.
2. Escolha **organização** se tiver CNPJ (melhor pra vender) ou **você mesmo**.
3. Pague os US$ 25. O Google confere sua identidade — leva de horas a poucos dias.

### Passo 2 · Criar a chave de assinatura (uma vez só, pra sempre)
⚠️ **Perdeu a chave, perdeu o app**: sem ela nunca mais dá pra atualizar aquele app na Play. Guarde em dois lugares.

No seu computador (ou peça pra mim que eu te passo os comandos prontos):

```
keytool -genkey -v -keystore torque.keystore -alias torque \
  -keyalg RSA -keysize 2048 -validity 10000
```

Ele pergunta uma senha e alguns dados. Depois:

```
base64 -w 0 torque.keystore > torque.txt
```

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, e crie os quatro:

| Secret | O que colar |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | o conteúdo do `torque.txt` |
| `ANDROID_KEYSTORE_SENHA` | a senha do keystore |
| `ANDROID_KEY_ALIAS` | `torque` |
| `ANDROID_KEY_SENHA` | a senha da chave (normalmente a mesma) |

### Passo 3 · Gerar o pacote (o GitHub compila pra você)
1. **github.com/raphaelmarge/metodo-torque** → aba **Actions** → **App nativo Android** → **Run workflow**.
2. Escolha o **produto** (`personal`, `nutri` ou `academia`) e o **pacote**:
   - **apk** → instala direto no seu celular pra testar (não precisa de chave nenhuma);
   - **aab** → o arquivo assinado que sobe na Play (precisa dos Secrets do Passo 2).
3. Quando ficar verde ✅, baixe o artefato na própria página da execução.

### Passo 4 · Subir na Play Console (~40 min por app)
1. **Criar app** → nome do `LOJAS-TEXTOS.md`, idioma Português (Brasil), tipo **App**, **Gratuito**.
2. **Testes → Teste interno** → **Criar versão** → arraste o `.aab`.
3. **Ficha da loja**: cole os textos do `LOJAS-TEXTOS.md`, suba o ícone 512, o gráfico de destaque e **pelo menos 2** capturas (recomendo 4 a 8 — o script gera).
4. **Conteúdo do app**: política de privacidade, **URL de exclusão de conta**, questionário de Segurança dos dados (respostas prontas no `LOJAS-TEXTOS.md`), classificação **Livre**, sem anúncios, público adulto.
5. Testou e está ok? Promova para **Produção**. A revisão leva de 1 a 7 dias.

### Passo 5 · Tirar a barra do navegador (só se você usar o PWABuilder)
O app gerado aqui é **nativo (Capacitor)** e já abre em tela cheia — este passo **não é necessário**. Ele só valia pro pacote TWA do PWABuilder, que era o caminho antigo.

---

## PARTE 2 — Apple App Store

**Precisa de:** conta Apple Developer (US$ 99/ano) + Mac com Xcode.

```
cd nativo
npm install
node prepara.js personal      # ou academia / nutri
npx cap add ios
npx cap sync ios
node ajusta-nativo.js ios     # textos de permissão + PrivacyInfo (obrigatório)
npx cap open ios              # abre no Xcode
```

No Xcode: **Signing & Capabilities** → escolha o seu time → **Product → Archive** → **Distribute App** → App Store Connect.

Em **appstoreconnect.apple.com**: crie o app, cole os textos do `LOJAS-TEXTOS.md`, suba as capturas de **1290×2796** (as que o script gera), preencha o **App Privacy** e envie. A revisão leva de 1 a 3 dias.

### ⚠️ Dois riscos reais na revisão da Apple — e como responder

**1. Diretriz 4.2 (“é só um site empacotado”).** Nossos apps funcionam offline de verdade, têm login, câmera, notificações e banco de dados local. Se recusarem, responda na revisão:

> O app funciona integralmente offline (banco de exercícios e alimentos embarcados, dados locais no dispositivo), usa a câmera para estimar medidas corporais com processamento no próprio aparelho e gera conteúdo próprio (fichas de treino, planos alimentares e laudos). Não é um invólucro de site.

**2. Diretriz 3.1.1 (compra dentro do app).** Esta é a que mais derruba SaaS. A regra: se o app vende assinatura de conteúdo digital pra pessoa física, a Apple exige a compra dentro do app (e fica com 15–30%).

O nosso caso se encaixa na **3.1.3(e), serviços empresariais**: quem paga é a academia/o profissional (pessoa jurídica ou autônomo), não o usuário final do app. Por isso:

- **Não coloque botão de assinar, preço nem link de pagamento dentro do app.** As capturas geradas pelo script já escondem a faixa do teste grátis justamente por isso.
- Na revisão, se perguntarem, responda que a assinatura é contratada fora do app, por venda direta a empresas, e que o app não oferece nenhuma compra digital ao usuário.

Se a Apple insistir, o plano B é lançar no iOS **só o app do aluno/paciente** (que é gratuito e não vende nada) e manter o painel do profissional na web — que no iPhone já funciona hoje pelo “Adicionar à Tela de Início”, sem loja e sem custo.

---

## Ordem que eu recomendo

1. Rode o SQL atualizado (a função de excluir conta).
2. **TORQUE PERSONAL na Play**, em teste interno — é o produto com a ficha mais forte.
3. TORQUE NUTRI na Play.
4. TORQUE ON academia na Play.
5. Apple por último: mais caro, mais lento e com os dois riscos acima.

Travou em alguma tela? Manda print que eu te guio clique a clique.
