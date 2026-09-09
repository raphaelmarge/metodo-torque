# Questionários do Personal — reformulação móvel (proposta mt-v806)

## Estado da entrega

Implementação proposta em branch separada; não aprovada para publicação.
Base: `0418af16a0c97b285dd2c54e12902af9b47493dc` (merge do PR #804).
Fontes locais extraídas do artefato `github-pages` do run `34287820496`.
O conteúdo de `personal.html` foi conferido pelo hash Git do blob.

## Experiência

- Questionários antes do banco de perguntas; criar, preparar envio e enviar continuam ações distintas.
- Nome e pergunta primeiro; código interno automático e pontuação recolhidos em opções avançadas.
- Modelos Disposição, Sono, Dor e Recado preenchem apenas o rascunho.
- Tipos Carinhas, Nota 0–10 e Texto livre, com prévia do conteúdo da pergunta.
- Rótulos e pontos das carinhas em campos separados, mantendo os controles serializados originais.
- Interpretação atual explícita. Texto livre não apresenta controles de pontuação ou inversão.
- Cartões compactos, ações secundárias recolhidas, contagem de perguntas selecionadas.
- Duplicidades antigas preservadas e sinalizadas; códigos novos repetidos são recusados.
- Pergunta vinculada a questionário não oferece exclusão pela nova interface.

## Limites de alteração

`personal-questionarios.js` e CSS formam uma camada isolada. O carregador foi
acrescentado ao módulo `personal-ferramentas.js`, preservando seu conteúdo anterior.
Os controles/IDs e listeners originais são movidos, não clonados. Gravações usam
os handlers canônicos. Não há chamadas remotas ou gravação direta no novo módulo.
Não foram modificados `personal.html`, `apps/store.js`, o builder do aluno, Edge
Functions, políticas RLS ou dados reais. Supabase consultado somente para metadados.

A atualização proposta inclui os dois assets no precache e sincroniza mt-v806
nos três arquivos de versão. Isso não confirma que a versão está em produção.
O eventual merge deverá revalidar a versão caso main tenha avançado.

## Testes executados

`tests/test-questionarios-usabilidade.js`: **30 verificações aprovadas**. Fixture
DOM offline em Chromium, com seção HTML e handlers canônicos reais, armazenamento
em memória e dados fictícios. Confere criação de perguntas/questionários, códigos,
pontos negativos/zero, payload da direção, seleção, preservação dos registros,
rascunho após render, IDs e ausência de overflow em 320/375/390/430/1280 px nos
temas claro e escuro. Não inicializa autenticação ou sincronização e não atesta
entrega no app do aluno, Safari real nem o carregamento completo da página.

Com Playwright instalado, executar:

```sh
CHROMIUM_PATH=/caminho/do/chromium node tests/test-questionarios-usabilidade.js
```

A variável CHROMIUM_PATH é opcional se o Chromium do Playwright estiver disponível.
QPX_SHOTS pode apontar para uma pasta existente para produzir as prévias.
`tests/test-versao.js`: **17 verificações aprovadas**.

A tentativa da suíte completa terminou com **51 suítes, 40 com falha**; não está
verde. Muitas falhas são navegação bloqueada por política do navegador
(`ERR_BLOCKED_BY_ADMINISTRATOR`), caminhos de Playwright indisponíveis e arquivo
de workflow não incluído no artefato Pages. Não foram contornadas políticas.

### Pendência independente: sincronização

`tests/test-sync-cas.js:15` falhou esperando
`base_atualizado = 2026-09-06T12:00:00+00:00`, mas recebeu `undefined`.
A mesma falha foi reproduzida extraindo SOMENTE `apps/store.js`,
`tests/test-sync-cas.js` e `tests/test-sync-identidade.js` do artefato original em
uma pasta limpa. `apps/store.js` local é byte a byte idêntico ao original; o
arquivo no commit-base do GitHub também foi consultado. Essa evidência não basta
para concluir o impacto em produção ou a causa do incidente. Precisa ser
investigada separadamente; não corrigida nem encoberta por esta reformulação.

## Critérios antes de publicar

1. CI completo no checkout do PR, distinguindo falhas preexistentes de regressões.
2. Safari/iPhone: teclado, foco, campos avançados, rolagem e botão Salvar acessível
   com a barra inferior real; verificar também tema claro e desktop.
3. Login real em ambiente de teste, navegação entre áreas e manutenção do rascunho.
4. Criar pergunta → montar questionário → preparar envio → confirmar destinatário
   → enviar → responder no app do aluno → conferir resposta no painel.
5. Duas sessões/dispositivos, desconexão e reconexão: investigar a falha de CAS e
   garantir que esta mudança visual não seja aprovada como correção de dados.
6. Atualização do service worker e carregamento dos novos assets online/offline.
7. Manter intactos IDs, questionários e respostas existentes; não deduplicar nem
   excluir dados de produção durante a revisão visual.

Não há migração de banco. Reverter este PR reverte somente a camada de interface
e as referências de assets/versão, sem restaurar snapshots de dados.
