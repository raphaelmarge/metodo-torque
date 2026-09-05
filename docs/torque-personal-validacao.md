# Validação da landing TORQUE PERSONAL

Data: 2026-09-05. Navegador: Chrome/Chromium desktop em modo automatizado, servidor HTTP local.

Referência: descrição da v2 recuperada da conversa “Recriar Landing Page”. O HTML/ZIP original da v2 não estava disponível; esta implementação recria a direção descrita sobre a página atual da main.

## Conferências realizadas

- Larguras 320, 375, 390, 430, 768 e 1440 px: sem transbordamento horizontal; capturas carregadas com proporção preservada e `object-fit: contain`.
- Dois tours: setas, navegação por teclado e atualização dos indicadores; passagem pelas oito telas do painel e seis telas do aluno em todas as larguras.
- Ampliação em diálogo, fechamento por Escape e alternância da perspectiva no hero.
- Preferência de movimento reduzido e botão para pausar animações.
- Preço R$ 49/mês, âncora de preço e abertura do FAQ.
- Links originais preservados; WhatsApp com substituição por `?zap=5531999990000` verificado sem enviar mensagem.
- Demos do aluno e do personal e entrada `personal.html`: resposta HTTP 200 e conteúdo renderizado. Nenhum erro JavaScript capturado durante os testes.
- Inspeção visual do hero e da seção Sobre no mobile e desktop.

## Limites

Os testes de demos verificam abertura e renderização; não exercitam todos os fluxos internos dos aplicativos. Não houve criação de conta, transação financeira ou envio de WhatsApp. Safari/iPhone físico e ambiente de produção não foram testados. Fotografias da seção Sobre são placeholders ilustrativos existentes; os prompts e locais de substituição estão em `torque-personal-imagens.md`.
