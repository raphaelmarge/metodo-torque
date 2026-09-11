/* Mesmo store do produto, janela/conta fictícias próprias e respostas controladas.
 * Não escreve em _estado, não usa sleeps nem substitui o motor de sincronização. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const STORE = fs.readFileSync(path.join(__dirname, '../apps/store.js'), 'utf8');
module.exports = async function primeiraPuxada(browser) {
  const ctx = await browser.newContext({serviceWorkers:'block'});
  let deadline;
  try {
    await ctx.route('**/*', route => route.abort());
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><html><body>Sincronização fictícia isolada</body></html>');
    await page.evaluate(() => {
      const memory = new Map();
      Object.defineProperty(window, 'localStorage', {value:{
        get length(){return memory.size;}, key:i=>[...memory.keys()][i],
        getItem:k=>memory.get(k) || null, setItem:(k,v)=>memory.set(k,String(v)), removeItem:k=>memory.delete(k)
      }});
      function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
      const first = deferred(), ack = deferred(), called = deferred();
      window.fixtureSync = {first,ack,called,calls:[],queries:[],reading:false};
      const client = {
        auth:{getSession:async()=>({data:{session:{user:{id:'fixture-user',email:'fixture@example.invalid'}}}}),onAuthStateChange(){}},
        from(table){
          const q={table,filters:[]};fixtureSync.queries.push(q);
          return {
            select(){return this;}, eq(k,v){q.filters.push([k,v]);return this;},gt(){return this;},
            then(ok,bad){
              if(table==='membros')return Promise.resolve({data:[{academia_id:'fixture-academy',papel:'funcionario',academias:{nome:'Fixture'}}]}).then(ok,bad);
              if(table!=='dados')throw Error('Consulta inesperada: '+table);
              fixtureSync.reading=true;
              return first.promise.then(ok,bad);
            }
          };
        },
        rpc(name,args){
          fixtureSync.calls.push({name,args});
          if(name==='dados_cas'){called.resolve();return ack.promise;}
          if(name==='dados_grava')return Promise.resolve({data:args.p_linhas.map(r=>({chave:r.chave,atualizado:'2026-09-11T15:00:00+00:00'}))});
          throw Error('RPC inesperada: '+name);
        }
      };
      window.MT_CLOUD={url:'https://fixture.invalid',anonKey:'fixture'};
      window.supabase={createClient:()=>client};
    });
    await page.addScriptTag({content:STORE});
    await page.waitForFunction(()=>fixtureSync.reading, null, {timeout:5000});
    return await Promise.race([page.evaluate(async () => {
      const f=fixtureSync, S=MTStore, Y=__MTSync, K='mtapp:ptStudio', out={};
      out.identidade=S.cloud().aid==='fixture-academy'&&f.queries.filter(q=>q.table==='dados').every(q=>q.filters.some(([k,v])=>k==='academia_id'&&v==='fixture-academy'));
      S.write('ptStudio',{alunos:[{id:'pendente',nome:'Fixture'}]});
      // Trabalho de outro módulo legítimo não deve ser contado como duplicação do CAS.
      S.write('config',{titulo:'Outra chave fictícia'});
      await Y.enviaSujas();
      out.segurou=f.calls.length===0&&Y._estado.sujas[K]===true&&!Y._estado.reconciliou;
      f.first.resolve({data:[]});
      await f.called.promise; // consulta concluída; a gravação ainda NÃO foi confirmada
      const inFlight=Y.enviaSujas();
      out.aguarda=!!Y._estado.emEnvio&&Y._estado.reconciliou;
      out.naoDuplicou=f.calls.filter(c=>c.name==='dados_cas').length===1;
      f.ack.resolve({data:[{chave:K,atualizado:'2026-09-11T15:00:00+00:00'}]});
      await inFlight;
      const calls=f.calls.filter(c=>c.name==='dados_cas');
      out.subiu=calls.length===1&&calls[0].args.p_chave===K&&calls[0].args.p_academia==='fixture-academy'&&calls[0].args.p_base_atualizado===null&&calls[0].args.p_valor.alunos[0].id==='pendente';
      out.confirmou=!Y._estado.emEnvio&&!Y._estado.sujas[K]&&Y.baseDe(K)==='2026-09-11T15:00:00+00:00';
      out.comuns=f.calls.some(c=>c.name==='dados_grava'&&c.args.p_linhas.some(r=>r.chave==='mtapp:config'));
      out.contadorGenericoFalharia=f.calls.length>1; // motivo para observar a operação, não todas as RPCs
      return out;
    }), new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('A primeira puxada não concluiu os checkpoints em 10 s')),10000);})]);
  } finally { clearTimeout(deadline); await ctx.close(); }
};
