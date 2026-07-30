# 📲 App NATIVO do TORQUE ON (Android/iOS de verdade)

A pasta `nativo/` empacota o sistema inteiro como **aplicativo nativo** usando Capacitor — a mesma tecnologia de apps como Burger King e muitos bancos. Não é um atalho pro site: os arquivos do sistema vão **dentro** do aplicativo, ele abre mesmo sem internet e sincroniza com a nuvem (Supabase) igual sempre. E quando precisarmos de superpoderes de celular (notificação push total no iPhone, FaceID, widgets), é aqui que eles entram, por plugins — sem reescrever nada.

## Como gerar o APK Android (sem instalar NADA no seu computador)

O GitHub compila pra você, na nuvem:

1. Abra **github.com/raphaelmarge/metodo-torque** → aba **Actions**.
2. No menu da esquerda, clique em **"App nativo Android"**.
3. Botão **"Run workflow"** → **Run workflow** (verde). Espera uns 5–10 minutos.
4. Quando ficar verde ✅, clique na execução → seção **Artifacts** → baixe **torqueon-academia-apk**.
5. Dentro do zip vem o **app-debug.apk**: manda pro seu Android (WhatsApp/cabo), toca nele e instala (o celular vai pedir pra "permitir desta fonte" — permite). Pronto: **app nativo instalado**, com ícone e splash da marca.

Esse APK "debug" serve pra você testar e mostrar. **Pra Play Store** é preciso a versão assinada (.aab) — quando você criar a conta na Play Console, me avisa que eu ligo a assinatura no robô (guardamos a chave nos Secrets do GitHub) e ele passa a gerar o arquivo que sobe direto na loja.

## iPhone (iOS)

Precisa de um Mac com Xcode (regra da Apple, sem contorno):

```
cd nativo
npm install
npm run ios          # monta o www e cria o projeto ios/
npx cap open ios     # abre no Xcode → assinar com sua conta Developer → arquivar → App Store
```

## Os 3 produtos

O primeiro app nativo é o **TORQUE ON academia** (`com.torqueon.academia`), que abre no portal. TORQUE PERSONAL e TORQUE NUTRI seguem o mesmo molde — é trocar o `appId`, o nome e a página inicial no `capacitor.config.json`. Me pede quando quiser que eu monto os outros dois.

## Próximos superpoderes nativos (quando você quiser)

| Recurso | Plugin | O que muda pro cliente |
|---|---|---|
| Push de verdade no iPhone | `@capacitor/push-notifications` | Aviso de vencimento/aula chega mesmo com o app fechado |
| FaceID / digital | `@capacitor-community/biometric` | Entrar no app com o rosto, sem senha |
| Câmera nativa | `@capacitor/camera` | Leitor de código de barras mais rápido no Nutri |
| Widget/atalhos | nativo por plataforma | Check-ins e agenda na tela inicial |

## Estrutura da pasta

- `package.json` — dependências do Capacitor
- `capacitor.config.json` — identidade do app (appId, nome, cor)
- `copia-www.js` — copia o site pra dentro do app (roda sozinho no robô)
- `assets/icon.png`, `assets/splash.png` — ícone 1024 e tela de abertura 2732 usados pelo gerador de assets nativos
- `www/`, `android/`, `ios/` — gerados na hora do build (não ficam no repositório)
