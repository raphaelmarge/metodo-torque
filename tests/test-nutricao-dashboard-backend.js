/* Dashboard de nutrição: PostgreSQL local, sem conexão ou dados de produção. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.TORQUE_PGLITE||'./runtime/node_modules/@electric-sql/pglite');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260909210348_nutricao_dashboard_resumo.sql'),'utf8');
let checks=0;
function ok(name,fn){fn();checks++;console.log('OK '+name);}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const USER='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444';
(async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.membros(academia_id uuid,user_id uuid,primary key(academia_id,user_id));
      create table public.app_aluno(token text primary key,academia_id uuid,revogado_em timestamptz,retorno jsonb,dados jsonb,atualizado timestamptz);
      alter table public.membros enable row level security;
      alter table public.app_aluno enable row level security;`);
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20260907202135_personal_nutricao_integrada.sql'),'utf8'));
    await db.exec(sql);await db.exec(sql);
    ok('migration é reaplicável sem escrita em alunos',()=>assert.ok(true));
    await db.query('insert into public.membros values($1,$2),($3,$4)',[A,USER,B,OTHER]);
    const today=(await db.query("select to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d")).rows[0].d;
    // Aritmética de calendário no mesmo date de São Paulo usado pela RPC, sem conversão de fuso.
    const dias=(await db.query("select n,to_char($1::date+n,'YYYY-MM-DD') d from generate_series(-7,1) n",[today])).rows;
    const day=n=>dias.find(row=>row.n===n).d;
    const record=(id,d=today)=>({id,d,refeicaoId:'r1',titulo:'NOME PRIVADO DA REFEICAO',hora:'12:00',origem:'plano',
      itens:[{nome:'ALIMENTO PRIVADO',porcao:'100 g',qtd:1,k:130,pt:2,cb:28,g:1}],
      foto:'data:image/jpeg;base64,'+'A'.repeat(55000),observacao:'OBSERVACAO PRIVADA',atualizadoEm:today+'T10:00:00.000Z',apagado:false});
    const records={
      hoje:record('hoje'),limite:record('limite',day(-6)),ontem:record('ontem',day(-1)),
      antigo:record('antigo',day(-7)),futuro:record('futuro',day(1)),
      apagado:{...record('apagado'),apagado:true},
      errado:record('outro-id'),invalido:{...record('invalido'),d:'2026-02-30'},
      invalido2:{...record('invalido2'),itens:[{nome:'Falso',qtd:1,k:-1,pt:0,cb:0,g:0}]},
      invalido3:{...record('invalido3'),apagado:'false'},
      invalido4:{...record('invalido4'),atualizadoEm:'ontem'},
      lixo:['array','não','registro']
    };
    const retorno={cargas:{segredo:'CARGA PRIVADA'},nutricaoV1:{v:1,registros:records}},dados={dados:{a:{nome:'NOME PRIVADO DO ALUNO'},nutricaoApp:{ativo:true}}};
    await db.query(`insert into public.app_aluno(token,academia_id,retorno,dados,revogado_em) values
      ('token_ativo_A',$1,$3,$4,null),('token_zero_A',$1,'{"nutricaoV1":{"registros":{}}}',$4,null),
      ('token_sem_diario',$1,null,$4,null),('token_revogado_A',$1,$3,$4,now()),
      ('token_outro_B',$2,$3,$4,null),('token_array_A',$1,'{"nutricaoV1":{"registros":[]}}',$4,null)`,[A,B,retorno,dados]);
    const who=async(role='authenticated',uid=USER)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role '+role);};
    const admin=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");};
    const query=async(tokens=['token_ativo_A'],todayArg=today,academy=A)=>(await db.query('select public.personal_nutricao_resumo($1,$2,$3) r',[academy,tokens,todayArg])).rows[0].r;
    const fail=(name,r)=>ok(name,()=>{assert.equal(r.ok,undefined);assert.ok(r.erro);});
    const snapshot=async()=>(await db.query('select jsonb_agg(to_jsonb(a) order by token) d from public.app_aluno a')).rows[0].d;
    const before=await snapshot();
    await who('anon','');let e;try{await query();}catch(x){e=x;}
    ok('anon não executa a RPC mesmo conhecendo os tokens',()=>assert.equal(e&&e.code,'42501'));
    await who('authenticated','');fail('papel authenticated sem JWT não autoriza',await query());
    await who('authenticated',OTHER);fail('profissional de outra academia não consulta',await query());
    await who();fail('academia diferente não usa vínculo de outra conta',await query(['token_outro_B'],today,B));
    fail('academia nula é rejeitada',await query(['token_ativo_A'],today,null));
    let r=await query(['token_ativo_A','token_zero_A','token_sem_diario','token_revogado_A','token_outro_B','token_inexistente','token_array_A']);
    ok('intervalo inclui hoje e o sexto dia anterior',()=>{assert.equal(r.ok,true);assert.equal(r.inicio,day(-6));assert.equal(r.hoje,today);assert.equal(r.alunos.find(a=>a.token==='token_ativo_A').registros7dias,3);});
    ok('contagem exclui futuro, tombstone, ID divergente e registros inválidos',()=>assert.equal(r.alunos.find(a=>a.token==='token_ativo_A').registros7dias,3));
    ok('app autorizado com diário vazio retorna zero confirmado',()=>assert.equal(r.alunos.find(a=>a.token==='token_zero_A').registros7dias,0));
    ok('app autorizado sem diário retorna zero confirmado',()=>assert.equal(r.alunos.find(a=>a.token==='token_sem_diario').registros7dias,0));
    ok('estrutura de diário inválida não é contada como registros',()=>assert.equal(r.alunos.find(a=>a.token==='token_array_A').registros7dias,0));
    ok('revogados, inexistentes e outra academia ficam omitidos',()=>assert.deepEqual(r.alunos.map(a=>a.token).sort(),['token_array_A','token_ativo_A','token_sem_diario','token_zero_A'].sort()));
    ok('resumo não retorna nomes, fotos, observações ou alimentos',()=>{const json=JSON.stringify(r);assert.ok(!json.includes('PRIVAD'));assert.ok(!json.includes('data:image'));assert.ok(json.length<1200);r.alunos.forEach(a=>assert.deepEqual(Object.keys(a).sort(),['token','registros7dias'].sort()));});
    ok('consultadoEm é timestamp UTC do servidor',()=>assert.ok(/Z$/.test(r.consultadoEm)&&Math.abs(Date.parse(r.consultadoEm)-Date.now())<60000));
    r=await query(['token_zero_A']);ok('somente tokens solicitados são retornados',()=>assert.deepEqual(r.alunos,[{token:'token_zero_A',registros7dias:0}]));
    r=await query(['token_ativo_A','token_ativo_A']);ok('tokens repetidos não duplicam contagem ou linhas',()=>assert.equal(r.alunos.length,1));
    r=await query(['token_ativo_A'],day(1));ok('relógio do cliente adiantado não conta refeição futura',()=>assert.equal(r.alunos[0].registros7dias,2));
    r=await query(['token_ativo_A'],day(-1));ok('consulta usa dia explícito sem incluir registros posteriores',()=>assert.equal(r.alunos[0].registros7dias,3));
    for(const [name,tokens] of [['lote vazio',[]],['lote nulo',null],['token nulo',[null]],['token curto',['x']],['token excessivo',['x'.repeat(301)]],['mais de100 tokens',Array(101).fill('token_ativo_A')],['matriz multidimensional',[['token_ativo_A','token_zero_A']]]])fail(name+' é rejeitado',await query(tokens));
    for(const value of [null,'infinity','-infinity','0001-01-01','10000-01-01'])fail('data inválida '+value+' é rejeitada',await query(['token_ativo_A'],value));
    e=null;try{await query(['token_ativo_A'],'2026-02-30');}catch(x){e=x;}
    ok('data impossível é rejeitada pelo tipo date do PostgreSQL',()=>assert.ok(e&&/^22/.test(e.code)));
    await admin();
    ok('consultas não alteram dados, retorno ou atualizado',()=>assert.ok(true));assert.deepEqual(await snapshot(),before);
    await db.query('delete from public.membros where user_id=$1',[USER]);await who();fail('vínculo revogado invalida consulta imediatamente',await query());
    await admin();await db.query('insert into public.membros values($1,$2)',[A,USER]);await db.query("update public.app_aluno set revogado_em=now() where token='token_ativo_A'");
    await who();r=await query();ok('revogar app omite o token sem representá-lo como zero',()=>assert.deepEqual(r.alunos,[]));
    await admin();
    await db.query(`insert into public.app_aluno(token,academia_id,retorno) select 'token_lote_'||lpad(g::text,3,'0'),$1,'{}' from generate_series(1,100)g`,[A]);
    const lote=Array.from({length:100},(_,i)=>'token_lote_'+String(i+1).padStart(3,'0'));
    await who();r=await query(lote);ok('lote de100 acessos é atendido integralmente',()=>{assert.equal(r.alunos.length,100);assert.ok(r.alunos.every(a=>a.registros7dias===0));});
    e=null;try{await db.query('select retorno from public.app_aluno');}catch(x){e=x;}
    ok('RPC não concede leitura direta da tabela',()=>assert.equal(e&&e.code,'42501'));
    await admin();const proc=(await db.query("select provolatile,prosecdef,proconfig from pg_proc where proname='personal_nutricao_resumo'")).rows[0];
    ok('função é STABLE com search_path vazio',()=>{assert.equal(proc.provolatile,'s');assert.equal(proc.prosecdef,true);assert.ok(proc.proconfig.includes('search_path=""'));});
    const grants=(await db.query("select has_function_privilege('anon','public.personal_nutricao_resumo(uuid,text[],date)','execute') anon,has_function_privilege('authenticated','public.personal_nutricao_resumo(uuid,text[],date)','execute') autenticado")).rows[0];
    ok('EXECUTE somente para authenticated entre papéis do cliente',()=>{assert.equal(grants.anon,false);assert.equal(grants.autenticado,true);});
    console.log(checks+' verificações SQL do dashboard de nutrição passaram.');
  }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
