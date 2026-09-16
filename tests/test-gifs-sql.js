/* Banco de GIFs: executa a migração em PostgreSQL/PGlite isolado e prova as
 * políticas com duas academias sintéticas. Nunca conecta à produção. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { PGlite } = require(process.env.TORQUE_PGLITE || "./runtime/node_modules/@electric-sql/pglite");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const U = "33333333-3333-4333-8333-333333333333";
const V = "44444444-4444-4444-8444-444444444444";
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log("OK " + label); };

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema storage;
      create function auth.uid() returns uuid language sql stable
        as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create table public.membros(academia_id uuid not null, user_id uuid not null);
      create function public.minhas_academias() returns setof uuid language sql stable security definer
        set search_path = '' as $$select academia_id from public.membros where user_id = auth.uid()$$;
      create table storage.buckets(
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects(
        id bigint generated always as identity primary key,
        bucket_id text not null, name text not null unique
      );
      create function storage.foldername(p text) returns text[] language sql immutable as $$
        select case when position('/' in p) = 0 then array[]::text[]
          else string_to_array(regexp_replace(p, '/[^/]*$', ''), '/') end
      $$;
      create function storage.extension(p text) returns text language sql immutable as $$
        select case when position('.' in p) = 0 then '' else regexp_replace(p, '^.*\\.', '') end
      $$;
      grant usage on schema auth, storage, public to anon, authenticated;
      grant execute on function auth.uid(), public.minhas_academias(), storage.foldername(text), storage.extension(text)
        to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      grant usage, select on sequence storage.objects_id_seq to anon, authenticated;
      alter table storage.objects enable row level security;
    `);
    await db.query("insert into public.membros values ($1,$2),($3,$4)", [A, U, B, V]);
    const migration = fs.readFileSync(path.join(__dirname,
      "../supabase/migrations/20260916160659_exercise_gif_bank.sql"), "utf8");
    await db.exec(migration);
    await db.query("insert into storage.objects(bucket_id,name) values ('exercicios','supino-reto-barra.gif'),('exercicios',$1),('exercicios',$2)",
      [A + "/meu.gif", B + "/outro.gif"]);

    const as = async (uid, role = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
      await db.exec("set role " + role);
    };
    const denied = async (fn, label) => {
      let error;
      try { await fn(); } catch (e) { error = e; }
      ok(error && error.code === "42501", label + " (" + (error && error.code) + ")");
    };

    await as(U);
    let names = (await db.query("select name from storage.objects order by name")).rows.map((x) => x.name);
    ok(names.includes("supino-reto-barra.gif") && names.includes(A + "/meu.gif") && !names.includes(B + "/outro.gif"),
      "equipe lista o acervo global e a própria pasta, nunca a pasta vizinha");
    await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('exercicios','raiz.gif')"),
      "equipe não envia para a raiz curada");
    await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('exercicios',$1)", [B + "/invasao.gif"]),
      "equipe não envia para outra academia");
    await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('exercicios',$1)", [A + "/sub/pasta.gif"]),
      "upload não cria subpastas fora do contrato");
    await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('exercicios',$1)", [A + "/foto.jpg"]),
      "extensão diferente de GIF é recusada");
    await db.query("insert into storage.objects(bucket_id,name) values ('exercicios',$1)", [A + "/novo.GIF"]);
    ok(true, "GIF entra somente na pasta da academia autenticada");
    ok((await db.query("update storage.objects set name=$1 where name=$2 returning name",
      [A + "/renomeado.gif", A + "/novo.GIF"])).rows.length === 0,
      "UPDATE continua bloqueado; substituição silenciosa não existe");
    ok((await db.query("delete from storage.objects where name='supino-reto-barra.gif' returning name")).rows.length === 0,
      "acervo global não pode ser excluído pela equipe");
    ok((await db.query("delete from storage.objects where name=$1 returning name", [B + "/outro.gif"])).rows.length === 0,
      "arquivo de outra academia não pode ser excluído");
    ok((await db.query("delete from storage.objects where name=$1 returning name", [A + "/novo.GIF"])).rows.length === 1,
      "equipe pode excluir o próprio upload");

    await as("", "anon");
    ok((await db.query("select name from storage.objects")).rows.length === 0,
      "anon não lista objetos; o bucket público libera apenas o download por URL");
    await denied(() => db.query("insert into storage.objects(bucket_id,name) values ('exercicios',$1)", [A + "/anon.gif"]),
      "anon não envia arquivos");

    await db.exec("reset role");
    const bucket = (await db.query("select * from storage.buckets where id='exercicios'")).rows[0];
    ok(bucket.public === true && Number(bucket.file_size_limit) === 8 * 1024 * 1024 &&
      bucket.allowed_mime_types.length === 1 && bucket.allowed_mime_types[0] === "image/gif",
      "bucket fica público para leitura e limitado a GIF de até 8 MB");
    console.log(checks + " verificações do banco de GIFs passaram (PGlite isolado; não é produção).");
  } finally {
    await db.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
