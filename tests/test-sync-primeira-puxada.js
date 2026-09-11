'use strict';
const assert=require('node:assert/strict');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const primeiraPuxada=require('./_sync-primeira-puxada');
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const result=await primeiraPuxada(browser);
 for(const [key,value] of Object.entries(result)){assert.equal(value,true,key);console.log('OK '+key);}
 console.log(Object.keys(result).length+' verificações da primeira puxada passaram; conta fictícia, sem rede.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
