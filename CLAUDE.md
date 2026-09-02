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
| App do aluno | **código** em `app/aluno-builder.js` + **dados** de `dadosAppAluno` (personal.html); o do paciente NUTRI segue o mesmo desenho desde a v661: **código** em `app/nutri-builder.js` + **dados** de `dadosAppPaciente` (nutricao.html), pacote com `dados.tipo="nutri"` | `app/index.html` junta os dois na hora (despacha pelo `dados.tipo`); aluno entra por `aluno-login.html` (login = e-mail, senha enviada por e-mail no cadastro) |
| Vendas | `personal-vendas.html`, `torqueon.html` | Landing pages |
| Demos | `demo-aluno.html`, `demo-personal.html`, `demo-nutri.html`, `demo-paciente.html` | Demonstrações com dados fake pra mandar pro cliente. Os apps são gerados por `node tools/demo-aluno/regen-demo.js` e `node tools/demo-paciente/regen-demo.js` (com o servidor 8765 no ar — regenerar quando o builder mudar) e simulam a nuvem interceptando o `fetch`; demo-personal e demo-nutri semeiam o localStorage e abrem o módulo |

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

**Parte 2 do dia — A2, B2** (a partir da v595): o professor pediu um
sub-treino de cardio/alongamento dentro do dia. A parte 2 **não é outra ficha**:
é um campo dentro dela, `f.p2 = {n, l:[{t,v,o}]}` (o quê / quanto / obs). Assim
ela não rouba a letra seguinte (as fichas seguem A, B, C), não entra sozinha na
Semana do aluno (que casa pelo **id** da ficha) e viaja no mesmo pacote.
`letraFicha(f, idx)` no painel tira a letra do título ("A — Peito" → A) ou da
posição — **a mesma regra do app**, que faz o mesmo `split("—")` no builder;
mexeu numa, confira a outra. O painel tem o formulário curto com `datalist`
`#p2sugestoes`; a prescrição do WhatsApp (`treinoTexto`) imprime o A2 embaixo
dos exercícios; o pacote leva `p2` em `fichasApp` e um resumo `{k, l}` dentro do
`GUIA` (é o que o recibo do fim do treino usa pra dizer "Ainda falta A2"). No
app o bloco azul fica DENTRO da gaveta da ficha, depois do botão de começar,
com cada linha marcável (`ptp2 = {d: hoje, f:{...}}` — só vale pro dia) e
cronômetro na linha que tem minutos. `iniciaTmr(sg, rot)` ganhou rótulo próprio
e mm:ss acima de 90 s — antes dizia "Descanso" pra tudo. Ganchos:
`window.__letraFicha`, `window.__dadosApp`, `window.__p2`.

**IA prescreve o MÊS, com perfil profundo e a leitura do professor** (a partir
da v604): o `ia_treino` deixou de montar "a semana" e passou a montar o **mês**
— as MESMAS fichas/circuitos/corridas valem 4 semanas e o que muda é a
progressão escrita, que a IA devolve no campo `mes` (`MES_REGRA` na chat-envia,
usada pelos três formatos: 4 semanas, ajuste concreto, **semana 4 sempre mais
leve**). `peneiraMesIA` só aceita as 4 semanas completas (resposta antiga →
`null` e o treino entra igual, sem progressão); `semanaDoMes(mes)` resolve em
que semana o aluno está pela data de geração (passou do mês, trava na 4). Guarda
em `t.mes[tipo]`; o painel pinta o card **📅 Plano do mês** (`pintaMesPlano`) e o
pacote leva `mesApp` com a semana **já resolvida** — o app só imprime a faixa
`#trMes`. ⚠️ `var MESAPP=` entra ENTRE `var PLANO=` e `var TRHEAD=`: o teste que
recorta o pacote por regex teve de ser reancorado (a mesma armadilha da v583).

O prompt ganhou três blocos novos: `perfilFisicoIA` (última avaliação + o quanto
mudou desde a primeira), `evolucaoIA` (cargas REAIS do `retorno.cargas`,
frequência dos últimos 28 dias, RPE, bpm) e `corridasIA` (pace e maior distância
já feita). Cada bloco diz honestamente quando o dado não existe, em vez de
deixar a IA estimar. E `briefIA(a)` põe **na frente de tudo** a leitura humana
do professor — `a.briefIA = {desejo, quer, adapta, leitura}`, editada no
`<details>` `#taBrief` da aba Automático e IA e guardada NO ALUNO (o mês
seguinte só ajusta o que mudou). `BRIEF_REGRA` na chat-envia manda esse bloco
vencer qualquer conclusão tirada dos números, trata *adaptações e limitações*
como **regra absoluta** e exige ressalva no resumo em vez de ignorar em
silêncio um pedido perigoso. Ganchos: `window.__peneiraMes`, `__semanaMes`,
`__montaDadosIA`, `__briefIA`, `__brief`, `__pintaMes`.

**Peso sugerido na série** (a partir da v603): `gSugereKg(ex, repsAlvo)` olha o
`ptdc` daquele exercício e devolve o próximo degrau (`gPasso`: 1 kg abaixo de
20, 2,5 acima) **só quando** o aluno bateu as repetições prescritas na última
vez E não subiu no treino anterior a essa (deixa consolidar). Sem histórico,
sem reps prescritas, ou reps abaixo do alvo → devolve 0 e nada aparece. O
botão `#gSugT` (classe `.gsug`) fica na TELA do exercício, embaixo dos tiles —
dentro de "Mudar a carga" o aluno nunca veria. Tocar nele grava a carga do dia
(`gv.cargas` + `gGrava`) e repinta: o tile CARGA já mostra o número novo com o
"+2,5 kg desde a última", e o botão some. **Nada sobe sozinho** — a sugestão é
sempre um toque explícito. Gancho: `window.__gSugere`.

**Resumo do fim da corrida** (a partir da v602): os números do fim eram duas
linhas de texto dentro do card; agora `crResumo(reg, extras)` abre a tela
cheia `#crResumoF` com seis tiles (km, tempo, pace, kcal, bpm médio, pico),
as medalhas/recordes em verde e os botões de postar. `cr.resumo` trava o
`espelhaCr` enquanto ela está aberta — senão a pintura do cronômetro passava
por cima. A arte (`cardCorrida`) ganhou o batimento e passou a servir a
ESTEIRA: sem km o número grande vira o TEMPO, e o botão de compartilhar não
exige mais GPS (antes `reg.k > 0` deixava quem corre em esteira de fora).
`crEh()` é um escape próprio do bloco de cardio — o `esc2` nasce noutro
pedaço do script.

**Tela por zona de batimento** (a partir da v601): com a cinta conectada, o
fundo da tela cheia da corrida (`#crPainelF`) vira a cor da zona (`HRZC`, Z1
azul → Z5 vermelho) e a faixa `#crZonaFx` mostra zona, bpm e % da máxima.
`crZonaPinta(mapaAberto)` é chamada no fim do `espelhaCr` e também pelo
`hrPinta` (senão a zona congelava com o cronômetro pausado). **Sem cinta nada
muda**: `HR.on` falso devolve o gradiente do studio e esconde a faixa — mesma
regra honesta do resto do batimento. A voz só entra depois que a zona firma
(12 s em `crZDesde`), senão falaria a cada batida na fronteira entre duas
zonas. A faixa do bloco guiado (`#crFaseF`) vai a branco quando o fundo
colorido entra, porque o ciano do aquecimento sumia no laranja do Z4.

**Treino guiado no circuito** (a partir da v600): o WOD ganhou o mesmo desenho
da musculação — UM movimento por vez. `wfGuia()` pinta o `#wfAgora` com a
quantidade em 38 px, o nome, a linha "depois: X" e o botão `#wfFeito`;
`wfAvanca()` anda um movimento e, ao passar do último, zera `wod.gi` e clica no
**mesmo** `#wodVolta` de sempre (um caminho só pra contar volta, senão dois
contadores divergem). Só vale pra **amrap** e **fortime** — EMOM e Tabata são
definidos pelo relógio e seguem como estavam. A lista embaixo (`listaMovs(t, gd)`)
passa a derivar o riscado de `wod.gi` em vez do `wfRisc` manual nesses dois
tipos, e tocar num item PULA pra ele. Com o guiado na tela, o `#wfVolta` é
rebaixado a atalho discreto ("Fechei a volta inteira") — e volta ao normal a
cada pintura, porque `espelhaW` reseta classe/texto/estilo dele no topo. `wod.gi`
zera em wodZera, ao começar do zero, ao trocar de tipo e ao escolher outro WOD.
Ganchos: `window.__wodGuia.avanca`.

**O trajeto em 3D** (a partir da v643): o Raphael pediu o visual do Strava, com
relevo. Antes de qualquer coisa faltava o dado: o app **não guardava a rota** —
`ptcardio` tinha só `{d,n,m,s,k,p,fc,fcx}` e o traçado vivia em `cr.fimRota`,
memória, até fechar o app. Não existia mapa de corrida passada. Agora o registro
leva `r`, uma **polilinha codificada** (o formato clássico de mapa): Douglas-
Peucker com pilha (tolerância 0,00005° ≈ 5,5 m, abaixo do erro do GPS) e teto de
200 pontos. Medido: volta da Pampulha, 600 pontos → 59 pontos e **235 bytes**
(eram 31,7 KB), pior desvio **5,1 m** contra a linha; quarteirão com cantos de
90° → 5 pontos, desvio 0,37 m. Importa porque o `ptcardio` inteiro viaja pro
professor no `devolveApp` — é a conta da v611.

O 3D é o **MapLibre GL 5.9.0** (`assets/vendor/maplibre/`, BSD, sem chave e sem
cobrança por carregamento — por isso não Mapbox; a v6 só vem em ESM e o app é
uma string carregada por `<script>` comum). Ele fica na tela de **resumo** e no
**histórico**, nunca durante a corrida: relevo só aparece com a câmera
inclinada, mapa inclinado é pior de ler correndo, e é onde o Strava também
mostra. O mapa da corrida continua sendo o canvas — **não houve troca de motor,
existe uma tela nova**. Carregamento sob demanda com as três travas do
`scanner-visao.js`; caminho **absoluto** `/assets/vendor/maplibre/…` (o mesmo
HTML roda em `/app/`, na demo e nos testes); e conferir `window.maplibregl`
depois do `onload` é obrigatório, porque o `app-sw.js` devolve o `index.html`
com status 200 pra qualquer arquivo de mesma origem que falte — o `onerror`
nunca dispara.

⚠️ Cache **própria** `mt-mapa-v1` nos DOIS service workers, fora do precache: a
cache do app é apagada a cada `mt-vNNN` e o aluno rebaixaria 1 MB por versão. A
regra tem de existir no `app/app-sw.js` — o `sw.js` da raiz **não alcança**
`/app/`, escopo mais específico ganha. E no `ignora` do `nativo/produtos.json`
pra quem não usa.

⚠️ **Como saber se as ruas vieram**: não dá pra perguntar ao MapLibre. Medido:
o evento `data` com `.tile` **não dispara** pra fonte raster nem no sucesso nem
na falha (os que apareciam eram da camada da rota, que é geojson), e
`areTilesLoaded()` fica falso enquanto o relevo não vier. Quem responde é uma
**sonda**: uma `Image` com `crossOrigin='anonymous'` (a mesma exigência que o
WebGL faz) baixando o ladrilho do centro. Testada nos dois sentidos com
ladrilho falso servido no teste. A rota entra no `style.load`, não no `load`,
senão sem internet o aluno não veria nem o próprio trajeto.

⚠️ O `fitBounds` é feito com a câmera **reta** e a inclinação entra depois
(`easeTo`): com `pitch` dentro do `fitBounds` o trajeto cabe no tronco de visão
inclinado, que é bem maior que a tela, e o desenho sai com um terço da largura.
Cor do céu e do fundo saem de `CV()` — como o canvas, o estilo do MapLibre é um
objeto JS e **não entende `var()`**. Ganchos: `window.__crMapa.{rota,abre3D,
fecha3D,estilo3D,motor}`.

**A IA não obedecia as diretrizes do professor** (conserto na v639): o Raphael
disse que o treino saía fora do que ele tinha escrito. Eram QUATRO gargalos no
caminho entre o que ele digita e o que a IA recebe — nenhum deles no prompt:

1. **A IA via 24% do banco.** `montaDadosIA` mandava os **25 primeiros de cada
   grupo** na ordem do arquivo — 436 de 1828 exercícios, sorteados por acaso.
   Pedir um exercício fora desses 25 era pedir uma coisa que ela não sabia que
   existia. Agora `catalogoIA(cands, primeiro, orcamento)` cresce o teto por
   grupo até encostar no orçamento de caracteres (a chat-envia aceita 60000 em
   `dados`) e, dentro de cada grupo, ordena **quem o professor citou, favoritou
   ou já usa com este aluno na frente** — 1306 exercícios, envio de 45 KB.
