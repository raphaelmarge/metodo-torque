/* Editor no shell real e IndexedDB do Chromium. Somente imagem geométrica sintética. */
const assert=require('node:assert/strict');
let chromium;
try{chromium=require(process.env.TORQUE_PLAYWRIGHT||'playwright').chromium;}
catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem.js');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;console.log('OK '+label);};
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await ctx.route('**://*.supabase.co/**',r=>r.abort());
 const p=await ctx.newPage();p.on('dialog',d=>d.accept());
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL(/personal\.html/);
 await p.waitForFunction(()=>window.MT_PERSONAL_POSTURAL&&window.__ptStudio);
 await p.evaluate(()=>{
  const st=MTStore.read('ptStudio',{});st.alunos=[{id:'postural-synthetic',nome:'Aluno sintético',ativo:true}];
  localStorage.setItem('mtapp:ptStudio',JSON.stringify(st));__ptStudio.render();
 });
 const open=async()=>p.evaluate(async()=>{document.querySelector('#abas [data-a="avaliacoes"]').click();await MT_PERSONAL_POSTURAL.open('postural-synthetic');});
 await open();await p.waitForSelector('#ppRoot:not([hidden])');
 const before=await p.evaluate(()=>JSON.stringify(MTStore.read('ptStudio',{})));
 const image=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=1000;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,600,1000);g.strokeStyle='black';g.strokeRect(100,100,400,800);return c.toDataURL('image/png').split(',')[1];});
 await p.setInputFiles('#ppFile',{name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await p.waitForSelector('#ppSvg:not([hidden])');
 await p.click('[data-pp-tool="horizontal"]');await p.locator('#ppSvg').scrollIntoViewIfNeeded();
 const b=await p.locator('#ppSvg').boundingBox();
 await p.mouse.click(b.x+b.width*.4,b.y+b.height*.4);await p.mouse.click(b.x+b.width*.6,b.y+b.height*.4);
 await p.waitForSelector('.pp-mark');ok((await p.locator('#ppMarks').innerText()).includes('0,0°'),'dois pontos horizontais exibem 0°');
 await p.fill('#ppText','Observação sintética');
 await p.click('#ppSave');ok((await p.locator('#ppStatus').innerText()).includes('Confirme a autorização'),'salvamento exige confirmação');
 await p.check('#ppConsent');await p.click('#ppSave');await p.waitForSelector('.pp-history-row');
 ok(await p.locator('.pp-history-row').count()===1,'snapshot salvo em IndexedDB');
 ok(!await p.isChecked('#ppConsent'),'nova versão exige nova confirmação');
 ok(await p.evaluate(()=>JSON.stringify(MTStore.read('ptStudio',{})))===before,'foto não altera ptStudio');
 const download=p.waitForEvent('download');await p.click('[data-pp-action="export"]');const file=await download;
 ok(file.suggestedFilename().endsWith('.png'),'exporta PNG');
 await p.reload();await p.waitForFunction(()=>window.MT_PERSONAL_POSTURAL&&window.__ptStudio);await open();
 await p.waitForSelector('.pp-history-row');await p.click('[data-pp-action="load"]');await p.waitForSelector('#ppSvg:not([hidden])');
 ok((await p.locator('#ppMarks').innerText()).includes('Observação sintética'),'recarregamento preserva marcação e observação');
 ok(!await p.isChecked('#ppConsent'),'reabertura não presume consentimento de nova versão');
 for(const width of [390,1280]){await p.setViewportSize({width,height:844});ok(await p.locator('#ppRoot').isVisible(),'editor disponível em '+width+'px');}
 await p.check('#ppConsent');await p.click('#ppSave');await p.waitForFunction(()=>document.querySelectorAll('.pp-history-row').length===2);
 ok(await p.locator('.pp-history-row').count()===2,'nova versão não substitui anterior');
 await ctx.close();console.log(checks+' verificações do editor postural passaram (Chromium, nuvem bloqueada).');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
