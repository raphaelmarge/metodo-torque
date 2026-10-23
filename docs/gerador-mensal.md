# Gerador mensal de treinos — Torque One

Implementação local de 23/10/2026. Escopo: Personal, anamnese do aluno, retorno mensal e componente de treinamento resistido. Este documento acompanha as 17 seções do plano. As referências orientam regras; não constituem validação clínica do algoritmo. Publicação, piloto e revisão profissional de protocolos permanecem etapas distintas.

## 1. Contrato do produto

O motor produz uma proposta para um intervalo com início e fim explícitos. Não assume quatro semanas e não modifica a ficha enquanto o aluno registra seus treinos. A sequência é revisar perfil e parâmetros, consolidar e validar os dados, gerar proposta, revisar/aplicar no painel e publicar no app pelo fluxo existente. Uma etapa nova não é ativada pelo calendário.

Mesmas entradas e versões produzem a mesma proposta. A previsibilidade descreve a decisão e a continuidade do planejamento, sem prometer resultados físicos. O caminho principal é JavaScript local e não chama modelo de linguagem.

## 2. Objetivos e prioridades

Há cinco objetivos: ganhar massa (`hipertrofia`), reduzir gordura (`emagrecimento`), aumentar força (`forca`), melhorar condicionamento (`condicionamento`) e saúde/autonomia (`saude`). O perfil aceita objetivo secundário e prioridades musculares separados. Preferências apenas ordenam opções já compatíveis; não ultrapassam restrições, equipamentos ou tempo.

O motor desta entrega compõe treinamento resistido. Escolher condicionamento ou saúde não representa uma prescrição completa de corrida, mobilidade ou equilíbrio: esses componentes conservam o planejamento específico existente e devem ser revisados pelo personal.

## 3. Anamnese e os 17 parâmetros operacionais

O perfil estruturado fica em `aluno.geradorMensal.perfil`. A anamnese enviada pelo aluno permanece relatada em `retorno.anamnese` e `anamnese.geradorMensal` após importação; importação não é confirmação profissional. O relato de origem é mantido, e o personal registra revisão datada. O gênero não substitui informações fisiológicas pertinentes.

| Nº | Parâmetro | Fonte e decisão |
|---|---|---|
| 1 | Identificação, idade e população | Aluno, nascimento e idade na etapa; elegibilidade do protocolo |
| 2 | Anamnese, autoria e situação | Versão relatada, importada e revisada; ausência não significa resposta negativa |
| 3 | Condições, sintomas e lesões | Condições estruturadas e relato novo; pendência clínica quando necessário |
| 4 | Capacidade funcional | Requisitos disponíveis/indisponíveis, recursos e adaptações |
| 5 | Orientações profissionais | Autor, data, escopo, exercícios permitidos, vetos e limites |
| 6 | Nível na modalidade | Iniciante, intermediário ou avançado, confirmado pelo personal |
| 7 | Retorno após pausa | Readaptação separada da experiência histórica |
| 8 | Objetivos | Principal e secundário; dose aprovada e componentes complementares |
| 9 | Prioridades e preferências | Regiões e exercícios preferidos/evitados dentro da compatibilidade |
| 10 | Agenda e duração | Dias e minutos, período real, preparação, execução, descanso e transição |
| 11 | Equipamentos e ambiente | Interseção com requisitos explícitos do catálogo |
| 12 | Recuperação e rotina | Sono, fadiga, atividades e percepção; contexto para revisão |
| 13 | Etapa anterior | Fichas anteriores e continuidade dos movimentos compatíveis |
| 14 | Desempenho | Séries efetivamente feitas, presença e escalas de esforço separadas |
| 15 | Avaliações físicas | Medidas, data, unidade, método e contexto comparável |
| 16 | Fechamento mensal | Relato do aluno e confirmação/correção do personal com snapshot |
| 17 | Protocolo versionado | Dose, suficiência, incrementos, limites, autoria e revisão |

São 17 grupos operacionais derivados das 17 seções do plano, não 17 multiplicadores numéricos. Nem todo campo altera carga: identificação, método, autoria e revisão determinam validade, elegibilidade e explicações.

