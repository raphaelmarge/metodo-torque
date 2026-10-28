"""Stream official OFF bulk CSV; retain Brazilian products with reported core macros."""
import csv,gzip,io,json,urllib.request,math,time,datetime,hashlib,argparse
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir',type=Path,default=Path(__file__).parent)
parser.add_argument('--limit',type=int,default=12000)
parser.add_argument('--imports-only',action='store_true',help='Products sold in Brazil with GTIN prefixes other than 789/790')
args=parser.parse_args()
root=args.output_dir
root.mkdir(parents=True,exist_ok=True)
u='https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'
csv.field_size_limit(2**31-1)
def number(s):
    try:
        n=float(s)
        return n if math.isfinite(n) else None
    except (ValueError,TypeError):return None
def tags(s):return [x for x in s.split(',') if x]
selected=0; scanned=0; started=time.time()
out=root/'off-brazil-bulk.jsonl'
request=urllib.request.Request(u,headers={'User-Agent':'TorqueNutriCatalogResearch/1.0'})
with urllib.request.urlopen(request,timeout=90) as response:
    metadata={'sourceUrl':u,'sourceVersion':'official-csv-'+response.headers.get('Last-Modified','unknown'),
              'sourceDate':response.headers.get('Last-Modified'), 'contentLength':response.headers.get('Content-Length'),
              'etag':response.headers.get('ETag'),'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (root/'off-source-metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf8')
    print(json.dumps(metadata),flush=True)
    reader=csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=response),encoding='utf8'),delimiter='\t')
    with out.open('w',encoding='utf8') as f:
        for row in reader:
            scanned+=1
            if scanned%100000==0: print(json.dumps({'scanned':scanned,'selected':selected,'seconds':round(time.time()-started)}),flush=True)
            domestic_prefix=row.get('code','').startswith(('789','790'))
            if domestic_prefix == args.imports_only:continue
            countries=tags(row.get('countries_tags',''))
            if 'en:brazil' not in countries:continue
            if any(number(row.get(k+'_100g')) is None for k in ('energy-kcal','proteins','carbohydrates','fat')):continue
            if row.get('no_nutrition_data') in ('on','yes','1','true'):continue
            p={'code':row['code'],'product_name':[{'lang':'main','text':row.get('product_name','')}],
               'brands':row.get('brands'),'categories_tags':tags(row.get('categories_tags','')),'countries_tags':countries,
               'nutriments':[{'name':k[:-5],'100g':number(v)} for k,v in row.items() if k.endswith('_100g') and number(v) is not None],
               'serving_size':row.get('serving_size'),'serving_quantity':row.get('serving_quantity'),
               'product_quantity':row.get('product_quantity'),'quantity':row.get('quantity'),
               'data_quality_errors_tags':tags(row.get('data_quality_errors_tags','')),
               'last_modified_t':number(row.get('last_modified_t'))}
            f.write(json.dumps(p,ensure_ascii=False,separators=(',',':'))+'\n')
            selected+=1
            if selected%1000==0:
                f.flush();print(json.dumps({'scanned':scanned,'selected':selected,'seconds':round(time.time()-started)}),flush=True)
            if selected>=args.limit:break
metadata.update({'scannedRows':scanned,'selectedRawRows':selected,'elapsedSeconds':round(time.time()-started),
                 'selection':f'First {args.limit} rows in official CSV with country en:brazil, '+('GTIN prefixes other than 789/790' if args.imports_only else 'GTIN prefix789/790')+', and four numeric core nutrients.',
                 'selectionScope':'Produtos listados para venda no Brasil; '+('GTIN fora dos prefixos 789/790 (inclui importados).' if args.imports_only else 'GTIN nos prefixos 789/790.'),
                 'rawSha256':hashlib.sha256(out.read_bytes()).hexdigest()})
(root/'off-source-metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf8')
print(json.dumps(metadata),flush=True)
