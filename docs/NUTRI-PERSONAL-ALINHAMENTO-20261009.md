# Torque Nutri: alinhamento com Personal e aluno

Pedido de Raphael em 09/10/2026: estudar o Torque Personal e aproximar o Torque Nutri e o paciente, principalmente antes e depois, agenda e evolução.

## Referência verificada

Base: `raphaelmarge/metodo-torque`, commit `cffcbb7879ae218c42898c45d1d2b1f1df8e3b8d`, após mt-v861. Foram lidos `personal.html`, `app/aluno-builder.js`, `app/aluno-skin.js`, `assets/personal-torque-one.css` e o código efetivo de `nutri/`. O Nutri novo usa `nutri/app.js`, `platform.js`, `assessment.js` e `patient-experience.js`; o módulo legado da raiz permanece distinto.

| Área | Personal / aluno observado | Nutri anterior | Ajuste implementado |
| --- | --- | --- | --- |
| Agenda profissional | Um calendário com Semana/Mês, dia selecionado e navegação temporal | Listas de consultas e pedidos | Calendário compartilhado, Semana/Mês sem perder a data, filtro por paciente, próxima consulta, detalhes do dia e fila de pedidos |
| Agenda do paciente | Próximo encontro, calendário, salvar `.ics` e preparar remarcação no chat | Lista de consultas e formulário de solicitação | Agenda na navegação principal, calendário, solicitações na data escolhida, refeições planejadas do dia e mensagem de remarcação para revisar |
| Antes e depois | Ângulos separados, primeira/última foto e alça de comparação | Comparação por datas/ângulos com controle diferente | Contagens por ângulo, primeira/última foto elegível, arrastar diretamente, controle por teclado e modo lado a lado |
| Evolução | Resumo antes das abas detalhadas, filtros de período e histórico | Avaliação completa como primeira tela | Resumo da última avaliação e constância, atalhos Corpo/Fotos/Histórico, filtros 30/90/365 dias ou todo o histórico, peso/gordura/massa livre de gordura/cintura/quadril |
| Identidade e navegação | Marca personalizada, temas e funcionalidades preservadas | Mesmos fundamentos, organização diferente | Tokens existentes, controles de toque, chat disponível em Menu/Meu acompanhamento e atalhos existentes |

## Fontes, ações e estados alternativos

- Agenda lê somente pacientes, consultas e solicitações já carregados para o perfil. Usa o dia local, não o dia UTC do compromisso. Solicitação confirmada com consulta vinculada aparece uma vez. Dia sem consulta informa ausência; refeições exibidas são planejamento, não confirmação de consumo.
- Agendar, editar, concluir, cancelar, confirmar e recusar continuam usando as ações existentes, incluindo validação de sobreposição e concorrência. Salvar no calendário usa o exportador `.ics` existente. Remarcar pelo paciente preenche o chat e exige o envio normal pelo usuário.
- Evolução usa avaliações visíveis do paciente; campos ausentes não viram zero. Massa livre de gordura continua distinta de massa muscular medida. A constância usa o cálculo vigente de cuidado/XP. O gráfico omite valores ausentes e datas futuras; menos de dois pontos exibe um estado explicativo.
- Fotos continuam com imagem original, autoria, data, versão e visibilidade. Não se misturam pacientes, ângulos ou fotos privadas no app do paciente. Registros sem ângulo ficam em uma categoria própria. Zero/uma foto têm estados honestos, sem resultados ilustrados como se fossem reais.
- Não foram alterados banco, RPCs, autenticação, cobrança, contratos de publicação, registros de consumo nem fórmulas de XP. O cache isolado do Nutri passa de v8 para v9 e inclui `schedule.js`.

## Validação e limites

Passaram localmente os checks de avaliação, integração em DOM simulado, cuidado, diário, receitas, apresentação do paciente e novos casos de calendário/pares de fotos/períodos. Os testes existentes preservam as verificações de privacidade, dados e funcionalidades, adaptando somente a navegação inicial para Resumo e os textos dos estados vazios.

