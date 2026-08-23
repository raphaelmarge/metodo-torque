# TORQUE ON — guia do projeto (leia antes de mexer)

Família SaaS fitness do Raphael (TORQUE FIT, Belo Horizonte). Site estático
(HTML/CSS/JS puro, sem build) hospedado no **GitHub Pages** → www.torqueon.com.br.
Deploy automático a cada merge na `main`. Dados: localStorage (offline-first) +
Supabase (nuvem, multi-tenant por academia). Responda ao Raphael sempre em
**português do Brasil, nível iniciante** (ele não é programador).

## Produtos (arquivos principais)

| Produto | Arquivo | O que é |
|---|---|---|
| Portal TORQUE ON | `index.html` + `apps/*.html` | Sistema da academia (estilo EVO): alunos, financeiro, check-in, grade, modo TV, chat com IA |
| TORQUE PERSONAL | `personal.html` (R$ 49/mês) | Módulo do personal: alunos, fichas, avaliações, app do aluno |
| TORQUE NUTRI | `nutricao.html` | Módulo do nutricionista: pacientes, dietas, app do paciente |
| App do aluno | **código** em `app/aluno-builder.js` + **dados** de `dadosAppAluno` (personal.html); Nutri ainda usa `montaAppNutri` (nutricao.html) | `app/index.html` junta os dois na hora; aluno entra por `aluno-login.html` (login = e-mail, senha enviada por e-mail no cadastro) |
| Vendas | `personal-vendas.html`, `torqueon.html` | Landing pages |
| Demos | `demo-aluno.html`, `demo-personal.html`, `demo-nutri.html` | Demonstrações com dados fake pra mandar pro cliente. O do aluno é gerado por `node tools/demo-aluno/regen-demo.js` (com o servidor 8765 no ar — regenerar quando o builder mudar) e simula a nuvem interceptando o `fetch`; os outros dois semeiam o localStorage e abrem o módulo |

Bancos compartilhados em `assets/`: `exercicios-db.js` (1270), `alimentos-db.js`
(989), `receitas-db.js` (63). Rotinas diárias adicionam itens — sempre com
dedupe por nome (case-insensitive) validado por script node.

**Fonte única do app do aluno** (a partir da v467): o código do app mora em
`app/aluno-builder.js` (`MT_APP_ALUNO.monta(D)`) e é servido pelo site, igual pra
todos os alunos. O painel só monta o pacote de DADOS daquele aluno
(`dadosAppAluno` → ~4 KB, contra 180 KB de HTML) e grava em `app_aluno.dados` no
formato `{html, dados, ver, stamp}`. Quem abre `/app/?t=…` junta os dois — então
uma correção de código chega em TODOS os alunos sozinha, sem ninguém republicar.
O VISUAL do redesenho mora em `app/aluno-skin.js` (`MT_APP_SKIN`, embutido pelo
builder no HTML publicado, com guarda — sem skin, nada muda); aparência se mexe
lá, nunca reescrevendo o builder.
Regras: nada de dado de aluno dentro do aluno-builder.js (tudo entra pelo objeto
`D`); a cor chega por variáveis CSS no `:root`; canvas usa `CV('cor')` porque não
entende `var()`. O `html` do pacote é só rede de segurança pra quem estiver com a
página `/app/` velha guardada — sai numa versão futura. `app/app-sw.js` guarda o
esqueleto (rede primeiro, cache de reserva) pro app abrir sem internet.

**Foto do aluno** (a partir da v506): dois campos na ficha, sem briga entre
eles — `a.foto` é a que o PERSONAL põe pelo painel, `a.fotoAluno` é a que o
ALUNO põe tocando no avatar do topo do app. Onde a foto aparece, vale
`fotoAluno || foto`. A do aluno é cortada em quadrado e reduzida pra 320 px no
próprio celular (a original nunca sai de lá), guardada em `ptfotoperfil` e
devolvida pro painel dentro do `retorno` (`fotoPerfil`), pelo mesmo
`app_aluno_devolve` das fotos de progresso — **sem SQL novo**. O painel só
aceita `data:` de imagem, sem aspas e até 400 KB, e grava com `S.write` em vez
de `save()` pra não redesenhar a lista embaixo de quem está lendo o perfil.