## 4. Nível, gênero e fatores individuais

O nível exige revisão profissional; anos de academia não o confirmam automaticamente. Retorno após pausa é uma propriedade adicional. Gênero, sexo e XP não entram nas decisões de carga, prioridade ou elegibilidade. Gestação, pós-parto e outros contextos fisiológicos são registrados diretamente e exigem cobertura individual apropriada.

## 5. Saúde, lesões e acessibilidade

Saúde não informada gera pendência. Condições relatadas, função limitada ou contexto fisiológico especial exigem orientação individual revisada com responsável, data, escopo e lista explícita de exercícios autorizados. O motor cruza essa autorização com os requisitos funcionais, equipamentos e todos os vetos. Catálogo insuficiente ou conflito não relaxa filtros.

Diabetes não altera medicação nem gera uma conduta glicêmica. Ausência de membro não implica nível iniciante ou carga reduzida. Melhora de desempenho ou dor não retira restrições. Protocolos não cobertos continuam atendidos por planejamento manual assistido.

Um relato novo de sintomas ou mudança de saúde abre revisão inclusive durante a etapa. Revisões do aluno têm IDs imutáveis; a conferência profissional reconhece os IDs analisados. Um relato favorável não confirmado não autoriza progressão, e uma nova limitação não precisa esperar o fechamento.

## 6. Evidências e regras

`MT_GERADOR_MENSAL.EVIDENCE` registra IDs R01–R09, versão, fonte, população, pré-condições, limites, responsabilidade técnica esperada e o fato de o motor não ter validação clínica. A autoria do protocolo aprovado é do profissional que o revisa. A data editorial da referência não se apresenta como revisão clínica individual.