`tests/test-nutri-personal-alignment-browser.js` cobre as demos reais em Chromium com rede externa, escritas e WebSocket bloqueados: calendário, data/paciente do agendamento, remarcação sem envio, avaliações, fotos de teste, slider por mouse/teclado e geometria em 320/375/800 px, além do profissional em 375/1280 px. Sua execução depende do CI do commit; a inclusão do teste não comprova aprovação. Não houve inspeção visual local nem teste físico no iPhone.

A proposta canônica deve ser revisada e passar pelos gates do repositório antes da integração. A prévia pública da Dra. Larissa é independente, com dados fictícios, foto autorizada e perfis separados por URL; publicar a prévia não equivale a publicar a aplicação de produção.

## Ajuste da home e navegação — 10/10/2026

Pedido: reduzir repetições, acrescentar sino no canto superior direito e organizar o menu inferior do paciente.

- Home concentrada na próxima refeição e nos cuidados do dia. Água aparece uma vez, com adicionar/desfazer; calendário de dias, diário, check-in, confirmação explícita do plano e feedback profissional continuam disponíveis. Plano completo, evolução, receitas e conquistas permanecem nas suas áreas. Os botões de conta ficam no Menu.
- Sino abre avisos internos originados apenas nos dados já carregados: plano publicado, mensagens recebidas da nutri, consultas e respostas, avaliações compartilhadas e orientação sobre diário visível. Clicar abre a área correspondente; marcar como lido não envia mensagens nem altera registros clínicos. Preferências de leitura isoladas por conta/clínica/paciente; na demo duram até recarregar. Não há serviço de push.
- Menu móvel com Início, Plano, Evolução, Agenda e Menu. Destinos secundários destacam Menu, mantendo os acessos existentes. A causa da barra incompleta era a regra móvel antiga que escondia Agenda apesar das cinco colunas.
- Cache Nutri atualizado de v9 para v10 e inclui `notifications.js`. Não há alterações em banco, RPCs, autenticação nem fórmulas de XP.

Validação desta revisão: 7 casos de notificações, 11 de apresentação, 9 de integração e 29 de autenticação aprovados localmente. As duas demos personalizadas iniciaram e navegaram em DOM simulado sem chamadas de rede; foto original conferida por hash. A regressão Chromium foi ampliada para sino, leitura, destino, cinco botões visíveis/alinhados e home/modal em 320/375/800 px e ambos os temas. O teste de consumo continua verificando XP pela aba Conquistas.

O CI anterior (run `38006592982`, commit `b999c9b`) falhou em 1 de 205 suítes: Agenda escondida no paciente móvel. A regra responsável foi corrigida nesta revisão; a execução do novo commit permanece necessária. Não houve teste visual local nem teste em iPhone físico.

## Atendimentos na agenda — 10/10/2026

Pedido de Raphael: aproximar a área de atendimentos da agenda do Torque Personal. Referência: `pintaAgendaDia` em `personal.html`, com horário, nome, estado, destaque do próximo atendimento, acesso à ficha e ações secundárias recolhidas.

- Consultório: calendário e atendimentos do dia lado a lado no desktop; semana compacta e lista por horário no celular. O próximo atendimento agendado do dia fica destacado. Realizados e cancelados conservam seus estados.
- Cartões mostram horário, duração, paciente e observação. Abrir ficha usa a navegação existente do paciente correto; Realizada permanece na ação principal do próximo atendimento. Remarcar, cancelar e exportar calendário continuam no menu de ações de cada consulta.
- Resumo do dia usa apenas as consultas carregadas, incluindo os estados de histórico, e informa quantas foram realizadas. Pedidos mantêm confirmação/recusa separadas. Nenhum horário livre é presumido.
- Cache Nutri v11. Sem mudança de banco, Auth, RPC, XP ou regras de gravação. Versionamento geral e publicação continuam pendentes do preparo da release.
- Verificação local: 5 checks de alinhamento e 9 de integração aprovados. Dois cenários reais em Chromium aprovados com rede externa/escritas/socket bloqueados: filtro, agendamento, remarcação, conclusão e abertura da ficha correta. Geometria da semana/mês e ações abertas conferida em 320/375/800/1280 px e temas claro/escuro. Capturas desktop e móvel inspecionadas. Sem teste físico; o CI completo deve validar o novo commit.
