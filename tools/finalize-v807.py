from pathlib import Path
root=Path(__file__).resolve().parents[1]
def edit(path,old,new):
 p=root/path;t=p.read_text();assert old in t,path;p.write_text(t.replace(old,new,1))
p=root/'tests/test-questionarios-usabilidade.js';t=p.read_text();t=t.replace("async function snapshot(p){return p.evaluate(()=>JSON.stringify(state));}","""async function snapshot(p){return p.evaluate(()=>JSON.stringify(state));}
async function abreFormulario(p, id) {
 if (!await p.locator(id).evaluate(el => el.open)) await p.locator(id + ' > summary').click();
 await p.waitForFunction(sel => document.querySelector(sel).open, id);
}""")
t=t.replace("await p.locator('#qqNovoBox > summary').click();await p.fill('#qqNome'", "await abreFormulario(p, '#qqNovoBox');await p.fill('#qqNome'")
t=t.replace("if(process.env.QPX_SHOTS){await p.locator('#qqNovoBox > summary').click();await p.screenshot({path:path.join(process.env.QPX_SHOTS,'questionarios-organizados.png'),fullPage:true});}", "if(process.env.QPX_SHOTS){await p.screenshot({path:path.join(process.env.QPX_SHOTS,'questionarios-organizados.png'),fullPage:true});}")
p.write_text(t)
p=root/'tests/test-personal.js';t=p.read_text();start=t.index('  await p.fill("#qpSigla", "motex");');end=t.index('  const qpTxt =',start);sec=t[start:end];sec=sec.replace('  await p.click("#qpAdd");','''  await p.click("#qpAdd");
  // O decorador termina o salvamento antes de preparar a próxima pergunta.
  await p.waitForFunction(() => !document.getElementById("qpNovoBox").open && !document.getElementById("qpAdd").disabled);''');p.write_text(t[:start]+sec+t[end:])
edit('assets/personal-questionarios.css','.qpx-saved-actions .qpx-details{flex:1 1 90px}', '.qpx-saved-actions>.btn{flex-basis:100%;white-space:nowrap}.qpx-saved-actions .qpx-details{flex:1 1 90px}')
edit('apps/store.js',"  function publicaAppsSeguros(linhas, opcoes) {\n", """  function pacoteDoPersonal(linha) {
    var pacote = linha && linha.dados, dados = pacote && pacote.dados;
    if (dados && dados.tipo === 'nutri') return false;
    return !!(pacote && pacote.sourceKey === 'mtapp:ptStudio') ||
      !!(dados && dados.a && dados.a.appTokenP) || /(?:^|\\/)personal\\.html$/.test(location.pathname || '');
  }
  function publicaAppsSeguros(linhas, opcoes) {
""")
edit('apps/store.js',"      var seguras = linhas.map(function (l) { var c = Object.assign({}, l); c.dados = Object.assign({}, l.dados, { sourceUpdatedAt: rev }); return c; });\n      return sync.client.from('app_aluno').upsert(seguras, opcoes);", """      var lista = Array.isArray(linhas) ? linhas : [linhas];
      var seguras = lista.map(function (l) {
        if (!pacoteDoPersonal(l)) return l;
        var c = Object.assign({}, l);
        c.dados = Object.assign({}, l.dados, { sourceKey: k, sourceUpdatedAt: rev });
        return c;
      });
      return Promise.resolve(sync.client.from('app_aluno').upsert(Array.isArray(linhas) ? seguras : seguras[0], opcoes)).then(function (r) {
        if (r && r.error && r.error.code === 'PT409' && ciclo === sync.ciclo && sync.client) sinalizaConflito(k, r.error.message);
        return r;
      });""")
edit('apps/store.js',"if (p === 'upsert') return function (linhas, opcoes) { return publicaAppsSeguros(linhas, opcoes); };", """if (p === 'upsert') return function (linhas, opcoes) {
                var lista = Array.isArray(linhas) ? linhas : [linhas];
                return lista.some(pacoteDoPersonal) ? publicaAppsSeguros(linhas, opcoes) : q.upsert(linhas, opcoes);
              };""")
edit('apps/store.js','    sync.emEnvio = null;\n    sync.ciclo++;', '''    sync.emEnvio = null;
    sync.conflitos = {}; sync.promessaEnvio = null;
    try { var aviso = document.getElementById('mtSyncConflito'); if (aviso) aviso.remove(); } catch (_) {}
    sync.ciclo++;''')
