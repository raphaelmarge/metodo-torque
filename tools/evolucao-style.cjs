'use strict';
// Fontes CSS permanecem editáveis; o builder precisa incluí-las no HTML exportado/offline.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const files=['app/tecnica-video.css','app/treino-evolucao.css','app/nutricao-semana.css'];
const css=files.map(file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).join('\n');
fs.writeFileSync(path.join(root,'app/evolucao-style.js'),'/* Gerado por tools/evolucao-style.cjs. */\nself.MT_EVOLUCAO_STYLE='+JSON.stringify(css)+';\n');
