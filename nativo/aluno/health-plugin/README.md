# TorqueHealth — leitura opcional do aluno

Plugin local para Capacitor 7. O cliente web só registra TorqueHealth quando
isNativePlatform e isPluginAvailable confirmam sua presença. Não há APK/IPA nem
conexão operacional entregue: Swift/Kotlin ainda precisam de compilação e
homologação física. Os SDKs não estão presentes no ambiente de implementação.

## Preparar a variante aluno

Na pasta nativo, com SDKs nativos instalados:

```sh
npm install
node prepara.js aluno
npx cap add android
npx cap sync android
# ou, num Mac com Xcode:
npx cap add ios
npx cap sync ios
```

cap add só é necessário na primeira criação. ajusta-nativo.js cuida das antigas
permissões de câmera e não substitui a configuração HealthKit.

iOS: no target App, habilitar Signing & Capabilities → HealthKit para
com.torqueon.aluno. Não habilitar Clinical Health Records ou background delivery.
Adicionar no Info.plist NSHealthShareUsageDescription com o texto: “Com sua
autorização, trazemos os treinos, passos ou sono que você escolher para acompanhar
sua rotina com seu profissional.” Não adicionar NSHealthUpdateUsageDescription:
nenhuma escrita é solicitada. Não chamar autorização sem entitlement e descrição.
A Apple não revela se a leitura foi negada.

Android: SDK 35, JDK 17 e aparelho com Health Connect disponível. Manifesto declara
somente READ_EXERCISE, READ_STEPS e READ_SLEEP; pedidos seguem a escolha do aluno.
Health Connect 1.1.0 está fixado no Gradle. Nenhuma rota, FC, peso, escrita ou
leitura em segundo plano é solicitada. A Activity de justificativa abre offline.

Antes de distribuir outro produto nativo da família, remover a dependência deste
plugin se ele não oferecer esse fluxo. O escopo desta entrega é o aluno do Personal.

## Contrato

- capabilities → available, platform, kinds, reason.
- request recebe read (workouts, steps, sleep) e write vazio.
- permissions retorna status por categoria; iOS sempre unknown para leitura.
- read recebe kinds, start/end ISO e retorna records, truncated.
- settings retorna opened; no iOS false, com orientação manual na interface.

Records têm IDs estáveis, origem, intervalo e dia local. Treinos incluem segundos
e distância opcional. Passos/sono só incluem totais agregados. Não há token do
aluno nem acesso Supabase no plugin. Android mantém distância ausente e usa
timeBasis elapsed; iOS conserva HKWorkout.duration e totalDistance, se disponível.

## Gate físico pendente

Compilar e executar nos dois sistemas: negar tudo; autorizar só uma categoria;
revogar externamente; testar sobreposição telefone/relógio; trocar aluno durante
leitura; repetir importação; simular quota/interrupção; conferir ausência de
distância; distinguir tempo ativo/decorrido; mudança de fuso/DST e sono cruzando
meia-noite. Revisar privacidade e declaração de saúde das lojas antes de publicar.

O usuário informou não ter contas Apple/Google/Strava/Garmin. Nenhuma conta foi
criada. Este plugin não constitui um aplicativo autônomo de relógio.
