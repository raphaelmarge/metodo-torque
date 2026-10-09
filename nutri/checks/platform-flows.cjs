'use strict';
// Integration of actual app modules and original Torque cores in an isolated VM.
// This checks rendering contracts and state mutations, not browser layout.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const root=fs.existsSync(path.resolve(__dirname,'../dist/app.js'))?path.resolve(__dirname,'../dist'):path.resolve(__dirname,'..');
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i],get length(){return values.size;}};};
const nodes=new Map();
const element=id=>({id,html:'',value:'',style:{},dataset:{},files:[],disabled:false,isConnected:true,open:false,addEventListener(){},querySelectorAll(){return[];},showModal(){this.open=true;},close(){this.open=false;},
 set innerHTML(html){this.html=String(html);if(id==='app')for(const key of [...nodes.keys()])if(!['app','modal','modal-body','toast'].includes(key))nodes.delete(key);for(const m of this.html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){if(!nodes.has(m[1]))nodes.set(m[1],element(m[1]));nodes.get(m[1]).value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';}},
 get innerHTML(){return this.html;}});
for(const id of ['app','modal','modal-body','toast'])nodes.set(id,element(id));
const context=vm.createContext({
 console,URL,URLSearchParams,Date,Math,JSON,Map,Set,Object,Array,Number,String,Promise,RegExp,TextEncoder,AbortController,
 crypto:{randomUUID},btoa:s=>Buffer.from(s,'binary').toString('base64'),
 localStorage:memory(),sessionStorage:memory(),location:new URL('https://test.invalid/nutri/'),navigator:{onLine:true},
 document:{querySelector:selector=>nodes.get(selector.replace(/^#/,''))||null,querySelectorAll:()=>[],getElementById:id=>nodes.get(id),
   documentElement:{style:{setProperty(){}}},body:{classList:{add(){},remove(){},toggle(){},contains(){return false;}}}},
 requestAnimationFrame:fn=>fn(),scrollTo(){},addEventListener(){},setTimeout:()=>1,clearTimeout(){},
 history:{replaceState(){}}
});
context.window=context;context.globalThis=context;context.self=context;
for(const name of ['receitas-db','composicao-corporal','nutricao-core','medalhas-core','identidade-marca','alimentos-db'])vm.runInContext(fs.readFileSync(path.join(root,'vendor',name+'.js'),'utf8'),context);
let bundle='';
for(const name of ['assessment.js','vendor/medalha-visual.js','patient-experience.js','platform.js','app.js']){
  bundle+=fs.readFileSync(path.join(root,name),'utf8').replace(/^import .+?;\s*$/mg,'').replace(/\bexport (?=(?:function|const) )/g,'').replace(/^start\(\)\.catch\([^\n]*\);\r?$/m,'')+'\n';
}
bundle+='\nglobalThis.testApp={S,P,seedDemo,render,action,saveLog};';
vm.runInContext(bundle,context,{filename:'actual-app-bundle.js'});
const {S,P,seedDemo,render,action,saveLog}=context.testApp;
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
(async()=>{
  seedDemo();
  check('All professional areas render with the original app, platform and nutrition cores',()=>{
    for(const [page] of P.pages){S.page=page;render();assert(nodes.get('app').innerHTML.length>300,page);assert(!nodes.get('app').innerHTML.includes('[object Object]'),page);}
  });
  await action('switch-role');
  check('Patient home combines real meals, clinical overview and original medal renderer',()=>{
    S.page='today';render();const html=nodes.get('app').innerHTML;
    for(const content of ['patient-cover','Minha rotina alimentar','Próxima refeição pendente','Hidratação','Você, em evolução','Registrar refeição','data:image/svg+xml;base64,'])assert(html.includes(content),content);
    assert(html.includes('patient-layout'));assert(!html.includes('NaN'));
  });
  check('Every patient area remains available including private follow-up modules',()=>{
    for(const page of ['today','food','progress','chat','more',...P.patientPages.map(x=>x[0])]){S.page=page;render();const html=nodes.get('app').innerHTML;assert(html.length>300,page);assert(!html.includes('[object Object]'),page);assert(!html.includes('NaN'),page);}
    S.page='more';render();for(const [page] of P.patientPages)assert(nodes.get('app').innerHTML.includes('data-page="'+page+'"'),page);
  });
  await action('water');await action('water');
  check('Two hydration actions update one actual daily log and the patient home',()=>{
    const actual=S.logs.filter(x=>x.patient_id===S.selected).at(-1);
    assert.equal(actual.water_ml,500);S.page='today';render();assert(nodes.get('app').innerHTML.includes('0,5'));
  });
  await action('water-undo');
  await saveLog({mealId:'breakfast',completed:true});
  check('Registering a meal changes the next pending meal without duplicating completions',()=>{
    S.page='today';render();let html=nodes.get('app').innerHTML;
    assert(html.includes('data-log-meal="lunch"'));assert(html.includes('1/4'));
    const actual=S.logs.filter(x=>x.patient_id===S.selected).at(-1);assert.equal(actual.water_ml,250);assert.equal(actual.meals.filter(x=>x==='breakfast').length,1);
  });
  await saveLog({mealId:'breakfast',completed:true});
  check('Repeating a meal registration remains idempotent',()=>assert.equal(S.logs.filter(x=>x.patient_id===S.selected).at(-1).meals.filter(x=>x==='breakfast').length,1));
  check('Patient assessment excludes private professional notes while retaining the routine tab',()=>{
    S.page='progress';render();const html=nodes.get('app').innerHTML;
    assert(html.includes('Minha rotina'));assert(html.includes('Mapa de medidas'));assert(!html.includes('Paciente quer organizar os horários.'));
  });
  check('Empty patient views do not reuse another patient’s clinical data',()=>{
    S.selected='demo-1';S.page='progress';render();const html=nodes.get('app').innerHTML;
    assert(html.includes('ainda não compartilhou'));assert(!html.includes('68,2'));
    S.page='today';render();assert(nodes.get('app').innerHTML.includes('Lucas'));assert(!nodes.get('app').innerHTML.includes('Última avaliação'));
  });
  console.log(passed+'/'+passed+' platform integration checks passed.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
