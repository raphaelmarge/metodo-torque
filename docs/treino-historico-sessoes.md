# Histórico por sessão — Torque Personal

Base: `e11509237f9205e75db8d90565c5fb6db501252c`. PR draft #867.
Não altera Personal, HQ, Pontal, agenda ou Watch. Não aplica SQL remoto.

## Comportamento implementado

O app aluno carrega um journal local imutável e captura a prescrição ao iniciar
musculação, corrida e circuito no player. Resultados e correções referenciam a
sessão, sem consultar a ficha atual para reconstruir o passado. Cada nova
execução recebe outro ID. O botão “Histórico por sessão · corrigir resultados”
permite filtrar a data, consultar prescrito/realizado e corrigir informações
sem chamar conclusão, check-in, medalha ou pagamento.

- Musculação: snapshot da ficha e de cada série; carga/reps/RPE originais e
  revisões. Voltar à série preserva o prazo absoluto do descanso em andamento.
- Corrida: plano, blocos/intervalos, etapas efetivamente registradas, distância,
  duração, ritmo e rota/origem disponíveis. Correção de distância/tempo é
  identificada como manual e preserva o original, incluindo GPS quando existe.
- Circuito: receita/configuração no início, movimentos e resultados reais
  disponíveis, incluindo reps por rodada, tempos, placar e adaptações.
- Revisões têm motivo, autoria declarada pelo dispositivo e horário. O original
  não é substituído. Dados antigos sem horário têm `at:null`, nunca o horário
  da importação disfarçado de execução. Prescrições antigas não salvas são
  explicitamente indisponíveis; a ficha atual não preenche essas lacunas.
- Duplo encerramento não cria segunda sessão. Recibos concorrentes podem
  coexistir, mas projetam uma única sessão encerrada. O editor de histórico é
  independente dos efeitos dos players.

## Persistência e concorrência

`app/treino-historico-core.js` mantém uma chave de localStorage por identidade
 e evento. IDs aleatórios impedem sobrescrita entre escritores; união é
idempotente. Mesmo ID com conteúdo diferente é erro. Pais ausentes ficam
pendentes. Revisões concorrentes são mantidas como conflito explícito, sem
escolher um vencedor silenciosamente. Um editor obsoleto deve reabrir o
registro; a resolução de conflito referencia todos os heads observados.

O adapter síncrono dos players usa essa união de eventos. `createLocked` também
está disponível para fluxos assíncronos com Web Locks; locks não são usados
como alegação de transação/CAS em localStorage. Quota interrompe a gravação,
preserva os eventos já persistidos e mantém retry disponível. Não há limpeza
automática do journal. As projeções antigas permanecem por compatibilidade;
o histórico novo é a fonte de consulta das revisões posteriores.

`app/treino-historico-sync.js` envia lotes e busca páginas usando RPCs dedicadas.
Só avança cursor após persistência local e só confirma envio após ACK. Falhas,
ausência das RPCs e offline mantêm os eventos locais e status pendente.
Identidade é conferida novamente depois das respostas assíncronas.

## SQL preparado, não aplicado

`supabase/proposals/treino-historico.sql` propõe tabela com RLS, sem grant direto
para aluno, e RPCs autenticadas pelo token ativo do contrato existente. Escrita
serializa por aluno, valida pais/ciclos/limites e reverte lotes inválidos.
Cursor bigint é transportado como texto. Actor é declarado pelo cliente,
não identidade verificada de profissional.

O transporte está ligado no app, mas sincronização entre aparelhos depende da
aprovação, promoção da proposta a migration pela CLI e aplicação das RPCs.
Nada foi executado no Supabase remoto. Não há promessa de sincronização
implantada nem recuperação de informação que nunca foi salva.

## Verificação e limites

Testes sintéticos cobrem núcleo (19), duas abas reais (6), transporte simulado
(7), SQL PGlite (9) e integração nos três players (15). Há suíte PostgreSQL
com duas conexões e observador para locks, idempotência e revogação, executada
no CI; o executor local não dispõe de PostgreSQL/PGTESTURL. Regressões dos
players de musculação, corrida e circuito também foram executadas.

A consulta importa somente dados legados ainda presentes no aparelho. Registros
antigos truncados, prescrição ausente ou dados de outro aparelho indisponíveis
não são reconstruídos. O cronômetro utilitário antigo permanece um produtor
legado; ele não é o player de circuito prescrito/livre integrado nesta entrega.
As revisões novas não reescrevem retroativamente todos os widgets antigos de
estatísticas: ficam disponíveis no histórico por sessão.

A retirada de `.gserie-rulers` continua bloqueada pela exigência de inspeção
local de pixels. A Library resolveu `IMG_0514.jpeg`, mas o helper oficial
falhou no download e na repetição oficial. Não houve bypass nem uso da imagem
como dado de teste. Nenhuma captura original ou dado real entrou no Git.
