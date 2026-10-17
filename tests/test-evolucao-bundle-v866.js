'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),lf=s=>s.replace(/\r\n/g,'\n');
const ctx={self:null,globalThis:null};ctx.self=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
const modules=['app/evolucao-style.js','app/tecnica-video.js','app/treino-evolucao.js','app/nutricao-semana.js','assets/corrida-analise.js','app/corrida-export.js','app/saude-conexoes.js'];
for(const file of modules)vm.runInContext(read(file),ctx,{filename:file});
assert.equal(lf(ctx.MT_EVOLUCAO_STYLE),['app/tecnica-video.css','app/treino-evolucao.css','app/nutricao-semana.css'].map(p=>lf(read(p))).join('\n'),'CSS exportado corresponde aos estilos testados');
vm.runInContext(read('app/aluno-builder.js'),ctx);
const html=ctx.MT_APP_ALUNO.monta({a:{id:'bundle-fixture',nome:'Aluno sintético'},studio:'Teste',cfg:{},fichasApp:[],guiaFichasP:[],fexs:[]});
let scripts=0;for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){new vm.Script(m[1]);scripts++;}assert.ok(scripts>0);
for(const hook of ['__tecnicaVideo','__treinoVariantes','__corridaEvolucao','__saudeConexoes','ajTecnica'])assert.ok(html.includes(hook),'Runtime exportado: '+hook);
for(const file of modules){assert.ok(read('personal.html').includes('src="'+file+'"'),file+' carregado no personal');assert.ok(read('sw.js').includes('"'+file+'"'),file+' offline personal');const relative=file.startsWith('app/')?file.slice(4):'../'+file;assert.ok(read('app/index.html').includes('src="'+relative+'"'),file+' carregado no aluno');assert.ok(read('app/app-sw.js').includes('"'+relative+'"'),file+' offline aluno');}
for(const p of ['demo-aluno.html','demo-aluno-sem-cadastro.html','demo-aluno-cadastro.html']){for(const m of read(p).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);}
console.log('OK módulos presentes no HTML exportado, recuperação, caches e demos; JavaScript serializado válido e CSS correspondente.');
