# Estudo completo da Central de Ajuda do EVO — 579 artigos lidos na íntegra

> ## Progresso da implementação (atualizado)
> ✅ **TODOS os 🔴 alta prioridade** + a maioria dos refinos 🟡 concluídos. Blocos entregues:
> 1–9 (todos os 🔴) · 10 (limite de entradas + horário de contrato) · 11 (Tabela de Preços) ·
> 12 (multa em 2 modos) · 13 (aulas virtuais na grade) · 14 (caixa cego) ·
> 15 (estilos de série na prescrição) · 16 (ocupação por área).
>
> Já existiam (roadmap havia superestimado): recompensas resgatáveis, fornecedores↔lançamentos.
>
> **Restante (complexos ou de menor valor):** plano de contas hierárquico · PAR-Q com regras completas ·
> anuidade data-fixa/período · combinações fixas de horário · contrato com fim determinado (cross-cutting) ·
> 2FA (TOTP) · protocolo de avaliação configurável · metodologia de treino por IA.


> Leitura integral das 92 coleções (`ajuda-md/`) por 6 leitores em paralelo, cruzada com o
> que o TORQUESYS já tem. Aqui ficam **só os achados replicáveis offline** (sem hardware,
> app nativo ou integração de terceiros). Itens de catraca/biometria/gateway/NF/app estão
> mapeados para a Fase 2 e não entram aqui.

Legenda de prioridade: 🔴 alta (uso diário / regra central) · 🟡 média · ⚪ refinamento.

## A. Cadastro & CRM
- 🔴 **Nome preferencial (nome social/apelido)** — exibido em telas/agendamentos/impressão; nome de registro continua nos contratos/recibos/relatórios formais.
- 🔴 **Notificação no cadastro** — nota fixa de até 150 caracteres visível a quem abre o perfil; modal com as últimas 5.
- 🔴 **Temperatura do lead** (gelado/frio/morno/quente) como qualificação no funil e nas aulas experimentais.
- 🔴 **Opt-in de canais de contato** (e-mail/ligação/SMS/WhatsApp) por cliente; a automação/CRM respeita cada canal.
- 🟡 **Responsável financeiro PF ou PJ** no cadastro.
- 🟡 **Regras de exclusão de cliente** — travar se houver venda/saldo pendente; "excluir dados pessoais" (LGPD) mantendo histórico financeiro e mostrando "Dados Removidos".
- ⚪ Filtros de recência na busca (recém-cadastrados, últimos acessados/convertidos).
- ⚪ Campos obrigatórios configuráveis por etapa (Oportunidade vs Cliente), forçar maiúsculas, travar duplicidade de CPF/e-mail/carteirinha.

## B. Contratos
- 🔴 **Suspensão configurável por contrato** — nº de vezes, tempo total (dias), período mínimo, carência da 1ª e espera entre as próximas; pool compartilhado; determinado × indeterminado; "consumir dias".
- 🔴 **Restrição de venda por gênero e faixa etária** no contrato (cadeado no ato da venda).
- 🔴 **Transferência de contrato entre clientes** (≠ troca de plano): completa, somar dias ao contrato do destino, ou converter dias em saldo credor `(valor/vigência)×meses restantes`.
- 🟡 **Quantidade de entradas por contrato** — Dia/Semana/Mês/Período/Ilimitada.
- 🟡 **Multa de cancelamento em 2 modos** — tabela de % por meses cumpridos, ou % sobre o saldo remanescente a pagar.
- 🟡 **Horário de contrato** — restringe acesso a dias/horários específicos.
- 🟡 **Anuidade vinculada ao contrato** — cobrança "data fixa" ou "por período" (N meses após a venda).
- 🟡 **Contrato com fim determinado** — mesma data de término para todos, valor proporcional até lá.
- ⚪ Tabela de desconto progressivo por nº de dependentes no plano família + "dependente adicional" com taxa própria.
- ⚪ Pro rata do 1º mês (do início até o dia de vencimento + mês cheio).
- ⚪ Crédito de dias em massa (por filtro) com reversão.