2. **O nome citado não virava obrigação.** `exCitados(texto, cands)` casa nos
   **dois sentidos**: nome do catálogo inteiro dentro do texto dele ("quero
   stiff") e trecho do texto dele dentro do nome do catálogo ("terra romeno" →
   *Levantamento terra romeno*), sempre pelo nome mais **curto** (o movimento
   base, não a variação com kettlebell) e sem repetir variação de quem já
   entrou. Vira o bloco `EXERCÍCIOS QUE O PROFESSOR CITOU … são OBRIGATÓRIOS`.
   ⚠️ só o texto de **pedido** alimenta isso (`desejo`, `quer`, `obs`, `gosta`)
   — `adapta`, `lesoes` e `naogosta` são proibições e virariam o contrário do
   que ele escreveu. E uma negação **colada** no pedido ("nada de
   desenvolvimento militar") desqualifica o trecho: `negado()` anda pra trás no
   máximo 3 palavras, pulando ligação (de, com, na…) e parando na primeira
   palavra de conteúdo — janela larga reprovava por engano ("quero ABCD, **não**
   ABC, terra romeno obrigatório" matava o terra).
3. **A regra do sistema ganhava do professor.** O prompt mandava "1 ficha por
   dia disponível" e "5 a 8 exercícios por ficha"; quem pedia ABCD recebia ABC.
   `BRIEF_REGRA` na chat-envia passou a dizer que **a estrutura pedida
   substitui esses padrões** (quantidade, divisão, exercícios por ficha,
   duração), que o exercício citado é obrigatório e que existe um `LEMBRETE
   FINAL` no fim dos dados pra conferir o plano contra o texto dele antes de
   responder. O painel repete o recado no fim do envio (recência) e a linha de
   DIAS/SEMANA diz na cara que é padrão da anamnese e cede ao professor.
4. **O que a IA prescrevia e o painel descartava sumia calado.** `ignorados`
   era contado desde sempre e **nunca mostrado**: pedido atendido pela IA que
   não batesse com o banco virava nada, e a tela ainda dizia que deu tudo
   certo. Agora o painel primeiro tenta **recuperar** o nome sem acento e sem
   pontuação (`chaveEx`: "AGACHAMENTO BULGARO" → *Agachamento búlgaro*) e, o
   que sobrar, aparece **pelo nome** no aviso.

Junto: o campo da diretriz deixou de ser cortado em **600 caracteres em
silêncio** (`BRIEF_MAX` = 2000, com contador por campo e recado quando corta),
as **observações do aluno** subiram pra junto da leitura (estavam enterradas no
meio da anamnese) e o `ping` da chat-envia passou a devolver
`regras: ["mes","brief","briefManda"]` — se a função publicada no Supabase for
velha demais pra obedecer a leitura, o painel **avisa dentro da gaveta**
(`#brAviso`) em vez de deixar o treino sair errado sem explicação.
Ganchos: `window.__catalogoIA`, `__exCitados`, `__brief.confere`.

**O mapa da corrida não aparecia** (conserto na v641): o Raphael disse que na
área de corrida o mapa não vinha, mas **a bolinha azul vinha**. Isso já entrega o
diagnóstico: o GPS estava bom (a bolinha só é pintada quando há posição) e quem
falhava eram os **tiles** — as imagens das ruas. Causa: `t.img.crossOrigin =
'anonymous'` na criação de cada tile. O canvas do mapa (`#crMapa`/`#crMapaFull`)
**nunca é lido de volta** — quem exporta imagem são OUTROS canvas (a arte da
corrida, a foto de progresso, o card do treino) —, então não existe canvas sujo
e CORS não comprava nada. Em compensação cobrava: com `crossOrigin`, o navegador
EXIGE o cabeçalho `Access-Control-Allow-Origin` e, se ele não vier (proxy de
operadora, DNS privado, bloqueador, CDN respondendo do cache sem o cabeçalho), a
imagem nem carrega. Como a exigência valia pro CARTO **e** pro OSM de reserva, os
dois morriam juntos — daí o retângulo liso com a bolinha em cima. Saiu.

Junto veio o que fazia isso ser indiagnosticável: **o silêncio**. Tile que morre
não dizia nada. Agora `desenhaCv` conta quantos tiles pintaram (`pintou9`) e,
com zero pintados e a reserva também falhada (`crMapaErro`), o mapa escreve
**"Não deu pra carregar as ruas"** e, embaixo, *"seu trajeto continua sendo
gravado"* — que é verdade e é o que o aluno precisa saber no meio da corrida.

⚠️ **A armadilha que quase passou**: ao acrescentar `crMapaErro=0;` no seletor de
estilo eu comi o `+` do fim da linha anterior. `node --check` passou — porque o
JavaScript aplica **ASI**: `"a"\n"b" +` não é erro de sintaxe, ele fecha a
primeira expressão e trata o resto como uma expressão solta. Resultado: a string
do app foi **truncada** de 416 KB pra 258 KB e o app perdeu 2 dos 3 `<script>`.
Quem pegou foi `test-app-sintaxe.js`, que monta o app e faz parse de cada script
— exatamente o que o cabeçalho dele diz que existe pra pegar. **Checar a sintaxe
do builder não basta: o que vale é montar o app.**

⚠️ Duas âncoras de teste tiveram de mudar junto, e a lição é a mesma da v583: um
teste que ancora em `,256,256);}catch` quebra quando qualquer coisa entra dentro
do `try`, sem que a regra tenha mudado. Foram reancorados no que importa.

**Os gráficos do app do aluno sumiram** (conserto na v638): o Raphael mandou
duas fotos — em **Evolução → Corpo** a curva do peso aparecia só com os
pontinhos PRETOS e sem linha nenhuma; em **Evolução → Cargas** as barras
tinham sumido, sobrando os números no ar e as datas embaixo. Eram DOIS
defeitos da mesma família, cor que não chega:

1. **Token do painel vazou pro pacote do aluno** (desde a v620). A `PADFUNDO`
   dentro de `dadosAppAluno` é a lista dos 13 tons de fundo que viram o
   `:root` do app publicado — **outro documento**. A migração de tokens do
   painel trocou 6 deles por `var(--tk-sup2)`, `var(--tk-sup)`, `var(--tk-bd2)`,
   `var(--tk-trilha)`, `var(--tk-bd)`, `var(--tk-bd4)`, e o `CORC` padrão por
   `var(--tk-roxoTx2)`. Lá esses nomes não existem: o valor chega inválido e a
   variável fica **vazia** — medido no navegador, `--bg2`, `--bg3`, `--bg7`,
   `--bg8`, `--bg10`, `--bg11` e `--corc` voltavam string vazia. Sem `--bg7`
   as barras de carga ficam transparentes; sem `--bg2` os cards do app perdem
   o fundo. Voltaram a ser **hex cravado**, com o aviso no código.
2. **Cor de SVG entrando por ATRIBUTO** (desde a v550). `stroke='var(--corc)'`
   e `fill='var(--corc)'` são atributos de apresentação, e **atributo não lê
   variável CSS**: o valor vira inválido e o navegador cai no inicial —
   `stroke: none` (a linha some) e `fill: black` (o ponto some no fundo
   escuro), que é exatamente a foto que ele mandou. Viraram
   `style='stroke:var(--corc)'` (propriedade CSS) na curva do peso (linha,
   pontos e números) e no anel de XP do nível, que estava invisível pelo mesmo
   motivo.

⚠️ A regra geral: **o pacote do aluno não é CSS do painel**. Tudo que sai de
`dadosAppAluno` é DADO que vira o `:root` de outro documento — cor ali é hex,
sempre. Duas travas novas: `test-tokens-painel.js` recorta o corpo de
`dadosAppAluno` e reprova qualquer `var(--tk-…)`/`var(--pt-…)` (pega os 7
vazamentos da v620), e `test-app-sintaxe.js` varre o app montado atrás de
`fill=`/`stroke=` com `var()` dentro, ignorando quem entra por `style=` (pega
as 7 ocorrências da v550). As duas foram testadas contra o código quebrado
antes de entrar.

**Agenda: um calendário só, e os sub-menus viram fita** (a partir da v635): o
Raphael abriu a Agenda e disse "uns 4 calendários diferentes pra mesma coisa".
Eram mesmo: a **grade da semana**, o **calendário do mês**, o **um dia por vez**
do celular e o seletor de data do formulário de agendar — 3591 px de altura —
e o bloco de **pedidos de horário aparecia duas vezes** (a faixa roxa e um card
idêntico no meio). Agora é UM: o botão **Semana | Mês** (`data-agvis`, escolha
em `mtapp:ptAgVis` gravada com `localStorage` direto) troca o zoom do mesmo
calendário. Semana = a grade de horários — no celular ela é o "um dia por vez",
que é a MESMA visão noutro tamanho, quem escolhe é o CSS. Mês = o calendário do
mês com a contagem por dia, pra achar uma data longe. Ficou em **1714 px**.
⚠️ o card do mês não pode ser escondido pelo atributo `hidden`: o `fazSubAbas`
mexe no `hidden` de TODO `[data-agsec]` e o devolveria pra tela — quem manda é
`style.display`, que ganha do `hidden`. ⚠️ o botão Semana|Mês aparece em DOIS
cabeçalhos (o da semana no computador, o do dia no celular, porque lá o
`.altopo` é `display: none`), então ele é um molde com `data-agvis` e um
listener delegado — id repetido em dois pontos do DOM não existe. O
`#btnIcsP` (enviar pro calendário do celular) saiu do card do mês: ele vale pra
agenda inteira, não pra uma das visões. Ganchos: `window.__agVis`.

**Os sub-menus viram fita de sublinhado** (v635): o Raphael reparou que todos
eram pílula roxa e que a ficha do aluno tinha virado outra coisa. Estava certo
— e a exceção era justamente a que seguia o desenho: a tela 04 do handoff mostra
aba de **46 px com sublinhado roxo de 2 px e sem fundo**, que eu só tinha
aplicado no `#pfAbas` do celular (v625). Agora `.abas` inteiro segue o desenho,
computador e celular, e no celular a fita **rola de lado** em vez de quebrar em
fileiras. ⚠️ o `apps.css` faz `.abas` em pílula e **não pode ser tocado** (veste
o Nutri e o portal); a regra vive no `<style>` do painel. ⚠️ `.ativa` tem de vir
DEPOIS de `:hover` — mesma especificidade, quem vem por último ganha, e sem isso
passar o mouse apagava o sublinhado roxo. ⚠️ o bloco de celular do `.abas` está
logo depois da regra base **de propósito**: o que estava lá em cima (no bloco de
640 px) não valia, porque a base de 46 px vinha depois no arquivo.

**Montar ficha: escolher exercício virou tela à parte** (a partir da v634): com
tudo na mesma página a ficha aberta media **1594 px** de altura — quatro telas
de celular de controles na cara ao mesmo tempo, e o Raphael disse "ainda está
pouco intuitivo". Ele escolheu o fluxo de **uma coisa por vez**: a ficha aberta
mostra só os exercícios dela e o botão **+ Adicionar exercício**; o botão abre
uma **tela cheia** (`.tdesq.abrir`, `position: fixed`) com um trabalho só —
buscar → escolher → séries/reps/descanso → Adicionar —, e somar o exercício
volta pra ficha. Ficou em **941 px**. A tela cheia não guarda estado: a classe
`abrir` entra no DOM que já está na tela (nada de re-render, a rolagem não se
perde) e o `renderFichas()` do "+ Adicionar" reconstrói tudo, o que **fecha
sozinho** — que é justamente o caminho de volta. No computador nada muda: lá o
escolher é a coluna da esquerda, sempre à vista, e o botão e o cabeçalho da
tela cheia ficam `display: none` por `@media (min-width: 901px)` (⚠️ não por
regra solta: a base vinha DEPOIS do bloco de celular no arquivo e, com a mesma
especificidade, escondia o botão nos dois tamanhos). A **parte 2 do dia (A2)**
saiu do "escolher" e foi pra dentro da ficha — ela é conteúdo da ficha, não
passo de escolher exercício. E os dois formulários de somar (exercício e A2)
passaram a usar a MESMA linguagem do editor: rótulo em cima, campo embaixo.
Antes era `☆ [3] × [12] ⏱ [60] s [obs] [+ Adicionar]` numa fileira de caixinhas
sem nome, que num celular de 390 quebrava com o "s" sozinho numa linha.
⚠️⚠️ **A armadilha que custou caro**: o `.card` do `apps.css` tem
`animation: tqUp .4s … both`, e o `both` deixa o transform final **computado**
(matriz identidade) em vez de `none`. Transform, mesmo identidade, **cria bloco
de contenção** — então o `position: fixed` colava no CARD e não na tela (a
"tela cheia" saía com 364×1097 num aparelho de 390×844). Enquanto ela está
aberta, `body.tela-escolher .card { animation: none; transform: none }`.

**Montar ficha: a gaveta cobria a ficha e havia 4 jeitos de editar** (conserto
na v633): o Raphael abriu no celular e mandou a foto — os exercícios apareciam
**cortados atrás** do "Buscar nos 1780 exercícios". A gaveta de baixo da v627
(`position: sticky; bottom: 0`) ficava **por cima** da ficha e não tinha como
fechar: bonita na maquete, inviável no polegar. Agora `.tdesq` é bloco normal
logo abaixo da ficha — a ordem de leitura é a de uso (vê a ficha → escolhe o
próximo exercício) e nada cobre nada. ⚠️ junto veio de novo a armadilha do
`grid-template-columns: 1fr`: a fita de 3 seletores de 132px empurrava a coluna
pra 484 px numa tela de 390 (`overflow-x: auto` zera o mínimo automático de
item de FLEX, não de coluna de grid) — virou `minmax(0, 1fr)` + `min-width: 0`
nos filhos.

E a MESMA linha tinha **quatro linguagens de edição** ao mesmo tempo: um `≡`
que parecia arrastar e **não arrastava** (`cursor: default`), um `<select>` de
tipo de série colado no nome, três textos que abriam `prompt()` do navegador
(séries, descanso, obs) e as setas. Agora a linha inteira é **um botão que abre
o editor daquele exercício** — séries, repetições, descanso, tipo de série e
observação como campos de verdade, num lugar só (`data-tfld="fid:i:campo"`,
gravados no `change`). Fora do editor sobram apenas as três ações de POSIÇÃO
(↑ ↓ ✕), que são coisa diferente de editar. ⚠️ `exAberto` mora FORA do render,
porque `renderFichas()` reconstrói a lista a cada campo mexido — sem isso o
editor fechava na cara do professor; e só **um** editor abre por vez. Sumiram
`data-tsr`/`data-tdesc`/`data-tobs`/`data-ttecsel` e os quatro `prompt()`. O
nome da ficha também parou de aparecer **duas vezes** (tampa da gaveta + o
cabeçalho da coluna da direita, que agora só diz "~20 min de treino" e o botão
de apagar). Testes: `test-celular-painel.js` mede a sobreposição em 390 px com
a ficha ABERTA (e falha se `.tdesq`/`.tddir` nem existirem, pra não passar de
graça).

**Os hábitos viram média no perfil** (a partir da v632): o Raphael pediu "a
média de cada ícone que ele clica — dieta, sono, cardio e etc". São os quatro
botões do app (`HABS` = Água, Comida, Sono, Cardio) que gravam
`pthab[dia][i] = true` e voltam no `retorno.habitos`. Na aba **Check-ins** do
perfil (a mesma da v630 — nada de aba nova) eles viram um cartão cada, com a
média de **dias por semana**, o selo de melhorando/estável/piorando e o mesmo
gráfico de evolução das perguntas. A semana começa na **segunda** (regra dos
chips do Início) e a **semana em curso fica de fora da conta** — meia semana
contra semanas cheias faria todo aluno parecer que piorou na quarta-feira.
⚠️ o `grafico()` saiu de dentro do bloco dos check-ins e virou helper da função
inteira, porque agora serve os dois blocos; e `htmlCheckinsApp` passou a
devolver conteúdo mesmo **sem** questionário respondido (só com hábito).

**Montar ficha: o velho e o novo estavam juntos** (conserto na v632): o Raphael
disse que a tela estava "inviável", e estava — o cabeçalho novo da v617
("MONTANDO PRA <aluno>", *Gerar com IA*, *Salvar e publicar*) convivia com o
card VELHO logo abaixo, que repetia o nome do aluno num campo, trazia
*+ Nova ficha*, *WhatsApp*, *vale até*, *Ficha pronta* e — pior — um **segundo
botão de publicar** (`#tEnviaApp`, "Enviar pro app do aluno"). Dois botões pra
mesma ação e o nome do aluno em dois lugares. Agora as ferramentas moram todas
na **segunda fileira do próprio cabeçalho** (`.tdlinha`, `flex: 1 0 100%` pra
cair na linha de baixo do mesmo flex) e o `#tEnviaApp` continua no DOM — é a
ÚNICA rota pra nuvem, e o *Salvar e publicar* clica nele — só que `hidden`.
⚠️ o `apps.css` põe `width: 100%` em todo `<select>`: sem `width: auto` no
`.tdlinha > select`, o "Ficha pronta" tomava a linha inteira e a fileira virava
três andares. O rodapé mandava "selecione os exercícios da biblioteca
(abaixo)" — biblioteca que **não existe mais abaixo** desde que a busca passou
a viver dentro da gaveta de cada ficha; o texto foi corrigido.

**Corrida contínua E intervalada no mesmo treino** (a partir da v631): o
professor pediu uma folha só com as duas coisas. Entrou o tipo `misto` no
`#cbTipo` — com ele o formulário mostra os **dois** grupos de campos ao mesmo
tempo (`cbMostraCfg` deixou de esconder o grupo que não é o tipo escolhido) e o
resumo sai como "6 km · 35 min · pace 6:20 **+** 6× 45s forte / 75s leve". No
app, `crMontaBlocos` enfileira **aquecimento → parte contínua → tiros → volta à
calma**, nessa ordem (é a que o corpo aguenta); sem o player guiado, o
`pintaCr` roda a parte contínua e só começa os tiros quando passa do **tempo
alvo** dela — ou da **distância**, quando só há km prescrito — guardando o
instante em `cr.mistoT0` (zerado junto com o resto do estado, senão o treino
seguinte já nasceria "nos tiros"). A pausa automática fica **desligada** no
misto, igual ao intervalado: um treino com tiro não pode pausar sozinho no meio.
O resumo do cardio virou **um lugar só, dois gêmeos**: `cbResumo` no painel e
`alvoCardio` no builder leem as chaves longas (`dist/tempo/pace/reps/tiro/desc`)
e `crAlvoTxt`, dentro do app, lê as curtas (`d/tp/p/r/ti/de`) — mexeu num,
confira os outros. A `chat-envia` aprendeu o `misto` no prompt de corrida e a
`peneiraCardiosIA` aceita o valor.

**O quadro do trajeto parecia sumido** (conserto na v631): o "mapa do treino"
não tinha sumido — a frase **"Ligue o GPS pra desenhar o trajeto"** era
desenhada com `700 22px` cravado e, num celular de 390 px, saía **cortada nas
duas pontas** ("gue o GPS pra desenhar o trajet"), o que faz o quadro parecer
quebrado. Agora ela encolhe até caber (`measureText` num laço, piso de 11px).
⚠️ é canvas: `var()` não existe lá, e o tamanho tem de ser calculado na largura
CSS (`W = cv.width / dpr`), não na do backing store.

**Questionário respondido vira métrica do aluno** (v630): a aba **Check-ins**
da ficha (`data-pfa="quest"`, que já existia — o Raphael pediu explicitamente
pra NÃO nascer aba nova) mostrava número solto: um rabisco laranja sem eixo e
um "média 3,5 · 3,5" em letra miúda. Agora cada pergunta **com nota** vira um
cartão (`.qscard`) com o valor de hoje em número grande, o selo do estado
(↑ melhorando / → estável / ↓ piorando — sempre com a PALAVRA junto, cor
sozinha não conta história) e um **gráfico de linha** com eixo, escala, a média
do mês anterior tracejada como régua e a data das duas pontas. Regras do
gráfico: uma série por gráfico, então **sem legenda** (o título do cartão diz de
quem é a linha); a escala Y sai da **pergunta** (`escalaDe` lê `questPerguntas`:
0 a 10 do `linear`, os pontos das carinhas do `emoji`), nunca do mínimo/máximo
do aluno — senão uma variação de 0,2 vira montanha; rótulo direto só onde vale
(o número grande e a régua "antes 7,5"), porque número em todo ponto é ruído;
alvo de mouse largo (`<rect>` transparente com `<title>`) porque o pontinho de
2,4 px é pequeno demais. Pergunta de **texto** não vira gráfico: mostra a última
resposta, as três anteriores com data e a resposta mais comum. A lista crua foi
pra dentro de um `<details>` — ela é a prova, não o resumo. **"Estável" é ROXO,
não laranja**: laranja é o token de atenção e aluno constante não é problema.
⚠️ a cor entra por `style='stroke:var(--pt-ok)'` (propriedade CSS) e nunca por
`fill='#...'` — atributo de SVG não entende `var()` e sem isso o gráfico não
acompanha o modo claro; os testes que liam `fill='#4ade80'` passaram a ler
`data-cor='ok'` (e com `['"]`, porque `innerHTML` devolve aspas duplas).
⚠️ `var esc = escalaDe(...)` **sombreava a função `esc()` do painel inteiro**
(`var` sobe pro topo do escopo) e derrubava a aba com "esc is not a function" —
virou `escP`. O demo passou a mandar cinco perguntas com história (disposição
subindo, dor caindo, sono balançando, motivação em carinhas e um recado
escrito) e as perguntas do cadastro batem com as respostas, senão a escala do
gráfico cai no plano B.

**A camada de baixo do painel** (v629): o Raphael olhou o redesenho pronto e
disse "tem muita coisa que está diferente". Estava — e não era tela nenhuma: era
o `apps/apps.css`, a folha COMPARTILHADA (portal, Nutri, Personal). Ela dava ao
painel um `.card` com sombra e **sem borda**, um `.card h2` de **10,5px em CAIXA
ALTA cinza** (que inverte a hierarquia: o título do card ficava menor que o
texto dele), `.btn` em **pílula de 46px**, `.btn.sec` sem borda, `.muted` num
cinza fora da paleta e `.corpo` com 48px de lado. O handoff pede o contrário em
todos. Como as 16 telas usam essas classes, **um desvio ali reaparecia em todas
de uma vez** — por isso cada tela refeita continuava "diferente". Agora o
`<style>` do `personal.html` reescreve essa base com os valores do desenho
(card com borda de 1px e sem sombra, padding 17/18, título 15,5px caixa mista,
botão 44px raio 11, secundário com borda, WhatsApp virou secundário com tinta
verde, conteúdo com 26px) e aponta os tokens velhos do apps.css (`--fundo`,
`--card`, `--linha`, `--texto`, `--cinza`, `--cinza-2`) pros `--pt-*`. **Não
mexa no apps.css** — ele veste o `nutricao.html` e o `index.html`, que não
passaram pelo handoff. `.corpo` ganhou `--corpo-px`/`--corpo-py` porque a faixa
roxa do Início precisa DESENCOSTAR exatamente do respiro dela pra ir de ponta a
ponta (e o `:has()` desliga o `margin-top` negativo quando existe um aviso
acima: modo teste, boas-vindas, assinatura). Junto vieram: contador da aba vira
selo de tinta (`.cnt.leve` = só o número pra "quantos alunos", roxo pro chat,
`.cnt.aten` pro que pede ação hoje — pílula roxa chapada com texto branco é
justamente o que a regra 2 proíbe), "Módulo Personal" sai da CAIXA ALTA, "Modo
claro" desce pro pé da gaveta (`margin-top: auto`), o grupo MENOS USADO vira
lista de texto (ícone só volta com o menu encolhido), a `.topo` vira faixa fina
de 17px (o desenho não tem cabeçalho: a tela começa na faixa roxa), a `.dnota`
ganha fundo `--pt-caixa` com o botão na mesma linha, e a busca de Alunos divide
a linha com os filtros e ganhou a lupa. Três cores velhas que só apareciam pelo
JS foram trocadas pelos tokens nos **Relatórios** (`#16a34a`/`#d97706`/`#dc2626`
e o `#faf9fc` que fazia os KPIs do mês saírem em cartões BRANCOS no painel
escuro). ⚠️ `montaSitePro` e o laudo imprimível continuam com hex cravado **de
propósito** — são documentos autônomos, `var()` não existe lá. A suíte
`test-tokens-painel.js` passou a medir a base (borda, sombra, padding, tamanho
do título, altura e raio do botão) **na geometria calculada**, não na classe.

**Painel repaginado: Alunos e ficha do aluno** (a partir da v615): telas 2a e
2b do canvas. **2a** — a lista virou tabela (`.altab`/`.alrow`) com cabeçalho
(`#alResumo` = "N ativos · M sumindo"), busca por nome/telefone (`#alBusca`) e
os filtros **Ativos / Sumindo / Devendo / Encerrados** (`alEstado`). Cada linha
traz plano + situação do pagamento, treinos do mês com barra, idade da ficha e
próxima sessão, e **a ação que resolve o estado dela** (Cobrar / Montar ficha /
Chamar / Zap) — regra 1 do handoff. ⚠️ `alEstado` usa a MESMA conta do
Financeiro (não pagou o mês corrente + passou do vencimento); a primeira versão
usava `dividaDe`, que soma o histórico inteiro e marcava 22 de 24 como DEVENDO
ao lado de "Pago dia 5". ⚠️ `carteiraPT().saldo` é **dinheiro**, não quantidade
de aulas. A linha mantém a classe `.aluno-pt` porque outros trechos e testes
miram nela. **2b** — cabeçalho roxo (`.pftopo`) com voltar, "Editar cadastro",
nome, a linha objetivo · tempo de casa · plano · situação · idade, dois selos,
as **4 ações do dia** (Montar treino, chat, financeiro, agenda) e a próxima
sessão; aba nova **Resumo** (primeira, `data-pfa="resumo"`) com 4 números
(treinos no mês, peso, batimento, check-in), a Semana do aluno em 7 chips e a
Ficha atual. O `←` antigo sumiu: quem herdou o id `pfFechar` (e o listener) é o
"‹ Alunos". Ganchos: `window.__alBusca`. **Faltam 10 telas** (2c-2e, 3a-3d,
4a-4e).

**Painel repaginado: Início e menu** (a partir da v614): primeiro lote do
canvas *Painel do professor* (16 telas, handoff em `design_handoff_painel_personal`).
**A tela 1b foi descartada** — o Raphael escolheu a 1a, e o registro disso mora
no próprio arquivo de design. Entregue: (1) **menu cortado em dois** — as 6 do
dia a dia em cima (Início, Alunos, Agenda, Financeiro, Treinos, **Chat, que
subiu**) e as outras 10 sob `MENOS USADO` (`.navgrupo` + `.pouco`), com
contador `.cnt` em Alunos/Agenda/Chat; a gaveta `.abas-pt` **não** virou pílula,
como o handoff pede. (2) **Início na 1a**: faixa roxa (`#dashTopo`) com a
próxima sessão — `faltaPra()` dá o rótulo "AGORA EM 40 MIN"/"MAIS TARDE" — mais
`Resolver hoje` (`pintaResolver`: cobrança vencida pela MESMA regra do
Financeiro, ficha sem prescrição nova, e conversa parada que entra depois por
`resolverChat()`, porque o chat é da nuvem e o render é síncrono), a linha do
tempo do dia (`.dlinha`, próxima com faixa roxa, feita esmaecida, quem faltou
com "Cobrar aula") e a coluna da direita com o mês (`pintaMesDash`) e o Radar.
(3) **Cinco blocos saíram do Início pra Relatórios** → sub-aba nova *Do dia a
dia* (`data-rela="geral"`): KPIs, metas, movimentação/indicadores, fechamento,
aniversários e alertas — o Início mostra só o que muda decisão hoje, e uma nota
com atalho diz pra onde foram. ⚠️ Ao semear dados em teste use
`localStorage.setItem` direto: `MTStore.write` dispara a sincronização e, com
mock estreito de nuvem instalado por outro bloco, estoura `upsert is not a
function`. Ganchos: `window.__dashPT` ganhou `topo`, `resolver`, `mes`, `falta`.
**Faltam as outras 12 telas** (2a-2e, 3a-3d, 4a-4e).

**Seis defeitos de COMPUTADOR do handoff** (a partir da v628): dois agentes
compararam o desenho de desktop (telas 01, 03 e 04) com o implementado a
1280 px e mediram o que estava fora. Consertados: (1) o botão **Ver semana**
usava `float: right` **dentro do `<h2>`** e o float invadia a caixa da linha
seguinte — a primeira linha do "Seu dia" media **357px** contra 455px das
outras; virou flex e agora todas medem 456; (2) o **cabeçalho da tabela de
Alunos não batia com os dados** — até **78px** de erro na coluna PRÓXIMA,
porque as duas faixas usavam frações e a 6ª coluna do cabeçalho é um `<span>`
vazio enquanto a da linha tem 94px de botões; larguras fixas nas duas, erro
agora **0**; (3) as regras `.alrow.devendo .alav` / `.sumindo` viviam **presas
no bloco de celular**, então no computador todo avatar saía roxo; (4) o botão
do Resolver hoje saía com **46px** porque o `min-height: 46px` do `.btn` do
`apps.css` vencia o `height: 40px`; (5) o nome com selo quebrava em duas linhas
(`align-items: baseline`); (6) "publicada esta semana" não cabia na coluna
FICHA e virava três linhas — agora é "esta semana".

**Montar treino no celular** (a partir da v627): tela 20 — a última das sete.
Regra 6 do colapso: o formulário de escolher exercício vira **gaveta de baixo**
(`border-radius: 22px 22px 0 0`, `box-shadow: 0 -18px 40px rgba(0,0,0,.5)`,
puxador de 38×4), com a ficha visível atrás. A ficha (`.tddir`) ganha
`order: 1` e o escolher (`.tdesq`) `order: 2`, e a cascata de 3 seletores vira
**fita que rola** — empilhada, ela comia 180px da gaveta e a ficha sumia.
⚠️ `position: sticky`, **não** `fixed`: com duas fichas abertas ao mesmo tempo,
`fixed` daria duas gavetas empilhadas no mesmo pedaço da tela.
⚠️ **Desvio consciente**: o desenho também apaga os controles de cada exercício
(setas, ✕ e o seletor de tipo de série) e faz um toque na lista somar direto.
As duas coisas juntas deixariam a tela **sem nenhum caminho** pra ajustar série,
repetição e descanso depois — o próprio handoff avisa disso na anotação. Então
a gaveta entra (é o ganho real: põe o "escolher" no alcance do polegar com a
ficha atrás), mas os campos de série/repetição/descanso ficam **dentro dela** e
os controles do item **continuam** no card. Bonito e sem como editar não serve.

**Financeiro e Chat no celular** (a partir da v626): telas 21 e 22 do handoff.
**21** — o dinheiro do mês vira um **card roxo** (`#pgHero`, gradiente
`--pt-grad-card`, número de 34px, meta, barra e a linha "a receber ·
vencidos"), lendo os MESMOS números do card do mês do Início
(`dadosDoMes` + `config.metasPT`), então as duas telas nunca contam diferente.
Cada atrasado passa a caber em **duas fileiras** — quem é + quanto em cima, os
três botões de 38px embaixo — e o cabeçalho troca o dinheiro pelo NOME da tela
(era o mesmo número duas vezes na mesma dobra). O histórico de 6 meses e o
"Como você recebe" ficam atrás de uma porta tracejada (`#pgVerMais`) — a regra
9 do colapso. **22** — a conversa vira **tela cheia**: a lista some, entra o
"‹" (`#chatVolta`), o chip de contexto vira faixa de ponta a ponta, as bolhas
perdem o avatar (quem fala já está no cabeçalho) e ganham o rabinho
(`16px 16px 16px 5px`), as respostas rápidas viram fita que rola e o Enviar
vira o quadrado de 46px. Antes o celular herdava o layout de computador: a
lista inteira empilhava em cima e a conversa só começava depois de 1.600px —
tocar num aluno não mudava nada na tela.
⚠️ **Duas coisas do desenho 22 continuam fora, por não existir dado**: o
"digitando…" (o chat é polling de 25 s numa tabela sem coluna de estado — não
há canal de presença) e o selo de reação "💪 1" (`app_chat` não tem coluna de
reação; a tabela de reações é exclusiva do feed). É a mesma recusa da v618.
⚠️ Mais dois estilos **inline** encontrados e movidos pro CSS (`#chatTitulo`,
`#chatSub`) — media query não vence inline, e o nome do aluno saía em 17px no
celular apesar da regra de 14px. Já são cinco casos: é o defeito mais comum
deste arquivo.
⚠️ `display: flex` numa caixa de texto corrido quebra a FRASE em itens: o
`<b>Ver mais</b>` da porta do Financeiro sumiu numa caixa de 38px até a
`.pgmais` virar `display: block`. Terceira vez (a `.dnota` na v621, o `<label>`
do questionário na v623) — texto corrido nunca é flex.

**Ficha do aluno e Agenda no celular** (a partir da v625): telas 18 e 19 do
handoff. **18** — a faixa roxa vira cabeçalho **full-bleed**, o avatar é
quadrado de 54px (raio 17, não círculo), o nome sobe pra 21px/900, as 4 ações
do dia ficam numa fileira de 44px (a principal branca com texto
`--pt-roxo-fundo`), as 8 abas viram **fita de sublinhado que rola** e os 4
números viram grade **2×2**. ⚠️ Três estilos **inline** do HTML (`#pfAbas`,
`#pfTitulo`, `#pfFotoBtn`) e três `!important` mantinham as regras de celular
**mortas desde a v563** — media query não vence estilo inline. Tudo foi pro CSS.
⚠️ Desvios conscientes, todos por não perder função: as **8 abas ficam** (o
desenho mostra 5, e cortar sumiria com App do aluno, Cadastro e Frequência — o
próprio desenho mostra a 5ª cortada na borda, ou seja, prevê rolagem); o "···"
**é** o `#pfAcoesBtn` que já existe (trocar por um quadradinho novo tiraria as 6
ações de dentro dele); o card da próxima sessão fica **dentro** do roxo, com os
tokens `--pt-sobre-roxo-*` (no computador a mesma informação é uma linha dentro
do roxo, e é o mesmo elemento no HTML — duplicar o DOM seria pior); e o tile
"DOR NO OMBRO" do desenho **não existe**, porque a dor mora na resposta do
questionário e nenhuma consulta do Resumo a traz — fica CHECK-IN, que é real.

**19** — a grade de 7 colunas vira **um dia por vez** (regra 5 do colapso):
`pintaAgendaDia()` desenha 7 chips de data com **pontinho** de estado (laranja =
pedido de horário esperando) e a lista corrida do dia embaixo, cada linha com a
ação DENTRO dela (Cobrar na falta, Abrir ficha + Feita na próxima, Oferecer na
vaga). As duas visões leem os **mesmos dados** (`dias`, `noIntervalo`) — nunca
contam diferente — e quem escolhe é o CSS em 900px. `agDiaSel` guarda o dia
escolhido; sem ele na semana à vista, vale hoje.

**Handoff do painel: tokens e as telas de celular** (a partir da v624): chegou o
pacote `design_handoff_painel_personal` (22 PNGs em 2×, o HTML de cada tela
**recortado com os estilos inline**, `tokens-painel.css` e as 9 regras de
colapso). O que ele traz de novo em relação ao canvas da v614–v622 são as **7
telas de CELULAR** (02 Início, 17 Alunos, 18 Ficha, 19 Agenda, 20 Montar
treino, 21 Financeiro, 22 Chat) — justamente o que faltava.

**Tokens** — o `:root` passou a ser o bloco do handoff, com os nomes do desenho
(`--pt-*`). Os nomes `--tk-*`, usados em centenas de lugares desde a v620,
viraram **apelidos** (`--tk-sup: var(--pt-card)`): mesma cor, zero renomeação, e
o modo claro passou a ter **um lugar só** — apelido de variável CSS se resolve
na hora do USO, então redefinir `--pt-txt-3` no tema claro muda o `--tk-tx3`
junto. Regra 1 do handoff (**nenhuma cor nova**) virou teste:
`tests/test-tokens-painel.js` varre o `<style>` **e** os `style=` do HTML e
reprova hex fora da paleta. Foram 11 cores inventadas eliminadas (um azul
`#60a5fa` que não existia em paleta nenhuma, um `#f8717199` de 8 dígitos, dois
vinhos de borda, os cinzas do menu claro). Destaque e estado são **tinta
transparente sobre um token**, nunca hex novo.

**Tela 02 (Início no celular)**: a faixa roxa **encosta no topo e nas bordas** —
o cabeçalho do app (`.topo`) some no celular, porque cada tela do celular tem o
próprio cabeçalho (é assim nas telas 02 e 17). "+ Novo aluno" vira o quadrado
de 40px, "Marcar sessão" sai (a Agenda está na barra de baixo), o card do
Resolver hoje deixa de ser coluna e vira **linha** (bolinha 8px + texto +
botão), e **só o primeiro card leva o botão cheio de roxo**. A saudação passou
a ser "Bom treino, <nome>" lendo `mtapp:perfil.nome` — ⚠️ `config.nome` NÃO
serve: no cadastro pela nuvem o campo se chama "nome do seu studio" e sairia
"Bom treino, TORQUE".

**Tela 17 (Alunos no celular)**: a tabela vira **lista de ponta a ponta** —
avatar 40px tingido pelo estado, nome com o selo colado (`DEVE 800`, `SUMINDO`),
a próxima sessão num canto de ~70px (por isso `alProxima` ganhou o campo
`curto`: "18:00" hoje, "amanhã", "qui") e **uma** linha de resumo embaixo
(`.almob` = ficha · treinos do mês · situação). Linha de 232px → **67px**.
Os botões só aparecem no aluno **aberto** (regra 7 do README): tocar na linha
abre, tocar de novo fecha; no computador nada disso vale. ⚠️ o bloco de tablet
virou `@media (min-width: 901px) and (max-width: 1000px)` — sem o piso, ele
vinha depois no arquivo e reescrevia `.alrow` de volta pra grade.

**O painel no CELULAR** (a partir da v623): o Raphael mandou a foto do celular
dele e o cabeçalho da ficha do aluno estava destruído — o **nome do aluno com
largura ZERO** (some, porque tem `nowrap` + `overflow:hidden`) e a linha do
objetivo com **uma palavra por linha**, os botões vazando por cima. Causa: o
redesenho da v614–v622 foi revisado numa tela de 1280 px, e todas as linhas
novas nasceram como **flex sem `flex-wrap` e sem `min-width: 0`** — quando o
vizinho de largura fixa não cabe, a coluna do texto é espremida até zero em vez
de a linha quebrar. Consertados, todos da mesma família: `#pfTopo` (vira grade
de 2 fileiras até 900px; o layout saiu do `style` inline pro CSS, senão media
query nenhuma vence sem `!important`), `.altopo` (a URL da Minha página não tem
espaço, tinha 411px de largura mínima e empurrava a **página inteira** pra
518px — até a barra de menu fixa esticava), `.dlinha` (o nome do aluno na linha
do dia em 93px), `.fdcab`, `.kv-pt` e o `<label>` do questionário (`display:flex`
quebra a FRASE em vários itens de flex — o mesmo defeito da `.dnota` na v621).
A **lista de Alunos** virava um prédio de 6 andares no celular (232px por
aluno, dois alunos por tela): os quatro valores do meio ganharam o embrulho
`.aldet`, que é `display: contents` no computador (a tabela fica idêntica) e
**uma linha corrida** no celular — 108px por aluno.

Dois defeitos que não eram só de celular saíram junto: (1) na **Agenda**, dois
alunos no MESMO dia e hora levavam o mesmo `grid-column`/`grid-row` e ficavam
**um por cima do outro** — o professor via só o de cima; agora a célula é uma
pilha (`.agpil`); (2) tabela dentro de caixa que rola (`.tabrola`) precisa de
`white-space: nowrap` nas células, senão o navegador aperta as colunas e cada
número quebra em duas linhas em vez de a caixa rolar.

⚠️ Lição que virou suíte: `tests/test-celular-painel.js` varre as 16 telas (e
as sub-abas) num celular de 390 px e mede **o que o professor VÊ** — texto com
largura zero, rótulo curto partido em duas linhas, caixa com menos de 1,6
palavra por linha, irmãos sobrepostos e página rolando de lado. Contar linha é
com `Range.getClientRects()`, **nunca** altura-da-caixa ÷ entrelinha: o padding
de um botão de 44px vira "3 linhas" e a suíte acusa 1490 falsos positivos.
Guardas obrigatórias: pular quem tem `input/select/button/svg` dentro (a altura
do controle entra na conta), pular `display:inline` (o rect de um inline que
quebra é a UNIÃO das linhas, então dois `<b>` na mesma frase "se cobrem") e
pular o que está dentro de `<svg>` (lá sobrepor é o desenho).
⚠️ `white-space: nowrap` num valor é armadilha: pôr no `.kv-pt strong` fez o
valor composto "cartão auto R$ 2.920 · pix R$ 2.140 · dinheiro R$ 3.310" virar
342px intocáveis e empurrar a página. Quem quebra é a LINHA, não o valor.
⚠️ `grid-template-columns: 1fr` deixa a coluna crescer até o min-content do
conteúdo: use `minmax(0, 1fr)` onde um texto sem espaço possa entrar.

**Demo do painel com nuvem simulada** (a partir da v622): o demo público
(`demo-personal.html`, já no ar) mostrava o painel inteiro **menos três telas** —
Chat, Questionários e Comunidade vivem da nuvem e, sem conta, só sabiam dizer
"entre na sua conta". Agora `assets/demo-nuvem.js` troca o `MTStore.cloud()` por
um cliente de mentira resolvido **em memória** (tabelas `app_chat`,
`app_checkin`, `app_quest`, `app_feed`, `app_agenda`, `app_aluno`…, com
`eq/gte/in/order/limit/single` e `insert/update/upsert/delete` de verdade). Os
nomes saem do `mtapp:ptStudio` que o próprio demo semeia, então o Chat fala com
a Carla que está na lista de Alunos. **Trava dupla**: só liga com
`mtapp:ptDemo` **E** `mtapp:ptDemoNuvem`, as duas gravadas só pelo
demo-personal.html — o professor de verdade não tem nenhuma das duas. Ele
**não** mexe em `sync.client`, então o motor de sincronização segue desligado
(o demo não escreve em banco nenhum), e embrulha o `MT_FUNCAO.chama` pra
**nenhuma Edge Function rodar** — demo público não dispara WhatsApp, link de
cobrança nem gasta IA. `minha_assinatura` devolve `null` de propósito, pra a
faixa "Modo teste" continuar dizendo a verdade. ⚠️ os instantes são gravados
**sem "Z"**: o Chat lê a hora por fatia de string, mas a Comunidade lê com
`new Date(iso).getHours()` — com Z, o post das 07:58 apareceria às 04:58. O
demo passou a semear `appTokenP` (`dtk1`…`dtk24`), `appPubEm`/`appVer` e
`feedOn: true`; não adianta deixar aluno "pendente" de propósito, porque
`autoPublicaApps` republica sozinho ao abrir. Suíte nova: `tests/test-demo-painel.js`
(aborta e conta qualquer chamada a `*.supabase.co` — vazamento aparece na hora).

Três defeitos do painel apareceram na revisão do demo e foram consertados
junto: (1) o **nome do aluno na lista nova não abria a ficha** — o
`data-abreperfil` da tabela da v615 só tinha dono no bloco de pacotes de
serviço, noutro pedaço do painel, então o alvo mais óbvio da linha não
respondia e o único caminho era o menu "···"; (2) os tiles **PESO**,
**BATIMENTO** e **CHECK-IN** do Resumo da ficha liam `a.retorno`, campo que
**nada no painel gravava** — agora `pfResumoNuvem(a)` busca `app_checkin` (o
mesmo lugar da tela "A semana") e o `retorno` do `app_aluno`, guarda a cópia
local com `S.write` (ela também alimenta os blocos de evolução do pedido da IA)
e troca só o tile pintado, com `poeKpi`, pra não repintar o resumo e virar
laço; no demo vale `a.demoRetorno` como fonte; (3) ficha publicada nesta semana
dizia "0 semanas" — agora diz "publicada esta semana".

**Menu do computador retrátil + revisão visual** (v621): o professor encolhe a
gaveta no botão do cabeçalho (`#btnMenuFino`) e ela vira uma faixa de **66 px**
só de ícones — a grade da Agenda e as duas colunas de Montar treino ganham a
largura. O rótulo **não sai do documento**: vira `font-size: 0`, então o leitor
de tela continua lendo "Início" e o `title` de cada botão é posto uma vez a
partir do próprio texto (nada de repetir 17 rótulos na mão). A escolha fica em
`mtapp:ptMenuFino`, gravada com `localStorage` direto — preferência de tela não
passa pelo `S.write`, que sincroniza. No celular nada muda: lá o menu já é a
gaveta do ☰, e o botão de encolher some.

A revisão tela a tela achou cinco defeitos que os testes não pegavam porque são
de aparência: (1) `nav .cnt`, `nav button.pouco` e `nav button.pouco .mi` da
v614 miravam `nav`, mas a gaveta do computador é uma `<div class="abas-pt">` —
o contador nunca virou pilha roxa e o grupo "menos usado" nunca ficou compacto;
(2) `.abas-pt button` (classe+elemento) vencia `.mcab-bt` e engolia o botão de
encolher; (3) `.dnota` era `display: flex`, então texto corrido com `<b>` no
meio virava três itens e a frase quebrava em pedaços — agora o padrão é bloco e
quem precisa do botão à direita pede `.dnota.lado`; (4) sem nuvem, o título do
feed e o avatar do chat ficavam com um traço solto; (5) o `letter-spacing`
negativo dos números gigantes vazava no `<small>` e comia o espaço entre as
palavras ("kcalemrepouso").

**Modo claro do painel** (v620, tela 3d): as telas novas (v614–v619) cravavam o
hex escuro na mão, então o tema claro não alcançava nenhuma delas. Agora a
paleta do painel é **um token por papel** — `--tk-sup`/`--tk-sup2`… (superfície),
`--tk-bd`… (borda), `--tk-tx`…`--tk-tx6` (texto), `--tk-ok`/`--tk-erro`/
`--tk-aten`, `--tk-roxoFraco`/`--tk-roxoTx` — definidos no `:root` e
**redefinidos** em `html[data-tema="claro"]`. Trocar de tema é só trocar esses
valores; o roxo da marca (#7c3aed) não muda, como manda o handoff.
⚠️ Três lugares NÃO podem levar token e continuam com hex cravado:
(1) **atributo de SVG** (`fill='…'`, `stroke='…'`) — atributo não entende
`var()`, só a propriedade CSS entende; (2) **`montaSitePro`**, que gera a página
de vendas publicada — documento autônomo, lá esses nomes não existem; (3)
canvas, que também não entende `var()` (o painel não usa, mas o app do aluno
usa). O `.sw2` precisou de `html[data-tema="claro"] input[type="checkbox"].sw2`
porque o `apps.css` tem `html[data-tema="claro"] input[type="checkbox"]
{background:none}`, mais forte que a classe — sem essa regra o interruptor
sumia no claro. O teste mede a **cor calculada** de cada superfície nos dois
temas (a lição da v612: contar o que o professor VÊ, não a classe).

**Painel repaginado — as abas de fundo** (v619): **4a Configurações** ganhou a
aba **Resumo** (a primeira): um card por grupo dizendo o próprio ESTADO
(Receber dos alunos com o provedor, WhatsApp oficial, App dos alunos com quantos
usam), o que liga/desliga virou **interruptor** (`.sw2` — precisa da regra
`input[type="checkbox"].sw2` porque o `apps.css` tem um seletor de atributo mais
forte que a classe sozinha) e a tela **diz em português** que chave e token
nunca voltam pra ela. **4b Personalização** ganhou o cabeçalho "A cara do seu
app" com *Publicar pros N* (o MESMO `publicaAppsPendentes` de sempre) e cada
foto por tipo agora diz **quantas fichas ela atende hoje**. **4c Relatórios**:
a sub-aba *Do dia a dia* abre com movimentação/indicadores/aniversários em três
caixas, *Sessões por semana* com as faltas empilhadas e os *Alertas do studio*
ao lado; o mês e o *Mandar fechamento* subiram pro cabeçalho. ⚠️ `#bNiverP` e
`#relAlertas` são **movidos** (appendChild) pras caixas novas e voltam pro
`#relGuarda` antes de cada repintura — sem isso o `innerHTML` apagaria elementos
que outro trecho do painel ainda preenche. **4d Comunidade**: cabeçalho com a
contagem da semana e o interruptor do feed, e cada post virou card com avatar,
"hoje 07:58 · Treino B", texto entre aspas e a moderação dentro dele. **4e Minha
página**: o endereço publicado no topo, com *Copiar link* e *Abrir página* — e,
onde o desenho mostrava "184 visitas · 6 pedidos", a tela **diz que o painel
ainda não conta visitas nem pedidos**, porque a página é HTML estático e quem
pede aula cai no WhatsApp. Número inventado não entra.

**Painel repaginado — Avaliação, Questionários e Chat** (v618): **3a** — a aba
*Histórico e evolução* das Avaliações abre com as DUAS últimas medições
comparadas: 4 tiles (peso, gordura, massa magra, IMC) com o delta, a composição
em barras, *Gasto e metabolismo* (TMB + dia leve/dia de treino, que são o TMB
vezes 1,375 e 1,55) e a *Pontuação*. Tudo sai do `laudoDe()`, que já existia —
nenhuma conta nova. As fotos de progresso continuam na ficha do aluno, e a nota
do rodapé leva até lá em vez de duplicá-las. **3b** — Questionários ganhou a aba
**A semana** (agora a primeira): quem respondeu mal vem em cima
(`qsAlerta` respeita o sentido da pergunta — dor ALTA e disposição BAIXA pedem
atenção, porque a resposta carrega `menos`), depois *tudo bem* e *não
responderam*, com "Cobrar os N". A resposta abre ao lado com um tile por
pergunta e o texto por extenso. Junta `app_checkin` (a nota da semana) com
`app_quest` (as perguntas do professor) — **sem SQL novo**. O *desdobramento* do
canvas (pergunta extra que nasce da resposta) **não foi feito**: ele exige mexer
no app do aluno e num campo novo no banco, então nada foi fingido na tela.
**3c** — o Chat virou duas colunas: lista com busca, prévia da última mensagem,
horário e contador de novas; conversa com avatar, chip de contexto (próxima
sessão + treino do dia), *Abrir ficha*, separador de dia, "✓✓ lido" na última
mensagem minha e três respostas rápidas. O "digitando…" do desenho **não entra**
— não existe canal de presença, e fingir seria mentira na tela.

**Painel repaginado — Financeiro, Agenda e Montar treino** (v616 e v617): o
canvas do Claude Design (16 telas) virou código, seguindo a ordem do handoff.
**Financeiro (2e)**: cabeçalho do mês numa linha, **bloco vermelho de Atrasados
no topo com a ação DENTRO da linha** (Link/Pix/Recebi — a regra nº 1 do handoff é
"todo aviso tem botão"), "Cobrar todos" que abre o WhatsApp de cada um e **conta
as abas que o navegador bloqueou** em vez de fingir que mandou, 6 meses com o mês
corrente hachurado (projeção), "Como você recebe" e "Entrou hoje". O handler dos
botões de cobrança virou UM só (`cliqueCobranca`), servindo a lista de pendentes
e o bloco novo. **Agenda (2c)**: a semana em grade — 7 dias a partir de hoje nas
colunas, os horários que existem de verdade nas linhas, o estado na célula
(FEITA/FALTOU/PEDIDO/DEVENDO ou a ficha prescrita **pra aquele dia**, por
`agTreinoTxt`, não a de hoje); dia vazio vira coluna DESCANSO; buraco dentro do
expediente abre Agendar já preenchido; a faixa roxa de pedidos aceita todos
clicando no MESMO botão Confirmar de cada um. **Montar treino (2d)**: cabeçalho
"MONTANDO PRA <aluno>" com *Gerar com IA* e *Salvar e publicar* (que aciona o
mesmo `#tEnviaApp` de sempre), e cada ficha aberta em duas colunas — à esquerda a
cascata (tipo de treino → tipo de série → grupamento, a ordem que o Raphael
pediu) + busca + **chips** de exercício + a Parte 2 do dia; à direita a ficha
montada com o tipo de série como selo colado no nome. O `<select data-exsel>`
continua existindo **escondido** (é a fonte da verdade do "+ Adicionar"); quem o
professor toca são os chips. `TECS_PT` ganhou um 4º campo (nome curto) só pro
selo — "Rest-pause" comia meia linha. ⚠️ os testes que liam `4×10`/`⏱ 60s` agora
leem `4 × 10`/`60 s`, que é o formato do desenho.

**Comunidade não recarregava sozinha** (conserto na v613): o timer de 45 s do
feed fazia `if(SEC==='feed')carrega()`, mas `SEC` é **private do IIFE do menu**
(declarado lá embaixo, noutra função) — então o timer estourava
`SEC is not defined` a cada rodada e a Comunidade só mostrava post novo quando
o aluno reabria o app. Ninguém via porque o erro só acontece 45 s depois de
abrir. Agora a checagem é no DOM
(`document.querySelector("[data-sec='feed']:not([data-sec-off])")`), que é a
mesma verdade e é pública. Teste novo (**⏱ nenhum timer do app estoura ao
rodar**): o `addInitScript` embrulha o `setInterval`, guarda cada callback e
chama todos — vazamento de escopo em timer aparece na hora, sem esperar
45 segundos. O painel tem 8 timers e passou pela mesma checagem.

**Ver todas / Mostrar menos das Conquistas** (conserto na v612): a grade
retrátil trocava o texto do botão e a classe `.enc`, mas **não escondia medalha
nenhuma** — o botão de cada medalha nasce com `display:block` no PRÓPRIO
elemento, e estilo inline ganha da folha de estilo, então
`#cqGrid.enc>button:nth-child(n+7){display:none}` nunca valia. Virou
`display:none!important`. Lição pro resto do app: **teste de coisa que
aparece/some tem que contar o que o aluno VÊ** (`getComputedStyle(...).display`),
nunca a classe — a classe entrava certinha o tempo todo.

**Foto só quando muda no retorno** (a partir da v611): `devolveApp()` dispara a
cada `Sv` de peso, carga, treino marcado, hábito, corrida ou batimento — e num
treino real as anotações estão minutos umas das outras, então a folga de 1,8 s
não junta quase nada: era **um envio por anotação**, cada um recarregando as
TRÊS fotos (antes, depois e perfil) sem terem mudado. Medido com uma foto real:
~37 KB o trio, ~9 MB por aluno/mês, ~207 MB/mês com 24 alunos. Agora uma marca
(`ptdevfoto` = data + tamanho + últimos 24 chars de cada imagem) guarda o que
já subiu, e as chaves de foto **somem do payload** quando a marca bate. Omitir é
seguro porque o `app_retorno_mescla` só mexe nas chaves que CHEGAM — o que não
vem fica como está na nuvem. A marca só é gravada quando o servidor responde
`ok`, então envio que falhou manda a foto de novo. `ptdevfoto` não está na lista
de chaves que disparam `devolveApp` (senão viraria laço). Gancho:
`window.__devolveApp`. ⚠️ o teste que checava a string `fotoPerfil:` no HTML
passou a checar `dd9.fotoPerfil=`.

**Questionário vira UM card só** (a partir da v610): cada questionário eram
TRÊS caixas empilhadas pra dizer "responde isso" — a faixa roxa, um parágrafo
de "seu personal usa as respostas pra…" + 🔒, e a lista inteira do que ia ser
perguntado. O Raphael chamou de poluído e tinha razão. Agora a faixa roxa **é**
o card: rótulo, nome, "N perguntas · leva X" e o botão branco (`.qsbt`) dentro
dela. Saíram o parágrafo, a lista de perguntas (o aluno vê ao responder) e o
`#ckRet` — o botão já diz *Continuar de onde parou*, que é a mesma informação.
A privacidade continua dita uma vez, na faixa do topo (`#qsTopS`). No builder,
`cab` virou `cabQ(dentro)` pra o botão entrar DENTRO da faixa em vez de um
`replace` no HTML pronto.

**Demo do aluno com questionário** (a partir da v609): a área Questionários da
demo mostrava só o check-in — quem assistia não via o recurso que o professor
mais usa. O `regen-demo.js` passa a dar ao Alex um `questApp` de 4 perguntas
("Como você está?": sono em carinhas, dor de 0 a 10, energia em carinhas e um
campo livre), liberado ONTEM e com `repete`, então a faixa diz **2 pra
responder** e o menu carrega o badge 2. O push do professor (v608) NÃO aparece
na demo de propósito: é notificação de verdade do celular, disparada pelo
painel — o que a demo mostra é o badge e a bolinha, que é o aviso de dentro do
app.

**Lembrete de questionário e check-in** (a partir da v608): a régua de push
avisava treino do dia, aniversário, marco, aluno sumido e cobrança — mas
questionário liberado e check-in esperando não avisavam nada, e o aluno só
descobria se abrisse o app por conta. Entrou `pushPendencias()` no
`personal.html`, **fora** da `rotinaDiariaPush`: pra não cutucar quem já
respondeu ela precisa LER a nuvem (`app_checkin` desta semana + `app_quest`
desde a liberação), e a rotina antiga é síncrona (os testes contam com isso).
Regras: o questionário avisa no dia em que libera (com `repete`, o período
corrente anda de 7 em 7 dias — **mesma conta do app**); o check-in avisa **da
sexta em diante** (`dSem >= 4`, 0 = segunda), no máximo 1 por semana. Chaves do
`pushLog`: `quest|<alunoId>|<per>` e `ckin|<alunoId>|<semana>`. **Leitura que
falha = ninguém recebe nada** (`motivo: "sem-leitura"`): um "seu check-in está
esperando" pra quem já mandou é pior do que aviso nenhum — e a chamada da nuvem
está dentro de `try` porque a função roda num timer. Gancho:
`window.__pendPT`.

**Ranking da turma sai das Conquistas** (a partir da v607): o card
`#cqRank` ("Ranking da turma · agosto") repetia o **Ranking da semana** que a
Comunidade já mostra (`#fdRank`) e, no meio das Conquistas — que são do aluno
consigo mesmo —, a comparação com os colegas ficava fora de lugar. Apagado o
div e o bloco que o preenchia; a ordem do bloco das Conquistas passa a ser
medalhas → peso/sequência → semanas → mapa de calor → retrospectiva → Stories.
A RPC `app_desafio_ranking` **continua viva e não mudou**: quem usa é a
Comunidade e o placar do Desafio — nada de SQL foi tocado.

**Mês E ano no mapa de calor** (a partir da v606): a v599 trocou a fita de 52
semanas pelo calendário do mês e o Raphael sentiu falta dos pontinhos do ano
inteiro. Agora os dois moram no MESMO card, com o botão **Mês | Ano**
(`#mapVm`/`#mapVa`) no cabeçalho; as setas `‹ ›` só aparecem no modo mês, que
é o único onde andar pra trás faz sentido. A fita voltou legível: quadradinho
de **13 px** com rolagem lateral por dentro do card (`#mapaAnoRol`), em vez dos
4 px espremidos na largura da tela que motivaram a v599 — o CARD nunca estoura,
quem rola é a fita. Ela nasce encostada em HOJE por **`direction:rtl` no
rolador** (com `direction:ltr` de volta nas duas linhas de dentro), não por
`scrollLeft`: quando o app abre, a aba Conquistas está escondida, a largura é
zero e ajustar o scroll na mão vira nada — quem tinha deixado o app no Ano
voltava e via janeiro do ano passado. A escolha fica em `ptmapv`. As duas
visões usam a MESMA régua de cor (`mapCor` + `forcaDoDia`), então o degradê
conta a mesma história nos dois lugares. Ganchos: `window.__mapaMes` ganhou
`vis` e `ve`.

**Mapa de calor do mês** (a partir da v599): o bloco `#mapaAno` das
Conquistas era a fita de 52 semanas (364 quadradinhos de 4 px) — bonita de
longe, ilegível num celular de 480. Virou o **mês em calendário**, com `‹ ›`
pra andar pra trás (`mapMes`, 0 = mês atual), semana começando na segunda
(igual aos chips do Início), hoje com anel e os dias que ainda não chegaram
pontilhados. A cor conta QUANTO foi treinado: `forcaDoDia(iso, feitos)` soma
as séries de `ptsets_<dia>` em três degraus (>=20, >=10, resto) e devolve 1
pro dia que só está em `ptfeitos` sem série anotada (uma corrida, por
exemplo). O cabeçalho diz "N treinos em agosto" e compara com o melhor mês
ANTERIOR (nunca consigo mesmo). O id continua `mapaAno` de propósito — o
classificador `[data-sec]` e os testes já apontam pra ele. A demo semeia
`ptsets_<dia>` (segunda cheia, quarta média, sábado leve) senão o degradê
não aparece. Ganchos: `window.__mapaMes` (`forca`, `mes`, `pinta`).

**Player guiado de cardio** (a partir da v598): o treino de corrida/bike
prescrito vira uma FILA de blocos — `crMontaBlocos(plano)` devolve
`[{k,n,d,s,km}]`: aquecimento (`aq`, 5 min), o miolo (`c` contínuo, ou `f`/`l`
alternando um par por tiro) e a volta à calma (`vc`, 3 min). A moldura entra
sozinha, do mesmo jeito que o aquecimento da musculação já entrava (o professor
prescreve o miolo, o app põe a borda) e o aluno desliga em Corrida →
engrenagem → *Aquecimento e volta à calma* (`ptcrCfg.bl`). Corrida LIVRE não
ganha blocos. Quem fecha o bloco é a **distância quando o GPS está ligado**, e
o tempo quando não está — com `5 km em 30 min`, fechar no primeiro cortaria o
treino no meio. Na tela cheia entra o `#crBlocoBox` (trilho `#crTrilho` +
`#crBlocoD` "depois: X" + `#crBlocoT` relógio + `#crPulaF`); a faixa
`#crFase`/`#crInfo` passa a falar do bloco. Troca de bloco fala em voz
(`crFala`) ou bipa, conforme `ptcrCfg.fb`, e vibra. Estado em
`cr.blocos/bi/bt0/bkm0`, limpo em `crZera`, `crFinaliza` e ao trocar de treino;
a pausa automática não corta um bloco guiado. Ganchos: `window.__crGuia`
(`monta`, `pula`, `atual`).

**Mapa da corrida com estilo** (a partir da v592): o mapa do GPS é canvas puro
(sem Leaflet), e agora tem `CRMAPS` com cinco estilos — `escuro`/`claro`/
`colorido` (CARTO, com `@2x` quando a tela é retina), `satelite` (Esri World
Imagery, endereço em `z/y/x`) e `ruas` (OSM cru, o único que ainda leva o
tratamento de dessaturação + véu, marcado por `lava:1`). O aluno escolhe em
Corrida → engrenagem → *Estilo do mapa* (`ptcrCfg.mp`); o padrão `auto` segue o
tema do app (noturno → mapa escuro). Tile que não carrega cai no OSM
(`t.img.onerror`, uma tentativa só) — estilo fora do ar nunca deixa o mapa em
branco. Nitidez: o canvas passou a guardar pixel de verdade (largura na tela ×
`devicePixelRatio`, teto 2) e o desenho continua em pixel de CSS via
`setTransform(dp,0,0,dp,0,0)` + `drawImage(...,256,256)` — sem isso o mapa em
tela cheia saía borrado no iPhone. A atribuição é por estilo e a caixa branca
tem a largura do texto (`measureText`). Ganchos: `window.__crMapa`
(`estilos`, `url`, `estilo`, `dpr`). Volume: os tiles do CARTO são de uso livre
com crédito dentro do razoável — se a base crescer muito, o caminho é uma chave
paga (MapTiler/Mapbox) entrando no lugar da `u` do estilo.

**Corte das fotos é 4:5** (a partir da v590): `leCapa()` corta em **4:5 pelo
centro** e reduz pra **640 px** de largura (era 16:9 / 720 px). Motivo: o card
do aluno é EM PÉ (`clamp(470px,64vh,570px)` num corpo de 480 px), então com
16:9 o `object-fit:cover` mostrava só a faixa do meio — menos da metade do que
o professor mandou. As miniaturas do painel também viraram 4:5, pra prévia
mostrar o enquadramento de verdade. Foto 16:9 já salva continua valendo (todo
lugar usa `object-fit:cover`). Gancho de teste: `window.__leCapa`.

**Foto do treino por TIPO** (a partir da v589): escolher foto ficha por ficha
não escala (24 alunos × 5 fichas). Agora o professor sobe **uma foto por tipo**
em Personalização → *Fotos por tipo de treino* (`st.config.capasTipo`): peito,
costas, ombros, braços, pernas, core, wod, corrida, caminhada, bike. O painel
descobre o tipo de cada ficha pelo grupo muscular que MAIS aparece nela
(`tipoDaFicha` → `grupoCapa`; **pernas é testado antes de braços** porque
"QuadrÍCEPS" casa com `/íceps/` — mesmo bug da v572 no app). Precedência:
foto da ficha > foto do tipo > `capaTreino` (geral) > nada. No pacote a foto do
tipo viaja como **CHAVE** (`ck` no painel; `c`/`cp` no app guardam a chave ou um
`data:`), com o mapa `CAPAS_TIPO` uma vez só e `capaFM()` resolvendo — senão
três fichas de perna copiariam a mesma imagem três vezes dentro do pacote.
`CAPT` no builder lê de `D.cfg.capasTipo`.

**Técnicas de intensidade no exercício** (a partir da v588): o item da ficha
ganhou `tec` — `drop` (Drop-set), `up` (Up set), `rest` (Rest-pause), `bi`
(Bi-set) ou `iso` (Isometria); vazio = série normal. **Só o NOME é modelado**:
o que muda (peso ou repetição) o professor escreve na `obs`, porque o Raphael
usa as duas leituras. A tabela mora em dois lugares de propósito, porque são
arquivos separados: `TECS_PT` no `personal.html` (seletor **Tipo de série** na
cascata de montar — a ordem é tipo de treino → tipo de série → grupamento →
exercício, pedido do Raphael — mais o `select.tecsel` na linha de cada
exercício já montado, whitelist na ficha vinda da IA, e o texto do WhatsApp) e `TECS_APP` no `app/aluno-builder.js` (fora do concat gigante) —
**mexeu numa, mexe na outra**. No app: selo `.tecchip` laranja colado no nome,
a explicação ao abrir o exercício, e `#gTec` no treino guiado (`gPoeTec(it)`,
com `tc` viajando no `GUIA`).

**Circuito e corrida viram gavetas** (a partir da v586): as três abas de Treinos
usam o MESMO desenho — `<details class='fichabox'>` com quadradinho da letra
(A, B, C…), nome, resumo na tampa e só a do dia aberta. Âncoras: `data-fi`
(ficha), `data-wi` (circuito) e `data-cri` (corrida — **não** `data-ci`, que já
é dos copinhos de água). Helpers no builder, fora do concat gigante:
`diaDoPlano(tipo, idx)` (rótulo "· hoje"/"· terça" lendo o `planoApp`) e
`gavetaTop(letra, nome, sub)`. O "só a do dia aberta" da ficha agora usa
`#trFichasWrap .fichabox` — sem isso ele fechava as gavetas das outras abas. As
gavetas de circuito/corrida abrem numa IIFE própria, antes do `var trSub`.
Corrigido junto: no `regen-demo.js` as fichas ganharam `id` (`dmf0`…`dmf4`),
porque o painel casa o dia do plano pelo **id** do treino e não pela posição —
sem isso os dias de musculação sumiam do plano da demo.

**Check-in da semana em uma pergunta por tela** (a partir da v600): era o último
formulário empilhado do app — cinco carinhas + peso + recado + botão, tudo de uma
vez dentro do card. Agora o card mostra um convite (faixa colorida, "3 perguntas ·
leva 30 segundos") e UM botão (`#ckAbrir`); o fluxo abre em tela cheia reusando a
casca do `#qaFluxo` (o seletor virou `#qaFluxo,#ckFluxo`). Três telas: carinha (avança
sozinha ao tocar, 350 ms), peso (número grande, opcional) e recado (opcional). Parou no
meio? `ptckdraft` guarda o rascunho POR SEMANA e o botão vira "Continuar de onde parou".
O envio é o MESMO de antes (`app_aluno_checkin` com `p_nota`/`p_texto`/`p_peso`; sem
nuvem, cai no WhatsApp) — **sem SQL novo**, e `ptck`, `window.__ckPend` e o badge do
menu não mudaram. Gancho de teste: `window.__ckFluxo`. Cuidado ao mexer: `EMO` e
`FACES` continuam definidos ANTES do fluxo porque o código novo usa os dois, e a
suíte `test-personal.js` dirige o fluxo (não existe mais `#ckNotas`/`#ckEnvia`).

**Questionários viram área própria** (a partir da v585): o check-in da semana
(`#ckCard`) e o questionário do personal (`#qaCard`) moravam embaixo da conversa,
na área do Chat — quem abria o chat pra mandar um recado caía num formulário
grande logo abaixo. Agora existe a seção `quest` (`#qsTopo` faixa roxa +
`#qaCard` + `#ckCard` + `#qsVazio`), com entrada própria no menu: o botão
**Questionários** da gaveta (`#mgQaBt`, `data-msec='quest'`, com o badge somando
`__qaPend()+__ckPend()`) e a linha dos Ajustes (`data-ajgo='quest'`). O
cabeçalho conta a mesma verdade do badge ("N pra responder" × "Tudo em dia"),
pintado por `pintaMB`. Como o check-in respondido SOME até a semana virar
(pedido antigo do Raphael), `#qsVazio` aparece quando nada mais está visível na
seção — senão sobrava só a faixa roxa. `secDe` não manda mais "Check-in" pro
chat; a classificação é por id.

**Tela de Início enxuta** (a partir da v584): o card **Minha semana** (`#semBlock`)
é um bloco só — recado do coach (`#coachTxt`), os chips seg–dom (`#diasSem`),
a linha de resumo (`#semResumo` = "4 de 4 na semana · N dias seguidos") e o
**Treinei hoje!** (`#btnFeito`), com `#medalhas` discreto embaixo. Antes eram
TRÊS blocos dizendo a mesma coisa: o anel 4/4 do card do coach, os chips e a
barra "Meta da semana" — os três removidos menos os chips, que são os únicos
que mostram QUAIS dias. Duas sequências diferentes moravam juntas e se
confundiam: a de **semanas** batendo a meta virou o terceiro tile das
Conquistas (`#cqTiles`, largura cheia — é conquista, não status de hoje) e a de
**dias com 3+ hábitos** (`#stkLine`) foi pro card dos hábitos (`#habWrap`) com
o texto dizendo do que é. A do card da semana conta dias TREINADOS
(`seqAtual`). Ids que sumiram: `coachCard`, `ringSem`, `ringNum`, `metaBox`,
`stkBox`.

**Cabeçalho da área Treinos** (a partir da v583): `#trTopo` é um bloco só —
faixa roxa em cima (`#trTopN`/`#trTopS`/`#trTopSub`) e as três pílulas
(`#trTabs`) logo abaixo dela, igual ao desenho da Evolução (`#evTopo` +
`#evAbas`). Antes as abas eram um card separado ANTES da faixa, e a faixa
morava dentro da lista de fichas — na tela as abas apareciam soltas no topo,
sem título nenhum. `trocaTrSub` pula o `#trTopo` no esconde-esconde (ele é o
chapéu das três abas) e troca o texto da faixa lendo `TRHEAD`, montado no
builder com um texto por aba (fichas/circuitos/corridas). O classificador
`[data-sec]` tem branch de id pro `trTopo`, não mais pro `trTabs`.

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

**Revisão geral do sistema — frentes 1 e 2+ (mt-v741 e mt-v742)**: em
2026-09-01 uma revisão por área (25 revisores + 2º revisor cético) achou 388
itens; o Raphael mandou atacar as 14 frentes na ordem do relatório. v741 —
**botões mortos**: os redesenhos v614–v627 espalharam `data-abreperfil` /
`data-feita` / `data-pgm` / `data-pix` / `data-app` por telas novas com o
listener preso aos containers antigos. Agora existe um dono de ÚLTIMA
instância no `document` (`DONOS_CLIQUE`), **na fase de captura**: o dono antigo
chama save() → render() e reconstrói a lista, então na fase de bolha o botão
já estava fora do DOM e `closest()` não achava mais o container — a ação
rodava DUAS vezes (medido: dois "Registrar R$ 80?" num Feita). Publicar app é
`publicaAppDoAluno(id)`; `valorCobranca(st, a)` é a conta do Cobrar (dívida
acumulada ou valor do plano/cadastro — `dividaDe().total` é 0 pra quem não tem
contrato no mês); `pfMontaTreino` grava em `#tAluno` (não em `#taAluno`, o da
aba IA) e força a aba Fichas; `pfIrChat` abre a conversa do aluno. O teste
CLICA (o da v614 só conferia que o botão existia).
v742 — (1) **dia da semana**: o plano da semana usa a chave do `getDay()`
(0 = domingo, como `PLN_DIAS` grava e o app lê); quatro leitores do painel e a
regua-diaria calculavam `(getDay()+6)%7` e mostravam o treino de UM dia antes
— agora todos passam por `diaDoPlano(iso)`; o teste da v736 estava escrito
com a conta errada; regua-diaria **v3** publicada (regra `dia-getday` no
ping). (2) **chat**: `order asc + limit` devolvia as mensagens mais VELHAS —
conversa e lista buscam desc e viram a ordem; marca como lida só o que
apareceu; Nutri igual. (3) **e-mail de acesso** com hex cravado (era texto
branco + `var()` — login e senha invisíveis). (4) `pfResumoNuvem` grava o
retorno **sem as chaves `foto*`** no ptStudio (`tiraFotosDoRetorno` limpa uma
vez na carga quem já tinha); a aba App busca as fotos por conta própria.
`store.js` volta a avisar a cada 10 min quando a cota estoura (era uma vez por
sessão e depois falhava calado). (5) **IA**: `exCitados` lê a FRASE inteira
(pontuação vira `;` antes do `chaveEx`, que apagaria a vírgula) e uma lista
NEGA maior (cuidado, atenção, nunca, jamais, dor, lesão, hérnia,
contraindicado…) — "cuidado com levantamento terra, tem hérnia" virava terra
OBRIGATÓRIO; frase só de equipamento (`GENERICA`: "com barra e halteres") não
casa nada; o RPE vai como escala 1-3 (era "1-5" e a IA lia pesado como
médio). (6) **carinhas**: `qsValor` usa a escala da PERGUNTA (min/max das
alternativas, padrão -2..2) e `qsRuim` normaliza — comparar pontos -2..2 com
0–10 punha todo mundo em "Pede atenção"; `quest.html` grava `menos` e inverte
a soma como o app; Nutri (`qsValorN`/`qsRuimN`) igual. Ganchos:
`window.__donosClique`, `__valorCobranca`, `__diaDoPlano`, `__emailAcessoHtml`,
`__tiraFotosDoRetorno`, `__qsValor`, `__qsRuim`, `__qsValorN`, `__qsRuimN`.

**Revisão — frentes 5 e 14 (mt-v743, app do aluno)**: (1) a trava do
"celular limpo" do `devolveApp` passou a olhar a MESMA lista de chaves do `Sv`
(`DEV_KS`): antes só as chaves antigas destravavam e Termo aceito, presença
confirmada, depoimento, indicação e corrida de quem ainda não tinha pesado
nunca chegavam ao painel. (2) **`app_retorno_mescla` recursiva** + nova
`app_lista_mescla` no SQL (aplicadas no banco em 2026-09-02 e espelhadas no
setup): objeto une em qualquer profundidade; LISTA une por DIA — o app é dono
dos dias que ele conhece (edição e mais de um registro no dia valem), os dias
que só a nuvem tem ficam, item sem `d` entra por igualdade. Antes um celular
novo mandava `cargas: {Supino: [1 registro]}` e apagava meses do exercício na
nuvem. (3) corrida: `crFimF` só fecha a tela cheia quando NÃO abriu o resumo
(`cr.resumo` ficava preso em true e o espelho parava); o trajeto guarda a
corrida inteira — ponto só entra a ≥ 5 m do anterior (`havKm`) e acima de
12.000 a lista é afinada pela metade (era `shift` a partir de 600 = só os
últimos 10 min). (4) guiado: `gConclui` marca `ptfeitos` do dia (o automático
das séries exige TODAS as fichas em `FEXS`, então com ABC nunca disparava);
régua de carga em **0,5 kg** (`GW.kg.p`, rótulo a cada 10 traços) e o scroll
PROGRAMÁTICO (`rd._prog`, 500 ms) não reescreve o campo nem marca `gv.mexe`
— era isso que arredondava 22,5 → 23 e matava o avanço automático. (5) fotos
de progresso: teto de 12 **por ângulo**, e a primeira de cada ângulo (o
"antes") nunca sai — sai a segunda mais antiga. Ganchos: `window.__gw`.

**Revisão — frentes 10 e 12 (mt-v744)**: (1) **Semana do aluno** guarda o ID
da ficha; Gerar fichas (regras/IA) e apagar ficha trocavam ids sem mexer no
plano e o app mostrava DESCANSO no dia de treino. `remapeiaPlano(t, velhas,
novas)` reencaixa pela LETRA do título (`letraFicha`) ou pela posição; o dia
sem par sai e o status do gerador avisa (`planoAviso`). (2) **isolamento**:
push-envia `prof` exige ser MEMBRO da academia do corpo (senha da push_config
e service key seguem valendo; regra `prof-membro` no ping); chat-envia só cai
em `donoUnico` quando NINGUÉM tem número (com outros cadastrados devolve `{}`
— era latente porque o WHATSAPP_TOKEN global está vazio); `app_aluno_faxina`
ganhou `p_academia` e `p_modulo` — só revoga linhas da academia que chamou e
do módulo certo (pacote com `dados->'dados'->>'tipo'`; os pacientes do Nutri
moram na mesma tabela e ficavam sem app); `excluir_minha_conta` e "apagar de
vez" limpam `dados_hist`/`app_aluno_hist` (`app_hist_apaga_academia`,
revogada de anon/authenticated). Tudo aplicado no banco em 2026-09-02 e
espelhado no setup; push-envia e chat-envia republicadas. (3) `app/index.html`:
token da URL diferente do guardado = limpa `pt*`/`nt*` e o pacote antes de
abrir (`window.__limpouOutroAluno`) — dois alunos no mesmo celular misturavam
peso, fotos e chat. (4) o app do paciente diz a verdade: a primeira e a última
foto vão pra ficha do nutricionista.

**Revisão — frente 3 (mt-v745, Financeiro)**: (1) **competência**: o pagamento
pode carregar `mes` (qual mês quita); `idxDe.pagouMes` lê `p.mes ||
data.slice(0,7)`. `dividaDe` devolve `chaves` (os meses em aberto) e
`registraRecebido(st, a, valor, forma)` é o caminho único do Recebi/Pix:
pagou o total acumulado → um pagamento por mês devido; pagou menos → quita o
mês MAIS ANTIGO. Antes "deve 2 meses" quitado num Recebi limpava só o mês
corrente e o velho voltava em toda cobrança. (2) bloco **Atrasados** e
"Cobrar todos" escondem Recebi/Pix/Link de quem tem `assinaturaRec`/
`assinaturaAs` (o webhook dá a baixa; um Recebi a mais era pagamento em
dobro). (3) o **Pix da renovação do pacote** leva `data-origem="pacote"` →
`abrePix(aluno, valor, origem)` → `pixRecebi` grava COM desc e zera
`pacote.cobrar`, igual ao Recebi do pacote. Ganchos: `__registraRecebido`.

**Revisão — frente 11 (mt-v745, sincronização)**: (1) `SYNC_IGNORA` ganhou o
que é DESTE aparelho: `mtapp:academia` (identidade do login — subia pros
outros membros), marcas do demo, `seeded`, `*SemConta`, `tema`, `ptMenuFino`,
`ptAgVis`. (2) `puxa()` **nunca cobre chave na fila** (`sync.sujas`): o
servidor carimba o upsert na chegada, então o eco do envio anterior voltava
"mais novo" que uma escrita feita logo depois e a lista voltava ao estado de
antes. (3) `nuvemTemMais` só deixa a nuvem vencer um local MAIS NOVO quando a
lista local está vazia ou a da nuvem é bem maior (1,5× + 3) — bastava UM item a
mais (uma ficha apagada offline) pra descartar a sessão inteira; e antes de
cobrir, guarda a cópia local em `mtsync:bak:<chave>`. (4) `modulo-conta.js`:
entrar/criar conta vindo do demo apaga as marcas, o estúdio falso e as imagens
do demo ANTES de ligar a sync (`window.__demoLimpo`). Ganchos:
`__nuvemTemMais`, `__sincronizavel`.

**Revisão — os 3 graves que sobraram (mt-v746)**: (1) `enviaTreinoGrupo`
copia SÓ as fichas (ids novos, `remapeiaPlano` reencaixa a Semana) — antes ia a
entrada inteira do `treinosV2` e o aluno do grupo perdia circuitos, corridas,
Semana, validade e ganhava o plano do mês gerado pra OUTRA pessoa; o botão
pede confirmação dizendo o que substitui. (2) `load()` garante `st.config`
(criar a conta antes do onboarding chamava `salvaNome` com config indefinido
e travava calado). (3) NUTRI: `cobraMensalN(p)` — paciente com "Pagamento
preferido → Plano/pacote" (`p.pagto === "plano"`) ou assinatura fica fora da
régua de cobrança, de Atrasados e do filtro Devendo (o campo era gravado e
nunca lido). Ganchos: `__enviaTreinoGrupo`, `__loadPT`, `__salvaNomeTeste`,
`__cobraMensalN`. Os 366 médios/leves seguem por área em mt-v747+.

**Revisão — os 366 médios e leves, por área (mt-v747+)**: cada área foi
atacada por um agente num worktree próprio, com um assert por conserto, e
integrada em lotes. NUTRI (nt-1, nt-2 — 36 itens): régua única de atraso
`pacAtrasadoN` (usa `cobraMensalN`, dia de cobrança e `pagouMesN`) pra lista,
Financeiro, Resolver hoje e lembretes; `cartaoFalhouEvt` monotônico como no
Personal; `diasSumidoN` ignora consulta faltada (Radar reaproveita);
`sexoDe(p)` normaliza o sexo (importador gravava "f"); Reativar paciente e
encerrar oferece revogar o app; `laudoDeN` com fator de atividade do cadastro
(um só "basal"); avaliação retroativa entra ordenada e só muda `p.peso` se for
a mais nova; perfil repinta só o pedaço (peso/financeiro) em vez de
`abrePerfilN`; IA de dieta vê o banco quase inteiro (`catalogoDietaIA`) e os
ignorados aparecem pelo nome; `config.appMudouEmN` + `autoPublicaAppsN` pelo
`stamp`; app do paciente: lembrete de água via `showNotification`, adesão em
data local, `feitos` devolvido (ranking), código de barras grava macros.
`tests/test-tokens-nutri.js` reprova `var(--` dentro de documento autônomo.
Personal — Início e Alunos (pt-inicio, pt-alunos — 22 itens, mt-v747):
`cobrancaVencida(st, a)` é a função-fonte de "vencido" (Resolver hoje, card
do mês, Atrasados, DEVENDO da lista — conta os meses em aberto);
`compMesAnterior()` compara até o MESMO dia do mês anterior (era mês parcial ×
mês cheio, e `setMonth` transbordava no dia 31); `metaMesDe(a)` nos dois
lugares (era 12 fixo × metaSemana×4); `prescricaoEm(t, a)` lê `t.fichasEm`
carimbado por `marcaTreinoMudou` em toda prescrição — a "idade da ficha" não
zera mais com a republicação automática; `resolverChat`/`pintaBadges` leem só
`de=aluno, lida=false` com cópia de 10 min (`chatPend`) e o contador do Chat
some quando zera; sino sem ruído (só pagamento com `eventoId`, treinos numa
linha por aluno); importador tira o +55 e o CPF; `letraFicha` nos chips e no
`alFicha`; `vaiMontarTreino()` único pra ficha/lista/Resolver.

**Revisão — infra, funções e SQL (mt-v748, 43 itens)**: (1) `apps/store.js` —
a trilha de auditoria era marcada SEM o prefixo `mtapp:` e nunca subia; o
eco do próprio salvamento voltava "mais novo" e repintava o painel (agora o
`upsert().select()` devolve o carimbo do servidor e conteúdo igual não acorda
ninguém); a outra aba subia de volta o que veio da nuvem (o carimbo entra
ANTES do `setItem` e o listener de `storage` reconhece `+00:00`); `write()`
devolve `false` na cota estourada; `SYNC_IGNORA` ganhou intento/quem/
fechVisto/logGeral/ptAssinatura; o bloco de atualização do SW saiu do store e
vive em `pwa-update.js`/`app.js`, que só recarregam com a página ociosa.
(2) `sw.js` faz o precache com `no-cache` (304 pelo ETag) e **preserva as
caches `mt-app-*`** do app do aluno; `app/app-sw.js` tem `var VERSION`
cravada — **a versão agora mora em TRÊS arquivos** (`assets/versao.js`,
`sw.js`, `app/app-sw.js`) e `test-versao` confere os três. (3) Edge
Functions, as 11 republicadas em 2026-09-02 (envia-email v10, assinatura-loja
v2, suporte v2, whatsapp v9, pagamentos-webhook v10, pagarme v8, pagamentos
v11, regua-diaria v4, push-envia v13, meta-webhook v10, chat-envia v16):
régua obedece `config.reguaOff` (regra `regua-off`); envia-email exige
MEMBRO (era relay aberto em nome da marca; regra `membro`); `respostaIA`
repassa o erro REAL da Anthropic (429 não vira "confira o secret"; regra
`erro-ia`); o prompt leva o nome da academia (nunca mais "TORQUE FIT" pra
todo mundo; `nome-academia`); `membros?limit=1` sempre `order=criado.asc`
(`membro-ordenado`); meta-webhook no fuso BR, mensagem gravada ANTES da
conversa (dedupe por `mid`), criação sem corrida (`on_conflict` +
merge-duplicates), número próprio sem App Secret só grava e esgotar as
voltas de ferramenta passa a conversa pra equipe de verdade (GET
`?acao=ping` devolve as regras); pagamentos reusa o cliente Asaas por CPF,
religa o webhook interrompido e recusa loja sem aluno no blob; pagarme
normaliza as ações com hífen; assinatura-loja com guarda de ordem
(`academias.assinatura_evento_em`); suporte com tipo validado, protocolo na
data do Brasil e e-mail conferido. (4) SQL aplicado no banco como migração
`v748_infra_revisao` e espelhado no setup: `hoje_br()`; `app_aluno_agenda`
lê `mtapp:grade` (com `grade` nunca achava e todo aluno travava em 3);
check-in/avaliação/pedido de horário no fuso BR; `app_quest_responde` pela
porta única (`app_aluno_ativo`); RPCs de config com `order by criado limit 1`;
revogar e faxina apagam `push_subs`; `hq_cliente_set` grava
`academias.assinatura_status` (uma verdade só pra "está pagando");
`app_aluno_pedido` recalcula o total pelo catálogo; matrícula sem `?a=` só
com UMA config no banco; reações amarradas à academia do post; helpers
internos sem EXECUTE público. Suíte nova: `tests/test-infra.js` (46
asserts). ⚠️ Antes de republicar uma função, CONFIRA o que está no ar
(`get_edge_function`) contra o repo — desta vez as 11 batiam.

**Revisão — app do aluno, app-html e app-core (mt-v749, 29 itens)**: no
`app/aluno-builder.js` (e `aluno-skin.js`): `raioX = D.raioX || []` (pacote
sem raio-X derrubava o `monta()`); `nomeCurto()` → "seu personal" pro padrão
e duas palavras pra Studio/Academia (era `studio.split(" ")[0]`, 14 usos
viraram `STUDIO_CURTO`); A2 só vira cronômetro com `min`/`minutos`/`'` (
"400 m" virava 90 min); check-in conta os 20 XP prometidos (`ptckh`, uma
chave por semana enviada); `#topoExtra` (nunca visível) e os ajustes mortos
do skin saíram; "Meu peso" ×3 e nome do studio ×2 no chat viraram "Meta" e
"Conversa" — ⚠️ o `secDe` classificava o card do chat pelo texto "Fale com" e
trocar o h2 escondia o chat inteiro: agora classifica por `#chMsgs`;
`dinheiro()` com centavos (era "R$ 149,9/mês"); Pix com `esc()`; `urlOk()`
compartilhado entre `linkRec` e a playlist; convite sem WhatsApp não sai
"wa.me/ —"; `PLTXT` lê `ctApp.diaVenc`. Circuito: For Time no limite grava o
cap (`wod.estourou`), AMRAP encerrado antes leva o decorrido (`wod.fimEl`,
campo `du` no `ptwodres`), "Voltar" virou "Descartar" com `confirm()`, os
`prompt()` de round/tempo/reps viraram campo dentro do tile (`wpEdita`); a
corrida ganhou o MESMO botão de registrar o treino do dia (`#crRsFeito`);
"Avisei que vou" só confirma quando o servidor responde `ok`; check-in sem
nuvem mostra "É só enviar" + "Enviei ✓" (só aí grava `ptck` — ⚠️ o `fim()`
era local ao `envia()`, virou callback); `.ics` com UID estável e
`VALUE=DATE` quando não há hora (`__agIcsBaixa`/`__agIcs`); toque a mais não
zera as séries (trava no máximo; segurar 600 ms tira uma — `__setbtnMenos`)
e o "Treinei hoje" automático olha a `.fichabox` do botão; `ptconf` podado em
60 dias e `ptckdraft` de outras semanas apagado. Mês/dia/semana declarados
uma vez (`MESN/MES3/MESES/DSEM/DSEMA`). Ficaram pro painel: restringir a
chave Pix e validar `linkRec` ao salvar. Testes: 27 asserts em
`test-personal.js` + 3 em `test-app-sintaxe.js` (D mínimo, `nomeCurto`,
`dinheiro`/`urlOk`); cinco antigos reancorados (`habStreak`→`stkLine`,
`topoExtra`, `.tphab`, "Fale com", "treino +10 XP").

**Revisão — ficha do aluno e Agenda, pt-perfil e pt-agenda (mt-v750, 33
itens)**: **Ficha** — `treinosMesDe(st, a)` é a conta ÚNICA de "treinos no
mês" (Resumo, chip e `poeKpi` liam contas diferentes; a meta é medida pelo
app e as sessões com o professor viram o 2º número); `sentidoPeso(a, ret)` +
`corPeso()` nos 3 lugares (peso subindo era sempre vermelho, mesmo pra quem
quer ganhar massa; o PDF fica neutro sem objetivo); `recordesDe(ret, desde,
ate)` e `resumoFc(ret)` são as regras únicas de recorde e batimento
(relatório, card, IA da semana e os dois tiles); `buscaRetornoApp()`
compartilha a Promise entre `pfResumoNuvem` e `pintaAppDados` (o retorno era
baixado duas vezes por abertura); o diário ganhou `#pfDiarioData` (padrão =
última sessão feita) e uma nota por dia; trocar plano-pacote SOMA o saldo
anterior; relatório/card do aluno aceitam o mês (`mesRelPadrao()`: até o dia
5 sem registro vale o mês anterior); hábitos dividem por dias com registro
(`base30`); a aba "Check-in" virou "Questionários e hábitos" e o KPI diz
"40+" quando a consulta cortou; `diaLocalDe()` nas datas dos questionários
(era UTC); `erroDeSql()` separa "rode o SQL" (42P01/42883/PGRST2xx) de rede
e RLS. **Agenda** — sessão passada sem marcar aparece como `SEM MARCAR · A`
(`agEstado` `pend`); pedido de remarcação ganhou o botão **Remarcar**
(`data-sremarca`, o Agendar EDITA a sessão, mesmo id/fixaId, e atualiza o
pedido) e o faltou ganhou **Desfazer Faltou** (`data-desfalta`); encaixe
nunca oferece pro próprio aluno (`encaixeCandidatos(st, data, excluiId)`);
fixa futura não cria antes do `desde`; cancelar/mudar hora avisa o app
(`avisaSessaoMudou()` — marcaAppPendente + push + `app_agenda` quando há
`pedidoId`); `pintaBadges`/`resolverChat` leem `de=aluno, lida=false` no
servidor; `confirmaAgendar(st, datas, hora, ignoraId)` é o aviso único (a
fixa simula 4 semanas); `normalizaHora()` recusa hora fora de HH:MM; `.ics`
com `DTSTAMP` e dia inteiro sem hora; `save()` fora da Agenda reaproveita a
leitura de pedidos de < 60 s (`agPedEm`). Bloco `v748` na suíte (29
asserts); três asserts antigos mudaram de propósito (rótulo da aba, do KPI,
"Emagrecer" com maiúscula, relatos viram atalho). ⚠️ Ao integrar, o
cherry-pick conflitou com o lote v747 em três pontos triviais (o KPI de
treinos e a consulta do chat) — o lado do agente venceu.

**Revisão — Financeiro e Relatórios, pt-fin e pt-rel (mt-v751, 26 itens)**:
**Financeiro** — `mesAtual()` virou FUNÇÃO (a variável era congelada na
carga e, na virada do mês, duas listas na mesma tela cobravam meses
diferentes); "Ativar mensalidade no cartão" só aparece sem gateway próprio
E depois que o `pingPagarmeGlobal` confirma `chaveConfigurada` (cache em
`window.__pingPagarme` — teste que precisa do botão zera
`__pingPagarme.cache` e responde `{ok, chaveConfigurada: true}` ao ping da
`pagarme`); com Mercado Pago/Pagar.me próprio a tela diz "automática só pelo
Asaas" com atalho; Link sem gateway dá recado em português (o botão CONTINUA
aparecendo de propósito: o caminho da `pagarme` global é documentado como
intencional); cortesia (sem contrato e sem valor) sai da lista de quem não
pagou; `msgCobranca(st, a)` é o texto ÚNICO de cobrança (lista, Cobrar
todos, Resolver hoje, alertas — usa o modelo `atraso` do professor);
`rotuloValorPlano(pl)` (/sessão, / N aulas); gráfico de 6 meses sempre em
mil e média só dos meses com pagamento; despesas com tokens; encerrar fixa
em mês passado pede confirmação. **Relatórios** — churn = `retencaoPT` nos
3 lugares (`fimDoMes(mes)`); rótulos honestos (Mensalidade média / Recebido
por pagante / Valor médio por venda); "falta receber" só de mensalidades por
competência (`p.mes`); setas retroativas valem pra retenção, semanas,
`ativosRel` e atrasados; assiduidade separa "sem registro" de falta; alerta
de atraso usa `cobrancaVencida`; `semPagar(mes)`/`semPagarNomes` pra
qualquer mês; fechamento ganhou `#fchEmailP` (reusa `enviaEmailFn` +
`htmlFechamento`); semanas rotuladas pela segunda-feira; "Saldo" → "Ativos
hoje"; "Sua hora rendeu" divide `fatAulas`; crédito de hora-aula vira venda
"Créditos de aula"; `formaFamilia()` nos dois cards; De/Até das Vendas
sobrevive ao redesenho (`rvMesBase`); `casaNiver()` casa 29/02 com 28/02
fora do bissexto (card e régua de push). ⚠️ Alertas dos Relatórios: o mesmo
aluno aparece em vários grupos (`[data-algrupo]`) — assert sobre "Pagamento
atrasado" tem de recortar o grupo. `window.__renderPT` repinta o painel sem
`reload`. Já resolvidos na v745 e conferidos: Recebi escondido pra
assinatura automática; Pix da renovação do pacote com desc.

**Revisão — Montar treino e IA, pt-treinos e pt-ia (mt-v752, 27 itens)**:
**Montar treino** — `letraFicha` só tira a letra do título quando ela é
`A`/`B`/`A2` (`^[A-Za-z]\d?$` antes do travessão); antes "Treino de peito"
virava a letra "Tr". ⚠️ o `aluno-builder.js` faz o MESMO `split("—")` com o
`slice(0,2)` antigo — enquanto os títulos gerados forem "A — …" nada
aparece, mas os dois têm de andar juntos. `descansoDe(it)` nos 5 pontos
(linha, editor, "~N min", pacote, guiado): **descanso 0 é dado**, e
`+it.descanso || 60` transformava "sem descanso" em 60 s. Botão "+N" da
busca passou a crescer 60 por toque com "mostrando X de Y"; editar um campo
repinta só a `.tdsub` (o Tab funcionava e o foco era roubado a cada tecla);
`msgPublicar()` é o texto único de publicar, com "Publicar agora" clicando
no `#tdPublica`; nomes e grupos da semente viraram os canônicos do catálogo
(com migração de "Pernas"/"Braços"); "só o peso do corpo" virou regex sobre
as tags reais (excluía 306 exercícios); Gerar fichas esquece o mês da IA
(`esqueceMesIA()`) e `pintaMesPlano` exige `geradaIA`; "Evoluir semana" não
mexe em ficha da IA e só evolui reps `^\d+$` (preserva "8-12"); o datalist
do WOD recarrega pela chave da biblioteca; o 11º circuito não vira DESCANSO
(`.slice(0,10)` também nos WODs, com aviso); modelo de ficha preserva o
vídeo do item. **IA** — parâmetros por tipo, catálogo com orçamento =
envelope − texto fixo (o lembrete final ia inteiro), tetos 8/16/8 com os
cortes mostrados, `confereIaPublicada` no botão (cobra a regra `mes`), IA de
circuito recebe os movimentos dos circuitos, cabeçalho único com `idadeDe`,
data local, e sem `mes` na resposta o plano velho é apagado com aviso.
⚠️ Semente do `load()` renomeada: teste que procurava "Supino reto" na
biblioteca agora acha "Supino reto com barra". ⚠️ `focus()` não vale em
elemento escondido — o teste do Tab precisa de `__vaiMontarTreino(id)`.
Ficaram de fora: teto de uso da IA por academia (precisa de tabela `ia_uso`
e trava na chat-envia) e a frase "monte a SEMANA" do prompt de corrida.

**Teto de uso da IA por academia (mt-v753)**: a chave da Anthropic é do
dono do sistema e QUALQUER conta logada — inclusive um teste grátis de 14
dias — podia chamar a IA em laço; a fatura era do Raphael. Agora cada
chamada de IA da `chat-envia` (testar, ajuda, analisar, ia_treino, ia_dieta,
sugerir) conta uma unidade no dia pela RPC `ia_uso_conta` (tabela `ia_uso`
SELADA, RLS sem política, EXECUTE revogado de anon/authenticated) e, passando
do teto, a função recusa com 429 e recado honesto em vez de seguir gastando.
Teto padrão **80 por dia por academia** — dá pra renovar o mês de 24 alunos e
ainda sobrar; o Secret `IA_TETO_DIA` muda o número sem republicar. Banco sem
o SQL novo (ou fora do ar) **não trava ninguém**: na dúvida deixa passar. A
regra `teto-ia` entrou no ping. Junto saiu a contradição do prompt de
corrida: ele mandava "monte a SEMANA" e o `MES_REGRA` logo abaixo dizia que
o plano é do mês — agora diz "monte os treinos que se repetem nas 4 semanas
do mes". Migração `v753_teto_ia_por_academia` aplicada no banco (conferida
subindo o contador e vendo a 4ª chamada ser recusada com teto 3) e espelhada
no setup; `chat-envia` v17 publicada e conferida pelo ping. Pra soltar uma
academia num dia: `delete from ia_uso where academia_id = '…' and dia =
current_date;`.

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
  200 com a MESMA credencial). Lista em `supabase/functions/` — as **13**, todas
  publicadas e ACTIVE: meta-webhook, chat-envia, whatsapp, envia-email (Resend),
  pagarme, push-envia, pagamentos, pagamentos-webhook, **pagarme-webhook**,
  **assinatura-loja** (2026-08-25), **suporte** (v708 — chamado com protocolo
  TQ-AAAAMMDD-XXXX gravado em suporte_chamados, e-mail via Resend pro Secret
  EMAIL_SUPORTE, padrão suporte@torqueon.com.br), **regua-teste** (2026-08-29 — a régua do
  teste grátis: pg_cron → pg_net → função, senha em `regua_config` selada,
  idempotência por `regua_log`, e-mails dia 1/3/7/12 pra `assinatura_status`
  = trial) e **regua-diaria** (v721, 2026-09-01 — a régua de PUSH no servidor; v2
  publicada no mt-v736 com o NOME do treino no título, regra nome-treino no
  ping, conferida no ar:
  pg_cron 10:00 UTC chama a função com a MESMA senha da regua_config; ela lê o
  `mtapp:ptStudio` da tabela `dados` de cada academia com aluno inscrito na
  push_subs e manda treino do dia, véspera e aniversário no fuso do Brasil,
  com as MESMAS chaves da régua do painel. Dedupe nos DOIS sentidos: o
  servidor pula o que o `pushLog` do blob já marcou, e o painel importa
  `push_log_srv` (RLS: membro só lê) pro pushLog antes da régua local rodar —
  `importaPushSrv`/`window.__pushSrv`. A cobrança fica no painel de propósito:
  duplicar contrato/dívida em dois lugares é como os números divergem).
  Ele publica copiando de www.torqueon.com.br/funcoes.html — ⚠️ desde a v721
  o `NOMES` da página cobre as 13 (regua-teste e suporte estavam FORA e o
  botão de copiar deles nunca carregava).
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
- **`design/BRIEFING-CLAUDE-DESIGN.md` é GERADO — não edite à mão.** É o recado
  que o Raphael cola no começo da conversa em claude.ai/design. Quem escreve é
  `tools/briefing-design/gera.js`, que lê do repo a versão, os 15 últimos
  lançamentos e em que versão `aluno-skin.js`/`aluno-builder.js` encostaram —
  mais dois avisos que ele descobre sozinho: **quantas versões o app andou
  desde a última mexida no skin** (o argumento contra copiar uma cópia velha
  por cima) e os **números de versão repetidos** (v598–v601 saíram duas vezes,
  de quando duas conversas trabalharam em paralelo — número de versão não serve
  como endereço). A prosa fixa mora no script. O workflow
  `.github/workflows/briefing-design.yml` roda o gerador e publica sozinho
  quando muda `assets/versao.js`, o skin, o builder ou o próprio gerador — não
  a cada push, senão viraria um commit de robô por empurrão.

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

