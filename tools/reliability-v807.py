#!/usr/bin/env python3
from pathlib import Path
import re, subprocess

ROOT = Path(__file__).resolve().parents[1]

def read(rel): return (ROOT / rel).read_text(encoding='utf-8')
def write(rel, text): (ROOT / rel).write_text(text, encoding='utf-8')
def must_replace(text, old, new, label):
    if old not in text:
        if new in text: return text
        raise SystemExit('v807: âncora não encontrada: ' + label)
    return text.replace(old, new, 1)

store = read('apps/store.js')
if 'function chaveProtegida(k)' not in store:
    subprocess.run([
        'git','apply','--reject','--whitespace=nowarn','--include=apps/store.js',
        'tools/patches/sync-cas-v806.patch'
    ], cwd=ROOT, check=False)
    rej = ROOT / 'apps/store.js.rej'
    if rej.exists(): rej.unlink()
    store = read('apps/store.js')

if 'baseDe: baseDe, resolveConflito: resolveConflito' not in store:
    store = must_replace(
        store,
        '    carimboDaNuvem: carimboDaNuvem, contagemDe: contagemDe, auditoria: auditoria };',
        '    carimboDaNuvem: carimboDaNuvem, contagemDe: contagemDe, auditoria: auditoria,\n'
        '    baseDe: baseDe, resolveConflito: resolveConflito };',
        'export __MTSync'
    )

store = store.replace('  function publicaAppsSeguros(linhas) {\n', '  function publicaAppsSeguros(linhas, opcoes) {\n')
store = store.replace("      return sync.client.from('app_aluno').upsert(seguras);\n", "      return sync.client.from('app_aluno').upsert(seguras, opcoes);\n")
if 'function clienteNuvemSeguro()' not in store:
    marker = '\n  function avisaStatus() {\n'
    proxy = r'''
  /* v807: toda publicação do pacote do aluno que sai pelo cliente público passa
   * pela mesma barreira de revisão. O personal.html usa S.cloud().client em
   * várias telas; um Proxy conserva select/rpc/storage/auth intactos e intercepta
   * SOMENTE app_aluno.upsert. Assim não existe um caminho "esquecido" que
   * publique um pacote montado sobre ptStudio ainda não confirmado na nuvem. */
  var clienteSeguro = null, clienteSeguroOrigem = null;
  function clienteNuvemSeguro() {
    if (!sync.client) return null;
    if (clienteSeguro && clienteSeguroOrigem === sync.client) return clienteSeguro;
    clienteSeguroOrigem = sync.client;
    clienteSeguro = typeof Proxy === 'function' ? new Proxy(sync.client, {
      get: function (alvo, prop) {
        if (prop === 'from') return function (tabela) {
          var query = alvo.from(tabela);
          if (tabela !== 'app_aluno' || typeof Proxy !== 'function') return query;
          return new Proxy(query, {
            get: function (q, p) {
              if (p === 'upsert') return function (linhas, opcoes) { return publicaAppsSeguros(linhas, opcoes); };
              var v = q[p]; return typeof v === 'function' ? v.bind(q) : v;
            }
          });
        };
        var v = alvo[prop]; return typeof v === 'function' ? v.bind(alvo) : v;
      }
    }) : sync.client;
    return clienteSeguro;
  }
'''
    if marker not in store: raise SystemExit('v807: avisaStatus não encontrado')
    store = store.replace(marker, '\n' + proxy + marker, 1)

if 'clienteSeguro = null; clienteSeguroOrigem = null;' not in store:
    store = must_replace(
        store,
        '    sync.ciclo++; sync.client = null; sync.email = ""; sync.reconciliou = false;\n',
        '    sync.ciclo++; sync.client = null; clienteSeguro = null; clienteSeguroOrigem = null; sync.email = ""; sync.reconciliou = false;\n',
        'reset proxy em paraSync'
    )
