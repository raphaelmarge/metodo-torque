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
