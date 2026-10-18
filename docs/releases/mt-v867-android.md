# mt-v867 — compilação Android após a integração

O build `39160550749`, acionado pelo merge dos PRs #888/#889, falhou antes de
produzir o APK. O Health Connect 1.1.0 exige compileSdk 36 e AGP >= 8.9.1,
mas o projeto gerado pelo Capacitor 7 usava SDK 35 e AGP 8.7.2. O plugin de
saúde do aluno também estava sendo incluído em todos os produtos.

Essa falha de compilação é separada das seis falhas originais de Playwright do
#889 e da consolidação dos service workers. As suítes dos dois PRs passaram
nos commits finais (228 e 244 suítes); o frontend continua em mt-v867.

## Produtos e compatibilidade

| Build | Plugin de saúde | Android mínimo | Compilação |
| --- | --- | --- | --- |
| Academia, Personal, Nutri | Não incluído | API 23, padrão do Capacitor 7 | Configuração original do Capacitor |
| Aluno com saúde | Health Connect | API 26 | SDK 36, AGP 8.10.1, Gradle 8.11.1, Kotlin 2.2.20 |
| Aluno compatível | Não incluído | API 23 | Configuração original do Capacitor |

A variante compatível conserva as funcionalidades anteriores do aluno e os
mesmos contratos de dados. Apenas a integração opcional de saúde fica
indisponível, como no navegador. Para prepará-la localmente:

```sh
TORQUE_HEALTH_ENABLED=0 node nativo/prepara.js aluno
```

No workflow manual, escolher `aluno` e desligar `saude`. Seu artefato e release
de teste usam `aluno-compat`, separados dos pacotes do aluno com saúde.
Academia, Personal e Nutri não recebem permissões de saúde nem aumento do
Android mínimo. O ajuste de compilação do aluno conserva targetSdk 35;
compileSdk 36 não altera sozinho os comportamentos de runtime do Android.
O SDK de Health Connect suporta API 26, mas a leitura exige Health Connect
em Android 9/API 28 ou posterior. A indisponibilidade continua explícita.

## Validação

PRs que alteram `nativo/` passam a compilar três APKs reais: Academia, Aluno
com saúde e Aluno compatível. O CI confere o mínimo Android no APK produzido,
e guarda os três pacotes como evidência. O job de PR só tem leitura do
repositório; publicar uma release continua restrito a push/manual.

O build não comprova leitura de dados em um aparelho. Permanecem necessários
consentimento/permissões por categoria, homologação em Android/iPhone reais,
compilação iOS e configuração de loja. Não há conexão Strava/Garmin OAuth nem
publicação automática na Play Store neste ajuste.

Referências: [AGP 8.10](https://developer.android.com/build/releases/agp-8-10-0-release-notes),
[compatibilidade Kotlin](https://kotlinlang.org/docs/gradle-configure-project.html),
[Health Connect](https://developer.android.com/health-and-fitness/health-connect/get-started).