store = store.replace(
    '    cloud: function () { return sync.client ? { client: sync.client, aid: sync.aid } : null; },',
    '    cloud: function () { return sync.client ? { client: clienteNuvemSeguro(), aid: sync.aid } : null; },'
)

if 'function mustWrite(key, value)' not in store:
    needle = '\n  /* v756: quem apaga uma chave DE PROPÓSITO'
    helper = r'''
  /* v807: para fluxos que fecham modal, limpam formulário ou exibem "Salvo".
   * write() continua retornando false por compatibilidade; mustWrite() aborta o
   * handler quando a persistência falha, evitando sucesso visual mentiroso. */
  function mustWrite(key, value) {
    if (write(key, value) !== false) return true;
    var err = new Error('Não foi possível salvar ' + key + '. O estado anterior foi preservado.');
    err.name = 'MTWriteError'; err.mtWrite = true; err.mtWriteKey = key;
    throw err;
  }
  function erroWriteEsperado(ev) {
    var e = ev && (ev.error || ev.reason);
    if (!e || !e.mtWrite) return;
    try { if (ev.preventDefault) ev.preventDefault(); } catch (_) {}
    try { console.warn('MTStore: fluxo interrompido após falha de persistência', e.mtWriteKey); } catch (_) {}
  }
  try {
    self.addEventListener('error', erroWriteEsperado);
    self.addEventListener('unhandledrejection', erroWriteEsperado);
  } catch (_) {}
'''
    if needle not in store: raise SystemExit('v807: âncora mustWrite não encontrada')
    store = store.replace(needle, '\n' + helper + needle, 1)
store = store.replace(
    '    read: read, write: write, uid: uid, esqueceChave: esqueceChave,',
    '    read: read, write: write, mustWrite: mustWrite, uid: uid, esqueceChave: esqueceChave,'
)
write('apps/store.js', store)

sql = read('supabase-setup.sql')
old_table = '''create table if not exists public.dados (\n  academia_id uuid not null references public.academias (id) on delete cascade,\n  chave text not null,\n  valor jsonb,\n  atualizado timestamptz not null default now(),\n  primary key (academia_id, chave)\n);\n'''
new_table = '''create table if not exists public.dados (\n  academia_id uuid not null references public.academias (id) on delete cascade,\n  chave text not null,\n  valor jsonb,\n  atualizado timestamptz not null default now(),\n  -- v807: precondição de escrita enviada pelo cliente. É zerada pelo trigger\n  -- antes de armazenar; existe só para o PostgREST aceitar o campo no upsert.\n  base_atualizado timestamptz,\n  primary key (academia_id, chave)\n);\nalter table public.dados add column if not exists base_atualizado timestamptz;\n'''
if 'base_atualizado timestamptz' not in sql:
    sql = must_replace(sql, old_table, new_table, 'coluna base_atualizado')
old_fun = '''create or replace function public.dados_carimba()\nreturns trigger language plpgsql set search_path = public as $$\nbegin\n  new.atualizado := now();\n  return new;\nend $$;\n'''
new_fun = '''create or replace function public.dados_carimba()\nreturns trigger language plpgsql set search_path = public as $$\nbegin\n  -- v807: ptStudio é o agregado crítico do Personal. Atualização só entra se\n  -- foi montada sobre EXATAMENTE a revisão que ainda está no servidor. Cliente\n  -- antigo (sem base_atualizado) recebe PT409 e, portanto, não consegue apagar\n  -- trabalho mais novo por acidente. Inserts continuam permitidos com base nula.\n  if new.chave = 'mtapp:ptStudio' and tg_op = 'UPDATE' then\n    if new.base_atualizado is null or old.atualizado is distinct from new.base_atualizado then\n      raise exception using\n        errcode = 'PT409',\n        message = 'Conflito de revisão: outra sessão alterou o painel. Atualize antes de salvar.';\n    end if;\n  end if;\n  new.atualizado := now();\n  new.base_atualizado := null;\n  return new;\nend $$;\n'''
if "errcode = 'PT409'" not in sql:
    sql = must_replace(sql, old_fun, new_fun, 'dados_carimba CAS')
