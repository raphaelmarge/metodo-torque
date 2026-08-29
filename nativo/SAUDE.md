# Relógio, bands e saúde — o caminho do app de verdade (iOS + Android)

Este documento é o mapa pra ligar smartwatch/band no TORQUE ON. A parte que
NÃO depende de loja já está no ar; a parte nativa tem o contrato pronto — é
plugar o shell da loja (esta pasta `nativo/`, Capacitor) e implementar a ponte.

## O que JÁ funciona hoje (sem loja, qualquer celular)

- **Importar do relógio (GPX/TCX)** — botão na área *Corrida e bike* do app do
  aluno. Todo smartwatch exporta o treino nesses formatos (Apple Watch via
  apps como HealthFit/RunGap ou Strava; Garmin/Polar/Coros/Xiaomi direto no
  app deles). O arquivo é lido NO aparelho (nada sobe pra rede), a corrida
  entra no `ptcardio` com km/tempo/pace/data reais e conta pra medalhas,
  marcas e recordes. Motor: `crImporta(texto, rotulo)` no
  `app/aluno-builder.js`, exposto como `window.__crImporta` (é o mesmo que a
  ponte nativa usa).

## O contrato da ponte (o que o shell nativo injeta)

O shell da loja injeta, ANTES do app web carregar, um objeto global:

```js
window.MTNativo = {
  saude: {
    // abre a tela nativa de conexão (pedir permissão HealthKit/Health Connect)
    abrir: function () {},
    // opcionais — quando existirem, o app web passa a usá-los:
    // devolve treinos novos desde `desdeISO` como lista de GPX/TCX (texto)
    treinos: function (desdeISO, callback) {},
    // peso mais recente { kg: 82.4, data: '2026-08-20' }
    peso: function (callback) {},
  },
};
```

Com `window.MTNativo.saude` presente, o app do aluno acende sozinho a linha
**Ajustes → APP → "Conectar relógio e saúde"** (id `ajSaude`) e o toque chama
`saude.abrir()`. A web NUNCA mostra essa linha sem a ponte: nada de botão que
finge.

**A partir do mt-v671 o app IMPORTA SOZINHO** quando `treinos`/`peso` existem:
no boot (3 s depois de abrir) e a cada volta pro app (visibilitychange), com
intervalo mínimo de 15 min entre rodadas e trava de ocupado com soltura em
10 s (callback nativo que nunca responde não trava o app pra sempre).

- `treinos(desdeISO, cb)`: `desdeISO` é timestamp ISO **completo em UTC**
  (`toISOString()`), nunca data local. A marca do último import fica em
  `ptsaudeSync` com **recuo de 48 h** (relógio que sincroniza horas depois);
  primeira vez pega 30 dias. Teto de 20 treinos por rodada. Cada texto passa
  por `window.__crImporta(txt, rotulo, auto=true)` — o modo silencioso não
  abre confirm/alert nem solta confete, e o **dedupe existe de verdade**:
  mesmo dia + duração ±5 s + km ±0,06 não entra duas vezes (vale também pra
  reimportação manual do mesmo arquivo). Sem cardio no app, `__crImporta`
  nem existe e só o peso importa.
- `peso(cb)`: valida kg 20–400 e data `YYYY-MM-DD`, e **só preenche data
  vazia** — o que o aluno digitou no app vence o relógio.

Quando algo entra, a linha `ajSaude` mostra "N treino(s) importado(s) do
relógio". Gancho de teste: `window.__saudeSync = {puxa(força), desde()}`.

## Passo a passo — Android (Health Connect)

1. `cd nativo && node copia-www.js && npx cap sync android`
2. Plugin: `npm i capacitor-health-connect` (ou o oficial que estiver mantido
   na época — conferir em capacitorjs.com/docs/plugins).
3. `AndroidManifest.xml`: permissões `android.permission.health.READ_EXERCISE`,
   `READ_HEART_RATE`, `READ_WEIGHT` + a activity de rationale que o Health
   Connect exige.
