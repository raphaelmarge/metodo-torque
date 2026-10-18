# mt-v867 — integração dos PRs #888 e #889

Os dois PRs partiram de `565f6edcda0748222f4b29289325daebfbd65d91` e
declaravam mt-v866. A integração preserva o Nutri do #888 e acrescenta o
acompanhamento do #889 com uma versão nova. Não reutilizar o nome de cache de
uma release já servida: no portal, o runtime anterior tem precedência sobre o
precache e poderia devolver um arquivo antigo mesmo após uma nova instalação.

## Ordem e recursos

1. Integrar o #888 com mt-v866 e o worker próprio do Nutri v17.
2. Integrar o #889 contendo o #888, com mt-v867 literal em `assets/versao.js`,
   `sw.js` e `app/app-sw.js`.
3. Publicar somente o artefato do commit aprovado pelo workflow Pages. O guard
   existente pode suprimir uma implantação intermediária superada por outro
   merge; por isso também se testa o salto direto 865 → 867.

O portal conserva os 14 recursos novos de acompanhamento; o esqueleto do aluno
conserva os sete módulos novos. `app/evolucao-style.js` continua gerado pelas
três folhas canônicas e incorporado ao HTML do aluno. O Nutri mantém seus 62
recursos e escopo independente. Os caches do mapa e da visão permanecem fora
do cache de cada release. Ativação remove somente o namespace do seu produto.

## Atualização e compatibilidade

- Nutri: precache e leitura de arquivos revalidam o HTTP cache. Instalação só
  assume o controle depois do precache completo, sem recarregar a página.
  A negociação de capacidade tolera o worker v14 sem assinatura; worker com
  assinatura e sem resposta não é considerado revogado. Troca de controlador
  refaz o vínculo atual. Respostas atrasadas continuam sem poder restaurar a
  conta anterior. Falha transitória de capacidade permite nova tentativa.
- Aluno: registro com `updateViaCache: none`, procura explícita de atualização
  e leitura de rede com `no-cache`, preservando os caminhos offline e os
  pacotes `{html,dados,ver,stamp}` anteriores. Não há limpeza de localStorage.
- Personal: recarregamento automático também espera o fechamento de diálogos,
  o término de mídia e das ações de acompanhamento. Fichas originais, sessões
  em andamento, histórico e variações aprovadas continuam separados.
- Nenhuma migração adicional de dados faz parte desta consolidação. Nutri
  independente, Nutri legado e nutrição integrada mantêm seus contratos.

## Seis falhas de CI do #889

| Suíte | Correção |
| --- | --- |
| `test-aluno-hero-full-bleed.js` | Fixture com origem HTTP local válida, permitindo APIs seguras e URLs da demo; permanecem as 100 verificações geométricas. |
| `test-celular-painel.js` | Ação “Analisar vídeo”, com nome acessível completo, cabe no cabeçalho móvel sem partir o rótulo. |
| `test-corrida-saude-v866.js` | Espera o evento real de fechamento remover o diálogo antes da asserção. |
| `test-evolucao-integracao-v866.js` | Usa a instalação do Playwright definida no lock do CI. |
| `test-metas-personalizadas-core.js` | Fixture fornece a GUIA canônica ao gravador real; preserva os casos de identidade e legado. |
| `test-personal.js` | Inclui a nova ação mantendo Chat/Agendar; verifica capture no input de foto; novas folhas usam a paleta do aluno, sem cores padrão vazando na personalização. |

As demos foram regeneradas pelo gerador canônico. Não se removeu funcionalidade
para acomodar as asserções.

## Evidências e limites

- `tests/test-service-worker-upgrade.js`: workers reais em Chromium e WebKit;
  865 → 866 → 867 e 865 → 867; instalação interrompida, cache runtime antigo,
  recursos offline, rascunho, pacote legado, fila e caches de outros produtos.
- `tests/test-nutri-update-browser.js`: worker publicado v14 → v17, sem reload,
  conta atual vinculada, saída legada, precache incompleto e recursos offline.
- `tests/test-nutri-reminders-browser.js`: consentimento explícito, revogação,
  corrida entre contas, reinício do worker e recuperação de resposta tardia.
- Localmente passaram os testes de atualização em Chromium, versão (17),
  integração de treinos (36), identidade/legado (47), versões/progressão (34),
  topo (100), painel móvel (19), infraestrutura (74) e bundle canônico.
  O CI do commit final é a referência para o lote completo e WebKit.

Não foi realizado teste em iPhone físico ou PWA instalada no iOS. WebKit no CI
é evidência de motor, não de integração com o sistema operacional. Lembretes
continuam desligados no serviço; habilitação e envio real dependem da
homologação separada descrita na release Nutri. Saúde nativa e OAuth de relógios
continuam sujeitos aos limites documentados no #889. O SHA e a versão de
`release-info.json` precisam ser conferidos após o deploy.