write('supabase-setup.sql', sql)

migration = '''-- mt-v807 — CAS atômico do ptStudio.\n-- Aplicar antes de publicar o cliente v807.\nalter table public.dados add column if not exists base_atualizado timestamptz;\n\ncreate or replace function public.dados_carimba()\nreturns trigger language plpgsql set search_path = public as $$\nbegin\n  if new.chave = 'mtapp:ptStudio' and tg_op = 'UPDATE' then\n    if new.base_atualizado is null or old.atualizado is distinct from new.base_atualizado then\n      raise exception using\n        errcode = 'PT409',\n        message = 'Conflito de revisão: outra sessão alterou o painel. Atualize antes de salvar.';\n    end if;\n  end if;\n  new.atualizado := now();\n  new.base_atualizado := null;\n  return new;\nend $$;\n\nrevoke execute on function public.dados_carimba() from public, anon, authenticated;\n'''
(ROOT / 'migrations').mkdir(exist_ok=True)
write('migrations/20260909_ptstudio_cas_v807.sql', migration)

for p in (ROOT / 'apps').glob('*.html'):
    t = p.read_text(encoding='utf-8')
    t2 = re.sub(
        r'function save\(st\) \{ S\.write\("([^"]+)", st\); render\(\); \}',
        r'function save(st) { S.mustWrite("\1", st); render(); }', t
    )
    if p.name == 'grade.html':
        t2 = t2.replace(
            '      S.write("grade", st);\n      $("rgStatus").textContent = "✅ Salvo — republique os apps dos alunos para valer no celular.";',
            '      if (S.write("grade", st) === false) { $("rgStatus").textContent = "Não foi possível salvar. A grade anterior foi mantida."; return; }\n      $("rgStatus").textContent = "✅ Salvo — republique os apps dos alunos para valer no celular.";'
        )
    if p.name == 'fluxo.html':
        old = '''  var cbs = contasBancarias();\n  $("fConta").innerHTML = '<option value="">Todas as contas</option>' +\n    cbs.map(function (c) { return '<option value="' + c.id + '">' + (c.nome || c.banco || "Conta") + "</option>"; }).join("");\n'''
        new = '''  var cbs = contasBancarias();\n  var fConta = $("fConta");\n  fConta.replaceChildren();\n  var todas = document.createElement("option"); todas.value = ""; todas.textContent = "Todas as contas"; fConta.appendChild(todas);\n  cbs.forEach(function (c) {\n    var op = document.createElement("option"); op.value = String(c.id || ""); op.textContent = c.nome || c.banco || "Conta"; fConta.appendChild(op);\n  });\n'''
        if old in t2: t2 = t2.replace(old, new, 1)
    if t2 != t: p.write_text(t2, encoding='utf-8')

test = read('tests/test-sync-cas.js')
if 'cliente público bloqueia publicação que contornaria a barreira' not in test:
    extra = '''\n await test('cliente público bloqueia publicação que contornaria a barreira',async()=>{\n  const x=await setup({rows:[dataRow(initial())]});await x.start();\n  const cloud=x.ctx.MTStore.cloud();assert.ok(cloud&&cloud.client);\n  const r=await cloud.client.from('app_aluno').upsert([{token:'token-proxy',academia_id:'academy-a',dados:{}}]);\n  assert.ok(!r.error);const pub=x.calls.find(c=>c.table==='app_aluno'&&c.rows&&c.rows.some(y=>y.token==='token-proxy'));\n  assert.equal(pub.rows[0].dados.sourceUpdatedAt,A);\n });\n await test('mustWrite interrompe o fluxo quando uma gravação é recusada',async()=>{\n  const x=await setup({rows:[dataRow(initial())]});await x.start();\n  const antigo=x.ctx.MTStore.read('ptStudio'),novo=x.ctx.MTStore.read('ptStudio');novo.nota='mais novo';x.ctx.MTStore.write('ptStudio',novo);antigo.nota='stale';\n  assert.throws(()=>x.ctx.MTStore.mustWrite('ptStudio',antigo),e=>e&&e.name==='MTWriteError'&&e.mtWrite===true);\n  assert.match(x.memory.get(K),/mais novo/);\n });\n'''
    test = test.replace(" await test('conflito impede publicar o pacote antigo do aluno'", extra + " await test('conflito impede publicar o pacote antigo do aluno'", 1)
    write('tests/test-sync-cas.js', test)

