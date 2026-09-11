# Alimentação e agenda integrada — mt-v821

Pedido do Raphael: concluir o visual tecnológico e funcional da Alimentação e levar o plano alimentar por horário aos calendários do aluno.
Base revisada: main 81a912adb7644bffa1cd72400c766ddb581c1366, mt-v820.

## Interface e comportamento

- Alimentação mantém Refeições, Diário e Planejar. A nova composição usa cartões, destaque da próxima refeição, busca por refeição/alimento e filtros Todas / Sem registro / Registradas. Foto e repetição abrem os fluxos existentes; navegar não registra consumo nem dá XP.
- Minha semana na Home, Agenda principal e calendário mensal da Evolução usam a mesma projeção somente de leitura. Bolinha roxa indica treino/agenda programados; verde indica alimentação programada. Dias com os dois recebem as duas marcas. A legenda explica as cores, sem substituir o histórico de treinos.
- Ao selecionar o dia, refeições e atividades aparecem por horário. Tocar na refeição abre Alimentação na mesma data e dá foco à refeição correta. Tocar numa data da Evolução abre a Agenda daquele dia.
- Datas futuras permitem consulta ao plano, mas não confirmação antecipada de refeições. O registro continua exigindo ação explícita e data não futura. Uma edição aberta conserva seus campos e sua própria data ao navegar.
- Horário, dias da semana e vigência vêm do plano já publicado. O profissional pode definir horário por refeição, selecionar os dias e usar Todos os dias. Essas alterações permanecem rascunho até aplicar/publicar pelo fluxo existente. Nenhum horário, alimento ou prescrição é inventado pelo calendário.
- Plano pausado, ausência de plano, datas fora da vigência e dias sem refeições não recebem bolinhas verdes. A bolinha é programação, não prova de consumo. Registros não apagam a marca de programação.

## Preservação

Sem mudanças em Supabase, RPCs, RLS, schema, dados reais, core nutricional, snapshots, fotos, regras de XP, treino ou sincronização CAS. Demos devem ser regeneradas juntas pelo gerador canônico. Os três arquivos de versão/cache devem permanecer iguais; não limpar localStorage/IndexedDB de usuários.

## Correção da preparação anterior

A execução 34555001261 falhou na integridade do transporte comprimido antes de aplicar código ou rodar testes. A recuperação usa somente três objetos completos cujo resultado reproduz os hashes independentes originais do builder, da skin e do teste tecnológico. O trecho documental danificado é descartado, não executado. A integração dos calendários usa script textual com âncoras exatas e hashes finais conferidos, seguido das suítes reais. Nenhum teste é desativado e nenhuma verificação de integridade é removida para aceitar código desconhecido.

## Validação

Localmente passaram test-nutricao-tech (77 verificações), test-nutricao-navegacao (101) e test-nutricao-calendarios (74), com builder real, memória isolada e rede bloqueada. O último cobre horários/dias/vigência, bolinhas independentes, foco/teclado, datas futuras, rascunhos, ausência de gravações indevidas, temas e larguras de 320 a 1280px.

Antes da publicação: regenerar as três demos, rodar as suítes direcionadas inclusive as do profissional e da Evolução, conferir os checks completos do head final e então publicar. Teste em Chromium não equivale a teste em iPhone/Safari físico. Registrar o resultado de CI/deploy no PR; este documento não confirma publicação.