- Supabase (projeto `hdcufkaalxfhwmfwoiqp`, "metodo-torque") — FEITO pelo
  conector: as **11 Edge Functions** do repo estão publicadas com **Verify JWT
  OFF** (a pagarme antiga continua lá) e os blocos zap_config, RECEBER POR
  PROFISSIONAL, BAIXA AUTOMÁTICA MULTI-GATEWAY e push_subs do SQL foram rodados
  (tabelas, colunas, índices únicos parciais e RPCs conferidos). O SQL da
  Comunidade ele já tinha rodado. A **chat-envia está na v14** (2026-08-30),
  igual ao repo no mt-v672: `MES_REGRA` (a IA monta o MÊS, 4 semanas de
  progressão, a 4ª sempre mais leve), `BRIEF_REGRA` **com o parágrafo da v639**
  (a estrutura pedida pelo professor SUBSTITUI os padrões do prompt — quem pede
  ABCD recebe ABCD; exercício citado é obrigatório; existe um LEMBRETE FINAL a
  conferir antes de responder), os **três blocos de BASE CIENTÍFICA da v672**
  (`METODO_MUSC`/`METODO_WOD`/`METODO_CORRIDA` — princípios ACSM/NSCA:
  sobrecarga progressiva, periodização escolhida e DECLARADA, 10–20 séries
  semanais por grupo, RIR na obs, distribuição polarizada na corrida; a IA
  termina o resumo com a linha "Metodologia: …", e a leitura do professor
  continua vencendo tudo), o `.trim()` do `env()`, o `chaveIa` e o
  `regras: ["mes","brief","briefManda","metodo"]` do ping — é por esse campo o
  painel descobre que a função publicada é velha e avisa dentro da gaveta
  (`#brAviso`) em vez de deixar o treino sair errado. O ping da v14 foi
  conferido no ar em 2026-08-30 (status 200, as 4 regras presentes). Higiene do
  linter (Advisors) rodada em 2026-08-30: índices `membros_user_idx` e
  `site_pro_academia_idx`, política `membros_dono_remove` com
  `(select auth.uid())` e EXECUTE das funções de GATILHO
  (`dados_guarda_hist`/`app_aluno_guarda_hist`) revogado de anon/authenticated
  — tudo aplicado no banco E espelhado no bloco "HIGIENE DO LINTER" do
  supabase-setup.sql. ⚠️ Os ~60 avisos de RPC SECURITY DEFINER executável por
  anon são DE PROPÓSITO (o app do aluno valida o token por dentro — revogar
  quebraria o app); as tabelas com RLS sem política são as SELADAS. Pendente do
  Raphael no painel do Supabase: ligar Auth → "Leaked password protection".
  Em 2026-08-30 (mt-v682/684) também publicados e aplicados: **push-envia
  v11** (ação `prof` — push pro PROFESSOR autenticado pela senha da
  `push_config` selada; inscrições `prof:<uid>` na push_subs ficam fora dos
  avisos de aluno) e **pagamentos-webhook v9** (avisa o professor no evento
  'pago'); blocos SQL "PUSH PRO PROFESSOR" (push_config + push_avisa_prof +
  gatilhos em app_chat/app_agenda) e "AULA EXPERIMENTAL" (coluna horario em
  matriculas_online + RPC pública aula_exp_pede com freio de spam) rodados no
  banco E espelhados no setup — os dois conferidos no ar antes de republicar
  (v10 e v8 batiam com o repo).
  ⚠️ Antes de republicar qualquer função,
  CONFIRA o que está no ar: a v11 tinha duas melhorias que ainda não estavam no
  repo, e publicar por cima teria apagado as duas. Na v12→v13 essa conferência
  foi feita item a item (39 marcas do código publicado, todas presentes no repo)
  e o repo estava à frente em tudo, inclusive no tipo `misto` da corrida.