**WhatsApp oficial por profissional** (a partir da v471): a função `whatsapp` é
UMA só, publicada pelo Raphael, e serve todo mundo. Cada personal/academia cola
o próprio *Phone number ID* + token em Configurações → WhatsApp; isso vai pra
`zap_config` (uma linha por academia) pelas RPCs `zap_config_salva` /
`zap_config_ve` / `zap_config_apaga`. A tabela tem RLS **sem política nenhuma**:
o token só é lido pela função, com a service key, e `zap_config_ve` devolve
`tem_token` (booleano), nunca o token. Sem credencial própria, ninguém envia: o
modelo é **cada um paga o seu** na Meta, e emprestar o número do dono faria a
conta cair no bolso errado e o aluno responder pra pessoa errada. O Secret
`WHATSAPP_COMPARTILHADO=sim` libera o número global de propósito (plano de
entrada ou demonstração). O painel guarda só um espelho local
(`config.zapApi = {ligado, phoneId, template}`) porque o desenho da fila é
síncrono — token nunca toca o localStorage.

**Receber por profissional** (a partir da v474): o `meta-webhook` descobre de quem
é a mensagem pelo ID do número que a recebeu (`metadata.phone_number_id` no
WhatsApp; `recipient.id`/`entry.id` no Instagram) e casa com `zap_config.phone_id`
/ `ig_id` — índices únicos parciais garantem um dono por número. **Sem dono, não
processa nada**: antes ele escolhia a academia com `limit 1`, ou seja, sorteava, e
a conversa de um caía dentro da academia do outro. A resposta sai pelo MESMO
número que recebeu. Um POST só pode falar de UM dono (donos misturados = 400),
porque a assinatura da Meta cobre o corpo inteiro; o `app_secret` é o do dono
resolvido, nunca o global. `zap_config_salva2` guarda também app_secret,
verify_token (gerado pelo servidor), ig_id e ig_token. A região marcada
`==== ROTEAMENTO ====` no index.ts é **JS puro de propósito** — `tests/test-meta-webhook.js`
recorta e avalia ela em node, sem chamar a Meta; não coloque tipo do TypeScript lá.

**Pagamentos por profissional** (a partir da v528): o link de cobrança
(cartão/Pix/boleto) sai da conta do PRÓPRIO personal/academia — ele escolhe o
gateway em Configurações → Receber dos alunos (Mercado Pago, Asaas ou Pagar.me)
e cola a própria chave, que vai pra `pag_config` (selada, RLS sem política,
mesmo desenho do zap_config) pelas RPCs `pag_config_salva`/`_ve`/`_apaga` —
`_ve` devolve `tem_chave`, nunca a chave. A função `pagamentos` gera o link com
a conta DELE: o dinheiro do aluno cai direto com o professor, sem repasse (e
`comissao_pct` nasce em 0, pronta pro split no futuro). "Outra plataforma" é
100% local: o professor cola o próprio link (`config.pagLink`). Sem nada
configurado, o caminho antigo (função `pagarme` com a chave global) continua.
O espelho local é só `config.pagApi = {ligado, provedor}`.

