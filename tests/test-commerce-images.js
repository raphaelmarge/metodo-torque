/* Real UI, synthetic local data and no external network. */
const assert=require('node:assert/strict');
let chromium;try {chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const BASE=process.env.BASE_URL||'http://127.0.0.1:8794';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(require('fs').existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':'/usr/bin/chromium'),args:['--no-sandbox']});
 try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
 const outside=[];await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(BASE).origin)return r.continue();outside.push(r.request().url());return r.abort();});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(BASE+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL('**/personal.html');await p.waitForFunction(()=>window.__dadosApp&&document.querySelector('#persArea'));
 await p.click('[data-a="pers"]');await p.selectOption('#persArea','beneficios');await p.click('#persGrupo2 summary');await p.click('#persGrupo3 summary');
 const image=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,200,100);return c.toDataURL('image/png').split(',')[1];});
 const file={name:'ficticio.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')};
 const fields={clube:p.locator('#persGrupo2 fieldset'),loja:p.locator('#persGrupo3 fieldset')};
 const config=()=>p.evaluate(()=>MTStore.read('ptStudio',{}).config);
 for(const kind of ['clube','loja']){
   const f=fields[kind];await f.locator('input[type=file]').setInputFiles(file);await p.waitForFunction(k=>!MT_COMMERCE_IMAGES.busy(k),kind);
   assert.equal(await f.locator('img').isVisible(),true);
   if(kind==='clube'){await p.fill('#clubeNome','Parceiro fictício');await p.fill('#clubeBen','Benefício fictício');}
   else{await p.fill('#lojaNome','Produto fictício');await p.fill('#lojaValor','49.90');}
   const before=await config();
   await p.evaluate(()=>{window.originalWrite=MTStore.write;MTStore.write=function(k,v){return k==='ptStudio'?false:originalWrite(k,v);};});
   await p.click('#'+kind+'Add');assert.deepEqual(await config(),before);assert.match(await p.locator('#'+kind+'Status').innerText(),/Não foi possível/);assert.equal(await f.locator('img').isVisible(),true);
   await p.evaluate(()=>MTStore.write=originalWrite);await p.click('#'+kind+'Add');
   const list=(await config())[kind==='clube'?'clube':'lojaItens'];assert.match(list.at(-1).f,/^data:image\//);assert.equal(await f.locator('img').isVisible(),false);
   const row=p.locator('[data-commerce-image="'+kind+'"]').last();await row.click();await p.locator('dialog[open]').getByText('Remover imagem',{exact:true}).click();await p.locator('dialog[open]').getByText('Cancelar',{exact:true}).click();assert.equal((await config())[kind==='clube'?'clube':'lojaItens'].at(-1).f,list.at(-1).f);
   await row.click();const dialog=p.locator('dialog[open]');await dialog.locator('input').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await p.waitForTimeout(50);assert.match(await dialog.innerText(),/Use uma imagem/);
   await dialog.locator('input').setInputFiles({name:'big.png',mimeType:'image/png',buffer:Buffer.alloc(8*1024*1024+1)});await p.waitForTimeout(50);assert.match(await dialog.innerText(),/no máximo 8 MB/);
   await dialog.locator('input').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await p.waitForTimeout(100);assert.match(await dialog.innerText(),/Não foi possível abrir/);
   await dialog.getByText('Cancelar',{exact:true}).click();
 }
 const dto=await p.evaluate(()=>__dadosApp(MTStore.read('ptStudio',{}).alunos[0],'test'));assert.match(dto.clubeApp.at(-1).f,/^data:image\/png/);assert.match(dto.lojaApp.find(x=>x.n==='Produto fictício').f,/^data:image\/jpeg/);assert.equal(dto.clubeApp[0].f,'');
 const html=await p.evaluate(d=>MT_APP_ALUNO.monta(d),dto);assert.match(html,/Logo de Parceiro fictício/);assert.match(html,/object-fit:contain/);
 // Logo preserves the wide source in a square transparent canvas; product uses cover.
 const pixels=await p.evaluate(async()=>{let src=MT_COMMERCE_IMAGES.draft('clube');const s=MTStore.read('ptStudio',{});src=s.config.clube.at(-1).f;const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=c.height=320;const g=c.getContext('2d');g.drawImage(im,0,0);return [g.getImageData(160,0,1,1).data[3],g.getImageData(160,160,1,1).data[3]];});assert.deepEqual(pixels,[0,255]);
 // Failed edit preserves both committed data and the pending preview; stale edits do not overwrite.
 await p.locator('[data-commerce-image="clube"]').last().click();
 await p.locator('dialog[open]').getByText('Remover imagem',{exact:true}).click();
 const stable=await config();
 await p.evaluate(()=>{window.originalWrite=MTStore.write;MTStore.write=function(k,v){return k==='ptStudio'?false:originalWrite(k,v);};});
 await p.locator('dialog[open]').getByText('Salvar imagem',{exact:true}).click();assert.deepEqual(await config(),stable);assert.match(await p.locator('dialog[open]').innerText(),/Não foi possível salvar/);
 await p.evaluate(()=>{MTStore.write=originalWrite;const s=MTStore.read('ptStudio',{});s.config.clube.at(-1).b='Alterado em outra edição';MTStore.write('ptStudio',s);});
 await p.locator('dialog[open]').getByText('Salvar imagem',{exact:true}).click();assert.match(await p.locator('dialog[open]').innerText(),/cadastro mudou/);assert.equal((await config()).clube.at(-1).b,'Alterado em outra edição');
 await p.locator('dialog[open]').getByText('Cancelar',{exact:true}).click();
 // Save removal, then confirm the published DTO loses the logo too.
 await p.locator('[data-commerce-image="clube"]').last().click();await p.locator('dialog[open]').getByText('Remover imagem',{exact:true}).click();await p.locator('dialog[open]').getByText('Salvar imagem',{exact:true}).click();assert.equal((await config()).clube.at(-1).f,undefined);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 console.log('OK: create, failure retention, cancel, formats/size/decode, cover/contain, DTO, legacy, remove, mobile and isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
