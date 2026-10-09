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
