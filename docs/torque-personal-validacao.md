# Validação — v2 original enviada pelo usuário

Data: 2026-09-05. Base de integração: `2ad9bf7764e44cdbf16010005f2d252e04db8e50`.

## Fidelidade à referência

`personal-vendas.html` veio do arquivo `torque-personal-v2.zip` fornecido pelo usuário. SHA-256 do HTML original: `758418027f3a47617398f728aaecd238e4117066a41424f91c9467ca3278cd3f`, conferido com o manifesto do pacote.

O HTML aplicado é idêntico à referência, exceto pela transformação do texto TORQUE ON do rodapé em um link para `torqueon.html`, preservando esse destino da página anterior. Não foi aplicado o instalador do pacote. Não houve alteração nos aplicativos, nas demos ou nas imagens compartilhadas.

As prévias do pacote usavam fonte alternativa do sistema. A implementação carrega a Archivo já disponível no repositório, como especificado pelo próprio HTML da v2.

## Testes realizados nesta integração

Chrome local com Playwright, usando os arquivos reais do repositório por HTTP. A suíte reproduzível está em `tests/test-landing-v2.js` e integra o executor existente `tests/run.sh`.

- 320, 375, 390, 430, 768 e 1440 px: sem transbordamento horizontal; sete capturas com proporção natural e `contain`; duas fotos Sobre com recorte proporcional via `cover`.
- Menu mobile, Escape e três etapas do produto; acompanhamento da etapa pelo scroll no desktop.
- Quatro telas do tour, setas, teclado, ciclo entre início/fim, ampliação da tela selecionada e restauração de foco.
- Nome e cor do studio, entrada tratada como texto, quantidade de alunos e preço fixo R$ 49/mês.
- Vídeo: abre por ação explícita, reproduz com dimensões válidas, mantém controles e pausa ao fechar.
- FAQ, âncoras internas, links de cadastro, demos e TORQUE ON; WhatsApp com número personalizado e fallback para parâmetro inválido, sem enviar mensagens.
- Movimento reduzido, pausa manual persistida na sessão e conteúdo disponível sem JavaScript.
- Nenhum erro JavaScript capturado na suíte. Prévia desktop, mobile e seção Sobre inspecionadas visualmente.
- `tests/test-lojas.js`: aprovado, incluindo rótulos de botões e links.

O teste antigo do Personal passou a localizar o CTA por texto/destino em vez da classe visual antiga. A validação da quantidade de exercícios continua impedindo números maiores que o banco quando uma quantidade é anunciada; a v2 original não anuncia esse número.

## Escopo da entrega

Prévia para revisão, sem publicar na main. O site público permanece na versão anterior até aprovação. Fotos da seção Sobre continuam ilustrativas, conforme a referência; prompts originais em `torque-personal-imagens.md`.

Não houve cadastro real, pagamento, envio de mensagem ou teste em Safari/iPhone físico. A suíte geral do repositório roda separadamente no PR; a validação acima descreve os testes locais desta integração.