edit('tests/test-sync-identidade.js','upsert(rows) { call.rows = rows; return this; }', 'upsert(rows, options) { call.rows = rows; call.options = options; return this; }')
edit('tests/test-sync-identidade.js',"call.rows.map(x => ({ chave: x.chave, atualizado:","(Array.isArray(call.rows) ? call.rows : [call.rows]).map(x => ({ chave: x.chave, atualizado:")
p=root/'tests/test-sync-cas.js';t=p.read_text();marker=" console.log(passed+' cenários de concorrência passaram.');";assert marker in t;t=t.replace(marker,"""
 await test('Nutri publica sem ptStudio e mantém opções e encadeamento',async()=>{
  const x=await setup();x.ctx.location.pathname='/nutricao.html';await x.start();
  const row={token:'paciente-ficticio',academia_id:'academy-a',dados:{dados:{tipo:'nutri',a:{id:'paciente'}}}};
  const query=x.ctx.MTStore.cloud().client.from('app_aluno').upsert(row,{onConflict:'token'});
  assert.equal(typeof query.select,'function');const r=await query.select();assert.ok(!r.error);
  const pub=x.calls.find(c=>c.table==='app_aluno'&&c.rows);assert.deepEqual(pub.rows,row);assert.equal(pub.options.onConflict,'token');
 });
 await test('Academia publica HTML legado sem depender do painel Personal',async()=>{
  const x=await setup();x.ctx.location.pathname='/apps/app-aluno.html';await x.start();
  const rows=[{token:'academia-ficticia',dados:{html:'<p>Exemplo</p>',stamp:'ficticio'}}];
  const r=await x.ctx.MTStore.cloud().client.from('app_aluno').upsert(rows);assert.ok(!r.error);
  assert.deepEqual(x.calls.find(c=>c.table==='app_aluno'&&c.rows).rows,rows);
 });
 await test('Personal aceita publicação de objeto único sem alterar o original',async()=>{
  const x=await setup({rows:[dataRow(initial())]});await x.start();
  const row={token:'aluno-ficticio',dados:{dados:{a:{appTokenP:'aluno-ficticio'}}}};
  const before=JSON.stringify(row),r=await x.ctx.MTStore.cloud().client.from('app_aluno').upsert(row,{onConflict:'token'});
  assert.ok(!r.error);assert.equal(JSON.stringify(row),before);
  const pub=x.calls.find(c=>c.table==='app_aluno'&&c.rows);assert.equal(pub.rows.dados.sourceUpdatedAt,A);assert.equal(pub.rows.dados.sourceKey,K);assert.equal(pub.options.onConflict,'token');
 });
 await test('Conflito confirmado pelo servidor ao publicar preserva cópia e bloqueia repetição',async()=>{
  const opts={rows:[dataRow(initial())]},x=await setup(opts);await x.start();opts.sendPromise=Promise.resolve({error:{code:'PT409',message:'Prescrição alterada'}});
  const publish=()=>x.ctx.MTStore.cloud().client.from('app_aluno').upsert([{dados:{}}]);
  assert.equal((await publish()).error.code,'PT409');assert.ok(x.ctx.__MTSync._estado.conflitos[K]);
  const n=x.calls.filter(c=>c.table==='app_aluno'&&c.rows).length;assert.ok((await publish()).error);
  assert.equal(x.calls.filter(c=>c.table==='app_aluno'&&c.rows).length,n);assert.ok([...x.memory.keys()].some(k=>k.startsWith('mtsync:conflito:academy-a:')));
 });
 await test('Logout remove conflito da sessão mas conserva backup da conta',async()=>{
  const x=await setup({rows:[dataRow(initial())],local:{[K]:{alunos:[{id:'rascunho'}]},'mtsync:ts':{[K]:'2026-09-06T15:00:00.000Z'}}});await x.start();
  assert.ok(x.ctx.__MTSync._estado.conflitos[K]);await x.logout();assert.equal(x.ctx.MTStore.cloud(),null);
  assert.equal(Object.keys(x.ctx.__MTSync._estado.conflitos).length,0);assert.ok([...x.memory.keys()].some(k=>k.startsWith('mtsync:conflito:academy-a:')));
 });
"""+marker);p.write_text(t)
p=root/'supabase-setup.sql';t=p.read_text();a=t.index('create or replace function public.dados_carimba()');b=t.index('-- ==================== REDUNDÂNCIA:',a)
m=(root/'migrations/20260909_ptstudio_cas_v807.sql').read_text()
p.write_text(t[:a]+m[m.index('create or replace function public.dados_carimba()'):]+ '\n' +t[b:])
for f in ['.github/workflows/reliability-v807-apply.yml','tools/reliability-v807.py','tools/finalize-v807.py']:
 (root/f).unlink()
