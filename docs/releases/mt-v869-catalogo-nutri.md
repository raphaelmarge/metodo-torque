# mt-v869 — Catálogo alimentar e prescrição por medidas

Pedido: cadastrar ao menos 3.000 alimentos naturais e industrializados com
composição pesquisada e permitir prescrever por gramas, ml e medidas caseiras
compatíveis, calculando nutrientes e ingredientes de receitas.

## Escopo

Rota real `/nutri/`, sobre `origin/main` em
`f341a7cde797e8868cb85e0de2762438f85d2f64`. A landing de marketing não é o
cadastro alimentar e não foi alterada nesta tarefa.

O catálogo do produto é estático, distribuído com o app e disponível offline.
O novo `MT_NUTRI_FOODS` tem fontes identificadas e arquivos públicos separados.
`MT_ALIMENTOS` legado, dados privados da clínica e planos já publicados permanecem
intactos. Não houve importação em tabelas privadas ou modificação de schema.
O manifest gerado em `nutri/data/catalog-manifest.json` registra 7.201 alimentos:
544 TACO e 6.657 Open Food Facts, sendo 7.009 referências em g e 192 em ml.
5.017 alimentos têm porção rotulada ou medida caseira explícita.

## Dados e qualidade

- TACO oficial: 597 linhas examinadas, 544 aceitas com quatro macros numéricos
  não negativos; 53 excluídas com razão registrada. Tr/NA/asterisco/vazio não
  viram zero. Micronutrientes ausentes ficam nulos.
- IBGE: 33 medidas em 16 alimentos por cruzamento explícito, com alimento,
  preparo, variedade quando indicada e descrição final da referência conferidos.
  Não há associação aproximada automática entre nomes, cru/cozido ou densidades.
- Open Food Facts: recorte brasileiro com marca/GTIN, base nutricional explícita,
  macros completos, filtros físicos/de qualidade e deduplicação. Dados
  colaborativos não são apresentados como rótulos individualmente revisados.
  Fonte CSV oficial de 22/10/2026; 12.000 candidatos examinados, 6.657 aceitos.
  A triagem de micronutrientes excluiu 77 linhas antes da deduplicação, com
  identificadores, valores originais e razões em `off-quality-exclusions.json`.
  Não há correção presumida de unidades. O balanço de massa aplica-se só a g.
- Fontes, licenças, política e downloads ficam em `nutri/data/README.md` e na
  biblioteca. Alimentos particulares não entram nos arquivos distribuídos.

## Quantidades e preservação

`food-measures.js` mantém `qtd` como multiplicador e os nutrientes por UMA medida.
O snapshot `measurement` guarda base, valores originais, equivalências e fonte.
Ao trocar g por colher ou ml por porção, conserva-se a quantidade física. Alterar
a quantidade recalcula todos os nutrientes disponíveis. A UI mostra equivalência
e referência da medida; não oferece uma unidade incompatível.

Receitas guardam ingredientes e rendimento; os totais são divididos pelo rendimento
sem repetir multiplicadores. Publicação, histórico, leitura do paciente e lista
de compras usam os valores copiados. Nenhuma atualização futura da fonte muda
um plano publicado. Itens antigos sem snapshot conservam seu contrato de porções.

Os dois normalizadores recebem extensão opcional, sem migração de planos antigos.
Quantidade inválida impede salvar/publicar; zero informado é distinto de ausência.
Marcas aparecem no nome de novos itens prescritos para evitar ambiguidade.

## Verificação e implantação

Testes de motor, catálogo, UI, receitas, compras, normalização e banco descartável
cobrem invariância de massa/volume, nutrientes incompletos, persistência e isolamento.
Todos os 7.201 registros passaram pelo motor e normalizador. Os checksums conferem
os arquivos distribuídos com finais de linha LF. UI em Chrome: 10/10, incluindo
remoção e inclusão com quantidade inválida. Atualização offline: 2/2 cenários.
As três variantes canônicas da demo do aluno foram regeneradas (32 checks).
O teste com bebida real confirmou 250 ml = 122,5 kcal e 2 copos = 400 ml = 196 kcal,
com marca e quantidade preservadas na visão do paciente.
As demos usam dados fictícios e não enviam alterações ao consultório.
Verificar resultado dos testes e implantação do commit exato antes de registrar
esta versão como publicada. A atualização usa Nutri cache v18 e global mt-v869.
