/* Disposable PGlite replay of the captured Nutri schema plus LOCAL proposal.
 * Fixtures are synthetic; no network, production Auth or real transactions.
 * Single connection: version conflicts are covered, simultaneous locks are not.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSnapshotDb } = require('../supabase/releases/nutri-consolidation/replay-snapshot.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const A=id(1),B=id(2),PA=id(3),PB=id(4),CA=id(11),CB=id(12),RA=id(21),RB=id(22),LEGACY=id(31);
let checks=0, serial=100;
const migration=path.join(__dirname,'../supabase/releases/nutri-consolidation/supabase/migrations/20261011184245_nutri_manual_finance_ledger.sql');
(async()=>{
  const db=await createSnapshotDb();
  const query=(sql,args=[])=>db.query(sql,args);
  const scalar=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
  const who=async(user,role='authenticated')=>{
    await db.exec('RESET ROLE');
    await query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
    if(role!=='owner')await db.exec('SET ROLE '+role);
  };
  const command=(data,op=id(++serial))=>scalar('select public.nutri_finance_command($1,$2)',[op,data]);
  const snapshot=()=>scalar('select public.nutri_finance_snapshot()');
  const deny=async(fn,code='42501')=>assert.rejects(fn,e=>e.code===code);
  const check=async(name,fn)=>{await fn();checks++;console.log('OK '+name);};
  const draft=overrides=>({action:'create',clinic_id:CA,patient_id:RA,kind:'income',title:'Consulta sintética',amount_cents:10000,due_on:'2026-10-12',method:'cash',note:'Anotação do lançamento',...overrides});
  const change=(action,entry,fields={})=>({action,entry_id:entry.id,expected_version:entry.version,...fields});
  let entry, expense, installments, partial, paid, corrected, refunded;
  try{
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
      ('${A}','a@example.test',now()),('${B}','b@example.test',now()),
      ('${PA}','pa@example.test',now()),('${PB}','pb@example.test',now());
      insert into public.clinics(id,owner_id,name,professional_name,crn) values
      ('${CA}','${A}','Clínica A sintética','Profissional A','CRN-TESTE-A'),
      ('${CB}','${B}','Clínica B sintética','Profissional B','CRN-TESTE-B');
      insert into public.patients(id,clinic_id,clinician_id,user_id,name,email,invite_code,invite_expires_at) values
      ('${RA}','${CA}','${A}','${PA}','Paciente A','pa@example.test',null,null),
      ('${RB}','${CB}','${B}','${PB}','Paciente B','pb@example.test',null,null);
      insert into public.financial_entries(id,clinic_id,owner_id,patient_id,kind,title,amount_cents,due_on,status,paid_on,method)
      values('${LEGACY}','${CA}','${A}','${RA}','income','Pago anterior',8000,'2026-09-12','paid','2026-09-10','cash');`);
    await db.exec(fs.readFileSync(migration,'utf8'));
    await check('abertura conserva valor/data pagos e competência desconhecida',async()=>{
      await who(A);const snap=await snapshot();const e=snap.entries[0],ev=snap.events[0];
      assert.equal(e.id,LEGACY);assert.equal(e.received_cents,8000);assert.equal(e.competency_on,null);
      assert.equal(e.version,1);assert.equal(ev.kind,'opening');assert.equal(ev.source,'legacy');
      assert.equal(ev.occurred_on,'2026-09-10');assert.equal(ev.operation_id,null);
      assert.equal(ev.entry_snapshot.patient_name,'Paciente A');
    });
    await check('RPC pública invoker e tabelas privadas com RLS sem grants clientes',async()=>{
      await who(null,'owner');
      const functions=(await query("select proname,prosecdef from pg_proc where proname in ('nutri_finance_capabilities','nutri_finance_snapshot','nutri_finance_command')")).rows;
      assert.equal(functions.length,3);assert(functions.every(f=>!f.prosecdef));
      for(const table of ['nutri_finance_operations','nutri_finance_events']){
        assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass',['private.'+table]),true);
        assert.equal(await scalar("select has_table_privilege('authenticated',$1,'SELECT')",['private.'+table]),false);
      }
      await who(A);await deny(()=>query('select * from private.nutri_finance_events'));
      await deny(()=>query('select * from private.nutri_finance_operations'));
    });
    await check('anon e sessão ausente não leem RPCs nem gravam',async()=>{
      await who(null,'anon');await deny(()=>snapshot());await deny(()=>command(draft()));
      await deny(()=>scalar('select public.nutri_finance_capabilities()'));
      await who(null);await deny(()=>snapshot());await deny(()=>command(draft()));
      await deny(()=>scalar('select private.nutri_finance_snapshot_impl()'));
    });
    await check('criação atômica e retry retorna mesmo resultado sem duplicar',async()=>{
      await who(A);const op=id(++serial),data=draft({competency_on:'2026-10-01'});
      const result=await command(data,op);assert.deepEqual(await command(data,op),result);
      entry=result.entries[0];assert.equal(result.events.length,1);assert.equal(entry.status,'pending');
      assert.equal(entry.balance_cents,10000);assert.equal(entry.competency_on,'2026-10-01');
      assert.equal(result.events[0].entry_snapshot.clinic_name,'Clínica A sintética');
      await deny(()=>command({...data,amount_cents:12000},op),'22023');
      assert.equal((await snapshot()).entries.length,2);
    });
    await check('gravação direta e por coluna bloqueadas inclusive antigo fluxo pago',async()=>{
      await deny(()=>query("update public.financial_entries set status='paid',paid_on='2026-10-10' where id=$1",[entry.id]));
      await deny(()=>query("update public.financial_entries set competency_on='2026-01-01' where id=$1",[entry.id]));
      await deny(()=>query('delete from public.financial_entries where id=$1',[entry.id]));
      await deny(()=>query("insert into public.financial_entries(clinic_id,owner_id,kind,title,amount_cents,due_on) values($1,$2,'income','Direto',100,'2026-10-11')",[CA,A]));
      await deny(()=>query('truncate public.financial_entries'));
    });
    await check('paciente e outro dono não comandam lançamentos/vínculos alheios',async()=>{
      await who(PA);await deny(()=>command(change('pay',entry,{amount_cents:100,occurred_on:'2026-10-10'})));
      await deny(()=>command(draft()));
      await who(B);await deny(()=>command(change('pay',entry,{amount_cents:100,occurred_on:'2026-10-10'})));
      await deny(()=>command(draft()));
      await deny(()=>command(draft({clinic_id:CB})));
      await who(A);await deny(()=>command(draft({patient_id:RB})));
    });
    await check('parcelas conservam centavos e criação falha integralmente',async()=>{
      const result=await command(draft({amount_cents:10001,installments:[
        {amount_cents:5001,due_on:'2026-10-31',competency_on:'2026-10-01'},
        {amount_cents:5000,due_on:'2026-11-30',competency_on:null}]}));
      installments=result.entries;assert.equal(installments.length,2);
      assert.equal(installments.reduce((a,e)=>a+e.amount_cents,0),10001);
      assert.equal(installments[0].installment_group_id,installments[1].installment_group_id);
      assert.deepEqual(installments.map(e=>e.installment_index),[1,2]);
      const count=(await snapshot()).entries.length;
      await deny(()=>command(draft({amount_cents:10000,installments:[{amount_cents:5000,due_on:'2026-10-31'},{amount_cents:5000,due_on:'2026-11-31'}]})),'22008');
      assert.equal((await snapshot()).entries.length,count);
      await deny(()=>command(draft({amount_cents:9999,installments:[{amount_cents:10000,due_on:'2026-10-31'}]})),'22023');
      assert.equal((await snapshot()).entries.length,count);
    });
    await check('pagamento parcial, CAS e retry anterior à versão preservam saldo',async()=>{
      const op=id(++serial),data=change('pay',entry,{amount_cents:4000,occurred_on:'2026-10-10',method:'cash'});
      const result=await command(data,op);partial=result.entries[0];
      assert.equal(partial.status,'pending');assert.equal(partial.paid_on,null);assert.equal(partial.received_cents,4000);
      assert.equal(partial.balance_cents,6000);assert.equal(partial.version,entry.version+1);
      assert.deepEqual(await command(data,op),result);
      await deny(()=>command(data),'40001');
      await deny(()=>command(change('pay',partial,{amount_cents:6001,occurred_on:'2026-10-10'})),'22023');
    });
    await check('pagamento total grava recibo imutável com snapshot da época',async()=>{
      const result=await command(change('pay',partial,{amount_cents:6000,occurred_on:'2026-10-11',method:'transfer'}));
      paid=result.entries[0];assert.equal(paid.status,'paid');assert.equal(paid.paid_on,'2026-10-11');
      assert.equal(paid.balance_cents,0);assert.equal(paid.net_paid_cents,10000);
      const receipt=result.events[0];assert.equal(receipt.amount_cents,6000);assert.equal(receipt.entry_snapshot.title,'Consulta sintética');
      await command(change('correct',paid,{title:'Consulta corrigida',competency_on:null,reason:'Correção solicitada'}));
      const snap=await snapshot();corrected=snap.entries.find(e=>e.id===paid.id);
      assert.equal(corrected.competency_on,null);assert.equal(corrected.title,'Consulta corrigida');
      assert.equal(snap.events.find(e=>e.id===receipt.id).entry_snapshot.title,'Consulta sintética');
      const correction=snap.events.find(e=>e.entry_id===paid.id&&e.kind==='correction');
      assert.equal(correction.previous_snapshot.competency_on,'2026-10-01');
    });
    await check('devolução manual parcial/total conserva quitação e exige motivo/data/limite',async()=>{
      await deny(()=>command(change('refund',corrected,{amount_cents:100,occurred_on:'2026-10-11'})),'22023');
      await deny(()=>command(change('refund',corrected,{amount_cents:100,occurred_on:'2026-10-09',reason:'Data incorreta'})),'22023');
      const result=await command(change('refund',corrected,{amount_cents:3000,occurred_on:'2026-10-11',method:'cash',reason:'Devolução combinada'}));
      refunded=result.entries[0];assert.equal(refunded.received_cents,10000);assert.equal(refunded.refunded_cents,3000);
      assert.equal(refunded.net_paid_cents,7000);assert.equal(refunded.balance_cents,0);assert.equal(refunded.status,'paid');
      await deny(()=>command(change('refund',refunded,{amount_cents:7001,occurred_on:'2026-10-11',reason:'Excesso'})),'22023');
      refunded=(await command(change('refund',refunded,{amount_cents:7000,occurred_on:'2026-10-11',reason:'Restante'}))).entries[0];
      assert.equal(refunded.net_paid_cents,0);assert.equal(refunded.balance_cents,0);assert.equal(refunded.status,'paid');
      await deny(()=>command(change('pay',refunded,{amount_cents:1,occurred_on:'2026-10-11'})),'22023');
      await deny(()=>command(change('void',refunded,{reason:'Não permitido'})),'22023');
    });
    await check('correção de competência preserva trilha mesmo sem outros campos alterados',async()=>{
      const result=await command(change('correct',installments[0],{competency_on:'2026-09-01',reason:'Competência correta'}));
      assert.equal(result.entries[0].competency_on,'2026-09-01');
      assert.equal(result.events[0].previous_snapshot.competency_on,'2026-10-01');
      assert.equal(result.events[0].entry_snapshot.competency_on,'2026-09-01');
      installments[0]=result.entries[0];
      await deny(()=>command(change('correct',refunded,{amount_cents:9999,reason:'Valor menor que pago'})),'22023');
    });
    await check('cancelamento sem pagamento zera saldo, não apaga e não reabre',async()=>{
      const result=await command(change('void',installments[1],{reason:'Consulta cancelada'}));
      const cancelled=result.entries[0];assert.equal(cancelled.status,'void');assert.equal(cancelled.balance_cents,0);
      assert.equal(result.events[0].previous_snapshot.status,'pending');
      await deny(()=>command(change('pay',cancelled,{amount_cents:100,occurred_on:'2026-10-11'})),'22023');
      await deny(()=>command(change('correct',cancelled,{title:'Reabrir',reason:'Tentativa'})),'22023');
    });
    await check('última baixa retroativa mantém data real de quitação mais recente',async()=>{
      let retro=(await command(draft())).entries[0];
      retro=(await command(change('pay',retro,{amount_cents:4000,occurred_on:'2026-10-10'}))).entries[0];
      retro=(await command(change('pay',retro,{amount_cents:6000,occurred_on:'2026-10-05'}))).entries[0];
      assert.equal(retro.status,'paid');assert.equal(retro.paid_on,'2026-10-10');
      assert.equal(retro.received_cents,10000);
    });
    await check('despesa usa movimentos separados e não aparece ao paciente',async()=>{
      expense=(await command(draft({kind:'expense',title:'Despesa sintética',patient_id:null}))).entries[0];
      expense=(await command(change('pay',expense,{amount_cents:5000,occurred_on:'2026-10-11'}))).entries[0];
      assert.equal(expense.kind,'expense');assert.equal(expense.net_paid_cents,5000);assert.equal(expense.balance_cents,5000);
      await who(PA);const snap=await snapshot();assert(!snap.entries.some(e=>e.id===expense.id));
      assert(snap.entries.every(e=>e.patient_id===RA&&e.kind==='income'));
      assert(snap.events.every(e=>['opening','payment','refund'].includes(e.kind)));
      assert(snap.entries.every(e=>!('note' in e)));
      assert(snap.events.every(e=>!('reason' in e)&&!('operation_id' in e)&&!('previous_snapshot' in e)&&!('note' in e.entry_snapshot)));
      assert.equal(snap.entries.find(e=>e.id===refunded.id).net_paid_cents,0);
      await who(PB);assert.deepEqual((await snapshot()).entries,[]);assert.deepEqual((await snapshot()).events,[]);
    });
    await check('idempotência isolada por dono e argumentos de identidade não autorizam troca',async()=>{
      const op=id(++serial);await who(A);const a=await command(draft({owner_id:B,status:'paid'}),op);
      assert.equal(a.entries[0].owner_id,A);assert.equal(a.entries[0].status,'pending');
      await who(B);const b=await command(draft({clinic_id:CB,patient_id:RB}),op);
      assert.equal(b.entries[0].owner_id,B);assert.notEqual(a.entries[0].id,b.entries[0].id);
      assert((await snapshot()).entries.every(e=>e.owner_id===B));
    });
    await check('centavos fracionários, zero, data futura e operação sem versão falham',async()=>{
      await who(A);
      for(const amount_cents of [0,-1,0.5,1000000001])await deny(()=>command(draft({amount_cents})),'22023');
      await deny(()=>command(change('pay',installments[0],{amount_cents:1,occurred_on:'2999-01-01'})),'22023');
      await deny(()=>command({action:'pay',entry_id:installments[0].id,amount_cents:1,occurred_on:'2026-10-11'}),'22023');
    });
    await check('auditoria não permite UPDATE DELETE nem TRUNCATE mesmo por owner SQL',async()=>{
      await who(null,'owner');
      for(const table of ['nutri_finance_events','nutri_finance_operations']){
        await deny(()=>query('update private.'+table+' set created_at=now()'));
        await deny(()=>query('delete from private.'+table));
        await deny(()=>query('truncate private.'+table));
      }
    });
    await check('revogação paciente remove projeções e recibos',async()=>{
      await who(A);await scalar('select public.revoke_patient_access($1,$2)',[RA,PA]);
      await who(PA);const snap=await snapshot();assert.deepEqual(snap.entries,[]);assert.deepEqual(snap.events,[]);
    });
    console.log('PASS '+checks+' cenários financeiro SQL; proposta LOCAL, sem aplicação remota ou concorrência multi-conexão.');
  }finally{await db.close();}
})().catch(e=>{console.error(e.message);console.error(e.stack);process.exitCode=1;});
