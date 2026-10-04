# Histórico de sessões do aluno — fase 1, ainda sem ativação

Base inspecionada: `e11509237f9205e75db8d90565c5fb6db501252c`.
Escopo: aplicativo do aluno Torque Personal, musculação, corrida e circuito.
Não houve alteração em Personal, HQ, Pontal, agenda, Watch, banco remoto ou deploy.

## Diagnóstico

- `runtimeSeries` / `gGrava` em `app/aluno-builder.js` identificam uma série por
  dia e posições `ficha:exercício:série`. A ficha atual participa de consultas e
  volume; isso não comprova qual era a prescrição em uma data passada.
- O player já separa série selecionada e próxima pendente e permite corrigir
  séries feitas. Sua revisão ainda sobrescreve resultados e não mantém revisões.
- Corrida tem ID/checkpoint, etapas e rota efetivamente observadas. O histórico
  guarda resultados; não há snapshot completo universal da prescrição.
- Circuito tem ID/checkpoint e parte dos resultados prescritos/realizados.
  Alguns caminhos ainda limitam `ptwodres` às últimas 20 entradas.
- `app_retorno_mescla` faz união recursiva; listas não oferecem controle de
  revisão. `app_aluno_estado` no SQL versionado retorna `dados`, sem fornecer
  o histórico de `retorno` para restauração do aluno em outro dispositivo.
  Isso é inspeção local, não comprovação do contrato remoto implantado.
- `.agents/skills` não existe neste checkout; `/workspace/.agents` está vazio.
  Foram lidos `AGENTS.md`, contexto relevante de `CLAUDE.md`, README e design.

## Entrega desta fase

`app/treino-historico-core.js` fornece um journal sem dependência de DOM,
cronômetros, rede, check-in, medalhas, pagamentos ou Watch. Não foi carregado
pelo app; nenhuma mudança de interface ou de persistência atual está ativa.

- Snapshot imutável da prescrição por sessão/modalidade/data; IDs de execução
  independentes dos índices da ficha. O integrador deve gerar IDs aleatórios
  estáveis para sessão, alvo e operação **uma vez**, antes de tentar gravar.
- Eventos `start`, `result`, `correction`, `finish`, com autoria e horário ISO.
  O encerramento é propriedade da sessão; recibos concorrentes não criam uma
  segunda sessão. Correção exige motivo e não muda o recibo de encerramento.
- Resultado original e todas as revisões preservados. Heads concorrentes ficam
  em conflito, sem um valor escolhido silenciosamente. Resolução referencia
  todos os heads observados; rascunho obsoleto é recusado.
- União comutativa, associativa e idempotente. Mesmo ID/conteúdo diferente é
  erro explícito. Reenvio atrasado não desfaz correção. Parents ausentes ficam
  pendentes até chegar o restante do lote.
- Uma chave de armazenamento por evento e por identidade; nenhuma substituição
  de documento agregado nem limpeza automática de histórico. Quota interrompe
  uma gravação/lote com erro, preservando o prefixo já persistido para retry.
- `createLocked` serializa operações entre abas com o mesmo lock por identidade.
  Falta de locks é erro explícito, sem alegar CAS sobre localStorage.
  `create` é primitiva síncrona para ambiente com escritor já serializado/testes;
  não deve ser chamada diretamente por vários escritores de navegador.
- Preservação sem conversão dos valores JSON reais de corrida (intervalos,
  distância, tempo, ritmo, rota/origem) e circuito (rodadas, movimentos, reps,
  tempo e carga). O núcleo não fabrica campos ausentes nem recalcula métricas.
- Legado é marcado explicitamente e não aceita uma prescrição inventada.

## Persistência e transporte preparados localmente

A proposta `supabase/proposals/treino-historico.sql` e o adaptador
`app/treino-historico-sync.js` acrescentam leitura paginada e escrita de eventos.
São código para revisão/teste, ainda sem migração aplicada nem chamada pelo app.
A tabela tem RLS e nenhum grant de acesso direto ao aluno; RPCs autorizam pelo
token ativo, como o contrato atual do aplicativo. O ID do dispositivo/actor
é declarado pelo cliente, não uma identidade de profissional verificada.

A escrita serializa por aluno, recusa colisões, valida pais e ciclos, e reverte
o lote inteiro quando inválido. A leitura limita quantidade e bytes, com
cursor textual bigint. A sincronização só avança cursor depois da persistência
local e só confirma envios com ACK explícito. Eventos ficam locais em erros
ou se as RPCs não existirem. Não há backfill de prescrição antiga.

SQL validado em PGlite descartável, não em duas conexões PostgreSQL reais.
A proposta deve ser promovida a migration pela CLI e revista antes de qualquer
rollout. Nada foi executado no Supabase remoto.

## Fases restantes e critérios

1. **Concluída nesta entrega:** núcleo isolado, testes de estado e duas abas.
2. **Ainda não implementada:** integrar início/checkpoints/confirmação dos três
   players. IDs e snapshot precisam ser persistidos antes de executar; a escrita
   do journal e a compatibilidade de resultados existentes precisam tolerar
   falha entre etapas sem duplicação. Sessão nova deve ser ação distinta de
   corrigir registro. Reabrir série não deve reiniciar o descanso.
3. **Ainda não implementada:** consulta por sessão/data, prescrito versus
   realizado e editor por modalidade com original, revisões/horário, conflitos
   e limites de legado. Corrigir não deve chamar rotinas de conclusão/recompensa.
4. **Preparada e testada localmente, ainda não integrada:** proposta SQL e
   transporte autenticado de leitura/escrita e restauração em outro aparelho. Não ligar `packet()` ao merge genérico como
   se isso sozinho fosse um contrato completo: falta leitura, validação no
   servidor, isolamento, limites e confirmação. Projetar/testar SQL local se
   necessário; aplicar SQL remoto permanece fora da autorização.
5. **Bloqueada pela referência:** retirar apenas as réguas duplicadas após
   inspeção dos pixels de `IMG_0514.jpeg`. A Library resolveu o arquivo, mas
   a materialização pelo helper oficial falhou no download e na repetição.
   Nenhum URL alternativo, bypass ou cópia de outro workspace foi usado.
6. Após integrar: regenerar demos pelo gerador, rever precache/versão no lote
   de release e repetir checks de navegação, layouts/temas, acessibilidade,
   player, SQL local e CI. A fase isolada não altera demos ou cache.

A ausência da referência bloqueia a alteração visual dependente da imagem;
não constitui bloqueio técnico para toda a integração funcional. A integração das fases 2–4
permanece trabalho pendente, não funcionalidade entregue no app.

## Verificação desta fase

- `node tests/test-treino-historico-core.js`: 19 cenários sintéticos.
- `tests/test-treino-historico-browser.js`: 6 cenários em Chromium, incluindo
  duas abas reais, locks, 40 gravações concorrentes, duplo encerramento,
  reload/cancelar, quota offline e troca de identidade.
- `tests/test-treino-historico-sql.js`: 9 cenários SQL locais em PGlite.
- `tests/test-treino-historico-sync.js`: 7 cenários de transporte simulado.
- Nenhum dado de aluno, captura ou credencial entrou no Git ou nos testes.
- Histórico completo anterior à adoção não pode ser reconstruído quando não
  foi persistido. A introdução deste núcleo não recupera dados descartados.
