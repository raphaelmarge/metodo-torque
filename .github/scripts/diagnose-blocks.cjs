/* Observação limitada de fixtures sintéticas. Não altera fonte nem asserções. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const name = process.argv[2];
if (!['personal','nutricao-personal-completa'].includes(name)) throw Error('Suíte não permitida');
const target = path.resolve(__dirname, '../../tests/test-' + name + '.js');
let source = fs.readFileSync(target, 'utf8');
function replace(old, next) {
  if (source.split(old).length !== 2) throw Error('Fonte mudou: revisar a instrumentação');
  source = source.replace(old, next);
}
if (name === 'personal') {
  replace('let upserts = 0;\n      st.client =', `let upserts = 0;
      const sample = () => ({client:!!st.client,aid:st.aid,queue:Object.keys(st.sujas||{}),inflight:st.emEnvio,reconciliou:st.reconciliou,conflitos:Object.keys(st.conflitos||{}),ciclo:st.ciclo,timer:st.timer});
      out.before = sample(); out.calls = [];
      st.client =`);
  replace('upserts++;\n        return Promise.resolve', `upserts++; out.calls.push({nome,chave:args.p_chave,comuns:(args.p_linhas||[]).map(x=>x.chave)});
        return Promise.resolve`);
  replace('out.subiu = upserts === 1;', 'out.subiu = upserts === 1; out.upserts=upserts; out.after=sample();');
  replace('ok(ferro.segurou,', "console.log('TRACE826 FERRO '+JSON.stringify(ferro));\n    ok(ferro.segurou,");
} else {
  replace('let browser,checks=0;', 'let browser,diagPage,diagContext,checks=0;');
  replace("p.on('pageerror',e=>errors.push(e.message));", `diagPage=p;diagContext=ctx;
  await ctx.tracing.start({screenshots:true,snapshots:true,sources:true});
  p.on('console',m=>{if(m.text().startsWith('TRACE826'))console.log(m.text());});
  p.on('pageerror',e=>errors.push(e.message));`);
  replace("await reveal(p,'[data-pnfeedback=\"reg1\"]');", `await p.evaluate(()=>{
    window.__diag826=()=>{const e=document.querySelector('[data-pnfeedback="reg1"]'),n=document.getElementById('navPt'),r=e&&e.getBoundingClientRect(),hit=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{area:document.getElementById('pnArea').value,rect:r&&r.toJSON(),nav:n&&n.getBoundingClientRect().toJSON(),open:e&&e.closest('details').open,hit:hit&&(hit.id||hit.tagName),scrollY,viewport:[innerWidth,innerHeight]};};
    let count=0;new MutationObserver(()=>{if(count++<30)console.log('TRACE826 RECORDS '+JSON.stringify(window.__diag826()));}).observe(document.getElementById('pnRegistros'),{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  });
  await reveal(p,'[data-pnfeedback="reg1"]');
  console.log('TRACE826 BEFORE_CLICK '+JSON.stringify(await p.evaluate(()=>window.__diag826())));`);
  replace(".finally(async()=>{if(browser)await browser.close();});", `.finally(async()=>{
    const dir=process.env.BLOCKS_OUT;
    if(dir&&diagPage){fs.mkdirSync(dir,{recursive:true});await diagPage.screenshot({path:path.join(dir,'final.png'),fullPage:true}).catch(()=>{});console.log('TRACE826 FINAL '+JSON.stringify(await diagPage.evaluate(()=>window.__diag826&&window.__diag826()).catch(()=>null)));}
    if(dir&&diagContext)await diagContext.tracing.stop({path:path.join(dir,'trace.zip')}).catch(()=>{});
    if(browser)await browser.close();
  });`);
}
new Function('require','module','exports','__filename','__dirname',source);
if(process.env.DIAG_CHECK==='1'){console.log('Instrumentação validada: '+name);process.exit(0);}
const fixture=new Module(target,module);fixture.filename=target;fixture.paths=Module._nodeModulePaths(path.dirname(target));fixture._compile(source,target);
