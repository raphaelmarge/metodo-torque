// Ajustes que as lojas EXIGEM e que o Capacitor não põe sozinho.
// Roda depois de `npx cap add android` / `npx cap add ios`.
// Uso: node nativo/ajusta-nativo.js [android|ios|ambos]
//
// Android: sem a permissão de câmera declarada, o WebView nem pergunta — as
//   Medidas pela câmera simplesmente não abrem no app instalado.
// iOS: a Apple recusa o envio se faltar o texto explicando POR QUE o app pede
//   câmera e fotos (NSCameraUsageDescription e companhia), e desde maio de 2024
//   exige também o arquivo de privacidade PrivacyInfo.xcprivacy.
const fs = require("fs");
const path = require("path");

const AQUI = __dirname;
const alvo = (process.argv[2] || "ambos").trim();

const CAMERA = "Usamos a câmera só quando você toca em “Medidas pela câmera”, para estimar as circunferências do aluno. A foto é lida dentro do aparelho e descartada em seguida — nunca é enviada para nenhum servidor.";
const FOTOS = "Você pode escolher uma foto já salva no aparelho para estimar as medidas do aluno. A imagem é lida aqui mesmo e descartada em seguida.";
const MIC = "O app não grava áudio; esta permissão só aparece porque a câmera e o microfone são pedidos juntos pelo sistema.";

function android() {
  const arq = path.join(AQUI, "android/app/src/main/AndroidManifest.xml");
  if (!fs.existsSync(arq)) { console.log("android: projeto ainda não existe, pulando"); return; }
  let s = fs.readFileSync(arq, "utf8");
  const perms = [
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  ];
  const faltando = perms.filter((p) => s.indexOf(p) === -1);
  if (faltando.length) {
    s = s.replace("</manifest>", "\n    " + faltando.join("\n    ") + "\n</manifest>");
    fs.writeFileSync(arq, s);
  }
  console.log("android: " + faltando.length + " permissões acrescentadas");
}

function ios() {
  const plist = path.join(AQUI, "ios/App/App/Info.plist");
  if (!fs.existsSync(plist)) { console.log("ios: projeto ainda não existe, pulando"); return; }
  let s = fs.readFileSync(plist, "utf8");
  const chaves = [
    ["NSCameraUsageDescription", CAMERA],
    ["NSPhotoLibraryUsageDescription", FOTOS],
    ["NSPhotoLibraryAddUsageDescription", FOTOS],
    ["NSMicrophoneUsageDescription", MIC],
  ];
  let novas = 0;
  chaves.forEach(function (par) {
    if (s.indexOf("<key>" + par[0] + "</key>") > -1) return;
    s = s.replace("</dict>\n</plist>", "\t<key>" + par[0] + "</key>\n\t<string>" + par[1] + "</string>\n</dict>\n</plist>");
    novas++;
  });
  fs.writeFileSync(plist, s);

  /* Manifesto de privacidade (obrigatório desde maio/2024). Declaramos o uso
   * de UserDefaults, que é o que o WebView usa por baixo do localStorage —
   * a Apple devolve o envio com aviso se a API for usada sem declaração. */
  const priv = path.join(AQUI, "ios/App/App/PrivacyInfo.xcprivacy");
  fs.writeFileSync(priv, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>NSPrivacyTracking</key>",
    "\t<false/>",
    "\t<key>NSPrivacyTrackingDomains</key>",
    "\t<array/>",
    "\t<key>NSPrivacyCollectedDataTypes</key>",
    "\t<array>",
    "\t\t<dict>",
    "\t\t\t<key>NSPrivacyCollectedDataType</key>",
    "\t\t\t<string>NSPrivacyCollectedDataTypeEmailAddress</string>",
    "\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>",
    "\t\t\t<true/>",
    "\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>",
    "\t\t\t<false/>",
    "\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>",
    "\t\t\t<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>",
    "\t\t</dict>",
    "\t\t<dict>",
    "\t\t\t<key>NSPrivacyCollectedDataType</key>",
    "\t\t\t<string>NSPrivacyCollectedDataTypeOtherUserContent</string>",
    "\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>",
    "\t\t\t<true/>",
    "\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>",
    "\t\t\t<false/>",
    "\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>",
    "\t\t\t<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>",
    "\t\t</dict>",
    "\t</array>",
    "\t<key>NSPrivacyAccessedAPITypes</key>",
    "\t<array>",
    "\t\t<dict>",
    "\t\t\t<key>NSPrivacyAccessedAPIType</key>",
    "\t\t\t<string>NSPrivacyAccessedAPICategoryUserDefaults</string>",
    "\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>",
    "\t\t\t<array><string>CA92.1</string></array>",
    "\t\t</dict>",
    "\t</array>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n"));
  console.log("ios: " + novas + " textos de permissão + PrivacyInfo.xcprivacy");
}

if (alvo === "android" || alvo === "ambos") android();
if (alvo === "ios" || alvo === "ambos") ios();
