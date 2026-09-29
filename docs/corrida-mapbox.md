# Mapbox no app do aluno

Referência de configuração e operação: 29/09/2026. A conta do proprietário está configurada. A variável de repositório do GitHub Actions `MAPBOX_PUBLIC_TOKEN` foi criada pela API (HTTP 201) e sua leitura posterior confirmou o valor esperado, sem expô-lo. Estilo HTTP 200 e renderização real com percurso fictício foram validados. O gate completo do commit final e a publicação ainda precisam ser confirmados.

## Escopo

O mapa é uma camada de visualização da corrida. O registro dos pontos, a distância, as pausas, os segmentos e a recuperação da sessão continuam sob responsabilidade do TORQUE. Usar Mapbox não acrescenta automaticamente os dados, segmentos, rankings ou funções sociais do Strava.

`runtimeMapaMapbox(C)` fica em `app/aluno-builder.js` e é incorporado ao documento gerado pelo construtor. O SDK externo Mapbox GL JS 3.30.0 é carregado sob demanda. A integração utiliza uma instância de mapa, reaproveitada entre os modos compacto e ampliado. A configuração gerada na publicação preenche `MT_MAPA.mapboxToken`; o mapa anterior permanece como alternativa durante falhas do mapa ao vivo.

`assets/mapa-config.js` é carregado depois de `assets/cloud-config.js` no app e no Personal. As demos carregam a mesma configuração antes do runtime simulado. A cópia versionada é um arquivo sem token; a publicação gera sua configuração a partir da variável Actions. `cloud-config.js` preserva as demais configurações e não recebe o token Mapbox. Falta ou falha da configuração, SDK, estilos e mapas remotos não deve bloquear a execução ou o salvamento da corrida.

## Configuração e manutenção

