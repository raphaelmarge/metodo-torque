"""Normalize a real Open Food Facts Brazilian bulk extract without filling unknown nutrients.

Input is the official OFF CSV extract produced by fetch_off_csv.py.
No application or database writes are performed here.
"""
import collections
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import unicodedata

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',type=Path)
parser.add_argument('--metadata',type=Path)
parser.add_argument('--output-dir',type=Path,default=Path(__file__).parent)
args=parser.parse_args()
ROOT=args.output_dir
ROOT.mkdir(parents=True,exist_ok=True)
# Quarantine records with contradictions observed during sample review. Values
# are never silently replaced with estimates or another product's composition.
MANUAL_REJECTIONS={
    '7891000103913':'brand_name_conflict',
    '7898941911058':'brand_name_conflict',
    '7898941911102':'brand_name_conflict',
    '7898941911072':'brand_name_conflict',
    '7896016608766':'brand_name_conflict',
    '7899916905621':'unresolved_serving_reference',
    '7899916904853':'unresolved_serving_reference',
}
INPUT = args.input or ROOT / 'off-brazil-bulk.jsonl'
metadata_path=args.metadata or ROOT/'off-source-metadata.json'
source_meta=json.loads(metadata_path.read_text(encoding='utf8'))
SOURCE_URL=source_meta['sourceUrl'];SOURCE_VERSION=source_meta['sourceVersion'];SOURCE_DATE=source_meta['sourceDate']
if hashlib.sha256(INPUT.read_bytes()).hexdigest()!=source_meta['rawSha256']:
    raise ValueError('Input does not match source metadata checksum')

def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def finite(x):
    return isinstance(x, (int,float)) and not isinstance(x,bool) and math.isfinite(x)

def barcode_ok(code):
    if not re.fullmatch(r'\d{8}|\d{12,14}', code): return False
    # GTIN check digit. Keep leading zeroes; never coerce identifiers to numbers.
    return (10 - sum(int(x)*(3 if i%2==0 else 1) for i,x in enumerate(code[-2::-1]))%10)%10 == int(code[-1])

def group(tags):
    present=set(tags)
    rules=[
        ('Suplementos',{'en:dietary-supplements','en:food-supplements','en:protein-powders','en:meal-replacements'}),
        ('Laticínios e alternativas',{'en:dairies','en:dairy-products','en:milks','en:yogurts','en:yoghurts','en:cheeses','en:plant-based-milk-substitutes','en:plant-based-yogurts'}),
        ('Bebidas',{'en:beverages','en:fruit-juices','en:waters','en:teas','en:coffees','en:sodas'}),
        ('Carnes, pescados e ovos',{'en:meats','en:meat-products','en:fishes','en:seafood','en:eggs','en:poultries','en:fish-products'}),
        ('Cereais, pães e massas',{'en:cereals-and-their-products','en:cereals','en:breads','en:pastas','en:rices','en:flours','en:oats'}),
        ('Frutas e vegetais',{'en:fruits','en:vegetables','en:fruits-and-vegetables-based-foods','en:legumes','en:pulses'}),
        ('Oleaginosas e sementes',{'en:nuts','en:seeds','en:nuts-and-their-products'}),
        ('Óleos, molhos e condimentos',{'en:vegetable-oils','en:oils','en:sauces','en:condiments','en:seasonings','en:spreads'}),
        ('Doces e snacks',{'en:snacks','en:chocolates','en:candies','en:sweets','en:biscuits','en:cookies','en:desserts','en:cakes'}),
    ]
    return next((name for name,candidates in rules if present.intersection(candidates)), 'Alimentos industrializados')

