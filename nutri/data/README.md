# Fontes do catálogo Torque Nutri

O catálogo reúne dados de composição de alimentos e produtos, com a fonte de cada
registro. Os valores são referências de composição; o produto, preparo e rótulo
efetivamente utilizados devem corresponder ao item selecionado.

## Alimentos da TACO

Arquivo público: [taco.json](taco.json).

Fonte: NEPA/UNICAMP. **Tabela Brasileira de Composição de Alimentos — TACO**,
4ª edição revisada e ampliada. Campinas, 2011.
[Planilha oficial](https://nepa.unicamp.br/publicacoes/tabela-taco-excel/).
Reprodução com citação da fonte, conforme autorização da publicação original.

Dos 597 registros, 544 têm energia, proteínas, carboidratos e gorduras numéricos
e não negativos na planilha e entram nesta seleção. Os outros 53 estão no
[relatório de importação](taco-import-report.json), com a razão de exclusão.
Não transformamos `Tr` (traço), `NA`, asterisco ou campo vazio em zero. Nutrientes
opcionais não quantificados permanecem `null`. A base é 100 g da parte comestível,
preservando o estado de preparo do nome, sem conversão entre cru e cozido.

Medidas caseiras selecionadas: IBGE. **POF 2008–2009: Tabela de Medidas Referidas
para os Alimentos Consumidos no Brasil**, 2011.
[Arquivo oficial](https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2008_2009/Tabela_de_Medidas_Referidas_para_os_Alimentos_Consumidos_no_Brasil/tabelamedidas_bd.zip).
O cruzamento explícito cobre 33 equivalências em 16 alimentos e confere
alimento, variedade quando indicada, preparo e descrição da referência. Não é
um peso universal de colher, concha ou unidade. Tamanhos reais podem variar.

## Produtos industrializados — Open Food Facts

Arquivo público e reutilizável: [openfoodfacts.json](openfoodfacts.json).
Dados: [Open Food Facts](https://world.openfoodfacts.org/).
Este recorte derivado é disponibilizado sob a
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Os conteúdos individuais estão sob a
[Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
Consulte as [condições oficiais](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/).

Origem: [CSV oficial do Open Food Facts](https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz),
versão de 22/10/2026. Foram selecionados 12.000 candidatos brasileiros com
prefixo GTIN 789/790; após os filtros, 6.728 produtos integram este recorte.
O relatório `openfoodfacts-import-report.json` registra a versão, critérios,
quantidades excluídas e checksum do recorte. São produtos identificados na fonte
como vendidos no Brasil, com código de barras, marca e quatro macronutrientes
completos, submetidos a filtros automáticos de coerência e duplicidade.
O cadastro é colaborativo: isso não equivale a uma revisão manual de cada rótulo.

As chaves `*_100g` da fonte significam 100 g ou 100 ml, conforme o alimento.
Preservamos apenas referências cuja unidade é identificável, sem assumir que
1 ml pesa 1 g. Porções de rótulo exigem equivalência explícita no próprio produto.
Nutrientes ausentes não são preenchidos. Sódio e minerais são apresentados em mg;
fibras, açúcares e gorduras saturadas, em g.

## Prescrição e atualização

Os dois arquivos são bases independentes reunidas em um catálogo coletivo na
interface. A base Open Food Facts é oferecida separadamente para download sob
sua licença. Esses arquivos não contêm dados de clínicas, pacientes ou alimentos
privados. As licenças dos dados não alteram a licença do código do aplicativo.

A quantidade prescrita multiplica os nutrientes da medida escolhida. A fonte,
a composição original e a equivalência são copiadas para o plano; uma atualização
futura do catálogo não altera planos já publicados. Alimentos antigos sem uma
equivalência conhecida conservam a porção cadastrada.

Reprodução da importação: `tools/food-catalog/`. O total efetivamente distribuído
e os checksums estão em [catalog-manifest.json](catalog-manifest.json).
Esta edição reúne **7.272 alimentos**: 544 TACO e 6.728 Open Food Facts.