1. Usar token público dedicado, com prefixo `pk.`, e os escopos `styles:read` e `fonts:read`. Token secreto `sk.` não pode ficar no frontend. Gerenciar na [página de tokens](https://console.mapbox.com/account/access-tokens/).
2. Conferir Allowed URLs para `https://www.torqueon.com.br`; a resposta HTTP 200 não comprova que outros domínios estejam bloqueados. Não incluir a prévia privada do Sites por padrão.
3. Nos testes locais reais, preferir token separado para `http://localhost:8765`, ajustando a porta. Restrições de URL não aceitam IPs ou curingas.
4. Para substituir o token, atualizar a variável de repositório Actions `MAPBOX_PUBLIC_TOKEN` e executar a publicação pelo fluxo normal. Não colocar o valor em arquivos versionados. O arquivo gerado `assets/mapa-config.js` preserva as outras configurações e define `MT_MAPA.mapboxToken`. O token público fica visível no navegador; restrições reduzem abuso, sem dispensar monitoramento.
5. Validar no domínio autorizado. Um teste de terminal sem `Referer` pode receber 403 mesmo com chave válida.

Fonte: [gerenciamento, escopos e restrições dos tokens](https://docs.mapbox.com/accounts/guides/tokens/).

Não colocar token de produção em exemplos, capturas, relatórios ou fixtures. Os testes automatizados devem usar SDK simulado ou recursos locais. A validação do SDK real deve usar coordenadas fictícias e registrar somente o resultado, sem imprimir o token.

O GitHub Push Protection bloqueou a tentativa inicial de versionar o token. A solução é mantê-lo fora do Git e gerar a configuração de implantação; não desativar nem contornar essa proteção. O arquivo gerado continua público no site, pois é uma credencial pública de navegador, e deve ser protegido pelas restrições de origem e pelo acompanhamento do consumo.

## Rede, cache e publicação

- O builder já pertence ao precache e ao fluxo de atualização dos dois service workers. Uma mudança de produto exige atualizar as três versões do repositório, regenerar as demos e executar os testes definidos em `CLAUDE.md`.
- A configuração também precisa chegar aos navegadores com cache. Verificar `assets/mapa-config.js` no domínio publicado por hash, sem imprimir o conteúdo, e depois testar uma instalação existente do app.
- No fluxo de publicação, `REQUIRE_MAPBOX_PUBLIC_TOKEN=true` exige a configuração válida; variável ausente ou inválida deve interromper a criação do artefato. Testes locais e de PR usam o arquivo versionado sem token, sem depender da conta de produção.
- Não acrescentar download em massa de tiles nem tratar o cache HTTP eventual como mapas offline garantidos. Os service workers atuais não armazenam recursos de outro domínio.
- Preservar a ausência de Mapbox quando não há token. Se SDK, WebGL, estilo ou tiles falharem, manter o registro da corrida e oferecer a alternativa existente com estado honesto.
- A política de referência deve permitir que o Mapbox receba a origem. `strict-origin` é uma opção que envia só a origem; `no-referrer` e `same-origin` impedem a autenticação de tokens restritos. Não enviar identificadores do aluno ou parâmetros de acesso em URLs Mapbox.
- Se houver CSP, adaptar a política existente aos recursos usados: CDN do SDK, `api.mapbox.com`, `events.mapbox.com`, imagens `data:`/`blob:` e workers. Não substituir a CSP inteira por um exemplo de documentação. SDK e CSS devem usar a mesma versão fixa.

Fonte: [segurança, políticas de referência e testes do GL JS](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/).

### Conferência da publicação

1. Confirmar os testes do commit final e as três versões iguais. Conferir que nenhum token real entrou no Git; os fixtures podem conter somente valores sintéticos.
2. Validar a geração de `assets/mapa-config.js` no mesmo fluxo que prepara o artefato aprovado. A variável deve definir somente o token público do mapa, sem reescrever outras configurações ou fontes do produto.
3. Registrar em `release-info.json` o commit, a versão e o SHA-256 dos bytes de `assets/mapa-config.js` já gerado. Esse metadado deve ser produzido depois da geração da configuração e pertencer ao mesmo artefato enviado ao Pages.
4. Comparar os arquivos de produto publicados com os respectivos arquivos do commit aprovado. A única exceção de conteúdo entre fontes versionadas e produto servido é `assets/mapa-config.js`, cuja referência é o hash do artefato gerado. `release-info.json` é metadado gerado da publicação, não uma fonte do produto. Qualquer outra diferença exige investigação.
5. Baixar a configuração servida sem registrá-la em logs. Calcular seu SHA-256 e compará-lo com o metadado e com o artefato aprovado. Registrar somente caminho, hash e resultado. Uma configuração válida, mas pertencente a outro artefato, não comprova esta publicação.
6. Testar a página publicada com percurso fictício, verificar carregamento das ruas/relevo, atribuição e alternância entre mapa e métricas; testar também uma instalação anterior. Não usar alunos reais nem reproduzir URLs de requisições que contenham o token.

O hash permite rastrear a configuração efetivamente servida. Ele não comprova sozinho funcionamento, restrição de origem ou ausência de cobranças.

## Custos e atribuição

Na consulta de 29/09/2026, Mapbox GL JS por carregamentos inclui 50.000 carregamentos web por mês sem cobrança. A faixa seguinte, de 50.001 a 100.000, custa US$ 5 por mil carregamentos. Preços em dólar, sujeitos às condições da conta e a alterações; acompanhar consumo no painel. Não contratar outro produto por inferência.

Um carregamento é contado ao criar uma instância de `Map`. Movimentar, ampliar e trocar camadas ou estilos dessa instância não gera outro carregamento; uma sessão tem duração máxima de 12 horas. Reutilizar a instância evita criar novos carregamentos a cada atualização do GPS. Rotas, busca, geocodificação e SDKs nativos têm produtos e condições próprios.

Fontes: [preços vigentes](https://www.mapbox.com/pricing/) e [unidade de cobrança do GL JS](https://docs.mapbox.com/mapbox-gl-js/guides/pricing/).

Manter o logotipo Mapbox e a atribuição do SDK legíveis em 320 px, inclusive no modo ampliado. Mapas com dados Mapbox exigem crédito ao Mapbox, ao OpenStreetMap e o link de correção do mapa; camadas adicionais podem exigir outros créditos. Não esconder esses controles por CSS nem cortar o rodapé. Fonte: [atribuição oficial](https://docs.mapbox.com/help/dive-deeper/attribution/).

## Privacidade e limites

O GL JS usa armazenamento local com prefixo `mapbox.eventData` e envia eventos de uso ao Mapbox. Não apresentar o serviço como inteiramente local ou sem comunicação com terceiros. A ativação deve vir acompanhada da conferência do aviso de privacidade do TORQUE sobre mapas externos e localização. Fonte: [armazenamento do SDK](https://github.com/mapbox/mapbox-gl-js/blob/main/STORAGE.md).

As coordenadas usadas para desenhar o percurso e os dados pessoais do aluno não devem ser enviados a APIs de upload, Directions ou Map Matching nesta integração. O mapa recebe os pontos para desenhá-los no navegador. A área visualizada fica identificável nos pedidos dos recursos do mapa, e os eventos próprios do SDK continuam existindo; não afirmar que nenhuma informação de localização sai do aparelho.

O app web pausa a corrida quando o documento fica oculto. Esta integração não garante GPS com a tela bloqueada, continuidade em segundo plano, economia de bateria ou precisão equivalente a um app nativo. A captura e os testes físicos precisam ser tratados separadamente. Manter a tela ativa, quando suportado, não equivale a gravar com a tela apagada.

Não há download de regiões offline nesta implementação web. A documentação de regiões offline do Mapbox descreve os SDKs nativos Android e iOS; adotá-los seria outra etapa. Fonte: [mapas offline nativos](https://docs.mapbox.com/help/dive-deeper/mobile-offline/).

Uma futura integração nativa também precisa de token próprio: as restrições de URL dos tokens web não atendem aos SDKs nativos. A telemetria de localização dos SDKs iOS/Android requer opção de recusa pelo usuário, conforme [orientação oficial de telemetria](https://www.mapbox.com/telemetry). Google Play e App Store continuam fora deste lote.

## Aceitação e evidências

| Cenário | Resultado esperado |
| --- | --- |
| Sem token | Não inicializar Mapbox; mapa anterior, treino, registro e histórico continuam acessíveis. |
| Token secreto ou formato inválido | Não enviar o valor ao provedor; usar alternativa segura. |
| Token público, origem permitida | Estilo e tiles carregam; mapa apresenta logotipo e atribuição legíveis. |
| Origem não permitida, token revogado ou falha de rede | Falha do mapa não interrompe o cronômetro nem apaga pontos/sessão. |
| GPS negado ou fraco | Estado explícito; nenhuma posição fictícia apresentada como real. |
| Pausa, perda de sinal e retomada | Não criar linha reta entre trechos separados nem somar distância de salto. |
| Compacto e ampliado, repetidos | Uma instância reaproveitada; foco, controles e percurso preservados. |
| 320, 390, 768 e 1440 px | Controles utilizáveis, atribuição visível, sem rolagem lateral. |
| App já instalado | Nova configuração chega pelo fluxo de atualização; sessão/histórico preservados. |
| Android e iPhone reais | Registrar comportamento de GPS na rua, tela bloqueada, áudio, bateria, conexão e retomada. |

Estado desta atualização documental: **variável Actions criada e conferida; estilo e renderização real validados com percurso fictício; gate final e publicação pendentes de verificação**. Os testes simulados comprovam apenas os contratos exercitados. Até haver ensaio físico, registrar **GPS e comportamento em segundo plano não verificados**. Não confundir publicação do código com aprovação das lojas.
