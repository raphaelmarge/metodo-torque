# Torque One — composição do aplicativo v816

Pedido do Raphael: aplicar a estética da prévia Torque One, mantendo todas as abas e funcionalidades do aplicativo existente.

Referência: https://torque-treino-nutricao-preview.raphaelmarge.chatgpt.site/
Sites: `appgprj_6a9f114f2d908191bac5348bf397e414`, versão 1. Fonte consultada: `app/globals.css` e `app/experience.tsx`, commit `0991c5f` do projeto de simulação. A prévia permanece independente do aplicativo de produção.

## Direção

- Fundo grafite `#0c0d11`, superfícies `#14161c`, controles `#1e2029`, bordas `#292c35`.
- Texto `#f3f3f6`, apoio `#989baa`. Lilás da referência `#b994ff` e verde `#91e9b6` para nutrição e estados positivos. Cores de marca configuradas pelo profissional continuam sendo a fonte dos destaques.
- Archivo, títulos em caixa mista, peso 600–700, leitura por tamanho e espaçamento em vez de caixa alta e bordas sucessivas.
- Cards com raio 16px, controles próximos de 10px, divisórias discretas, navegação com fundo tonal. Alvos de toque e tamanhos de campos não devem diminuir.
- Modo claro com superfícies próprias e contraste; foto e marca do profissional preservadas. Não copiar textos, dados fictícios ou limitações funcionais da simulação.

## Arquitetura preservada

O Personal recebe uma folha de estilos final e uma pequena camada de apresentação (`personal-torque-one.js`): marca, identificação do studio, contexto da área atual e atalhos que acionam a navegação existente. O aluno recebe CSS no skin existente, que o builder já incorpora. IDs, listeners, atributos de navegação, permissões, disclosures e armazenamento não são substituídos. Não há migração de banco ou alterações de cobrança.

## Composição aplicada

- Sidebar de 234px no desktop e 200px entre 801–1100px, com colapso de 66px. Até 800px, gaveta com busca e barra inferior. Os 18 destinos originais permanecem agrupados e acessíveis por rolagem.
- Cabeçalho de 85px no computador e 67px no celular. Nome do studio, contexto da área e busca real de alunos/comandos. Conteúdo com margem de 42px no desktop e 20px no celular.
- Início com indicadores abertos e divisórias verticais; próxima sessão e planejamento em duas colunas. Prioridades, resumo nutricional e acompanhamentos continuam alimentados pelos módulos existentes.
- Nutrição com três abas horizontais também no celular, biblioteca em grade, refeições separadas por divisórias e resumo lateral no computador. O editor mantém totais, rascunho, proposta com IA, revisão e aplicação separados; nenhuma geração ou publicação é disparada pela mudança visual.
- App do aluno com carrossel fotográfico mais compacto no celular e área ampla com navegação lateral no computador. Carga, repetições, hábitos, conquistas e registros permanecem nos mesmos fluxos.

As adaptações de densidade servem aos dados reais e às funcionalidades adicionais do produto. A interface não reproduz os números nem limita as áreas às poucas telas da simulação.

Continuam disponíveis no Personal: Início, Alunos, Agenda, Financeiro, Treinos, Chat, Nutrição, Avaliações, Questionários, Desafio, Relatórios, Assessoria, Minha página, Configurações, Personalização, Imagens, Sua ilha e Ajuda, com suas subabas.

No aluno, conservar carrossel e foto no início; datas acima dos quatro hábitos; registro por série com repetições antes da carga; nível e medalhas prioritários; calendário mensal e histórico anual abertos e separados; alimentação, questionários, contrato, pagamento, ferramentas e todas as opções autorizadas no menu.

## Verificação

Executar as suítes existentes de navegação, dados, player, hábitos, nutrição, onboarding, temas e geometrias móveis. Atualizar apenas expectativas visuais que descrevam o desenho anterior quando a nova referência justificar a mudança; nunca relaxar verificações de funcionalidade, isolamento ou acessibilidade para acomodar CSS incorreto.
