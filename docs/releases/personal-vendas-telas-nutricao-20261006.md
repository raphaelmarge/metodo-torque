# Página de vendas — telas atuais e nutrição integrada

Base: `fd215666ca2dfedc8578ecd8602943aa2d0c6630` da main, consultada em 06/10/2026.
Produto: TORQUE PERSONAL. Rota: `personal-vendas.html`.

## Conteúdo e origem

- Capturas reais dos demos canônicos, em contextos descartáveis e com dados fictícios. Fonte: `demo-personal.html` e `demo-aluno.html`; reprodução em `tools/capture-sales-screens.cjs`.
- Plano individual, refeições, horários, porções e rascunho: `assets/personal-nutricao.js` e seção Nutrição de `personal.html`.
- Diário com fotos, confirmação, trocas aprovadas, receitas e lista de compras: `app/aluno-builder.js` e `design/NUTRICAO-V814-CONTRATO.md`.
- A IA oferece propostas e estimativas revisáveis. A cópia não promete precisão por foto, publicação automática, resultados clínicos ou consulta com nutricionista incluída.
- Preservados R$ 49,90/mês, teste de 14 dias sem cartão, destinos de cadastro/assinatura, parâmetros comerciais e WhatsApp da equipe.

## Apresentação

- Novas capturas na abertura, oito áreas do painel, seis telas do aluno e nas etapas da jornada.
- Novo tour de 24 segundos em H.264/MP4, sem áudio, composto pelas capturas atuais com títulos em português; inclui a nutrição. Sem reprodução automática.
- Seção Nutrição com telas do painel e do aluno, ampliação, benefícios e links para os demos existentes. O aluno acessa Alimentação pelo menu inferior.
- Imagens mantêm largura/altura nativas e `object-fit: contain`. No celular, as telas da seção Nutrição são empilhadas para preservar a leitura.
- Dados das capturas são identificados como demonstração. Não foram modificados os módulos do produto, os dados dos alunos, a cobrança ou o banco.

## Atualização de cache

- CSS e JS da landing recebem caminhos novos (`landing-personal-20261006`). Uma consulta com `?v=` não resolveria o cache anterior, que ignora query strings.
- A página `app-personal-trainer.html` compartilha somente o CSS e teve sua referência ajustada.
- Versão candidata mt-v854 nos três arquivos de versão; precache aponta para os arquivos renomeados. Capturas têm diretório novo, sem substituir URLs antigas de imagens.

## Verificação

A suíte `tests/test-landing-v2.js` cobre 320, 375, 390, 430, 768 e 1440 pixels: proporção e carregamento das imagens, oito abas do painel, seis telas do aluno, ampliação e retorno de foco, navegação por teclado, WhatsApp, preço, demos, cadastro, vídeo, FAQ, marca, movimento reduzido e conteúdo sem JavaScript. Inclui os dois ampliadores e a FAQ da nutrição.

Os resultados executados e o estado da publicação são registrados no PR. Este arquivo não declara a versão publicada antes da conclusão da implantação.
