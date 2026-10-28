// Combine audited CSV extracts from the same source release before normalization.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [target,...dirs]=process.argv.slice(2);
if(!target||dirs.length<2)throw Error('Usage: node combine-off.mjs OUTPUT_DIR EXTRACT_DIR EXTRACT_DIR...');
if(dirs.some(dir=>path.resolve(dir)===path.resolve(target)))throw Error('Output must differ from input directories');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const parts=dirs.map(dir=>{
 const metadata=JSON.parse(fs.readFileSync(path.join(dir,'off-source-metadata.json'))),bytes=fs.readFileSync(path.join(dir,'off-brazil-bulk.jsonl'));
 if(sha(bytes)!==metadata.rawSha256)throw Error('Extract checksum mismatch: '+dir);
 if(bytes.length&&bytes[bytes.length-1]!==10)throw Error('Extract must end in newline');
 return {metadata,bytes};
});
const first=parts[0].metadata;
if(parts.some(p=>p.metadata.sourceVersion!==first.sourceVersion||p.metadata.sourceUrl!==first.sourceUrl||p.metadata.etag!==first.etag))throw Error('Source releases differ');
const bytes=Buffer.concat(parts.map(p=>p.bytes));
const metadata={sourceUrl:first.sourceUrl,sourceVersion:first.sourceVersion,sourceDate:first.sourceDate,etag:first.etag,
 selectionScope:'Produtos identificados na fonte como vendidos no Brasil, incluindo GTIN 789/790 e outros prefixos; sem afirmar origem de fabricação pelo código.',
 selectedRawRows:parts.reduce((sum,p)=>sum+p.metadata.selectedRawRows,0),rawSha256:sha(bytes),extracts:parts.map(p=>p.metadata)};
fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'off-brazil-bulk.jsonl'),bytes);
fs.writeFileSync(path.join(target,'off-source-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({rows:metadata.selectedRawRows,sha256:metadata.rawSha256}));