4. No shell (arquivo JS do wrapper), implementar `MTNativo.saude` chamando o
   plugin e convertendo cada sessão de exercício em GPX simples (lat/lon/time
   dos pontos, ou só tempo+distância quando não houver rota).
5. Publicar como atualização do app da Play Store (ver `ASSINATURA-LOJA.md`).

## Passo a passo — iPhone (HealthKit / Apple Watch)

1. `cd nativo && node copia-www.js && npx cap sync ios`
2. Plugin: `@perfood/capacitor-healthkit` (ou equivalente mantido).
3. No Xcode: capability **HealthKit** + textos de uso no `Info.plist`
   (`NSHealthShareUsageDescription` — em pt-BR, explicando que é pra trazer
   treinos e peso do aluno pro acompanhamento).
4. Implementar `MTNativo.saude` lendo `HKWorkout` (corrida/caminhada/bike) e
   `HKQuantityTypeIdentifierBodyMass`; treinos com rota (`HKWorkoutRoute`)
   viram GPX, sem rota viram TCX mínimo (tempo + distância).
5. Revisão da App Store: HealthKit exige que o app SÓ leia o que usa e mostre
   política de privacidade (usar `/privacidade.html` do site).

## Frequência cardíaca ao vivo — JÁ ESTÁ NO AR (a partir da v580)

O app do aluno lê cinta/pulseira de batimento e mostra **FC ao vivo + zona**
durante o treino guiado e durante a corrida. Dois caminhos, nesta ordem:

1. **`window.MTNativo.fc`** — a ponte do app de loja (cobre iPhone e Android).
2. **Web Bluetooth** (`navigator.bluetooth`) — serviço padrão de batimento
   `0x180D`, característica `0x2A37`. Funciona no **Chrome do Android**; o
   Safari do iPhone não tem Web Bluetooth.

Sem nenhum dos dois, **nada aparece** — nem o card da corrida, nem a linha
"Conectar cinta de batimento" nos Ajustes, nem o coração no topo do treino
guiado. Mesma regra do `ajSaude`: o app nunca mostra botão que não conecta.

Onde aparece: card *Batimentos ao vivo* na área **Corrida e bike** (com a idade
do aluno pra calcular a FC máxima = 220 − idade), coração com o BPM no topo do
**treino guiado**, coluna BATIMENTOS no **modo tela cheia** da corrida e a linha
**Ajustes → App → Conectar cinta de batimento**.

O batimento cru fica só no aparelho enquanto o treino roda. O que é guardado (e
devolvido pro professor no `retorno`, campo `batimentos`, sem SQL novo) é o
**resumo**: média e máximo do treino (`ptfc`, por data) e da corrida
(`fc`/`fcx` dentro do registro em `ptcardio`).

### O contrato pro shell nativo

```js
window.MTNativo.fc = {
  // conecta a cinta/relógio e chama o callback a cada batimento (número inteiro)
  conectar: function (callback) {},
  // opcional: encerra a leitura (o app chama quando o aluno desconecta)
  parar: function () {},
};
```

Plugin sugerido nos dois sistemas: `@capacitor-community/bluetooth-le` (lê o
serviço `0000180d-...` e a característica `00002a37-...`; o primeiro byte é o
flag — bit 0 diz se o valor tem 8 ou 16 bits). No iPhone o `Info.plist` precisa
de `NSBluetoothAlwaysUsageDescription` em pt-BR.

Ganchos de teste no app: `window.__fc` (estado), `window.__fcAmostra(bpm)`,
`window.__fcConecta()`, `window.__fcResumo()`, `window.__fcZera()`.

## Strava (alternativa que cobre qualquer relógio, sem loja)

Quase todo relógio despeja os treinos no Strava. Uma Edge Function
`strava-sync` (OAuth do Strava + token por aluno em tabela selada, mesmo
desenho do `zap_config`) puxaria as corridas novas de tempos em tempos.
Precisa: criar o app gratuito em strava.com/settings/api e publicar a função.
É o próximo passo natural depois deste.
