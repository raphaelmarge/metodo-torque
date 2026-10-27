# mt-v877 — Evolução orientada ao objetivo do aluno

Implementação local na branch do PR #900; conferir o CI do HEAD e o deploy antes
de tratar como publicada. A versão mt-v877 já estava reservada para o gerador.

## Comportamento

- Resumo começa pelas medalhas, seguido do objetivo e da meta semanal. Hipertrofia e força priorizam
  cargas comparáveis; emagrecimento e saúde mostram avaliação antes das cargas;
  condicionamento destaca as atividades registradas. O intervalo de 7, 28 ou 90
  dias continua disponível.
- Dias de descanso não quebram uma sequência diária apresentada como meta. O
  destaque passa a ser a semana; o aviso de descanso de hoje exige programação
  válida, considera substituições por data e os limites da etapa mensal.
- Uma conquista fica em destaque conforme o objetivo. A escolha fixada pelo aluno
  prevalece. Todas as conquistas, detalhes, medalhas 3D e compartilhamento continuam
  acessíveis. Nível e XP ficam em “Meu nível e XP”.
- Calendários, Corpo, histórico de cargas, Marcas e metas personalizadas permanecem.
  A alteração não concede XP, não aumenta cargas e não interpreta melhora clínica.
  O gerador mensal continua exigindo relato do aluno e confirmação do personal.

## Dados e limites

| Conteúdo | Fonte e estado alternativo |
| --- | --- |
| Objetivo | `objetivoApp`, novo campo opcional de `dadosAppAluno`, usa o objetivo do treino aplicado e depois o cadastro. Pacotes antigos podem usar `a.objetivo` ou o objetivo do onboarding local. Objetivo desconhecido publicado produz resumo neutro, sem substituição silenciosa por relato antigo. |
| Frequência | Dias verdadeiros de `ptfeitos`, com datas válidas e até hoje; `META` define o alvo semanal. Não altera a fonte original. |
| Cargas | Agrupador canônico `__cgEvolucao`, somente séries g2 concluídas, carga numérica não negativa e repetições positivas. Comparação exige mesmo exercício, unidade kg, base da carga, equipamento, variação, contexto de execução e variante. São necessários dois dias distintos dentro do período. Zero é válido; campos ausentes não viram zero. |
| Avaliação | Última avaliação de `AVS` no período: peso, cintura e gordura quando disponíveis. Ausência exibe estado vazio e atalho para Corpo; não declara ganho muscular ou perda de gordura a partir de carga/peso isolados. |
| Condicionamento | Quantidade e duração de corrida, caminhada ou bike em `ptcardio`, sem NF, parciais ou datas futuras. Tempo registrado não é apresentado como medida direta de condicionamento. |
| Conquista | Definições e métricas existentes de `medalhas-core`; prioridade pela relação com o objetivo e, depois, progresso na faixa. Pin local e isolado por aluno permanece. |

Registros legados sem contexto suficiente continuam no histórico, sem delta
presumido no resumo. O recurso de comparação depende dos metadados disponíveis;
não inventa equivalência para exibir um gráfico. As demos incluem dois exemplos
sintéticos com contexto explícito, gerados pelo pipeline canônico.

## Verificação

- Suíte `test-aluno-evolucao-objetivo.js`: cinco objetivos, legado/ausência/objetivo
  ambíguo, descanso, datas inválidas/futuras, zero e cargas inválidas, diferenças de
  contexto, filtros, prioridade/pin, nível recolhido e navegação para Corpo.
- Regressões de Evolução, Início, experiência v868, medalhas evolutivas/3D, metas
  personalizadas e integração do objetivo do treino no pacote do aluno.
- Geometria em 320, 390 e 1280 px, temas claro e escuro, preservação das fontes
  locais, testes com dados sintéticos e rede externa bloqueada.
- Três demos regeneradas; validação das variantes, JavaScript serializado, módulos
  do bundle e consistência da versão. Inspeção visual da demo local em Evolução.

Sem migração, escrita em dados reais de alunos, merge ou publicação nesta etapa.