def parse_measure(raw, base_unit, quantity):
    """Retain labeled portions, never infer density or grams per household measure."""
    raw=re.sub(r'\s+', ' ', str(raw or '')).strip()
    mass_unit=r'(?:kg|mg|g|ml|cl|dl|l)\b'
    if re.search(r'\d\s*/\s*\d+(?:[.,]\d+)?\s*'+mass_unit,raw,re.I): return []
    if re.search(r'\d\s*(?:x|×|\*)\s*\d+(?:[.,]\d+)?\s*'+mass_unit,raw,re.I): return []
    if re.search(mass_unit+r'\s*(?:x|×|\*)\s*\d',raw,re.I): return []
    if re.search(r'\d\s*(?:-|–|a)\s*\d+(?:[.,]\d+)?\s*'+mass_unit,raw,re.I): return []
    match=re.search(r'(?<![\d./])(\d+(?:[.,]\d+)?)\s*(kg|mg|g|ml|cl|dl|l)\b', raw, re.I)
    if not match: return []
    amount=float(match.group(1).replace(',','.'))
    unit=match.group(2).lower()
    multiplier={'kg':1000,'mg':.001,'g':1,'ml':1,'cl':10,'dl':100,'l':1000}[unit]
    normalized_unit='g' if unit in ('kg','mg','g') else 'ml'
    amount=round(amount*multiplier,5)
    if normalized_unit!=base_unit or not 0 < amount <= 2000: return []
    # If OFF reports a normalized portion, reject an inconsistent label.
    try:
        sq=float(quantity)
        if sq>0 and abs(sq-amount)>max(.1,amount*.02): return []
    except (ValueError,TypeError): pass
    measures=[{'id':'rotulo','label':'Porção do rótulo: '+raw,'amount':amount,'unit':base_unit,'source':'Open Food Facts — porção informada no rótulo'}]
    household=re.search(r'(?:^|[ (])([0-9]+(?:[.,][0-9]+)?)\s+(colheres?\s+(?:de\s+)?(?:sopa|chá)|fatias?|unidades?|potes?|copos?|xícaras?|sachês?|saches?)\b',raw,re.I)
    if household and not re.search(r'\d\s*/\s*\d',raw):
        count=float(household.group(1).replace(',','.'))
        label=household.group(2).lower()
        canonical={'colheres de sopa':'Colher de sopa','colher de sopa':'Colher de sopa','colheres sopa':'Colher de sopa','colher sopa':'Colher de sopa','colheres de chá':'Colher de chá','colher de chá':'Colher de chá','colheres chá':'Colher de chá','colher chá':'Colher de chá','fatias':'Fatia','fatia':'Fatia','unidades':'Unidade','unidade':'Unidade','potes':'Pote','pote':'Pote','copos':'Copo','copo':'Copo','xícaras':'Xícara','xícara':'Xícara','sachês':'Sachê','sachê':'Sachê','saches':'Sachê','sache':'Sachê'}
        if 0<count<=100:
            human=canonical.get(label,label.capitalize())
            measures.append({'id':'rotulo-'+norm(human).replace(' ','-'),'label':human+' (rótulo)','amount':round(amount/count,5),'unit':base_unit,'source':'Open Food Facts — equivalência explícita do rótulo: '+raw})
    return measures

def normalized_base(p):
    # OFF documents *_100g as per100g, or per100ml for liquids. Preserve only
    # records with explicit product/serving units, rejecting conflicting units.
    product_unit=p.get('product_quantity_unit')
    serving=str(p.get('serving_size') or '')
    match=re.search(r'\d+(?:[.,]\d+)?\s*(kg|mg|g|ml|cl|dl|l)\b',serving,re.I)
    serving_unit=('g' if match.group(1).lower() in ('kg','mg','g') else 'ml') if match else None
    if product_unit not in ('g','ml'):
        match_product=re.search(r'\d+(?:[.,]\d+)?\s*(kg|mg|g|ml|cl|dl|l)\b',str(p.get('quantity') or ''),re.I)
        product_unit=('g' if match_product.group(1).lower() in ('kg','mg','g') else 'ml') if match_product else None
    if serving_unit and product_unit and serving_unit!=product_unit: return None
    basis=serving_unit or product_unit
    if basis=='ml':
        liquid_categories={'en:beverages','en:milks','en:plant-based-milk-substitutes','en:plant-milks','en:soy-milks','en:yogurt-drinks','en:fermented-milk-drinks','en:fruit-juices','en:vegetable-juices','en:oils','en:soups','en:cream','en:creams'}
        if not liquid_categories.intersection(p.get('categories_tags') or []): return None
        if any(re.search(r'powder|ice-cream|frozen|ice-pop',x) for x in p.get('categories_tags') or []): return None
    return basis