## C. Grade, turmas e frequência
- 🔴 **Bonificação/penalização por assiduidade** — X presenças seguidas → Y sessões extras (validade em dias); falta sem justificar restringe a grade por N dias, liberada após M presenças.
- 🔴 **Fila de espera / "notificar disponibilidade"** para atividades lotadas.
- 🟡 **Estado "vaga de reposição"** (amarelo) na grade, além de nova (verde) e lotada (vermelho); ocupação laranja a 30% da capacidade.
- 🟡 **Reposição em qualquer atividade do mesmo grupo** e carryover na renovação (quando marcada como renovação).
- 🟡 **Aula "não aconteceu"/feriado** devolve a sessão como crédito a todos os matriculados.
- 🟡 **Janela de check-in** configurável (abre/fecha X min antes, tolerância pós-horário) e liberação automática de vaga.
- 🟡 **Aulas virtuais** na grade — link ao vivo (só com professor online) × gravado.
- ⚪ Combinações fixas de dias/horários (tudo-ou-nada) para contratos com limite semanal.
- ⚪ "Recurso" — pool compartilhado (ex.: 4 coletes) consumido por várias atividades.
- ⚪ Limite/renovação não-cumulativa de aulas experimentais; faixa etária em meses.

## D. Níveis, treino e saúde
- 🔴 **Níveis/graduação de clientes** (faixas) — progresso por sessões ou dias, cor por nível, gatilho de automação "Mudança de nível".
- 🔴 **Prontuário/diário de evolução sessão-a-sessão** — data, atividade, "como o cliente se sentiu", anexos, auditoria (distinto da avaliação física periódica).
- 🟡 **Classificação de exercícios** (nível iniciante/intermediário/avançado; tipo força/cardio/flex/mobilidade; similares) para alimentar a IA.
- 🟡 **Estilos de série** (conjugado/progressivo/drop-set) + "replicar série" na prescrição.
- 🟡 **PAR-Q com regras** — só 1 ativo por vez, validade em meses, 3 modos de bloqueio, "SIM a 1 pergunta" exige atestado.
- ⚪ Protocolo de avaliação configurável por campo; relatório comparativo das 3 últimas.
- ⚪ Prescrição do treino padrão em massa (filtro contrato/nível/gênero).
- ⚪ Metodologia de treino por IA (fórmulas por nível×frequência).

## E. Financeiro
- 🔴 **Transferência entre contas bancárias** — gera Contas a Receber na origem-destino sem virar receita/despesa (origem ≠ destino).
- 🔴 **Comissão por competência × por caixa** — integral na venda, ou proporcional aos recebimentos (por vencimento/recebimento).
- 🟡 **Fornecedores** como entidade vinculável a Contas a Pagar/Receber.
- 🟡 **Caixa oculto** — operador não vê o acumulado; supervisor confere depois.
- 🟡 **Sangria/retirada** distinta de pagamento (não é despesa).
- 🟡 **Relatórios de CxR nomeados** — Faturamento (lançamento) / Recebimentos (recebimento) / Previsão (vencimento).
- 🟡 **Recuperado de inadimplência** (quitação parcial de dívida vencida).
- 🟡 **Recusa reversível × irreversível** na retentativa de cobrança recorrente.
- ⚪ Plano de contas hierárquico (pai/filho, DRE só em nó final, reatribuição).
- ⚪ Máx. de parcelas de saldo devedor (padrão 12x); parcelamento no fecho da venda.