write('tests/test-sync-cas-sql.js', r'''const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase-setup.sql'),'utf8');
let n=0;function ok(v,m){assert.ok(v,m);n++;console.log('  OK '+m)}
ok(/alter table public\.dados add column if not exists base_atualizado timestamptz/i.test(sql),'schema aceita a revisão-base no upsert');
ok(/new\.chave\s*=\s*'mtapp:ptStudio'[\s\S]{0,500}tg_op\s*=\s*'UPDATE'/i.test(sql),'CAS é restrito ao agregado crítico e a UPDATE');
ok(/new\.base_atualizado is null[\s\S]{0,300}old\.atualizado is distinct from new\.base_atualizado/i.test(sql),'servidor rejeita cliente sem base ou com revisão velha');
ok(/errcode\s*=\s*'PT409'/i.test(sql),'conflito tem código estável para o cliente');
ok(/new\.atualizado\s*:=\s*now\(\)/i.test(sql),'servidor continua sendo dono do relógio');
ok(/new\.base_atualizado\s*:=\s*null/i.test(sql),'precondição não vira estado persistente');
ok(/revoke execute on function public\.dados_carimba\(\) from public, anon, authenticated/i.test(sql),'trigger não ganha superfície executável pública');
console.log(n+' garantias SQL do CAS passaram.');
''')

for rel in ['assets/versao.js','sw.js','app/app-sw.js']:
    t = read(rel)
    t = re.sub(r'mt-v806', 'mt-v807', t)
    write(rel, t)

write('docs/reliability-mt-v807.md', '''# mt-v807 — Reliability Release\n\nEscopo: confiabilidade, sem funcionalidade nova.\n\n- CAS atômico de `mtapp:ptStudio` no navegador e no Postgres.\n- Cliente público bloqueia `app_aluno.upsert` se o painel ainda não confirmou a revisão.\n- `mustWrite()` interrompe helpers de salvamento quando a persistência local falha.\n- Primeira correção da auditoria de `innerHTML`: filtro de contas do Fluxo usa DOM/textContent.\n- Testes de duas sessões, conflito, edição em voo, rascunho, publicação e contrato SQL.\n\n## Ordem de publicação\n\n1. Aplicar `migrations/20260909_ptstudio_cas_v807.sql`.\n2. Rodar `node tests/test-sync-cas.js`, `node tests/test-sync-cas-sql.js` e `node tests/test-versao.js`.\n3. Publicar o cliente v807.\n4. Validar Personal → aluno em dois dispositivos e offline/reconexão.\n\n## Rollback\n\nReverter o cliente é seguro, mas clientes antigos não conseguem atualizar `ptStudio` enquanto o CAS do servidor estiver ativo. Não remover a proteção do servidor sem antes retirar clientes v807 e analisar conflitos pendentes.\n\n## Pendência administrativa\n\nA branch `main` estava sem proteção e sem checks obrigatórios em 09/09/2026. A conexão GitHub usada nesta revisão não expõe escrita de regras de branch; habilitar proteção/ruleset continua sendo uma configuração administrativa do repositório.\n''')

store = read('apps/store.js')
required = ['base_atualizado', 'function resolveConflito', 'function clienteNuvemSeguro', 'mustWrite: mustWrite']
missing = [x for x in required if x not in store]
if missing: raise SystemExit('v807 incompleto: ' + ', '.join(missing))
print('mt-v807 aplicado com sucesso')