rejections=collections.Counter()
accepted=[]
scanned=0
for line in INPUT.open(encoding='utf8'):
    scanned+=1
    p=json.loads(line)
    reason=None
    code=str(p.get('code') or '')
    names=p.get('product_name') or []
    name=next((x.get('text','') for x in names if x.get('lang')=='pt' and x.get('text')),None)
    if not name: name=next((x.get('text','') for x in names if x.get('lang')=='main' and x.get('text')),'')
    name=re.sub(r'\s+',' ',name).strip()
    brand=re.sub(r'\s+',' ',str(p.get('brands') or '')).strip()
    ns={x.get('name'):x.get('100g') for x in p.get('nutriments',[]) if x.get('name')}
    vals=[ns.get(k) for k in ['energy-kcal','proteins','carbohydrates','fat']]
    basis=normalized_base(p)
    if code in MANUAL_REJECTIONS: reason='manual_quarantine_'+MANUAL_REJECTIONS[code]
    elif 'en:brazil' not in (p.get('countries_tags') or []): reason='not_brazil'
    elif p.get('obsolete'): reason='obsolete'
    elif not barcode_ok(code): reason='invalid_gtin'
    elif len(name)<3 or len(name)>180 or re.search(r'https?://|<[^>]+>',name) or not re.search('[A-Za-zÀ-ÿ]',name): reason='invalid_name'
    elif norm(name) in {'tradicional','original','integral','light','diet','zero','sem gluten','zero acucar','zero lactose','sem lactose','normal','produto','teste','test','unknown','nao informado'}: reason='non_descriptive_name'
    elif not brand or len(brand)>180: reason='missing_or_invalid_brand'
    elif not all(finite(x) for x in vals): reason='incomplete_kcal_macros'
    elif basis not in ('g','ml'): reason='ambiguous_reference_unit'
    else:
        kcal,prot,carbs,fat=vals
        if not (0<=kcal<=900 and all(0<=v<=100 for v in (prot,carbs,fat)) and prot+carbs+fat<=105): reason='physical_limits'
        tags=(p.get('data_quality_errors_tags') or [])+(p.get('data_quality_warnings_tags') or [])
        if not reason and any(re.search(r'nutrition|nutriment|energy|carbohydrate|protein|fat-|fiber|sodium|salt-',t) for t in tags): reason='nutrition_quality_flag'
        calculated=4*(prot+carbs)+9*fat
        if not reason and abs(kcal-calculated)>max(25,kcal*.25): reason='inconsistent_energy_macros'
        if not reason and kcal<1 and calculated>5: reason='zero_energy_with_macros'
        sugar=ns.get('sugars');saturated=ns.get('saturated-fat');fiber=ns.get('fiber')
        if not reason and finite(sugar) and (sugar<0 or sugar>carbs+max(.5,carbs*.02)): reason='sugars_exceed_carbohydrates'
        if not reason and finite(saturated) and (saturated<0 or saturated>fat+max(.5,fat*.02)): reason='saturated_exceeds_total_fat'
        if not reason and finite(fiber) and not 0<=fiber<=100: reason='invalid_fiber'
    if reason:
        rejections[reason]+=1
        continue
    item={'n':name,'c':group(p.get('categories_tags') or []),'p':'100 '+basis,
          'k':round(kcal,2),'pt':round(prot,3),'cb':round(carbs,3),'g':round(fat,3),
          'id':'off:'+code,'barcode':code,'brand':brand,'source':'Open Food Facts',
          'sourceUrl':'https://world.openfoodfacts.org/product/'+code,
          'baseAmount':100,'baseUnit':basis,'measures':parse_measure(p.get('serving_size'),basis,p.get('serving_quantity')),
          'sourceVersion':SOURCE_VERSION,'sourceDate':SOURCE_DATE,
          'sourceUpdatedAt':p.get('last_modified_t')}
    for target,source,multiplier in [('fb','fiber',1),('sugars','sugars',1),('saturated','saturated-fat',1),('sodiumMg','sodium',1000),('calciumMg','calcium',1000),('ironMg','iron',1000),('potassiumMg','potassium',1000),('cholesterolMg','cholesterol',1000)]:
        value=ns.get(source)
        if finite(value) and value>=0:
            upper=100 if multiplier==1 else 100000
            if value*multiplier<=upper: item[target]=round(value*multiplier,4)
    accepted.append(item)

