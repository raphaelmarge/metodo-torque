"""Import the official NEPA workbook, preserving unknowns and food-specific measures.

Usage: python import-taco.py --taco path.xlsx --ibge path.xls --out nutri/data
Dependencies: openpyxl==3.1.5, xlrd==2.0.1. Never derives nutrients from food names.
"""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import openpyxl
import xlrd

TACO_URL = 'https://nepa.unicamp.br/publicacoes/tabela-taco-excel/'
IBGE_URL = 'https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2008_2009/Tabela_de_Medidas_Referidas_para_os_Alimentos_Consumidos_no_Brasil/tabelamedidas_bd.zip'
SOURCE = 'TACO · NEPA/Unicamp · 4ª edição (2011)'
MEASURE_SOURCE = 'IBGE · POF 2008–2009 · medidas referidas (2011)'
MACROS = {'k': 3, 'pt': 5, 'cb': 8, 'g': 6}
EXTRAS = {'cholesterolMg': 7, 'fb': 9, 'calciumMg': 11, 'magnesiumMg': 12,
          'phosphorusMg': 15, 'ironMg': 16, 'sodiumMg': 17, 'potassiumMg': 18,
          'zincMg': 20, 'vitaminCMg': 28}

# Explicit crosswalk reviewed against BOTH the food/preparation and the final
# reference description. No fuzzy joins, variety substitutions or g/ml density.
# (TACO id, IBGE food, preparation, allowed measure codes, reference prefix)
CROSSWALK = [
    (1, 6300201, 99, [12, 16, 17], 'Arroz integral cozido'),
    (3, 6300101, 99, [12, 16, 17], 'Arroz cozido'),
    (5, 6300101, 99, [12, 16, 17], 'Arroz cozido'),
    (7, 6500401, 99, [16], 'Aveia flocos'),
    (97, 6401101, 2, [12, 16, 103], 'Beterraba cozida'),
    (98, 6401101, 1, [16, 103], 'Beterraba crua'),
    (109, 6401201, 2, [12, 16, 103], 'Cenoura cozida'),
    (110, 6401201, 1, [16, 103], 'Cenoura crua'),
    (121, 6501401, 99, [12, 16, 17], 'Farinha de mandioca'),
    (163, 6802701, 99, [16, 103], 'Abacate'),
    (182, 6801101, 1, [103], 'Banana prata'),
    (226, 6803101, 99, [12, 16, 103], 'Mamão papaya'),
    (261, 7901501, 99, [16], 'Manteiga'),
    (262, 7901501, 99, [16], 'Manteiga'),
    (488, 7803301, 2, [103], 'Ovo de galinha cozido'),
    (493, 6900304, 99, [16], 'Açúcar mascavo'),
]


def numeric(value):
    return (round(float(value), 6) if isinstance(value, (float, int))
            and not isinstance(value, bool) and math.isfinite(value) and value >= 0 else None)


def measures(filename):
    sheet = xlrd.open_workbook(filename).sheet_by_index(0)
    result, evidence = {}, []
    for taco, food, preparation, allowed, prefix in CROSSWALK:
        for i in range(5, sheet.nrows):
            row = sheet.row_values(i)
            if row[0] != food or row[2] != preparation or row[4] not in allowed:
                continue
            if not str(row[10]).startswith(prefix + ' - '):
                raise ValueError(f'IBGE reference changed: TACO {taco}, row {i + 1}')
            weight = numeric(row[8])
            if weight is None or weight <= 0:
                raise ValueError('Invalid IBGE weight')
            label = str(row[10]).split(' - ', 1)[1]
            # These selected rows describe exactly ONE utensil/unit. Reject an
            # equivalence expressed as several utensils, even if food matches.
            if re.match(r'\d|\bmeia\b|\bmetade\b', label, re.I):
                raise ValueError('Crosswalk must specify one measure')
            label = label[0].upper() + label[1:]
            entry = {'id': f'ibge-{int(row[4])}', 'label': label, 'amount': weight,
                     'unit': 'g', 'source': MEASURE_SOURCE}
            result.setdefault(taco, []).append(entry)
            evidence.append({'tacoId': taco, 'ibgeFoodId': food, 'preparationCode': preparation,
                             'measureCode': int(row[4]), 'grams': weight,
                             'reference': row[10], 'sourceRow': i + 1, 'sourceReferenceCode': row[9]})
    return result, evidence


def run(taco_path, ibge_path, out):
    workbook = openpyxl.load_workbook(taco_path, data_only=True)
    fatty = {row[0]: row for row in workbook.worksheets[1].values if isinstance(row[0], int)}
    household, evidence = measures(ibge_path)
    rows, rejected, category = [], [], ''
    for row in workbook.worksheets[0].values:
        if isinstance(row[0], str) and row[1] is None and row[0].strip() != 'Número do':
            category = row[0].strip()
        if not isinstance(row[0], int):
            continue
        values = {key: numeric(row[column]) for key, column in MACROS.items()}
        if any(value is None for value in values.values()):
            rejected.append({'id': row[0], 'name': str(row[1]).strip(),
                             'reason': 'macro_not_numeric',
                             'original': {key: row[column] for key, column in MACROS.items()}})
            continue
        item = {'id': f'taco:{row[0]}', 'n': re.sub(r'\s+', ' ', row[1]).strip(),
                'c': category, 'p': '100 g', 'baseAmount': 100, 'baseUnit': 'g',
                **values, **{key: numeric(row[column]) for key, column in EXTRAS.items()},
                'saturated': numeric(fatty.get(row[0], [None] * 3)[2]),
                'brand': '', 'barcode': '', 'source': SOURCE, 'sourceUrl': TACO_URL,
                'sourceId': str(row[0]), 'sourceVersion': '4ª edição, 2011',
                'retrievedAt': '2026-10-22', 'kind': 'generic', 'measures': household.get(row[0], [])}
        if row[0] in [3, 5]:
            item['aliases'] = ['Arroz branco cozido']
        rows.append(item)
    if len(rows) + len(rejected) != 597:
        raise ValueError('Unexpected TACO row count')
    out.mkdir(parents=True, exist_ok=True)
    (out / 'taco.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    manifest = {'source': SOURCE, 'sourceUrl': TACO_URL, 'measuresSourceUrl': IBGE_URL,
                'retrievedAt': '2026-10-22', 'accepted': len(rows), 'rejected': rejected,
                'measures': evidence,
                'inputSha256': {Path(p).name: hashlib.sha256(Path(p).read_bytes()).hexdigest()
                                for p in [taco_path, ibge_path]},
                'policy': 'Tr/NA/*/blank are not zero. Missing numeric macros exclude food; missing optional nutrients stay null. No raw/cooked or g/ml conversions.'}
    (out / 'taco-import-report.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'accepted': len(rows), 'rejected': len(rejected), 'foodWithMeasures': len(household),
                      'measures': len(evidence)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--taco', required=True)
    parser.add_argument('--ibge', required=True)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    run(args.taco, args.ibge, args.out)
