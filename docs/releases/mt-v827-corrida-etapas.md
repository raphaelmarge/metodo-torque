# mt-v827 — Prescrição de corrida por etapas

O editor passa a mostrar a sequência como caminho principal. O professor pode prescrever **correr 1 km → caminhar 100 m → correr 2 km → caminhar 200 m**, sem converter metros para frações de quilômetros nem encaixar todas as etapas em intervalos iguais.

## Experiência

- Lista numerada e aberta; toque na etapa para editar. Duplicação, ordem e remoção ficam no menu da própria linha, com comandos acessíveis pelo teclado.
- Atalhos para correr, caminhar, outra atividade e repetição de duas etapas. Cada trecho aceita quilômetros, metros, minutos ou segundos, além de orientação própria.
- Resumo soma somente grandezas conhecidas: `4 etapas · 3,3 km` ou `6 etapas · 1,5 km + 3 min`. Não estima tempo a partir de uma distância sem dados suficientes.
- Esforço opcional com alvo único ou faixa: sensação de 1 a 10, ritmo em min/km, frequência cardíaca em bpm e velocidade em km/h. Zona cadastrada é uma alternativa; sua biblioteca fica em uma seção secundária.
- Treinos simples existentes abrem no formato original. Contínuo, intervalado, misto, foto, planejamento e publicação continuam disponíveis. Salvar a prescrição e publicar no app permanecem ações distintas.

## Dados e execução

`alvo` conserva `valor`, `unidade` e `zona`. Os novos campos opcionais são `acao`, `esforco: {tipo,min,max}` e `orientacao`. A unidade `m` converte para quilômetros ao preparar o player. Orientações têm até 240 caracteres. O esforço direto e a zona salva são exclusivos; faixas inválidas são recusadas sem alterar o rascunho.

Os normalizadores em `assets/relatorio-0809.js` e `app/aluno-builder.js` produzem a mesma sequência. Sem campos novos, a saída legada permanece idêntica. A biblioteca não reescreve os snapshots de zonas dos treinos já prescritos. Rascunhos continuam isolados por conta e aluno; gravações mantêm o objeto original do store para conservar o controle de concorrência.

O player agora respeita a origem e o excedente de cada etapa também quando a distância é manual. Trechos curtos mostram metros, e as instruções faladas incluem a atividade e o esforço. GPS, pausa, avanço manual, tempo, intervalos antigos e sensores permanecem. Os alvos prescritos são instruções exibidas e faladas; esta versão não implementa comparação automática com sensores nem calcula zonas fisiológicas.

As três demos do aluno são geradas pela fonte canônica. O exemplo solicitado foi acrescentado somente aos dados demonstrativos, sem modificar alunos reais, Supabase, permissões ou regras de cobrança.

## Referências de interação

A separação entre duração da etapa e intensidade opcional segue os construtores documentados pela [COROS](https://support.coros.com/hc/en-us/articles/47285577958932-Create-Custom-Workouts-in-Your-COROS-App) e pelo [TrainingPeaks](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder). A sequência livre, a duplicação e as repetições foram adaptadas ao contrato existente do Torque. O [FAQ do TrainingPeaks](https://help.trainingpeaks.com/hc/en-us/articles/115003760832-Structured-Workout-Builder-FAQ) também fundamenta a distinção entre distância, duração e metas do atleta. Não foram adicionadas integrações com esses serviços.

## Verificação

- `test-corrida-etapas-personal.js`: montagem do exemplo, esforços, validações, edição, menus, rascunhos, snapshots, formato legado e contrato de publicação.
- `test-corrida-etapas-aluno.js`: igualdade entre editor e builder, execução real, GPS/manual, excedentes, saltos grandes, pausa, troca de modalidade de medição, tempo/distância e entradas inválidas.
- Suítes existentes de corrida, relatório e Personal mantêm suas verificações de comportamento, usando os novos caminhos de navegação.
- Layout conferido em 320, 390, 1129 e 1440 px, temas claro/escuro e cor personalizada. A publicação depende da suíte completa do repositório no commit efetivamente implantado.
