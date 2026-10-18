# mt-v866 — Planejamento semanal e receitas do Torque Nutri

Implementação em `/nutri/`, continuando o PR #888. O Nutri legado e a nutrição
integrada ao Personal mantêm os seus contratos. A versão global é mt-v866 e o
cache próprio do Nutri é v17, incluindo os novos módulos.

## Comportamento entregue

- Alternativas prescritas aparecem no plano do paciente e na impressão, mantendo
  as quantidades do alimento e da substituição separadas.
- Editor e paciente escolhem uma data. Os totais consideram apenas refeições
  previstas nesse dia. Revisão e impressão incluem a semana da data selecionada.
  Nutriente ausente permanece não informado. `endOn` é data de revisão; `fim`
  legado continua sendo fim da vigência.
- Receitas têm ingredientes quantificados, rendimento, preparo, fonte e cálculo
  por porção. A nutri revisa a composição antes de prescrevê-la. Uma receita
  anexada apenas como orientação não acrescenta nutrientes nem ingredientes às
  compras. A composição prescrita fica no snapshot do plano, independente de
  mudanças posteriores no catálogo.
- Compras aceitam períodos de 1 a 31 dias, opção padrão e escolhas diferentes em
  cada data. Ingredientes da receita são multiplicados pelas porções e divididos
  pelo rendimento. Medidas distintas, cru e cozido não são convertidos ou somados
  automaticamente. Principal e alternativa nunca são contados juntos.
- As escolhas de compras ficam neste navegador, isoladas por conta, clínica,
  paciente, plano, versão e assinatura do conteúdo. Não há sincronização dessas
  preferências entre dispositivos. Falha de armazenamento é informada.
- A revisão mostra diferenças antes da publicação. O paciente vê “O que mudou no
  meu plano” usando somente histórico publicado acessível do mesmo paciente e
  plano; snapshots conflitantes não são escolhidos pela ordem de chegada.
- Lembretes opcionais de consultas e questionários usam Web Push. O paciente
  escolhe antecedência/horário, ativa o aparelho e pode desativar. O worker verifica
  a conta vinculada e usa texto genérico, sem conteúdo clínico na notificação.

## Lembretes: implantação separada

Publicar o frontend não ativa envios. O serviço depende da release
[`nutri-reminders`](../../supabase/releases/nutri-reminders/README.md) no projeto
separado `mmdsmpetwhcfiyubhaah`. A estrutura SQL, a Edge Function v1 e a chave
pública VAPID foram provisionadas em 17/10/2026, com o serviço desligado.
Os secrets privados foram preparados fora do repositório, com o contato
informado pelo responsável; seu cadastro remoto depende de autenticar o CLI.
Cron e envio continuam pendentes. Não cria assinaturas de pacientes por conta
própria. Homologação deve usar conta/aparelho de teste com
consentimento explícito antes de habilitar o serviço.

Nenhuma migração de planos é necessária: o schema capturado já conserva os novos
campos JSON, o controle de versão e o histórico. Isso foi exercitado em banco
descartável; não equivale a um teste com Auth e pacientes reais.

## Evidências reproduzíveis

- `tests/test-nutri-day-changes{,-browser}.js`: dias, vigência, totais, PDF,
  diferenças, precisão e compatibilidade das porções legadas.
- `tests/test-nutri-recipe-composition{,-browser}.js`: composição, revisão,
  publicação demonstrativa, imutabilidade, campos legados e telas responsivas.
- `tests/test-nutri-weekly-shopping{,-browser}.js`: alternativas por data,
  persistência/isolamento, versão alterada, armazenamento indisponível e receitas.
- `tests/test-nutri-plan-evolution-sql.js`: publicação e CAS reais do schema
  capturado, histórico imutável, snapshot de receita e isolamento entre usuários.
- `tests/test-nutri-reminders*.js`: regras SQL com PGlite, transporte injetado,
  opt-in, troca de conta, saída, reentrada e service worker.
- `tests/test-nutri.js`, testes existentes de prescrição, compras e workspace:
  regressões dos contratos anteriores e cache por diretório.
- `nutri/checks/build-preview.py`: prévia portátil demonstrativa; sem configuração
  do banco, autenticação ou registro de worker.

Os testes usam dados sintéticos e não enviam notificações reais. O estado do CI e
da publicação deve ser consultado no commit do PR; este documento não declara
produção validada.

Em 17/10/2026 passaram localmente 38 suítes selecionadas (24 do novo Nutri,
13 da nutrição legada/integrada e a verificação de versão), com Node 24 e Chrome
do sistema via Playwright 1.63.0. As suítes antigas precisaram de `NODE_PATH` e
`CHROMIUM_PATH` explícitos no Windows; após essa configuração, as nove que não
encontravam o navegador também passaram. A suíte de concorrência financeira com
PostgreSQL externo permanece para o CI Linux, fora deste lote local.

A prévia portátil foi navegada em 19 áreas do paciente, sem erros de JavaScript,
rede, backend, registro de worker ou pedidos de permissão. O dispatcher passou
em `deno check` inclusive no Deno 2.1.4, com lockfile v4.

## Atualização consolidada com o PR #889

- O worker Nutri v17 revalida os arquivos HTTP e só ativa após completar todo
  o precache. A ativação não recarrega documentos nem apaga dados de pacientes.
- A instalação ocorre em paralelo à conta; o cliente negocia o protocolo de vínculo; v14 sem
  assinatura não causa aviso falso de revogação. Workers com assinatura e sem
  resposta continuam sendo tratados como erro. Troca de controlador refaz o
  vínculo da conta, sem pedir consentimento ou ativar o serviço.
- `tests/test-nutri-update-browser.js` exercita v14 → v17, queda na instalação,
  fila/rascunho, caches de outros produtos e recursos offline em Chromium e
  WebKit no CI. Localmente foi executado em Chromium; iPhone físico não testado.
- A primeira integração mantém mt-v866; a integração seguinte do Personal deve
  usar mt-v867, conservando o precache Nutri e os módulos das duas branches.