# Prefer newer entries and fuller micronutrient/portion data for duplicate packs.
accepted.sort(key=lambda x:(x.get('sourceUpdatedAt') or 0,len(x['measures']),len(x)),reverse=True)
unique=[]
codes=set(); signatures=set()
for item in accepted:
    short=re.sub(r'\b(?:(?:caixa|lata|pacote|garrafa|pote|embalagem)\s+)?\d+(?:[.,]\d+)?\s*(?:kg|mg|g|ml|cl|dl|litros?|l)\b','',item['n'],flags=re.I)
    brand_key='|'.join(sorted({norm(b) for b in item['brand'].split(',') if norm(b)}))
    signature=(norm(short),brand_key,item['baseUnit'])
    if item['barcode'] in codes: rejections['duplicate_barcode']+=1; continue
    if signature in signatures: rejections['duplicate_product_brand']+=1; continue
    codes.add(item['barcode']); signatures.add(signature); unique.append(item)
unique.sort(key=lambda x:(x['c'],norm(x['n']),norm(x['brand'])))
outfile=ROOT/'off-selected.json'
outfile.write_text(json.dumps(unique,ensure_ascii=False,indent=2),encoding='utf8')
manifest={'source':'Open Food Facts','sourceUrl':SOURCE_URL,'sourceVersion':SOURCE_VERSION,'sourceDate':SOURCE_DATE,
          'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':'ODbL 1.0; individual contents DbCL 1.0',
          'licenseUrl':'https://opendatacommons.org/licenses/odbl/1.0/',
          'attribution':'Dados: Open Food Facts, sob ODbL. Catálogo derivado disponível para download sob a mesma licença.',
          'inputRows':scanned,'acceptedRows':len(unique),'rejectedRows':dict(rejections),
          'selectionScope':'Produtos listados para o Brasil com códigos GTIN iniciados em 789 ou 790; recorte para priorizar produtos nacionais. Não representa todos os produtos vendidos no Brasil.',
          'units':dict(collections.Counter(x['baseUnit'] for x in unique)),
          'categories':dict(collections.Counter(x['c'] for x in unique)),
          'withLabeledServing':sum(bool(x['measures']) for x in unique),
          'sha256':hashlib.sha256(outfile.read_bytes()).hexdigest(),
          'qualityNote':'Rótulos cadastrados na base colaborativa, filtrados automaticamente. Não são revisão clínica nem validação manual individual. Nutrientes ausentes permanecem ausentes.',
          'unitPolicy':'Somente unidades explícitas g/ml em porção ou quantidade do produto, rejeitando conflitos; ml exige também categoria líquida inequívoca, sem pós, sorvetes ou congelados. Não converte massa em volume. Porções preservam texto e quantidade de rótulo; medidas individuais somente quando a contagem é explícita e simples.'}
(ROOT/'off-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