**Baixa automática multi-gateway** (a partir da v532): quando o aluno paga um
link (ou mensalidade automática) do gateway PRÓPRIO, a baixa entra sozinha.
Desenho em duas voltas: a URL do webhook (`pagamentos-webhook`) leva
`?aid=<academia>&k=<webhook_token>` (senha por academia na `pag_config`, gerada
pelo servidor — índice único parcial, um dono por senha); e a função **nunca
confia no corpo do aviso** — pega só o id do pagamento e busca os dados DE
VOLTA no gateway com a chave daquela academia (aviso forjado não vira baixa).
Grava em `pag_eventos` (RLS: membro só LÊ; escrita só pela service key) com
id = `provedor:pagamentoId:tipo` (idempotência por pagamento+desfecho: cobrança
que venceu e foi paga depois ainda ganha a baixa; `estorno` fica registrado mas
o painel não mexe no caixa por ora). A função `pagamentos`
carimba cada link com `external_reference`/`metadata.mt_ref` =
`mt|<alunoId>|<origem>` e aponta o webhook (MP: `notification_url` por link;
Asaas: webhook criado UMA vez pela API, id guardado em `asaas_webhook_id`;
Pagar.me: o professor cola a URL mostrada no card — `pag_config_ve` devolve o
`webhook_token` de propósito, papel de verify_token, nunca a `chave`; trocar a
chave zera `asaas_webhook_id` pra recriar na conta nova). O painel
(`puxaPagamentosGateway`) lê ASCENDENTE com `.eq(academia_id, aid)` (a RLS
devolve todas as academias do usuário — sem o filtro, quem participa de duas
teria a janela roubada) e marca d'água `config.pagEvDesde` = evento mais novo
menos 7 dias (nada se perde por janela; a folga cobre outro aparelho; dedupe
por `eventoId` segura as re-leituras); casa por ref → `a.pedidosPg` →
`a.assinaturaAs`, grava com `S.write`; origem `pacote` entra COM desc e zera
`a.pacote.cobrar`; o card "pacote renovou" tem Link com `data-origem="pacote"`.
Alerta de cobrança vencida usa marcador monotônico `a.cartaoFalhouEvt`
(`criado|id`) — não re-acende depois de paga nem oscila entre dois meses.
Assinatura (cobrança automática mensal) v1 é pelo Asaas (`acao: assinar` —
exige CPF do aluno; `a.assinaturaAs = {id, desde, valor}`); quem tem
`assinaturaAs` sai da régua de cobrança igual ao `assinaturaRec` do caminho
antigo, e os dois perdem os botões Recebi/Pix/Link da lista de cobrança (baixa
em dobro). Trocar/desligar gateway ou encerrar aluno com `assinaturaAs` avisa
que a assinatura continua viva no Asaas. **Split do dono** (marketplace, a
partir da v533): `splitDono()` na função pagamentos — com Secret
`ASAAS_WALLET_DONO` + `pag_config.comissao_pct > 0`, o link e a assinatura
Asaas saem com `split: [{walletId, percentualValue}]`; comissão 0 (o padrão de
todo mundo) = nenhum split enviado, professor recebe 100%. Subir a comissão =
`update pag_config set comissao_pct = N where academia_id = …` (exemplo
comentado no SQL) — sem republicar nada. A região `==== NORMALIZA ====` do
pagamentos-webhook é **JS puro de propósito** — `tests/test-pag-webhook.js`
recorta e roda em node; não coloque tipo do TypeScript lá.

**Cortar o acesso do aluno** (a partir da v475): `app_aluno.revogado_em` +
`app_aluno_ativo(t)`, por onde passam TODAS as RPCs do aluno (antes cada uma lia
o token cru e aluno cortado seguia postando). `aluno_revoga_acesso` (revoga ou
apaga de vez), `aluno_religa_acesso` e `app_aluno_faxina(tokens[])` — o painel
manda os tokens que conhece e recebe só a CONTAGEM do que foi cortado (token
nunca volta pro navegador). No app, `app_aluno_estado(t)` devolve um envelope
`{ok, motivo|dados}`: **só apaga o aparelho quando o servidor DIZ que acabou** —
falha de rede, HTTP 5xx, resposta que não é o envelope e função ainda não
publicada (PGRST202) caem no caminho antigo e não tocam em nada, porque a cópia
local existe pro aluno que treina sem sinal. "Encerrar aluno" e "Excluir minha
conta" passam a oferecer/fazer a revogação.

