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
  200 com a MESMA credencial). Lista em `supabase/functions/` — as **10**, todas
  publicadas e ACTIVE: meta-webhook, chat-envia, whatsapp, envia-email (Resend),
  pagarme, push-envia, pagamentos, pagamentos-webhook, **pagarme-webhook** e
  **assinatura-loja** (as duas últimas entraram em 2026-08-25).
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

- Supabase (projeto `hdcufkaalxfhwmfwoiqp`, "metodo-torque") — FEITO pelo
  conector: as **10 Edge Functions** do repo estão publicadas com **Verify JWT
  OFF** (a pagarme antiga continua lá) e os blocos zap_config, RECEBER POR
  PROFISSIONAL, BAIXA AUTOMÁTICA MULTI-GATEWAY e push_subs do SQL foram rodados
  (tabelas, colunas, índices únicos parciais e RPCs conferidos). O SQL da
  Comunidade ele já tinha rodado. A **chat-envia está na v12** (2026-08-25), com
  as regras da v604 dentro dela — `MES_REGRA` (a IA monta o MÊS, 4 semanas de
  progressão, a 4ª sempre mais leve) e `BRIEF_REGRA` (a leitura do professor
  vence os números; adaptações e limitações são regra absoluta) — mais o
  `.trim()` do `env()` e o `chaveIa` do ping. ⚠️ Antes de republicar qualquer
  função, CONFIRA o que está no ar: a v11 tinha duas melhorias que ainda não
  estavam no repo, e publicar por cima teria apagado as duas.
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
- Paridade NUTRI × PERSONAL: o app do paciente já ganhou XP, semana, medalhas
  e Comunidade. Falta o painel (cadastro com anamnese, sub-abas, perfil).