- Secrets — conferido pelo diagnóstico em 2026-08-24 (o ping de cada função diz
  o que ela enxerga; `diagnostico.html` é o caminho curto):
  - ✅ `ANTHROPIC_API_KEY` — **testada de verdade em 2026-08-24**: a IA de treino
    gerou ficha. A primeira chave colada foi recusada com `401 authentication_error
    "API key is invalid."` em TODA tentativa, e só uma chave nova resolveu.
    **A lição**: o ping (`ia: true`) prova só que o secret EXISTE (`!!env(...)`),
    não chama a Anthropic — chave pela metade, revogada ou suja passa no ping e
    falha no uso. O teste que vale é gerar um treino; o erro vem traduzido por
    `erroAnthropic` (401/403 = chave ruim, 429 = sem crédito/limite) e o motivo
    cru fica no log da função (`console.error("anthropic", status, corpo)`).
    Desde então o ping devolve `chaveIa` — tamanho, `comecaCerto` (sk-ant-),
    `pontasComEspaco` e `soAscii` — que separa "colada pela metade" de "copiada
    com lixo invisível" de "simplesmente errada", sem nunca mostrar a chave. E
    `env()` faz `.trim()`, porque espaço na ponta de um secret colado pelo
    celular derruba a chave certa com cara de chave errada.
  - ✅ `RESEND_API_KEY` + `EMAIL_DE` (`TORQUE ON <nao-responda@torqueon.com.br>`) —
    e o domínio `torqueon.com.br` está **verified** no Resend (região sa-east-1,
    envio habilitado), então o e-mail de senha chega na caixa do aluno de verdade,
    não só na do dono.
  - ✅ `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` — **par NOVO gerado em 2026-08-24**
    (a privada antiga tinha se perdido) e já nos Secrets: a push-envia responde
    `vapid: true`. Custo zero: a `push_subs` estava com ZERO inscrições, então
    não havia push de ninguém pra derrubar. A pública nova é
    `BCF653mK3mhwGp4W3c4Wq9MlprvFVwcfBGKDBmxVRdaI_S3y-umX1w6z1MyJuR_-WiO3IthaYSaDF9XMtK1O66I`
    e está nos CINCO arquivos do repo que a carregam (app/aluno-builder.js,
    apps/app-aluno.html, nutricao.html, demo-aluno.html, demo-paciente.html) —
    o comentário da push-envia dizia "TRÊS lugares", o que estava errado e foi
    corrigido. **O push só fecha o ciclo depois do mt-v597 entrar na main**: até
    lá o site entrega a pública ANTIGA pro app, o celular guarda ela e a
    assinatura feita com a privada nova não bate (a notificação é descartada em
    silêncio, sem erro nenhum aparecer).
  - ⚪ Opcionais e ainda desligados: `META_VERIFY_TOKEN`, `WHATSAPP_TOKEN`/
    `WHATSAPP_PHONE_ID`, `INSTAGRAM_TOKEN` (o robô da Meta) e a conta Pagar.me.
