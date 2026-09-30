'use strict';
// Same server, browser and network isolation for baseline and candidate.
// Compiles the checked-out test in memory; neither checkout is modified.
const fs = require('node:fs'), path = require('node:path'), {spawn} = require('node:child_process');
const { createServer } = require('./serve.cjs');
const current = path.resolve(__dirname, '../..');
const root = path.resolve(process.argv[2] || current);
const workers = process.argv[3] || 'block';
if (!['allow','block'].includes(workers)) throw new Error('serviceWorkers must be allow or block');
const loader = `const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(process.env.TEST_ROOT,'tests/test-saas.js');let source=fs.readFileSync(file,'utf8');
source=source.replace(/^  const newContext=b.newContext.bind\\(b\\);.*\\r?\\n/m,'');
const wrapper=\`  const newContext=b.newContext.bind(b);b.newContext=async function(opts){const context=await newContext({...opts,serviceWorkers:process.env.TEST_WORKERS});await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin?route.continue():route.abort());context.on('page',page=>page.on('response',response=>{if(response.url().includes('/app/index.html?t=tok-aluno-teste'))console.log('DESTINATION_FROM_SW='+response.fromServiceWorker());}));return context;};\\n\`;
source=source.replace(/(  const b = await chromium.launch[^\\n]+\\r?\\n)/,'$1'+wrapper);
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);`;
async function main(){
 const server=createServer({root});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env,TEST_ROOT:root,TEST_WORKERS:workers,BASE_URL:'http://127.0.0.1:'+server.address().port,NODE_PATH:path.join(current,'tests/ci/node_modules'),TZ:'America/Sao_Paulo'};
 if(!env.CHROMIUM_PATH&&fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe'))env.CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe';
 console.log('COMPARISON '+JSON.stringify({root,workers,externalNetwork:'blocked',browser:env.CHROMIUM_PATH||'Playwright'}));
 const child=spawn(process.execPath,['-e',loader],{cwd:root,env,stdio:'inherit'});
 const timer=setTimeout(()=>child.kill(),180000);
 const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timer);await new Promise(r=>server.close(r));process.exitCode=code===0?0:1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
