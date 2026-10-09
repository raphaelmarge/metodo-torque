# mt-v861 — Rotina e prazer no Torque Nutri

Ao tocar em Registrar refeição, o paciente agora confere os alimentos e porções
no mesmo diário disponível no Menu. O plano preenche opções para confirmação;
substituições prescritas, quantidades e alimentos diferentes podem ser relatados.
Editar o registro do mesmo dia/refeição/versão abre o relato existente. O diário
nunca confirma automaticamente que o plano foi seguido.

A tela Meu dia mostra uma próxima ação conforme horários e início do plano,
antes de pontos e medidas. Primeiro uso e retomada após três dias sem registros
têm mensagens próprias. Falta de registro não é tratada como falta de adesão.
A meta pessoal válida prevalece sobre a meta do consultório; o calendário mostra
cuidado registrado e mantém a confirmação de plano seguido separada.

A partir de 09/10/2026, o primeiro registro de água, check-in ou alimentação
concede 10 XP no dia; check-in e alimentação acrescentam 5 XP cada, até 20 XP/dia.
Mais água, mais refeições, edições e reenvios não multiplicam o prêmio.
Pesagem isolada e a confirmação de plano seguido não concedem pontos novos.
Os créditos anteriores usam a fórmula histórica. O total é recalculado dos
registros disponíveis e pode mudar com correções; não é um ledger imutável.

A nutricionista pode revisar e vincular um preparo ao rascunho da refeição.
A publicação conserva uma cópia da receita, sem alterar os alimentos, porções
ou nutrientes prescritos. O paciente acessa preparos do plano e favoritos
neste aparelho. Receitas do catálogo aparecem como ideias para a consulta,
sem serem apresentadas como prescrição individual.

O registro alimentar usa somente a RPC existente `save_food_journal`, com UUID
de operação e versão esperada. Envios de resultado incerto conservam os mesmos
argumentos para conferência. A marcação simples offline continua na fila
existente, sem criar alimentos ou nutrientes fictícios. Rascunhos de texto e
preferências são separados por conta e paciente. Relatos antigos conservam
versão, IDs e origem dos nutrientes; ausência de composição continua ausente.

Esta release depende das demos separadas mt-v860 (PR #882), preservando seu
isolamento. O cache Nutri passa a v8 com os quatro módulos novos e as demos;
os três arquivos de versão do ecossistema passam a mt-v861. Não há migração,
alteração de Auth, cobrança ou notificações.

Validação local: 152 checks Nutri entre Auth, cache/assets, avaliações,
integração, política de cuidado, adaptação do diário, receitas e apresentação.
O wrapper do ecossistema executa também os quatro conjuntos novos. A suíte de
browser cobre consumo, histórico, rascunhos, reenvios e tela móvel usando dados
fictícios. O CI do commit e o estado da publicação são registrados no PR.

Esta etapa implementa hipóteses de usabilidade e motivação. O efeito sobre
adesão e retorno precisa ser medido com pacientes; não há medição de dopamina
nem promessa de dependência. Retenção deve acompanhar utilidade, facilidade
de registro e bem-estar, em vez de aumentar o tempo de tela.