- Escala: o painel aguenta milhares de alunos (índices + paginação). Os passos
  seguintes, se a base crescer muito: fotos no Supabase Storage, IndexedDB no
  lugar do localStorage e sync incremental (salvar só o que mudou).
- Paridade NUTRI × PERSONAL: o app do paciente já tem XP, semana, medalhas e
  Comunidade — e o PAINEL já tem cadastro, anamnese, perfil e sub-abas (a
  pendência antiga estava desatualizada; auditoria em 2026-08-29). Do top-5 da
  auditoria, entregues: moderação da Comunidade (v655), filtros
  Sumindo/Encerrados + importador de pacientes (v656), gateway por
  profissional pag_config + baixa automática (v657), Resolver hoje no
  Início (v658), Check-ins "A semana" com Cobrar quem falta (v659), aba
  Financeiro consolidada (v660 — Atrasados com ação na linha, 6 meses,
  régua diaCobraN) e o app do paciente no motor novo (v661 —
  app/nutri-builder.js, pacote {html, dados, ver, stamp} com dados.tipo
  "nutri", autoPublicaAppsN republica só linhas que EXISTEM na nuvem e
  estão velhas). O VISUAL do app do paciente mora em app/nutri-skin.js
  (MT_NUTRI_SKIN, v665 — embutido pelo builder com guarda, mesmo desenho
  do aluno-skin: só tipo/raio/tamanho/espaço, nenhuma cor — a cor do
  consultório chega baked pelo builder; aparência se mexe lá, nunca no
  nutri-builder). O redesenho chegou no Nutri na v662: tokens --nt-* por
  papel (superfície/borda/texto/estados, valores que o Nutri já usava),
  apelidos --card/--linha/--cinza apontando pros tokens, modo claro num
  bloco só, e a base da v629 em verde (card com borda sem sombra, título
  15,5px caixa mista, botão 44px raio 11, sec com borda, whats com tinta).
  ⚠️ documentos autônomos (recibo, plano PDF, laudo, e-mail) e cor passada
  como CONFIG a módulo compartilhado (pagarme-cartao, BotBuilder) ficam
  com hex — tests/test-tokens-nutri.js recorta essas regiões e reprova
  hex novo no resto, além de medir a geometria nos dois temas.
  demo-paciente.html é gerado por tools/demo-paciente/regen-demo.js
  (v663 — app novo do nutri-builder com a Marina de 5 meses; regenerar
  quando o builder mudar).
