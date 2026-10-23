# mt-v870 — Substituições com quantidades ajustadas no Nutri

## Escopo e fluxo

Rota real `/nutri/`, sobre `origin/main` em
`41dbde12f9d222d872eaa46d140ae565a90e456b`. A ação por alimento da prescrição
apresenta até seis opções ordenadas pela proximidade nutricional, cada uma com
quantidade calculada e diferenças de kcal, proteínas, carboidratos e gorduras.

O nutricionista escolhe uma opção, confere a comparação e pode ajustar a medida
e a quantidade com o cálculo existente. A diferença também representa o impacto
daquela troca no dia em que a refeição está prevista. Várias trocas podem somar
diferenças; não há promessa de otimização conjunta de todas as alternativas.

A busca manual no catálogo permanece disponível, inclusive quando não há
sugestões com grupo, preparo e nutrientes suficientes. Na seleção manual,
a porção inicial é a do catálogo e o profissional ajusta e compara seus valores.

## Preservação e limites

- A visualização das sugestões não altera o plano. A confirmação adiciona um
  item independente em `substituicoes`, usando o snapshot `measurement` existente.
- O principal, totais prescritos, salvamento do rascunho, revisão, publicação,
  histórico, leitura do paciente e impressão preservam os contratos existentes.
- Dados incompletos não viram zero. Não há conversão presumida de massa/volume,
  densidade ou medida caseira; as medidas vêm de equivalências cadastradas.
- Quantidade principal inválida bloqueia o cálculo, inclusive se o editor ainda
  guarda o último valor válido. Referência, paciente, refeição e rascunho são
  conferidos novamente ao confirmar, bloqueando sugestões de um alvo alterado.
- A lista não verifica alergias ou adequação clínica. Restrições registradas no
  cadastro e na última anamnese são mostradas para revisão do profissional.
- Catálogo de 7.201 alimentos preservado. Sem mudança de schema, importação
  adicional, credenciais ou acesso a registros clínicos reais.

## Método de aproximação

O motor filtra identidade, grupo e preparo explícitos antes do ajuste. Estados
desconhecidos permanecem na busca manual; a categoria genérica de industrializados
não basta para recomendar um alimento. Identificadores, código de barras e nome/marca
evitam recomendar o próprio registro; alternativas já cadastradas são excluídas.

Para cada candidato, a quantidade minimiza a soma dos erros quadráticos de
energia e macros, divididos pelo maior entre o alvo e um piso de comparação.
Pesos: energia 2; proteínas, carboidratos e gorduras 1. Pisos: 50 kcal, 5 g de
proteína, 10 g de carboidrato e 3 g de gordura. Isso impede que um macro igual
a zero transforme qualquer traço em erro percentual infinito.

O resultado tem uma casa decimal e é reavaliado após arredondamento. Quantidades
fora de 1–1.000 g/ml são descartadas; quando a quantidade física do alvo é conhecida,
o candidato também deve ficar entre um quarto e quatro vezes aquela quantidade.
São descartados ajustes com diferença de energia acima de 25% ou índice de erro
acima de 35. Esse índice é 100 vezes a raiz da média ponderada dos erros
normalizados. São parâmetros de triagem do produto, não tolerâncias clínicas.
Quanto menor o índice, mais próxima a composição; ele não é exibido como percentual
de equivalência. O usuário vê os valores e diferenças reais por nutriente.

## Fundamento

A aproximação matemática de energia e macronutrientes não torna dois alimentos
clinicamente intercambiáveis. O catálogo não contém ingredientes e alergênicos
completos, e categorias genéricas de industrializados não definem substituições.

Referências consultadas em 23/10/2026:

- [Sociedade Brasileira de Diabetes — terapia nutricional no diabetes tipo 1](https://diretriz.diabetes.org.br/terapia-nutricional-no-diabetes-tipo-1/): sistemas de equivalentes de carboidratos são parte de planejamento individualizado, não prova de equivalência universal de todos os macros.
- [CDC — planejamento alimentar](https://www.cdc.gov/diabetes/healthy-eating/diabetes-meal-planning.html): a forma de consumo e outros componentes da refeição influenciam a resposta glicêmica.
- [Anvisa — rotulagem de alergênicos, 6ª edição](https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/alimentos/perguntas-e-respostas-arquivos/rotulagem-de-alergenicos.pdf/@@download/file): presença de alergênicos e contaminação cruzada dependem de informações específicas do produto.

## Distribuição

Validação local: 7 grupos do motor; 7 grupos de interface de substituições;
10 checks da biblioteca; 6 de medidas; 6 de prescrição pura e 6 em navegador;
13 de alternativas/lista de compras; 33 de autenticação; 9 de integração;
18 de caminhos/cache. Atualização Chromium de v14 para v19 testada com acesso
offline aos novos módulos e falha de instalação preservando a versão anterior.
A suíte de publicação depende de Bash/Python3 no ambiente Linux do CI e não foi
concluída no Windows local. O CI canônico continua obrigatório antes do merge.

Novos módulos incluídos no cache Nutri v19 e nas ferramentas de inspeção/demo.
Versão global mt-v870. Conferir CI e o commit servido antes de declarar esta
versão publicada. Nenhum resultado fictício de demonstração é dado clínico real.
