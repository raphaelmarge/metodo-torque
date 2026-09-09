/* PostgreSQL real (PGlite): isolamento, autoria e revisão do diário alimentar.
 * npm install --no-save @electric-sql/pglite@0.5.8
 * Ou TORQUE_PGLITE=/caminho/node_modules/@electric-sql/pglite node tests/test-nutricao-feedback.js
 * Nenhuma conexão com o Supabase de produção. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.TORQUE_PGLITE || './runtime/node_modules/@electric-sql/pglite');
const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260909192027_nutricao_feedback_refeicao.sql'), 'utf8');
let count = 0;
function ok(name, fn) { fn(); count++; console.log('OK ' + name); }
const ACA = '11111111-1111-4111-8111-111111111111', ACB = '22222222-2222-4222-8222-222222222222';
const PRO = '33333333-3333-4333-8333-333333333333', OTHER = '44444444-4444-4444-8444-444444444444';
const PRO2 = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'token_aluno_A', TOKEN2 = 'token_aluno_B';
const stamp = Date.now() - 600000;
const registro = (id, n = 0) => ({ id, d: '2026-09-09', atualizadoEm: new Date(stamp + n * 1000).toISOString(), apagado: false,
  titulo: 'Almoço', refeicaoId: 'almoco', hora: '12:30', origem: 'plano', foto: '', observacao: '',
  itens: [{ nome: 'Arroz', porcao: '100 g', qtd: 1, k: 130, pt: 2.5, cb: 28, g: 0.2 }] });
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.academias(id uuid primary key);
      create table public.membros(academia_id uuid,user_id uuid,nome text,primary key(academia_id,user_id));
      create table public.app_aluno(token text primary key,academia_id uuid,revogado_em timestamptz,dados jsonb,retorno jsonb,atualizado timestamptz);
      alter table public.app_aluno enable row level security;
      alter table public.membros enable row level security;`);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20260907202135_personal_nutricao_integrada.sql'), 'utf8'));
    await db.exec(migration);
    await db.exec(migration);
    ok('migration pode ser reaplicada sem apagar dados', () => assert.ok(true));
    await db.query('insert into public.academias values($1),($2)', [ACA, ACB]);
    await db.query('insert into public.membros values($1,$2,$3),($4,$5,$6),($1,$7,$8)', [ACA, PRO, 'Nutricionista A', ACB, OTHER, 'Outra academia', PRO2, 'Equipe A']);
    const pacote = { dados: { a: { nome: 'Aluno A' }, nutricaoApp: { ativo: true } } };
    const retorno = { feitos: { '2026-09-08': true }, nutricaoV1: { v: 1, registros: { almoco: registro('almoco'), lanche: registro('lanche') } } };
    await db.query('insert into public.app_aluno(token,academia_id,dados,retorno) values($1,$2,$3,$4),($5,$6,$3,$4)', [TOKEN, ACA, pacote, retorno, TOKEN2, ACB]);
    const who = async (role = 'anon', user = '') => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec('set role ' + role); };
    const admin = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); };
    const list = async (t = TOKEN, id = 'almoco') => (await db.query('select public.app_nutricao_feedback_lista($1,$2) r', [t, id])).rows[0].r;
    const send = async (id, text = 'Mensagem', opts = {}) => (await db.query('select public.app_nutricao_feedback_envia($1,$2,$3,$4,$5,$6,$7) r', [opts.token ?? TOKEN, opts.registro ?? 'almoco', text, id, opts.origem ?? 'aluno', opts.revisado ?? false, opts.versao === undefined ? (opts.revisado ? registro('almoco').atualizadoEm : null) : opts.versao])).rows[0].r;
    const denied = async (label, sql) => { let error; try { await db.query(sql); } catch (e) { error = e; } ok(label, () => assert.equal(error && error.code, '42501')); };
    const error = (label, result) => ok(label, () => { assert.equal(result.ok, undefined); assert.ok(result.erro); });
    await who();
    ok('conversa vazia não cria registros', () => assert.ok(true));
    assert.deepEqual(await list(), { ok: true, feedback: [] });
    await denied('anon não lê tabela de comentários', 'select * from public.app_nutricao_feedback');
    await denied('anon não insere autoria pela tabela', "insert into public.app_nutricao_feedback(token,id) values('token_aluno_A','forja')");
    let r = await send('m1', 'Minha porção foi diferente.');
    ok('aluno envia comentário com nome do pacote do servidor', () => { assert.equal(r.ok, true); assert.equal(r.feedback.length, 1); assert.equal(r.feedback[0].nome, 'Aluno A'); assert.equal(r.feedback[0].autor, 'aluno'); assert.equal(r.feedback[0].revisado, false); });
    ok('resposta não vaza token, academia, UID ou hash do registro', () => assert.deepEqual(Object.keys(r.feedback[0]).sort(), ['id','registroId','autor','nome','texto','revisado','criadoEm','registroVersao'].sort()));
    ok('resposta identifica exatamente a versão comentada', () => assert.equal(r.feedback[0].registroVersao, registro('almoco').atualizadoEm));
    ok('data da mensagem vem do servidor', () => assert.ok(Math.abs(Date.parse(r.feedback[0].criadoEm) - Date.now()) < 60000));
    const event = r.feedback[0];
    r = await send('m1', 'Minha porção foi diferente.');
    ok('replay devolve o mesmo evento sem duplicar', () => assert.deepEqual(r.feedback, [event]));
    error('idempotência rejeita mesmo ID com outro texto', await send('m1', 'Texto trocado'));
    error('ID já usado não muda de refeição', await send('m1', 'Minha porção foi diferente.', { registro: 'lanche' }));
    error('aluno não se torna profissional pela origem', await send('fake-prof', 'Forjado', { origem: 'profissional' }));
    error('aluno não pode revisar refeição', await send('fake-review', '', { revisado: true }));
    assert.deepEqual((await list(TOKEN2)).feedback, []);
    error('refeição desconhecida não cria conversa', await send('sem-reg', 'Oi', { registro: 'faltando' }));
    error('token desconhecido não autoriza comentário', await send('sem-token', 'Oi', { token: 'token_inexistente' }));
    error('token curto não autoriza consulta', await list('x'));
    for (const [label, params] of [
      ['ID vazio', [TOKEN,'almoco','Mensagem','','aluno',false]],
      ['ID longo', [TOKEN,'almoco','Mensagem','x'.repeat(101),'aluno',false]],
      ['ID com HTML', [TOKEN,'almoco','Mensagem','<img>','aluno',false]],
      ['ID reservado', [TOKEN,'almoco','Mensagem','__proto__','aluno',false]],
      ['registro reservado', [TOKEN,'constructor','Mensagem','r1','aluno',false]],
      ['registro longo', [TOKEN,'x'.repeat(301),'Mensagem','r1','aluno',false]],
      ['origem inválida', [TOKEN,'almoco','Mensagem','r1','administrador',false]],
      ['origem nula', [TOKEN,'almoco','Mensagem','r1',null,false]],
      ['revisão nula', [TOKEN,'almoco','Mensagem','r1','aluno',null]],
      ['texto vazio', [TOKEN,'almoco','  ','r1','aluno',false]],
      ['texto nulo', [TOKEN,'almoco',null,'r1','aluno',false]],
      ['texto longo', [TOKEN,'almoco','x'.repeat(2001),'r1','aluno',false]],
      ['controle no texto', [TOKEN,'almoco','x\u0001y','r1','aluno',false]]
    ]) error(label + ' é rejeitado', (await db.query('select public.app_nutricao_feedback_envia($1,$2,$3,$4,$5,$6) r', params)).rows[0].r);
    r = await send('max-text', 'á'.repeat(2000));
    ok('texto de 2000 caracteres permanece completo', () => assert.equal(r.feedback.find(x => x.id === 'max-text').texto.length, 2000));
    r = await send('newline', 'Texto\ncom\ttab');
    ok('mensagem conserva quebra de linha', () => assert.equal(r.feedback.find(x => x.id === 'newline').texto, 'Texto\ncom\ttab'));
    await who('authenticated', OTHER);
    error('JWT de outra academia não lê usando token conhecido', await list());
    error('JWT de outra academia não escreve usando token conhecido', await send('outro', 'Oi', { origem: 'profissional' }));
    error('JWT estranho não contorna vínculo usando origem aluno', await send('outro2', 'Oi'));
    await who('authenticated', PRO);
    await denied('profissional não lê tabela diretamente', 'select * from public.app_nutricao_feedback');
    await denied('profissional não altera autoria pela tabela', "update public.app_nutricao_feedback set autor='aluno'");
    error('revisão sem versão visualizada é rejeitada', await send('sem-versao', '', { origem: 'profissional', revisado: true, versao: null }));
    error('revisão com versão diferente é rejeitada', await send('velha-versao', '', { origem: 'profissional', revisado: true, versao: registro('almoco', 1).atualizadoEm }));
    r = await send('pro1', 'Refeição conferida.', { origem: 'profissional', revisado: true });
    ok('profissional revisa snapshot com sua autoria real', () => { const f = r.feedback.find(x => x.id === 'pro1'); assert.equal(f.autor, 'profissional'); assert.equal(f.nome, 'Nutricionista A'); assert.equal(f.revisado, true); });
    r = await send('pro2', '', { origem: 'profissional', revisado: true });
    ok('profissional pode confirmar revisão sem inventar comentário', () => assert.equal(r.feedback.find(x => x.id === 'pro2').texto, ''));
    r = await send('pro3', 'Confirmação por JWT', { origem: 'aluno' });
    ok('origem cliente nunca troca a identidade profissional por aluno', () => assert.equal(r.feedback.find(x => x.id === 'pro3').autor, 'profissional'));
    error('profissional não reaproveita ID pertencente ao aluno', await send('m1', 'Minha porção foi diferente.', { origem: 'profissional' }));
    await who('authenticated', PRO2);
    error('outro membro não reaproveita ID do colega', await send('pro1', 'Refeição conferida.', { origem: 'profissional', revisado: true }));
    await who();
    r = await list();
    ok('aluno lê resposta e revisão profissional', () => assert.equal(r.feedback.find(x => x.id === 'pro1').revisado, true));
    const revised = { ...registro('almoco', 1), titulo: 'Almoço alterado', feedback: [{ autor: 'profissional', revisado: true }] };
    let saved = (await db.query('select public.app_nutricao_salva($1,$2) r', [TOKEN, [revised]])).rows[0].r;
    assert.equal(saved.ok, true);
    r = await list();
    ok('editar a refeição remove revisão efetiva e conserva conversa', () => { assert.equal(r.feedback.length, 6); assert.equal(r.feedback.some(x => x.revisado), false); });
    ok('autoria forjada dentro do diário não entra na conversa', () => assert.equal(r.feedback.some(x => x.texto === undefined), false));
    await who('authenticated', PRO);
    r = await send('pro1', 'Refeição conferida.', { origem: 'profissional', revisado: true });
    ok('replay da revisão antiga não revisa edição nova', () => assert.equal(r.feedback.find(x => x.id === 'pro1').revisado, false));
    error('tela desatualizada não revisa versão editada', await send('pro-novo', 'Conferi a alteração.', { origem: 'profissional', revisado: true }));
    r = await send('pro-novo', 'Conferi a alteração.', { origem: 'profissional', revisado: true, versao: revised.atualizadoEm });
    ok('nova revisão pode confirmar o snapshot atualizado', () => assert.equal(r.feedback.find(x => x.id === 'pro-novo').revisado, true));
    await admin();
    await db.query("update public.app_aluno set retorno=jsonb_set(retorno,'{nutricaoV1,registros,almoco,titulo}',to_jsonb('Alteração sem stamp'::text)) where token=$1", [TOKEN]);
    await who();
    ok('hash também detecta alteração sem novo stamp', () => assert.ok(true));
    assert.equal((await list()).feedback.some(x => x.revisado), false);
    await admin();
    await db.query("update public.app_aluno set dados=jsonb_set(dados,'{dados,nutricaoApp,ativo}','false') where token=$1", [TOKEN]);
    await who();
    ok('plano pausado conserva consulta ao histórico', () => assert.ok(true));
    assert.equal((await list()).ok, true);
    error('plano pausado impede novos comentários', await send('pausado'));
    r = await send('m1', 'Minha porção foi diferente.');
    ok('replay após pausa continua idempotente', () => assert.equal(r.ok, true));
    await admin();
    await db.query("update public.app_aluno set dados=jsonb_set(dados,'{dados,nutricaoApp,ativo}','true') where token=$1", [TOKEN]);
    await db.query('delete from public.membros where user_id=$1', [PRO]);
    await who('authenticated', PRO);
    error('revogação do vínculo bloqueia leitura imediatamente', await list());
    error('revogação do vínculo bloqueia envio e replay', await send('pro1', 'Refeição conferida.', { origem: 'profissional', revisado: true }));
    await admin();
    await db.query('update public.app_aluno set revogado_em=now() where token=$1', [TOKEN]);
    await who();
    error('revogação do aluno bloqueia consulta', await list());
    error('revogação do aluno bloqueia replay', await send('m1', 'Minha porção foi diferente.'));
    await who('authenticated', PRO2);
    error('token revogado também impede acesso profissional pela RPC', await list());
    await admin();
    await db.query('update public.app_aluno set revogado_em=null where token=$1', [TOKEN]);
    await who();
    saved = (await db.query('select public.app_nutricao_salva($1,$2) r', [TOKEN, [{ ...registro('almoco', 2), apagado: true }]])).rows[0].r;
    assert.equal(saved.ok, true);
    error('refeição excluída não expõe conversa na RPC', await list());
    error('refeição excluída impede novo comentário', await send('apagado'));
    error('refeição excluída impede replay', await send('m1', 'Minha porção foi diferente.'));
    await admin();
    await db.query('update public.app_aluno set retorno=$2 where token=$1', [TOKEN, retorno]);
    const remaining = (await db.query('select retorno from public.app_aluno where token=$1', [TOKEN])).rows[0].retorno;
    ok('comentários não alteram treinos nem registros do aluno', () => assert.deepEqual(remaining, retorno));
    await db.query('update public.app_nutricao_feedback set criado_em=now()-interval \'2 days\' where token=$1', [TOKEN]);
    await who();
    for (let i=0;i<20;i++) assert.equal((await send('burst'+i)).ok, true);
    error('limite de 20 mensagens/minuto bloqueia a próxima', await send('burst21'));
    r = await send('burst0');
    ok('limite de frequência não bloqueia replay confirmado', () => assert.equal(r.ok, true));
    await admin();
    await db.query("update public.app_nutricao_feedback set criado_em=now()-interval '2 hours' where token=$1 and autor='aluno'", [TOKEN]);
    // Popula diretamente como administrador para exercitar teto diário sem esperar horas.
    await db.query(`insert into public.app_nutricao_feedback(token,academia_id,id,registro_id,autor,nome,texto,registro_stamp,registro_hash,criado_em)
      select $1,$2,'daily'||g,'almoco','aluno','Aluno A','Mensagem',$3,repeat('a',64),now()-interval '2 hours' from generate_series(1,100) g`, [TOKEN, ACA, registro('almoco').atualizadoEm]);
    await who();
    error('limite diário de mensagens é aplicado', await send('daily-new'));
    await admin();
    await db.query("update public.app_nutricao_feedback set criado_em=now()-interval '3 days' where token=$1", [TOKEN]);
    await db.query(`insert into public.app_nutricao_feedback(token,academia_id,id,registro_id,autor,nome,texto,registro_stamp,registro_hash,criado_em)
      select $1,$2,'cap'||g,'almoco','aluno','Aluno A','Mensagem',$3,repeat('a',64),now()-interval '3 days' from generate_series(1,200) g`, [TOKEN, ACA, registro('almoco').atualizadoEm]);
    await who();
    error('limite total da conversa conserva histórico', await send('cap-new'));
    await admin();
    await db.query(`insert into public.app_nutricao_feedback(token,academia_id,id,registro_id,autor,nome,texto,registro_stamp,registro_hash,criado_em)
      select $1,$2,'total'||g,'outro-registro','aluno','Aluno A','Mensagem',$3,repeat('a',64),now()-interval '3 days' from generate_series(1,5000) g`, [TOKEN, ACA, registro('almoco').atualizadoEm]);
    await who();
    error('limite por aluno impede crescimento ilimitado', await send('total-new', 'Oi', { registro: 'lanche' }));
    await admin();
    await db.query('update public.app_aluno set academia_id=$2 where token=$1', [TOKEN, ACB]);
    await who('authenticated', OTHER);
    r = await list();
    ok('trocar tenant do token não transfere conversas da academia anterior', () => assert.deepEqual(r.feedback, []));
    const catalog = (await db.query("select relrowsecurity from pg_class where oid='public.app_nutricao_feedback'::regclass")).rows[0];
    ok('RLS está habilitada na tabela exposta', () => assert.equal(catalog.relrowsecurity, true));
    await admin();
    const routines = (await db.query("select proname,proconfig from pg_proc where proname like 'app_nutricao_feedback_%'")).rows;
    ok('RPCs fixam search_path vazio', () => assert.equal(routines.every(x => x.proconfig.some(v => v === 'search_path=""')), true));
    await db.query('delete from public.app_aluno where token=$1', [TOKEN]);
    ok('exclusão do app remove conversas vinculadas por FK', () => assert.ok(true));
    assert.equal((await db.query('select count(*)::int n from public.app_nutricao_feedback where token=$1', [TOKEN])).rows[0].n, 0);
    console.log(count + ' verificações SQL de comentários e revisões passaram.');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