## F. Gerencial (fórmulas a alinhar/expor)
- 🔴 **Crescimento com 12 categorias** — Novos, Renovados (dentro do prazo), Retornos (fora do prazo), Vencidos (ativo→inativo dentro do prazo), Desistências (fora), Suspensos, etc.
- 🟡 **Fórmulas do painel Gestor** — Mensalidade média = total vendido ÷ soma dos meses; Ticket = recebido ÷ ativos; Custo/cliente = pago ÷ ativos; ICV1/ICV2; Aluno por m².
- 🟡 **Contrato VIP/especial não conta como ativo** (nem suspenso) — afeta todos os KPIs.
- 🟡 **Cor do indicador = tendência vs período anterior**, não vs meta.
- 🟡 **NPS** — Promotores 9-10, Neutros 7-8, Detratores 0-6; NPS = %Prom − %Detr; zonas 0-50/51-75/76-100 (já temos NPS; alinhar faixas).
- 🟡 **Tabela de preços dinâmica** para a equipe de vendas.
- ⚪ Ocupação por área (contagem manual, `%=clientes×100/equipamentos`).
- ⚪ Frequência média por cliente e ranking de frequência.

## G. Gamificação (Clube de Recompensas)
- 🔴 **Recompensas resgatáveis** — cadastro item↔custo em FitCoins, resgate tudo-ou-nada.
- 🟡 **8 regras de pontuação** (renovação antecipada por faixas, presença semanal, nova matrícula, rematrícula…) com "pega o gatilho mais próximo por baixo".
- 🟡 **Expiração/zeragem/conversão** de FitCoins; multiplicador por período; ação em massa.
- ⚪ Código de convite pessoal → desconto configurável por contrato (indicação).

## H. Convidados & autoatendimento
- 🔴 **Convidados de cliente** — cota por contrato/mês (renova dia 1º), gera serviço gratuito "Convite", libera acesso até 23:59, exige PAR-Q.
- 🟡 **Carteirinha temporária** com validade.
- ⚪ Portal de autoatendimento do cliente (cancelar/trancar/convidar) — parcial, é self-service.

## I. Administração, auditoria e segurança
- 🔴 **Log Geral / auditoria** — "de → para" de cada alteração, quem e quando; logs de exclusão de cliente/venda e cancelamento de recebimento.
- 🟡 **Perfis de permissão nomeados e reutilizáveis** (duplicar/inativar/histórico) com dependência composta entre permissões.
- 🟡 **Notificações internas para a equipe** com direcionamento (responsável pela atividade, novos cadastros…).
- 🟡 **Transferência/balanceamento de carteira** entre colaboradores (partes iguais / igualar / quantidades) com reversão.
- 🟡 **2FA (TOTP)** no login.
- ⚪ Bloqueios de acesso por exame/avaliação vencidos, contrato sem assinatura (catraca — Fase 2, mas a regra é replicável no Controle de Entradas).
- ⚪ Feature flags opt-in por unidade.

## Contradições a revisar (podemos estar diferentes do EVO)
- **Cancelamento automático por inadimplência**: implementamos em **meses**; o EVO separa "considerar inadimplente após X **dias**" de "cancelar após X meses". Manter meses, mas expor os dois.
- **Vencimento de contrato recorrente**: o EVO só gera a parcela na hora da cobrança; nós pré-geramos. Ok para o modo offline/demo, revisar na Fase 2.
- **Venda retroativa em período fechado**: o EVO trava lançamento em data já conciliada; não temos trava de período de caixa fechado.
- **DRE**: conferir se a cascata (Receita Bruta → Deduções → Líquida → Custos → Bruto → Despesas → Resultado) e a exclusão de centros de capex batem.

## Fora de escopo offline (Fase 2 — já mapeado)
Catracas/biometria/leitoras, apps nativos (Fiti/EVO App), boleto PJBank, PIX automático, conciliação bancária/OFX/Stone, NF-e/eNotas/certificado digital, SMS/e-mail marketing reais, integrações de terceiros (Wellhub/TotalPass/RD/Stripe/Vindi/etc.), antifraude via gateway, multiunidades, validador de CPF (Receita).
