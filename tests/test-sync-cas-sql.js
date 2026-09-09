const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase-setup.sql'),'utf8');
let n=0;function ok(v,m){assert.ok(v,m);n++;console.log('  OK '+m)}
ok(/alter table public\.dados add column if not exists base_atualizado timestamptz/i.test(sql),'schema aceita a revisão-base no upsert');
ok(/new\.chave\s*=\s*'mtapp:ptStudio'[\s\S]{0,500}tg_op\s*=\s*'UPDATE'/i.test(sql),'CAS é restrito ao agregado crítico e a UPDATE');
ok(/new\.base_atualizado is null[\s\S]{0,300}old\.atualizado is distinct from new\.base_atualizado/i.test(sql),'servidor rejeita cliente sem base ou com revisão velha');
ok(/errcode\s*=\s*'PT409'/i.test(sql),'conflito tem código estável para o cliente');
ok(/new\.atualizado\s*:=\s*now\(\)/i.test(sql),'servidor continua sendo dono do relógio');
ok(/new\.base_atualizado\s*:=\s*null/i.test(sql),'precondição não vira estado persistente');
ok(/revoke execute on function public\.dados_carimba\(\) from public, anon, authenticated/i.test(sql),'trigger não ganha superfície executável pública');
console.log(n+' garantias SQL do CAS passaram.');
