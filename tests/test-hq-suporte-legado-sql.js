'use strict';
// Synthetic old channels; read-only bridge must not touch lida/status/resposta.
const assert=require('node:assert/strict'),{PGlite}=require('./runtime/node_modules/@electric-sql/pglite'),F=require('./_operacao-prioridades-sql');
let n=0;function ok(v,s){assert.ok(v,s);console.log('OK '+(++n)+' '+s);}
(async()=>{const db=new PGlite();try{
 await db.exec(F.fixture);await db.exec(`create table saas_tickets(id uuid primary key,academia_id uuid,de text,quem text,texto text,lida boolean,criado timestamptz);
 create table suporte_chamados(id uuid primary key,protocolo text unique,academia_id uuid,user_id uuid,email text,tipo text,mensagem text,status text,resposta text,criado_em timestamptz);
 alter table saas_tickets enable row level security;alter table suporte_chamados enable row level security;`);
 for(let i=1;i<=5;i++){await db.query("insert into saas_tickets values($1,$2,'cliente','Nome privado','Mensagem sintética',false,'2026-10-01T12:00:00Z')",[F.uid(200+i),F.uid(i===5?102:101)]);await db.query("insert into suporte_chamados values($1,$2,$3,$4,'email-nao-expor@example.invalid','duvida','Mensagem antiga','respondido','Resposta armazenada','2026-10-01T12:00:00Z')",[F.uid(200+i),'PROTO-'+i,F.uid(101),F.uid(1)]);}
 const before=JSON.stringify((await db.query("select (select jsonb_agg(t) from saas_tickets t) tickets,(select jsonb_agg(t) from suporte_chamados t) chamados")).rows);
 const migration=F.read('supabase/migrations/20261006145701_hq_suporte_legado_leitura.sql');await db.exec(migration);
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[F.uid(id)]);await db.exec('set role authenticated');};
 const read=async(cursor=null,limit=3,account=null)=>(await db.query('select public.hq_ops_legacy_support($1,$2,$3) r',[cursor,limit,account])).rows[0].r;
 await actor(2);await assert.rejects(()=>read(),/administradores/);ok(true,'usuário não administrador não lê histórico');
 await db.exec('reset role;set role anon');await assert.rejects(()=>read(),/permission denied/);ok(true,'anon sem EXECUTE');
 await actor(1);const first=await read();ok(first.readOnly&&first.rows.length===3&&first.nextCursor,'primeira página limitada com cursor');
 let all=first.rows,cursor=first.nextCursor,pages=1;while(cursor){const next=await read(cursor);all.push(...next.rows);cursor=next.nextCursor;pages++;if(pages>10)throw Error('cursor circular');}
 ok(all.length===10&&new Set(all.map(r=>r.source+':'+r.id)).size===10,'empates de timestamp e ID entre fontes paginam sem perder ou duplicar');ok(all.some(r=>r.source==='saas_tickets')&&all.some(r=>r.source==='suporte_chamados'),'os dois canais preservam origem');
 ok(!JSON.stringify(all).includes('email-nao-expor')&&!JSON.stringify(all).includes('Nome privado')&&!JSON.stringify(all).includes('user_id'),'nomes de remetente, email e Auth ID não são expostos');ok(all.every(r=>r.delivery==='not_verified'),'resposta registrada não vira entrega confirmada');
 const scoped=await read(null,50,F.uid(102));ok(scoped.rows.length===1&&scoped.rows[0].accountId===F.uid(102),'filtro de conta aplicado no servidor aos dois canais');
 await assert.rejects(()=>read(first.nextCursor,3,F.uid(102)),/fora desta consulta/);ok(true,'cursor não pode ser misturado com outra conta');
 await assert.rejects(()=>read(null,51),/Limite invalido/);await assert.rejects(()=>read({}),/Cursor invalido/);ok(true,'limite e cursor inválidos recusados');
 await db.exec('reset role');const after=JSON.stringify((await db.query("select (select jsonb_agg(t) from saas_tickets t) tickets,(select jsonb_agg(t) from suporte_chamados t) chamados")).rows);ok(before===after,'todas as mensagens, marcações de leitura, status e respostas permanecem intactas');
 const p=(await db.query("select provolatile,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('service_role',oid,'execute') service from pg_proc where oid='public.hq_ops_legacy_support(jsonb,integer,uuid)'::regprocedure")).rows[0];ok(p.provolatile==='s'&&p.proconfig.includes('search_path=""')&&!p.anon&&!p.service,'RPC somente leitura, caminho vazio e grants mínimos');
 await db.exec(migration);ok((await db.query('select count(*) n from saas_tickets')).rows[0].n===5,'reaplicação da ponte não altera registros');
 console.log(n+' verificações de suporte legado passaram.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