**Semana do aluno + IA por tipo** (a partir da v534): aba "Semana do aluno"
(`data-tra="plano"`) amarra cada dia da semana a UM treino do aluno —
`t.plano = {dias: {"0".."6": {tp: "ficha"|"wod"|"cardio", id}}}` em
`st.treinosV2[alunoId]`. O pacote (`dadosAppAluno`) leva o plano RESOLVIDO
(`planoApp = {dia: {tp, i, n}}` — índice dentro de fichasApp/wodsApp/cardiosApp)
e o card HOJE do app segue o plano: ficha abre a gaveta certa, circuito/corrida
apontam a sub-aba (`__trSub`), dia sem treino vira DESCANSO; sem plano, vale o
rodízio antigo (`tot % FICHAS_META.length`). O padrão semanal vale pro mês
inteiro até mudar. A IA de treino ganhou seletor de TIPO (`#taTipo`:
musculação/wod/corrida): `geraTreinoIA(id, objetivo, equip, cb, tipo)` manda
`tipo` pra chat-envia (3 system prompts; formato `{wods:[…]}` / `{cardio:[…]}`),
peneira com as MESMAS regras dos formulários (`peneiraWodsIA`/`peneiraCardiosIA`)
e salva na coleção certa, pulando pra aba certa. chat-envia antiga (ignora tipo,
devolve fichas) → erro honesto mandando republicar, nada cai na aba errada.
Hooks: `window.__planoPT`. A demo do aluno TEM plano (o `regen-demo.js` grava
`plano.dias`); aluno sem plano segue no rodízio. O carrossel do Início tem 3
cards — `#heroTreino` (o do dia, montado por `pintaHero`) mais os extras
`#heroFicha` / `#heroWod` / `#heroCr`, e some o extra que repete o tipo do dia
(`tpHoje`), então são sempre 3. `#heroFicha` (v582) usa a ficha do rodízio e é
o que faz a foto de musculação aparecer em dia de circuito/corrida. O rótulo
de cada extra sai do `data-hk` na hora: **HOJE** só no primeiro card, os outros
viram **TAMBÉM** — antes todo card dizia HOJE, inclusive o que não era do dia.

**Frequência cardíaca ao vivo** (a partir da v580): o app do aluno lê cinta ou
pulseira de batimento e mostra FC + zona (Z1–Z5, sobre 220 − idade) durante o
treino guiado e a corrida. Dois caminhos reais, nesta ordem: `window.MTNativo.fc`
(ponte do app de loja, cobre iPhone) e Web Bluetooth (`navigator.bluetooth`,
serviço 0x180D / característica 0x2A37 — Chrome no Android; Safari não tem).
**Sem um dos dois, NADA aparece** — nem card, nem linha nos Ajustes, nem o
coração no player; mesma regra honesta do `ajSaude`. O batimento cru fica só no
aparelho; o que é guardado e devolvido pro professor (chaves `fc` e `idade` do
`retorno`, jsonb livre — **sem SQL novo**; no arquivo "baixar meus dados" a
mesma coisa se chama `batimentos`) é o resumo: `ptfc` por data (média e máximo
do treino) e `fc`/`fcx` dentro de cada corrida em `ptcardio`. No painel
(v581) isso vira o KPI *Batimento médio*, o bpm na linha de cada corrida e o
gráfico *Batimentos — esforço nos treinos* (barra = média colorida pela zona,
traço = pico, escala com piso porque batimento não vive perto do zero) mais o
aviso de carga alta. A zona sai de `idadeDe(a.nasc)` e, sem data de nascimento
na ficha, da `idade` que o aluno digitou no app; sem as duas, o painel mostra
só os números em vez de inventar faixa. Motor no
`app/aluno-builder.js` sob o prefixo `hr*`/`HR` (o nome `fc` já era usado como
variável local em duas funções); ganchos: `window.__fc`, `__fcAmostra`,
`__fcConecta`, `__fcResumo`, `__fcZera`. Contrato do shell nativo em
`nativo/SAUDE.md`.

**Avaliação física** (`assets/composicao-corporal.js`, `window.MT_CORPO`): motor
compartilhado Personal × Nutri. De peso/altura/idade/sexo/%gordura sai o laudo
completo (água, proteína, minerais, massa magra, músculo, IMC, controle de peso,
TMB, gasto por atividade, pontuação) + `laudoHtml()` imprimível. Quem tem
bioimpedância digita os valores medidos e eles VENCEM as estimativas.