| Regras | Referência e alcance |
|---|---|
| R01 — individualização | [Currier et al., 2023](https://pubmed.ncbi.nlm.nih.gov/37414459/): diversas combinações de resistência podem produzir resultados |
| R02–R04 — força, volume, esforço | [ACSM, 2026](https://pubmed.ncbi.nlm.nih.gov/41843416/) e [resumo oficial](https://acsm.org/resistance-training-guidelines-update-2026/): referências populacionais para adultos saudáveis |
| R05 — progressão | [Hickmott et al., 2022](https://pubmed.ncbi.nlm.nih.gov/35038063/): autorregulação; não valida incrementos mensais universais |
| R06 — continuidade | [ACSM, 2026](https://acsm.org/resistance-training-guidelines-update-2026/): continuidade é decisão operacional, preservando comparação |
| R07 — individualidade | [Refalo et al., 2025](https://pubmed.ncbi.nlm.nih.gov/40028215/): sem multiplicador de carga por gênero |
| R08 — saúde e função | [ADA 2026, seção 5](https://doi.org/10.2337/dc26-S005), [seção 6](https://doi.org/10.2337/dc26-S006), [CDC](https://www.cdc.gov/disability-and-health/articles-documents/physical-activity-for-people-with-disability.html), [VA/DoD](https://www.healthquality.va.gov/guidelines/rehab/amp/index.asp): orientação específica e capacidade individual |
| R09 — retorno | [Consenso de retorno ao esporte](https://doi.org/10.1249/mss.0000000000003371): processo contextual, sem inferir cura |

O ciclo mensal, os cinco objetivos, os estados de revisão, o cálculo de tempo e os parâmetros iniciais são decisões de produto. Os valores iniciais são apresentados como proposta operacional e exigem aprovação; não são atribuídos diretamente aos estudos.

## 7. Catálogo

`assets/gerador-mensal-catalogo.js` contém 22 exercícios de suporte inicial com IDs estáveis `gm-*`, padrões de movimento, músculos primários, equipamentos, posição, requisitos funcionais, apoio, lateralidade, unidade, base da carga e variação. São metadados estruturais iniciais (`reviewType: structural_seed`, `professionalReviewRequired: true`), sem revisão clínica externa; precisam de conferência individual pelo personal. `metadata.reviewed` identifica a estrutura cadastrada, sem atestar revisão clínica. A biblioteca pessoal só participa quando contém metadados explícitos revisados, autor e data. Nome parecido não cria equivalência de máquina nem autorização clínica.

A dose contabiliza somente músculos primários, com limite semanal e estimativa de sessão. Variações e equipamentos diferentes não recebem automaticamente a carga anterior. As orientações individuais restringem o catálogo; a interface não deve usar rótulos universais de exercício seguro para determinada doença.

## 8. Ciclo mensal e validação

Na primeira etapa, o personal revisa perfil e parâmetros antes de gerar. Nas seguintes, são necessários treino anterior, período encerrado, relato mensal e validação datada. Confirmação, correção e insuficiência são situações diferentes. A correção exige observação.

Para alunos que já têm fichas legadas e ainda não têm etapa mensal ativa, a primeira adoção tem uma confirmação própria. O personal informa o motivo e confere o ponto de partida. Essa exceção dispensa somente o fechamento inexistente do legado: perfil, saúde, datas e parâmetros continuam obrigatórios. A proposta deixa as cargas sem definição e não transforma o histórico antigo em evolução presumida. A adoção não pode ser usada em uma etapa mensal já ativa nem junto à revisão extraordinária.

Uma mudança relevante durante a etapa pode abrir revisão extraordinária. A ação prepara datas de coleta e da nova etapa com a mesma fronteira no dia atual; o personal salva os dados e confirma motivo, relato do aluno e orientações atuais. Não é permitida sobreposição anterior a essa fronteira. A proposta extraordinária não aumenta automaticamente cargas e mantém o treino em execução até revisão, aprovação e aplicação explícitas.

A validação guarda uma fotografia das fontes, indicadores e versões. A proposta referencia essa validação. Mudanças relevantes de anamnese, retorno, planejamento, avaliações, catálogo ou parâmetros tornam a proposta anterior inadequada para aplicação até nova conferência. Uma etapa já aplicada não é silenciosamente reescrita por registros atrasados.

## 9. Indicadores e ingestão legada

`assets/personal-gerador-mensal-adapter.js` é uma ponte de leitura: `build(st, alunoId, overrides)` retorna `{student, training, assessments, catalog, config}`. Ela não escreve no Store nem confirma relatos.

- Séries: somente `g === 2 && feito === true`, dentro do período. Diário ou carga digitada sem conclusão não comprovam uma série realizada.
- Identidade: `hid` é o ID de sessão, `exercicioId` identifica o exercício. Campos de equipamento, base, variação e contexto precisam existir no registro; não são completados usando o catálogo atual.
- Esforço: `rpe` por série usa 1–10; o retorno legado por sessão permanece 1–3. Ausência é `null`, sem conversão de escala.
- Agenda: datas explícitas prevalecem sobre recorrência; `[]` é descanso. O intervalo inclui todos os dias, inclusive o 29º, 30º e 31º, e várias sessões no mesmo dia.
- Presença: a marca legada `retorno.feitos[data]` é diária. Ela não conclui duas sessões diferentes naquele dia. Ambiguidade fica como desconhecida; falta e pausa podem ser confirmadas pelo profissional em `sessionReviews`.
- Avaliações: foto, fita, dobras e bioimpedância mantêm métodos separados. Contexto ou método ausente não produz comparação automática.
- Duplicatas idênticas não aumentam contagens; conflitos com o mesmo ID são excluídos pelo motor. Valores impossíveis e metadados insuficientes geram ressalvas.

Adesão, cobertura, volume externo e mudança de carga são indicadores distintos. Pausas ficam fora do denominador elegível; denominador zero retorna não aplicável. Volume externo só usa séries registradas compatíveis e não estima hipertrofia.

## 10. Decisão da próxima etapa

A ordem é elegibilidade, restrições, rotina/equipamentos, evolução validada, continuidade/adaptação, dose, conferência global e explicação. A etapa pode progredir, manter, readaptar ou reorganizar. Mudança de mês não obriga aumentar carga.

Antes da aprovação, o personal pode ajustar exercício, séries, repetições, carga e descanso. Registrar os ajustes exige motivo e autoria, mantém a proposta anterior na trilha de revisão e reaplica compatibilidade, volume, tempo e limites. Um ajuste não registrado impede aprovar. Exercícios próprios com metadados explícitos podem ser utilizados; uma substituição não transfere automaticamente a carga de outra variação.

Progressão de carga exige validação atual, confirmação de técnica/esforço/meta, sessões comparáveis suficientes e incremento permitido. O degrau do equipamento não é arredondado acima do teto. O protocolo inicial muda carga de maneira controlada; outras estratégias demandam revisão e edição profissional. Carga inicial sem evidência permanece não definida.

## 11. Gamificação

XP e nível físico são conceitos distintos. Os marcos mensais reconhecem participação e revisão, nunca cura, perda de peso obrigatória, falha muscular ou ultrapassagem de carga. Relatar dor e manter/reduzir dose não é fracasso. Revisões com mesmo ID não devem duplicar um marco. Dados clínicos ficam fora de compartilhamentos públicos e não entram no pacote de conquistas.

## 12. Experiência

O aluno mantém a ficha ativa, registra sessões e envia fechamento ou mudança de saúde. O personal recebe perfil, pendências, relato, indicadores, parâmetros, validação e proposta com motivos. Aplicar significa atualizar o painel; publicar continua sendo uma ação separada.

Cada proposta identifica mudanças, continuidade, fonte validada, restrições vigentes, dose, estimativa de tempo, pendências e o que acompanhar. Referências completas ficam nos detalhes do personal. O app do aluno recebe a explicação necessária e os dados de execução, sem anexar a anamnese clínica.

## 13. Organização técnica

| Módulo | Responsabilidade |
|---|---|
| `assets/gerador-mensal-core.js` | Normalização, snapshot, indicadores, elegibilidade, validação e geração determinística |
| `assets/gerador-mensal-catalogo.js` | Metadados funcionais explícitos dos exercícios |
| `assets/personal-gerador-mensal-adapter.js` | Ponte somente de leitura de ptStudio e retorno |
| `assets/personal-gerador-mensal.js` e `.css` | Revisão, persistência, proposta, aplicação e integração com publicação |
| `assets/anamnese-gerador-mensal.js` | Complementos estruturados da anamnese relatada |
| Módulo mensal do aluno e builder | Relato imutável, retorno e explicação da etapa liberada |

Os dados próprios do aluno ficam no estado já isolado por conta/aluno. Persistência usa a leitura vigente e `MTStore.write`, preservando a proteção CAS. Falha de gravação deve manter a edição disponível. O hash detecta alteração de conteúdo; não é uma assinatura de segurança nem substitui autorização do servidor.

## 14. Compatibilidade com o legado

Fichas e publicação existentes permanecem compatíveis. O catálogo antigo sem metadados pode continuar no editor manual, mas não ganha aprovação funcional por associação de nome. O novo motor não migra retrospectivamente cargas ou notas para registros comparáveis.

A etapa mensal não utiliza as sugestões semanais como um segundo motor concorrente. O app identifica o planejamento mensal aprovado e segue sua dose; o aluno ainda registra o que efetivamente fez. Mudanças extraordinárias de saúde continuam disponíveis.

No painel, gerar musculação pela IA legada, gerar pelo catálogo antigo e evoluir a ficha antiga são impedidos para aluno com etapa mensal ativa. O bloqueio da IA ocorre antes de chamar o serviço remoto. Esses caminhos devolvem a orientação para o Gerador mensal e preservam o estado salvo; outras modalidades conservam seu planejamento próprio.

## 15. Implantação e piloto

Esta implementação é local. Não declara implantação, migração de banco ou validação de produção. A revisão profissional dos parâmetros precede uso real. O piloto deve acompanhar tempo de revisão, ajustes, causas de pendências, qualidade dos registros e incompatibilidades; aprovação frequente não comprova eficácia clínica.

A expansão para outras modalidades e condições exige metadados, fontes, parâmetros e verificação próprios. A falta de protocolo automático não exclui o aluno do planejamento manual.

## 16. Matriz de aceite e verificação

| Critério | Verificação |
|---|---|
| Entradas e versões iguais geram proposta igual | Testes de núcleo e execução em navegador isolado |
| Relato favorável não confirmado não progride | Validação necessária e snapshot correspondente |
| Limitação nova provoca revisão imediata | Revisões de saúde pendentes, sem depender de data de fechamento |
| Restrições simultâneas e catálogo insuficiente | Elegibilidade e incompatibilidade sem relaxar filtros |
| Substituição respeita requisitos e carga | Seleção por metadados e ausência de transferência sem contexto |
| Ausentes, duplicados, impossíveis e unidades divergentes | Testes de indicadores e adaptador |
| Avaliação com método diferente | Grupos distintos e ressalva de comparabilidade |
| Objetivo, nível, agenda, tempo e equipamento | Propostas/pendências determinadas pelo perfil |
| Gênero e XP não mudam prescrição | Normalização sem multiplicadores ou decisões por identidade |
| Proposta antiga não se aplica após mudança | Hash de fontes, validação e conteúdo da proposta |
| Primeira adoção não presume progresso do legado | Confirmação e motivo, ausência de etapa ativa e cargas indefinidas |
| Revisão extraordinária permanece acompanhada | Mesma fronteira, motivo, relato e conferência clínica, sem progressão automática |
| Nova etapa não publica automaticamente | Aplicação no estado separada do fluxo de publicação |
| Outro aluno e histórico preservados | Testes de interface e falha de gravação |
| Sem IA e sem tráfego real nos testes | Rede externa bloqueada; motor sem serviço remoto |
| Motivos e edições reproduzíveis | Snapshot, autoria, versão e justificativas persistidos |

Suítes específicas: `tests/test-gerador-mensal-adapter.js`, `tests/test-gerador-mensal-core.js`, `tests/test-gerador-mensal-safety.js`, `tests/test-gerador-mensal-aluno.js`, `tests/test-gerador-mensal-browser.js` e `tests/test-gerador-mensal-integration.js`. As suítes usam somente dados sintéticos; os testes de navegador bloqueiam a rede externa e os service workers. O teste de integração serve os arquivos reais por interceptação local, percorre o MTStore e a publicação CAS simulada, sem servidor de produção. O relatório final deve distinguir teste de módulo, integração local e produção.

Os testes Node são executados com `node tests/test-gerador-mensal-adapter.js` e equivalentes. Os de navegador aceitam `TORQUE_PLAYWRIGHT` para a instalação existente do Playwright e `CHROMIUM_PATH` para o executável já instalado; não instalam dependências. `ARTIFACT_DIR` habilita capturas: a suíte de interface gera uma imagem da harness móvel, e a integração gera desktop e mobile do painel completo. A validação local usou Node 24 e Chromium existente na máquina.

A aplicação também foi verificada com falha simulada do MTStore: não deixa fichas ou histórico parcialmente gravados. A atualização automática da versão do app respeita uma etapa mensal ainda não publicada. O carimbo `active.publishedAt` somente é registrado após retorno confirmado da publicação para a mesma etapa; abrir a prévia não envia a prescrição.

A etapa aplicada conserva assinaturas da prescrição e das fontes clínicas. Antes de montar um novo pacote, `isCurrent` confere fichas, agenda de resistência do período, metadados dos exercícios utilizados, orientações e relatos de saúde pendentes. Edição posterior nesses dados bloqueia a publicação até revisão apropriada; alterações de outro aluno ou da agenda de outra modalidade não invalidam a etapa de resistência. Essa conferência também foi testada com anamnese clínica legada.

## 17. Parâmetros profissionais antes do uso

`defaultConfig()` oferece valores operacionais para revisão, com `approved: false`. O personal revisa versão, responsável, data, escopo, séries/repetições/descanso/esforço por objetivo e nível, suficiência de registros, incremento permitido, degraus disponíveis, tempo, volume e limites de elegibilidade. A aprovação e a validação mensal são etapas independentes.

Para saúde e lesões, a orientação individual precisa corresponder ao caso e ao profissional habilitado. A interface não deve converter uma confirmação genérica de anamnese em liberação clínica. Parâmetros aprovados ficam congelados na versão da etapa; atualizações não reescrevem etapas anteriores.
