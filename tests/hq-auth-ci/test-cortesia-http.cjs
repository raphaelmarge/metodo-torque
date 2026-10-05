'use strict';
// Called only inside the guarded ephemeral real Auth/PostgREST harness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function ({ client, check, rpc, good, rejected, waitRPC,
  users, accountA, accountB, anonKey, serviceKey }) {
  const { supportA, supportB, outsider } = users;
  const baseline = (await client.query('select id,assinatura_status,assinatura_via,assinatura_vence from public.academias order by id')).rows;
  await check('courtesy migration changes no customers and preserves real Auth identities', async () => {
    await client.query(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261005150924_personal_cortesia_temporaria.sql'), 'utf8'));
    await waitRPC(outsider, 'minha_assinatura', r => r.ok);
    assert.deepEqual((await client.query('select id,assinatura_status,assinatura_via,assinatura_vence from public.academias order by id')).rows, baseline);
    assert.equal(good(await rpc(outsider, 'minha_assinatura')), null);
    await client.query('insert into public.membros values($1,$2),($3,$4)', [accountA,supportA.id,accountB,supportB.id]);
  });
  await check('real password JWTs read only their linked subscription and courtesy deadline', async () => {
    await client.query("update public.academias set assinatura_status='cortesia',assinatura_via='cortesia',assinatura_vence=now()+interval '2 hours' where id=$1", [accountA]);
    const a = good(await rpc(supportA, 'minha_assinatura')), b = good(await rpc(supportB, 'minha_assinatura'));
    assert.equal(a.academia_id,accountA); assert.equal(a.cortesia,true); assert.equal(a.travado,false); assert.equal(a.dias_ate_travar,1);
    assert.equal(b.academia_id,accountB); assert.equal(b.status,'trial'); assert.equal(b.travado,false); assert.equal(Object.hasOwn(b,'cortesia'),false);
  });
  await check('courtesy deadline uses the server and invalid/missing ends never grant access', async () => {
    for (const value of ["now()-interval '1 second'",'null',"'infinity'::timestamptz","'-infinity'::timestamptz"]) {
      await client.query('update public.academias set assinatura_vence='+value+' where id=$1',[accountA]);
      const a=good(await rpc(supportA,'minha_assinatura'));
      assert.equal(a.cortesia,true); assert.equal(a.travado,true); assert.equal(a.dias_ate_travar,0);
    }
  });
  await check('paid and lifetime contracts retain their original precedence over deadlines', async () => {
    for (const status of ['ativa','vitalicia','atrasada']) {
      await client.query("update public.academias set assinatura_status=$1,assinatura_vence=now()-interval '1 day' where id=$2",[status,accountA]);
      const a=good(await rpc(supportA,'minha_assinatura'));
      assert.equal(a.status,status); assert.equal(a.travado,false); assert.equal(Object.hasOwn(a,'cortesia'),false);
    }
  });
  await check('membership revocation affects next HTTP read even with an existing valid JWT', async () => {
    await client.query('delete from public.membros where user_id=$1',[supportA.id]);
    assert.equal(good(await rpc(supportA,'minha_assinatura')),null);
    assert.equal(good(await rpc(supportB,'minha_assinatura')).academia_id,accountB);
  });
  await check('anonymous subscription access denied; service compatibility does not invent a user', async () => {
    for (const actor of [undefined,anonKey]) rejected(await rpc(actor,'minha_assinatura'),'42501');
    assert.equal(good(await rpc(serviceKey,'minha_assinatura')),null);
    assert.equal(good(await rpc(outsider,'minha_assinatura')),null);
  });
  // Restore only synthetic fixtures before the independent HQ workflow checks.
  await client.query('delete from public.membros');
  for(const row of baseline) await client.query('update public.academias set assinatura_status=$1,assinatura_via=$2,assinatura_vence=$3 where id=$4',
    [row.assinatura_status,row.assinatura_via,row.assinatura_vence,row.id]);
};