**Medidas pela câmera** (beta, só no Personal): `assets/scanner-visao.js`
(carrega o MediaPipe sob demanda) + `assets/scanner-corporal.js`
(`window.MT_SCANNER`: régua pela altura, silhueta, elipse de Ramanujan, RFM,
calibração por fita). Duas fotos viram circunferências; a imagem é lida no
aparelho e descartada — nunca vai pra rede. Vem DESLIGADO (`st.config.scanOn`).
Precedência do laudo: bioimpedância > dobras > fita > foto. Os ~17 MB do
MediaPipe ficam em `assets/vendor/mediapipe/` FORA do precache, numa cache
própria (`mt-visao-v1`) que sobrevive à troca de versão do sw.js — o precache
usa `addAll`, que é atômico, e o RUNTIME é apagado a cada versão.

**Comunidade** (feed da turma, estilo GymRats): tabela `app_feed` + RPCs
`app_aluno_posta` / `app_aluno_feed` / `app_aluno_feed_apaga`, com curtidas e
comentários reusando `app_reacoes` (`post_id = 'feed:<id>'`). Vale pros dois
apps (aluno e paciente) e vem DESLIGADA — o profissional liga nas Configurações
(`st.config.feedOn`) e republica os apps. Moderação: Personal em Desafio →
Comunidade; o professor lê/edita `app_feed` direto pela RLS de membro.

## Supabase

- `supabase-setup.sql`: TODO idempotente. Depois de alterar, o Raphael precisa
  rodar de novo (ele copia de www.torqueon.com.br/sql.html).
- Edge Functions: **todas com Verify JWT OFF** (a partir da v494). Cada função
  que exige login valida o token ela mesma (`usuarioValidado`/`usuarioDoToken`
  → `GET /auth/v1/user` com a service key) em vez de confiar no portão. Motivo:
  ler só o miolo do JWT deixava passar token forjado quando o Verify JWT estava
  desligado, e no projeto do Raphael o portão passou a recusar até token BOM
  (401 INVALID_CREDENTIALS só na chat-envia, enquanto a envia-email respondia
  200 com a MESMA credencial). Lista em `supabase/functions/`: meta-webhook,
  chat-envia, whatsapp, envia-email (Resend), pagarme, push-envia, pagamentos,
  pagamentos-webhook.
  Ele publica copiando de www.torqueon.com.br/funcoes.html.
- Nunca coloque service key no site — só anonKey (`assets/cloud-config.js`).
- **Redundância** (v513/v515): todo update/delete no `dados` guarda o valor
  ANTERIOR em `dados_hist` (10 versões por chave). O `retorno` do app do aluno
  tem o mesmo em `app_aluno_hist` (5 por token), mas só fotografa quando
  ENCOLHE ou na exclusão — crescer é o uso normal. O pacote (`dados` do
  app_aluno) fica de fora: se regenera republicando. Exemplos de restauração
  comentados nos blocos do SQL.

## Como testar (obrigatório antes de publicar)

```bash
# servidor de teste (pkill em chamada separada — exit 1 é normal se não havia nada)
pkill -f "[h]ttp.server 8765"
setsid nohup python3 -m http.server 8765 --bind 127.0.0.1 -d <raiz-do-repo> > /dev/null 2>&1 < /dev/null &

bash tests/run.sh   # 20 suítes — esperado: "suites com falha: 0"
```

- Playwright: `/opt/node22/lib/node_modules/playwright` + chromium
  `/opt/pw-browsers/chromium --no-sandbox` (em outra máquina, `npx playwright install chromium`).
- Testes simulam nuvem com mocks de `window.MTStore.cloud` — sempre salvar o
  original (`__cloudOrig`) e restaurar, senão vaza pros testes seguintes.
- test-lojas tem verificador de acessibilidade (botões/links sem texto) que
  varre o CÓDIGO das páginas.
- test-scanner roda em node puro: valida a matemática das medidas com um boneco
  sintético de larguras conhecidas. Câmera de verdade não é testada de propósito.

## Trabalhando junto com o Claude Design (leia se você É o Claude Design)

O Raphael usa o Claude Code E o Claude Design no MESMO repositório. Regras pra
ninguém atropelar ninguém — valem pros dois:

