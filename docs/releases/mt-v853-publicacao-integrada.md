# mt-v853 — Publicação integrada

Integração das nove propostas abertas #864–872, autorizada pelo proprietário em
05/10/2026. Este arquivo descreve o artefato e os critérios de implantação; seu
conteúdo versionado não comprova sozinho aplicação de SQL ou publicação do site.

## Comportamento entregue

- Personal: seleção/troca de exercícios, criação de ficha com estados explícitos,
  rascunhos recuperáveis e agendamento que distingue salvamento de confirmação.
- Aluno: eventos imutáveis por sessão nos três players, correções e recuperação,
  sincronização com confirmação e tratamento de concorrência/revogação.
- Metas e conquistas: identidade estável por exercício, início prospectivo,
  duração ativa quando comprovada e revisão de dados antigos sem inventar IDs.
- Loja e parceiros: imagens reais opcionais, tratamento de falha e alternativa
  visual. Cortesia: interpretação do status e prazo já gravados no servidor.
- Demos acompanham o builder canônico. Preservados o menu com Alimentação e a
  apresentação de treino aprovada. Sem alteração da oferta comercial.
- `nativo/aluno` adiciona apenas contratos e persistência experimentais isolados;
  não integra sensores, relógios, distribuição nativa ou execução em segundo plano.

## Validação anterior ao CI

As 14 suítes focadas de prescrição, agenda, loja, metas, conquistas, cortesia,
sessão offline e sincronização passaram no Chromium e PostgreSQL 17.11 locais.
O teste combinado player → journal → correção → metas preservou identidade,
tempo ativo, etapas e rota. As duas fixtures de metas foram adaptadas ao journal:
executam o núcleo real e criam legado antes do primeiro histórico, conferindo
ausência de identidade inventada após salvar e recarregar.

A revisão integrada também corrigiu a limpeza definitiva do loader: revogação
ou registro removido eliminam os três novos namespaces locais do histórico.
O teste reproduziu o resíduo antes da correção e passou em 31 verificações após
o ajuste, preservando os bytes na troca normal de aluno e preferências genéricas.
A suíte de ciclo de vida/concessão de aba passou em 13 verificações.

## Consolidação do histórico

A proposta #867 recebeu uma implementação alternativa durante esta integração,
até `88e7fee`. A release mantém a integração dos três players de #871: sessão
por execução, recuperação, concessão exclusiva de aba e runtime incorporado para
uso offline. A alternativa de carregar outro controlador em paralelo foi
substituída por esse contrato único. O atalho já permanece na seção Treinos e
as verificações fortes de encerramento, edição obsoleta e quota foram preservadas.

Foram incorporadas as correções relevantes da revisão posterior: horário antigo
desconhecido sem timestamp inventado, origem da distância manual/GPS e prazo
exato do descanso durante a troca de série. A exportação inclui o journal e suas
revisões somente da identidade ativa, sem exportar credenciais ou outros alunos.
O SQL rejeita horário nulo em eventos que não sejam os originais legados
expressamente permitidos; revisões continuam com a hora real da correção.

Após esses ajustes passaram corrida/retomada (65), séries e descanso (81),
loader/exportação (42), editor dos players (49), sintaxe e bundle. O download
real contém originais e revisões da identidade ativa; exclui checkpoints com
token, inclusive `ptguiaSessao`, e não gera arquivo parcial se o acesso mudou.

A primeira execução completa do CI passou em 179/182 suítes e detectou três
imports de Playwright sem caminho resolvível no runner. Esses testes passaram
a usar a dependência travada em `tests/ci/node_modules`; os três foram verificados
sem `NODE_PATH`, `NODE_OPTIONS` ou `TORQUE_PLAYWRIGHT`. O gate continua exigindo
nova execução completa aprovada no commit final, sem dispensar suítes.

O histórico passou em núcleo, transporte, navegador, três players, múltiplas
sessões, concessão de aba, SQL e concorrência. O gerador aceita LF/CRLF sem
duplicação e preserva o restante do builder. Ver
`20261005-historico-integracao.md` e `backend-hq-cortesia-20261005.md`.

O Windows local não dispõe das dependências do WebKit. Auth/PostgREST reais são
testados exclusivamente no runner Linux descartável. Exigir a suíte completa e
o workflow HQ Auth verdes no commit final antes de aplicar o banco e mesclar.
Não reduzir gates ou declarar validação do iPhone físico a partir de WebKit.

## Implantação e evidência

1. Congelar commit, conferir CI, catálogo remoto e a definição anterior de
   `minha_assinatura`. Projeto: `metodo-torque` / `hdcufkaalxfhwmfwoiqp`.
2. Aplicar somente os três arquivos e hashes da allowlist em
   `backend-hq-cortesia-20261005.md`, na ordem OPS → Equipe → cortesia.
3. Aplicar a migration canônica
   `supabase/migrations/20261005150945_treino_historico_eventos.sql`.
   Não executar `db push` global nem instalar módulos opcionais.
4. Conferir migrations, funções, RLS, ACLs, gate de equipe desligado e negação
   anônima. Os testes positivos usam identidades sintéticas no CI; não criar
   clientes, usuários ou mensagens reais para testar produção.
5. Mesclar preservando o histórico das propostas. O Pages repete a suíte,
   prepara o artefato com configuração pública Mapbox e verifica a publicação.
6. Confirmar `release-info.json`, commit/versão, bytes servidos e navegação real.
   Registrar resultados remotos na descrição da PR da integração.

## Limites e recuperação

HQ OPS atende administradores já existentes. Equipe é cadastro administrativo;
`staff_enabled=false` não pode virar concessão de acesso incidental. Cortesia
não atribui benefícios nem cria política comercial. Não há backfill de eventos
ou reconstrução fictícia de treinos antigos. Metas não prometem sincronização
multidispositivo de todo o seu estado local.

Google Play, App Store, contas de desenvolvedor, smartwatch, campanhas, comissões,
gateway e convites Auth continuam separados. O GPS web pausa com a página oculta.
Os alertas de segurança legados exigem análise de contrato por endpoint; não
revogar em lote as RPCs anônimas que autenticam o aluno por token.

Em falha do HQ, suspender Equipe antes de OPS com os scripts dos pacotes,
preservando dados e auditoria. O histórico novo não deve ser apagado em rollback.
Restaurar frontend exige considerar compatibilidade dos eventos já gravados.
Restauração da assinatura usa a definição anterior capturada, sem alterar contas.
