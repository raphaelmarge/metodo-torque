# Importação do catálogo alimentar

Dados públicos separados de planos e recursos privados. Nenhum script acessa
Supabase ou dados de pacientes. As fontes, licenças e limites estão em
`nutri/data/README.md`; os relatórios e checksums ficam ao lado dos JSONs.

Requer Python 3, dependências em `requirements.txt` para as planilhas, e Node.js.
Open Food Facts usa apenas a biblioteca padrão do Python. Execute da raiz:

```sh
python -m pip install -r tools/food-catalog/requirements.txt
python tools/food-catalog/import-taco.py --taco /caminho/taco-official.xlsx --ibge /caminho/tabelamedidas_bd.xls --out nutri/data
python tools/food-catalog/fetch_off_csv.py --output-dir /caminho/pesquisa --limit 12000
python tools/food-catalog/normalize_off.py --input /caminho/pesquisa/off-brazil-bulk.jsonl --metadata /caminho/pesquisa/off-source-metadata.json --output-dir /caminho/pesquisa/normalizado
```

O download OFF é transmitido em fluxo e interrompido no limite de candidatos.
A fonte é atualizada periodicamente: uma nova execução pode gerar outro recorte.
Preserve o extrato e seus metadados para reprodução exata; o normalizador confere
o checksum da entrada. A versão distribuída identifica a fonte de 22/10/2026.
Confira os motivos de rejeição, unidades e amostras antes de substituir arquivos.
Não invente valores para elevar a contagem nem associe medidas por nome aproximado.

Após revisão, copie `off-selected.json` para `nutri/data/openfoodfacts.json`,
`off-manifest.json` para `nutri/data/openfoodfacts-import-report.json` e os
metadados da extração para `nutri/data/openfoodfacts-source-metadata.json`.
Copie também `off-quality-exclusions.json` para `nutri/data/` para conservar
os motivos e valores dos registros excluídos pela triagem de micronutrientes.
Compile e valide:

```sh
node tools/food-catalog/build.mjs
node tests/test-nutri-food-data.js
node tests/test-nutri-food-measures.js
```

O compilador exige ao menos 3.000 registros reais, identidades únicas, fontes,
quatro nutrientes completos e medidas na mesma unidade da referência. A suíte
confere cada alimento e a invariância da quantidade ao trocar sua medida.
Atualizações do catálogo também exigem revisar o cache de `nutri/sw.js`.

## Ampliação aditiva e catálogo compartilhado (28/10/2026)

Não substitua os JSONs anteriores para ampliar a biblioteca. A expansão fica em
arquivo próprio, com rastreabilidade e deduplicação contra os registros publicados.
Os extratos de entrada ficam fora do repositório. Exemplo (diretórios diferentes):

```sh
python tools/food-catalog/fetch_off_csv.py --output-dir /pesquisa/gtin-br --limit 30000
python tools/food-catalog/fetch_off_csv.py --output-dir /pesquisa/importados --limit 3000 --imports-only
node tools/food-catalog/combine-off.mjs /pesquisa/combinado /pesquisa/gtin-br /pesquisa/importados
python tools/food-catalog/normalize_off.py --input /pesquisa/combinado/off-brazil-bulk.jsonl --metadata /pesquisa/combinado/off-source-metadata.json --output-dir /pesquisa/combinado/normalizado
node tools/food-catalog/expand-off.mjs /pesquisa/combinado/normalizado
```

Copie os metadados do extrato combinado para
`nutri/data/off-expansion-source-metadata.json`. O combinador exige a mesma
versão/ETag e valida os checksums das entradas; o normalizador também confere a
entrada combinada. Os prefixos GTIN são apenas um recorte de seleção, não prova
do país de fabricação. Todos os registros continuam exigindo o país de venda
Brasil na fonte. A triagem nutricional não foi relaxada para atingir o total.

O seletor exige exatamente 5.000 novos produtos, elimina código repetido,
produto/marca/unidade e nome de exibição já existentes, distribui a seleção por
categoria e marca e registra os descartes. Se faltarem produtos válidos, falha
antes de gravar. Confira relatórios e amostras; não invente nem reescale nutrientes.

```sh
node tools/food-catalog/build.mjs
node tests/test-food-catalog-expansion.js
node tests/test-nutri-food-data.js
node tests/test-food-catalog-shared-ui.js
node tests/test-nutri-food-catalog-ui.js
```

Os testes de interface usam os pré-requisitos Playwright/Chromium do projeto e
`BASE_URL` apontando para um servidor local. O Personal carrega o catálogo
canônico seguido de `assets/alimentos-catalogo-compartilhado.js`; não mantenha
uma cópia independente dos novos produtos. O adaptador não reescreve objetos
legados, dados privados ou prescrições e pode ser carregado novamente sem
duplicar registros. Atualizar também `sw.js` e a versão global do projeto.

O compilador aplica `nutri/data/catalog-quarantine.json` antes de disponibilizar
novas prescrições. Os JSONs anteriores continuam intactos para auditoria, e
planos salvos conservam seus snapshots. O manifesto identifica o arquivo de
quarentena e seu checksum; testes conferem a composição ativa exata.