- **Merge na main = site no ar na hora** (GitHub Pages). Toda mudança passa
  pelas suítes de `tests/` — o workflow `.github/workflows/testes.yml` roda
  sozinho em cada push na main e em cada PR. Vermelho = quebrou; conserte ou
  reverta antes de seguir.
- **Claude Design: prefira PR em vez de push direto na main** (branch
  `design/...`). Assim o teste roda ANTES de publicar.
- **Visual do app do aluno mora em `app/aluno-skin.js`** — é a camada certa
  pra mexer em aparência (CSS + ajuste mínimo de DOM, embutida no app
  publicado pelo builder). NÃO reescrever `app/aluno-builder.js` (lógica:
  sync, push, PIX, GPS, chat) nem `apps/store.js` (motor de sync) — mudanças
  aí são do Claude Code, com as suítes rodando localmente.
- Zonas tranquilas pra design: `personal-vendas.html`, `torqueon.html`,
  textos, imagens, `DESIGN.md`. Zonas de cuidado: `personal.html`,
  `nutricao.html`, `index.html` (páginas gigantes com JS embutido — combine
  antes ou vá de PR).
- O Claude Code puxa `origin/main` antes de cada lote — o que entrar por PR
  mergeado é incorporado automaticamente ao trabalho dele.

## Como publicar (fluxo obrigatório)

1. Trabalhe no branch `claude/material-app-site-conversion-4uy622` (ou outro `claude/...`).
2. Rode TODAS as suítes (acima).
3. **Suba a versão em +1** (`mt-vNNN`) a cada mudança de produto, nos **DOIS**
   lugares: `assets/versao.js` e o `var VERSION` cravado no `sw.js`. O navegador
   só troca o service worker quando os BYTES do `sw.js` mudam — com a versão só
   no arquivo importado, o `sw.js` ficou idêntico do v491 ao v509 e o iPhone
   congelou no código guardado (o Safari não confere arquivo importado).
   `tests/test-versao.js` falha se os dois números não baterem.
4. Commit → push → **PR pra main → merge imediato** (o Raphael quer cada lote no
   ar na hora, sem esperar aprovação) → recomeça o branch a partir de origin/main.
5. Avise o Raphael em pt-BR simples, com prints quando fizer sentido.

## Convenções

- Sem framework, sem build: HTML com JS embutido em cada página (o app do aluno
  é uma string gigante concatenada — cuidado com aspas e template).
- Visual: violeta #7c3aed / preto (Personal e portal), verde (Nutri). Fonte Archivo local.
- Textos da interface em pt-BR informal ("pra", emojis), marca sempre
  TORQUE ON / TORQUE PERSONAL / TORQUE NUTRI (nunca TORQUESYS — é só o redirect antigo).
- Tudo precisa funcionar offline; recursos de nuvem degradam com mensagens
  honestas ("Entre na sua conta…").
- `window.__algumaCoisa` são ganchos de teste — não remova.
- Ícones/manifests por produto; páginas novas de produto entram no precache do `sw.js`.

## Estado atual e pendências do Raphael

- Pendências dele no Supabase: **rodar o SQL de novo** (blocos zap_config,
  RECEBER POR PROFISSIONAL e BAIXA AUTOMÁTICA MULTI-GATEWAY), **publicar
  pagamentos e pagamentos-webhook** (baixa automática dos gateways próprios)
  e **republicar whatsapp, meta-webhook e chat-envia**; **republicar a chat-envia** (sem ela a IA de
  treino e a IA de dieta não funcionam), publicar envia-email e push-envia
  (+ conta resend.com com domínio verificado, secrets RESEND_API_KEY/EMAIL_DE),
  conta Pagar.me e ativação Meta do WhatsApp/Instagram (funcoes.html).
  O SQL da Comunidade ele já rodou.
- Escala: o painel aguenta milhares de alunos (índices + paginação). Os passos
  seguintes, se a base crescer muito: fotos no Supabase Storage, IndexedDB no
  lugar do localStorage e sync incremental (salvar só o que mudou).
- Paridade NUTRI × PERSONAL: o app do paciente já ganhou XP, semana, medalhas
  e Comunidade. Falta o painel (cadastro com anamnese, sub-abas, perfil).
