/* PGlite disposable baseline. Catalog snapshot only; all fixtures are synthetic.
 * This does not validate HTTP JWT, deployed Auth configuration or concurrency.
 */
const assert = require('node:assert/strict');
const { createSnapshotDb, snapshot } = require('../supabase/releases/nutri-consolidation/replay-snapshot.cjs');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const A = id(1), B = id(2), PA = id(3), PB = id(4), NEW = id(5), WRONG = id(6);
const CA = id(11), CB = id(12), RA = id(21), RB = id(22), RN = id(23);
let checks = 0;
async function check(name, run) { await run(); checks++; console.log('OK ' + name); }

(async () => {
  const db = await createSnapshotDb();
  const who = async (user, role = 'authenticated') => {
    await db.exec('RESET ROLE');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
    if (role !== 'owner') await db.exec('SET ROLE ' + role);
  };
  const query = (sql, params = []) => db.query(sql, params);
  const scalar = async (sql, params = []) => Object.values((await query(sql, params)).rows[0])[0];
  const denied = async (sql, params = [], code = '42501') => assert.rejects(query(sql, params), e => e.code === code);
  const insertFinancial = async (clinic, owner, patient, kind = 'income', title = 'Lançamento sintético') => (await query(`insert into public.financial_entries(clinic_id,owner_id,patient_id,kind,title,amount_cents,due_on,note)
    values($1,$2,$3,$4,$5,10000,'2026-10-12','Nota visível ao paciente') returning id,version`, [clinic,owner,patient,kind,title])).rows[0];
  try {
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
      ('${A}','a@example.test',now()),('${B}','b@example.test',now()),
      ('${PA}','patient-a@example.test',now()),('${PB}','patient-b@example.test',now()),
      ('${NEW}','invite@example.test',now()),('${WRONG}','wrong@example.test',now());
      insert into public.clinics(id,owner_id,name,professional_name) values
      ('${CA}','${A}','Clínica A sintética','Profissional A'),('${CB}','${B}','Clínica B sintética','Profissional B');
      insert into public.patients(id,clinic_id,clinician_id,user_id,name,email,notes,invite_code,invite_expires_at) values
      ('${RA}','${CA}','${A}','${PA}','Paciente A','patient-a@example.test','Nota clínica privada A',null,null),
      ('${RB}','${CB}','${B}','${PB}','Paciente B','patient-b@example.test','Nota clínica privada B',null,null),
      ('${RN}','${CA}','${A}',null,'Convite sintético','invite@example.test','Nota privada convite',null,null);`);
    let shared, privateRecord, other, income, expense, otherIncome, operation = id(100);
    await who(A);
    shared = (await query("insert into public.patient_records(patient_id,clinician_id,kind,title,visibility,data) values($1,$2,'clinical_note','Compartilhado','patient','{\"text\":\"v1\"}') returning id", [RA,A])).rows[0].id;
    privateRecord = (await query("insert into public.patient_records(patient_id,clinician_id,kind,title,visibility) values($1,$2,'clinical_note','Privado','private') returning id", [RA,A])).rows[0].id;
    income = await insertFinancial(CA,A,RA); expense = await insertFinancial(CA,A,RA,'expense');
    await who(B);
    other = (await query("insert into public.patient_records(patient_id,clinician_id,kind,title,visibility) values($1,$2,'clinical_note','Outra clínica','patient') returning id", [RB,B])).rows[0].id;
    otherIncome = await insertFinancial(CB,B,RB);

    await check('15 tabelas reconstruídas com RLS e 44 funções de catálogo', async () => {
      assert.equal(snapshot.relations.length, 15); assert.equal(snapshot.functions.length, 44);
      assert.equal(snapshot.relations.filter(t => t.rls).length, 15);
    });
    await check('anon não lê tabelas nem executa RPC clínica', async () => {
      await who(null,'anon');
      for (const table of snapshot.relations) await denied('select 1 from ' + table.schema + '.' + table.name + ' limit 1');
      await denied('select public.clinician_patient_details($1)',[RA]);
    });
    await check('clínico A lê somente seus pacientes e registros', async () => {
      await who(A);
      assert.deepEqual((await query('select id from public.patients order by id')).rows.map(x=>x.id),[RA,RN]);
      assert.equal(await scalar('select count(*) from public.patient_records where id=$1',[other]),0);
      assert.equal(await scalar('select count(*) from public.financial_entries where id=$1',[otherIncome.id]),0);
    });
    await check('nota clínica exige RPC do dono; paciente e outro dono não a recebem', async () => {
      await who(A); await denied('select notes from public.patients where id=$1',[RA]);
      assert.equal(await scalar('select notes from public.clinician_patient_details($1)',[RA]),'Nota clínica privada A');
      await who(B); assert.equal(await scalar('select count(*) from public.clinician_patient_details($1)',[RA]),0);
      await who(PA); await denied('select notes from public.patients where id=$1',[RA]);
      assert.equal(await scalar('select count(*) from public.clinician_patient_details($1)',[RA]),0);
    });
    await check('paciente lê seus registros compartilhados sem acessar privados/terceiros', async () => {
      await who(PA);
      assert.deepEqual((await query('select id from public.patient_records order by id')).rows.map(x=>x.id),[shared]);
      assert.equal(await scalar('select count(id) from public.patients'),1);
      assert.equal(await scalar('select count(*) from public.clinics'),1);
    });
    await check('paciente não escreve nota clínica nem altera vínculo Auth', async () => {
      await denied("insert into public.patient_records(patient_id,clinician_id,kind,title,visibility) values($1,$2,'clinical_note','Ataque','patient')",[RA,A]);
      await denied('update public.patients set user_id=$1 where id=$2',[PB,RA]);
      assert.equal((await query("update public.patient_records set title='Ataque' where id=$1 returning id",[shared])).rows.length,0);
    });
    await check('clínico não altera user_id por UPDATE direto', async () => {
      await who(A); await denied('update public.patients set user_id=$1 where id=$2',[PB,RA]);
    });
    await check('FK composta rejeita registro e financeiro de outro clínico', async () => {
      await denied("insert into public.patient_records(patient_id,clinician_id,kind,title) values($1,$2,'clinical_note','Ataque')",[RB,A],'23503');
      await assert.rejects(insertFinancial(CA,A,RB),e=>e.code==='23503');
      await assert.rejects(insertFinancial(CB,A,RA),e=>e.code==='23503');
    });
    await check('um dono não cadastra segunda clínica, fechando vínculo clinic/patient', async () => {
      await denied("insert into public.clinics(owner_id,name,professional_name) values($1,'Segunda','Profissional')",[A],'23505');
    });
    await check('histórico preserva versões e oculta versão privada anterior', async () => {
      await query("update public.patient_records set data='{\"text\":\"v2\"}' where id=$1 and version=1",[shared]);
      await query("update public.patient_records set visibility='patient' where id=$1 and version=1",[privateRecord]);
      assert.equal(await scalar('select count(*) from public.read_record_history($1)',[shared]),1);
      await who(PA);
      assert.equal(await scalar('select count(*) from public.read_record_history($1)',[shared]),1);
      assert.equal(await scalar('select count(*) from public.read_record_history($1)',[privateRecord]),0);
      await denied('select * from private.platform_history');
      await denied('select * from public.read_record_history($1)',[other]);
    });
    await check('paciente recebe nota de receita própria; despesa e outro paciente ficam ocultos', async () => {
      const entries=(await query('select id,note from public.financial_entries')).rows;
      assert.deepEqual(entries,[{id:income.id,note:'Nota visível ao paciente'}]);
      assert.equal((await query("update public.financial_entries set status='paid',paid_on='2026-10-11' where id=$1 returning id",[income.id])).rows.length,0);
    });
    await check('CAS financeiro não altera linha com versão antiga; histórico é criado', async () => {
      await who(A);
      const paid=(await query("update public.financial_entries set status='paid',paid_on='2026-10-11' where id=$1 and version=1 returning version",[income.id])).rows;
      assert.equal(paid[0].version,2);
      assert.equal((await query("update public.financial_entries set title='Stale' where id=$1 and version=1 returning id",[income.id])).rows.length,0);
      await who(null,'owner');
      assert.equal(await scalar("select count(*) from private.platform_history where entity_kind='financial_entry' and entity_id=$1",[income.id]),1);
    });
    await check('limite documentado: schema atual permite reabrir pago sem comando especializado', async () => {
      await who(A);
      const row=(await query("update public.financial_entries set status='pending',paid_on=null where id=$1 and version=2 returning version,status",[income.id])).rows[0];
      assert.deepEqual(row,{version:3,status:'pending'});
    });
    await check('idempotência diário evita duplicação e rejeita payload alterado', async () => {
      await who(PA);
      const args=[operation,RA,'2026-10-11',{waterDelta:250}];
      await query('select public.record_log_once($1,$2,$3,$4)',args);
      await query('select public.record_log_once($1,$2,$3,$4)',args);
      assert.equal(await scalar("select water_ml from public.daily_logs where patient_id=$1 and day='2026-10-11'",[RA]),250);
      await denied('select public.record_log_once($1,$2,$3,$4)',[operation,RA,'2026-10-11',{waterDelta:500}],'22023');
      await denied('select public.record_log_once($1,$2,$3,$4)',[id(101),RB,'2026-10-11',{waterDelta:250}]);
      await who(A); await denied('select public.record_patient_log($1,$2,$3)',[RA,'2026-10-11',{waterDelta:250}]);
    });
    let invite;
    await check('convite exige dono, email confirmado correto e expiração futura', async () => {
      await who(B); await denied('select * from public.rotate_patient_invite($1)',[RN]);
      await who(A); invite=(await query('select * from public.rotate_patient_invite($1)',[RN])).rows[0].invite_code;
      await who(WRONG); await denied('select public.redeem_patient_invite($1)',[invite],'22023');
      await who(null,'owner'); await query('update auth.users set email_confirmed_at=null where id=$1',[NEW]);
      await who(NEW); await denied('select public.redeem_patient_invite($1)',[invite]);
      await who(null,'owner'); await query('update auth.users set email_confirmed_at=now() where id=$1',[NEW]);
      await query("update public.patients set invite_expires_at=now()-interval '1 day' where id=$1",[RN]);
      await who(NEW); await denied('select public.redeem_patient_invite($1)',[invite],'22023');
      await who(A); invite=(await query('select * from public.rotate_patient_invite($1)',[RN])).rows[0].invite_code;
      await who(NEW); assert.equal(await scalar('select public.redeem_patient_invite($1)',[invite]),RN);
      await denied('select public.redeem_patient_invite($1)',[invite],'22023');
    });
    await check('revogar exige dono e vínculo esperado', async () => {
      await who(B); await denied('select public.revoke_patient_access($1,$2)',[RA,PA]);
      await who(A); await denied('select public.revoke_patient_access($1,$2)',[RA,PB],'40001');
      const result=await scalar('select public.revoke_patient_access($1,$2)',[RA,PA]); assert.equal(result.revoked,true);
    });
    await check('vínculo revogado perde leitura e não reaproveita resposta idempotente', async () => {
      await who(PA);
      assert.equal(await scalar('select count(id) from public.patients'),0);
      for(const table of ['financial_entries','patient_records','daily_logs','clinics']) assert.equal(await scalar('select count(*) from public.'+table),0);
      await denied('select public.record_log_once($1,$2,$3,$4)',[operation,RA,'2026-10-11',{waterDelta:250}]);
      await denied('select * from public.read_record_history($1)',[shared]);
    });
    console.log('PASS '+checks+' cenários baseline Nutri; fixtures sintéticas, sem HTTP/Auth real, produção ou concorrência multi-conexão.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
