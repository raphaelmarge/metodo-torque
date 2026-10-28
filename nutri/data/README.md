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
prefixo GTIN 789/790; após os filtros, 6.657 produtos integram este recorte.
O relatório `openfoodfacts-import-report.json` registra a versão, critérios,
quantidades excluídas e checksum do recorte. São produtos identificados na fonte
como vendidos no Brasil, com código de barras, marca e quatro macronutrientes
completos, submetidos a filtros automáticos de coerência e duplicidade.
O cadastro é colaborativo: isso não equivale a uma revisão manual de cada rótulo.
Registros com micronutrientes suspeitos foram excluídos integralmente, sem tentar
adivinhar a unidade ou corrigir o valor. O [relatório de exclusões](off-quality-exclusions.json)
expõe os valores recebidos, critérios de triagem e identificadores. Os limites
servem para exigir revisão da fonte; não são recomendações de consumo.

As chaves `*_100g` da fonte significam 100 g ou 100 ml, conforme o alimento.
Preservamos apenas referências cuja unidade é identificável, sem assumir que
1 ml pesa 1 g. Porções de rótulo exigem equivalência explícita no próprio produto.
Nutrientes ausentes não são preenchidos. Sódio e minerais são apresentados em mg;
fibras, açúcares e gorduras saturadas, em g.

## Prescrição e atualização

Os arquivos de TACO e Open Food Facts são bases independentes reunidas em um catálogo coletivo na
interface. A base Open Food Facts é oferecida separadamente para download sob
sua licença. Esses arquivos não contêm dados de clínicas, pacientes ou alimentos
privados. As licenças dos dados não alteram a licença do código do aplicativo.

A quantidade prescrita multiplica os nutrientes da medida escolhida. A fonte,
a composição original e a equivalência são copiadas para o plano; uma atualização
futura do catálogo não altera planos já publicados. Alimentos antigos sem uma
equivalência conhecida conservam a porção cadastrada.

Reprodução da importação: `tools/food-catalog/`. O total efetivamente distribuído
e os checksums estão em [catalog-manifest.json](catalog-manifest.json).
A edição de 22/10/2026 reúne 7.201 alimentos: 544 TACO e 6.657 Open Food Facts.

## Catálogo compartilhado com o Personal — 28/10/2026

A ampliação acrescenta **5.000 produtos** em
[openfoodfacts-expansion-20261028.json](openfoodfacts-expansion-20261028.json),
sob as mesmas licenças ODbL/DbCL e sem modificar o recorte anterior. O catálogo
Torque Nutri passa a **12.199 registros**. O Personal carrega esse mesmo arquivo
compilado e mantém seus 1.548 alimentos legados, totalizando **13.747 registros
públicos**, além dos alimentos próprios do profissional.

A identidade pública é preservada por fonte e código; nome, marca e porção
aparecem na busca. Coincidências de nome recebem a fonte ou o identificador
para distinguir referências diferentes. As calorias, macronutrientes e
nutrientes opcionais não são estimados nem recalculados para criar produtos.

A origem e as extrações estão em
[off-expansion-source-metadata.json](off-expansion-source-metadata.json).
O [relatório de normalização](off-expansion-normalization-report.json) documenta
os mesmos filtros da edição anterior e aponta o
[registro das exclusões](off-expansion-quality-exclusions.json). O
[relatório da seleção final](off-expansion-report.json) informa deduplicação,
unidades, marcas, seleção de exatamente 5.000 registros e checksum. Dois
registros adicionais ficam fora: referência seca/preparada pendente de revisão
e porção de rótulo incompatível com o limite de quantidade do aplicativo.

No Personal, planos, favoritos e alimentos privados conservam seus dados.
A biblioteca completa fica no painel. Para respeitar o contrato de publicação,
o pacote do aluno mantém os alimentos legados e privados e acrescenta os
produtos compartilhados usados no plano, nas alternativas, nas receitas ou
nos favoritos. Os limites existentes continuam validados, sem truncar o plano.

Duas referências antigas com possível confusão entre porção e 100 g foram
retiradas do catálogo ativo até revisão: [quarentena](catalog-quarantine.json).
Os arquivos de origem e os snapshots já prescritos permanecem intactos.
