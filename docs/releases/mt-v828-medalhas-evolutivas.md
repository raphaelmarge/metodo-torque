# mt-v828 — Medalhas e próximos objetivos

O catálogo do Personal passa a oferecer 356 opções: 29 trilhas básicas, 303 benchmarks CrossFit deduplicados, 14 opções HYROX e dez atividades de outros esportes. O personal escolhe quais ficam ativas, filtra por modalidade, busca nomes e ajusta os degraus e o título. A criação livre por total de treinos continua disponível.

No aluno, cada trilha mostra o nível alcançado e o próximo alvo, sem transformar cada etapa em um card separado. Uma meta fica em destaque e pode ser fixada. As seis primeiras medalhas continuam visíveis, com expansão para o restante. O demo mescla Fran, HYROX, corrida, alimentação, hábitos e treinos, com valores originados exclusivamente no histórico fictício da demonstração.

## Fontes e cobertura consultadas em 11/09/2026

- [Índice Hero/Tribute do CrossFit](https://www.crossfit.com/heroes): 249 nomes, todos incluídos.
- [Girls na FAQ oficial](https://www.crossfit.com/faq/wod): 33 nomes, todos incluídos.
- [15 benchmarks de referência](https://www.crossfit.com/essentials/crossfit-15-benchmarks), além de 11 variações/adicionais oficiais verificados. Sobreposições são deduplicadas, mantendo 303 nomes CrossFit.
- [Formato HYROX](https://hyrox.com/the-fitness-race/) e [regulamentos](https://hyrox.com/rulebook/): oito estações e seis formatos; metadados registram a temporada 26/27 consultada.

O índice Hero/Tribute e a lista Girls citados são completos na data consultada. Isso não significa todo WOD já publicado ou criado pela comunidade. Cada opção externa inclui sua URL de referência. As metas de progressão são propostas do produto TORQUE, editáveis pelo personal, e não distinções oficiais das marcas.

## Contrato aditivo

- `config.medalhasEvolutivas`: seleções `{id,nome?,metas?}`. A ausência usa seis trilhas básicas; seleção vazia não ativa trilhas extras.
- `MT_MEDALHAS.normaliza`: valida identificadores do catálogo e metas crescentes. `pacote` resolve somente as seleções para definições completas; dados de alunos não entram no núcleo.
- `dadosAppAluno.medalhasApp`: definições selecionadas, incluindo critério/filtro/fonte. O builder incorpora a função pura e esses dados; o aluno não precisa baixar o catálogo completo.
- `config.conquistas` mantém o formato anterior e o fluxo de publicação existente. Salvar seleção usa o mesmo objeto retornado por `load()` para preservar a revisão CAS.
- `ptmedalhaFoco:<hash do token>` guarda apenas uma preferência local; não conta como atividade, não altera XP e não envia uma mensagem ao personal.

## Progresso e limites

O núcleo lê dias de treino, cargas confirmadas, hábitos, questionários/check-ins, diário alimentar, histórico de corrida e placares de circuitos. Datas inválidas/futuras, resultados não concluídos e registros alimentares apagados não devem gerar progresso. Nome personalizado da medalha não muda seu critério.

Benchmarks exigem nome exato normalizado do circuito e placar salvo. RX, escalado e adaptado podem contar segundo o critério exibido; um registro com esse nome não certifica execução de um benchmark oficial ou participação em competição. HYROX e demais atividades usam o mesmo critério explícito por nome. A definição de uma estação no catálogo não transforma registros genéricos em prova concluída.

Corrida mantém a retenção de 30 atividades e circuitos a de 20 resultados por treino; as metas correspondentes se referem ao histórico disponível. Não são apresentados como totais vitalícios. Edições/exclusões legítimas podem recalcular esses valores. Dias de treino usam o histórico de dias existente e continuam com degraus adicionais após a última meta, garantindo uma próxima meta geral disponível.

Alimentação premia acompanhamento e constância, sem meta de restrição calórica ou redução de peso. Não há prescrições novas, mudanças de Supabase/RPC, envio real, nem substituição das áreas existentes.

## Verificação

Testes cobrem critérios, dados inválidos, personalização, isolamento de gravação, falha e recuperação, DTO, evolução do aluno, fixação por token, navegação e layouts móveis/desktop nos temas. As três demos são saídas de `tools/demo-aluno/regen-demos.js`. A publicação permanece condicionada às suítes completas do commit de integração e à conferência dos arquivos públicos.
