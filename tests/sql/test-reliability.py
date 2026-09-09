#!/usr/bin/env python3
"""Integração PostgreSQL real. Recusa qualquer destino fora do serviço local de CI.
Fixtures sintéticas; não usa URL, segredo, projeto ou dados do Supabase.
"""
from pathlib import Path
import json
import os
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('PGDATABASE') != 'reliability_test' or os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost'):
    raise SystemExit('Use somente o PostgreSQL local descartável reliability_test.')
CMD = ['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
AID = '00000000-0000-0000-0000-000000000001'
BID = '00000000-0000-0000-0000-000000000002'
TOKEN = 'aluno-ficticio-cas-807'
K = 'mtapp:ptStudio'
checks = 0


def literal(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def sql(text, role=None, aid=AID, fail=None):
    prefix = 'set test.academia = ' + literal(aid) + ';'
    if role:
        assert role in ('anon', 'authenticated')
        prefix += 'set role ' + role + ';'
    r = subprocess.run(CMD, input=prefix + text, text=True, capture_output=True, timeout=15)
    if fail:
        assert r.returncode != 0 and fail in r.stderr, (text, r.stdout, r.stderr)
    else:
        assert r.returncode == 0, (text, r.stdout, r.stderr)
    return r.stdout.strip()


def ok(condition, name):
    global checks
    assert condition, name
    checks += 1
    print('OK PostgreSQL ' + name, flush=True)


def revision():
    return sql(f"select atualizado::text from dados where academia_id='{AID}' and chave='{K}';")


def value(note):
    return {'alunos': [{'id': 'aluno-ficticio', 'appTokenP': TOKEN}],
            'treinosV2': {'aluno-ficticio': {'fichas': []}},
            'questionarios': [{'id': 'quest-ficticio'}], 'nota': note}


def upsert_statement(note, base, aid=AID, key=K):
    return f"""insert into dados(academia_id,chave,valor,base_atualizado,atualizado)
      values ({literal(aid)},{literal(key)},{literal(json.dumps(value(note)))}::jsonb,{literal(base)},'1900-01-01')
      on conflict (academia_id,chave) do update set valor=excluded.valor,
        base_atualizado=excluded.base_atualizado,atualizado=excluded.atualizado
      returning atualizado::text;"""


def upsert(note, base, **kwargs):
    aid = kwargs.pop('aid', AID)
    key = kwargs.pop('key', K)
    return sql(upsert_statement(note, base, aid, key), role='authenticated', aid=aid, **kwargs)


def package(base, student='aluno-ficticio', token=TOKEN):
    return {'html': '', 'sourceKey': K, 'sourceUpdatedAt': base,
            'dados': {'a': {'id': student, 'appTokenP': token}}}


def publish_statement(pac, token=TOKEN, aid=AID):
    return f"""insert into app_aluno(token,academia_id,dados)
      values ({literal(token)},{literal(aid)},{literal(json.dumps(pac))}::jsonb)
      on conflict(token) do update set dados=excluded.dados,academia_id=excluded.academia_id
      returning token;"""


def publish(pac, token=TOKEN, aid=AID, **kwargs):
    return sql(publish_statement(pac, token, aid), role='authenticated', aid=aid, **kwargs)


# Refuse a reused database instead of dropping anything that could belong to someone.
ok(sql('select current_database()') == 'reliability_test', 'destino descartável confirmado')
ok(sql("select count(*) from information_schema.tables where table_schema='public'") == '0', 'banco começa vazio')
sql('''
create role anon;
create role authenticated;
create table dados(academia_id uuid not null,chave text not null,valor jsonb,
 atualizado timestamptz not null default now(),primary key(academia_id,chave));
create table app_aluno(token text primary key,academia_id uuid not null,dados jsonb,
 retorno jsonb,atualizado timestamptz not null default now(),revogado_em timestamptz);
create table dados_hist(id bigint generated always as identity primary key,
 academia_id uuid not null,chave text not null,valor jsonb,atualizado timestamptz,
 guardado_em timestamptz not null default now());
create table app_aluno_hist(id bigint generated always as identity primary key,
 academia_id uuid,token text not null,retorno jsonb,atualizado timestamptz,
 guardado_em timestamptz not null default now());
-- Simula só a identidade da sessão, mantendo a mesma chamada nas políticas reais.
create function public.minhas_academias() returns setof uuid language sql stable
 as $$ select nullif(current_setting('test.academia',true),'')::uuid $$;
alter table dados enable row level security;
alter table app_aluno enable row level security;
alter table dados_hist enable row level security;
alter table app_aluno_hist enable row level security;
create policy dados_membros on dados for all using (academia_id in(select public.minhas_academias()))
 with check(academia_id in(select public.minhas_academias()));
create policy app_aluno_membros on app_aluno for all using (academia_id in(select public.minhas_academias()))
 with check(academia_id in(select public.minhas_academias()));
grant usage on schema public to authenticated,anon;
grant select,insert,update,delete on dados,app_aluno to authenticated;
''')
source = (ROOT / 'supabase-setup.sql').read_text()
# Copia as funções canônicas, não uma reimplementação do histórico/retorno.
for name in ['dados_guarda_hist', 'app_aluno_guarda_hist', 'app_retorno_mescla', 'app_aluno_ativo', 'app_aluno_devolve']:
    found = list(re.finditer(r'create or replace function public\.' + name + r'\([\s\S]*?\$\$;', source, re.I))
    assert found, name
    sql(found[-1].group(0))
sql('''
create trigger dados_hist_tg before update or delete on dados for each row execute function dados_guarda_hist();
create trigger app_aluno_hist_tg before update or delete on app_aluno for each row execute function app_aluno_guarda_hist();
grant execute on function app_aluno_devolve(text,jsonb) to anon,authenticated;
''')
migration = (ROOT / 'migrations/20260909_ptstudio_cas_v807.sql').read_text()
sql(migration)
sql(migration)
ok(True, 'migração pode ser reaplicada sem apagar políticas ou histórico')

base = upsert('inicial', None)
ok(bool(base) and not base.startswith('1900'), 'inclusão inicial usa relógio do servidor')
ok(sql("select base_atualizado is null from dados where chave='mtapp:ptStudio'") == 't', 'inclusão não persiste precondição')
new = upsert('primeira edição', base)
ok(new != base, 'upsert válido passa por BEFORE INSERT e UPDATE')
ok(sql("select base_atualizado is null from dados where chave='mtapp:ptStudio'") == 't', 'atualização remove precondição depois de validar')
history = sql('select count(*) from dados_hist')
upsert('antiga', base, fail='PT409')
upsert('sem revisão', None, fail='PT409')
sql(f"insert into dados(academia_id,chave,valor) values('{AID}','{K}','{{}}') on conflict(academia_id,chave) do update set valor=excluded.valor;", role='authenticated', fail='PT409')
ok(sql("select valor->>'nota' from dados where chave='mtapp:ptStudio'") == 'primeira edição', 'clientes antigos e base obsoleta não alteram a versão aceita')
ok(sql('select count(*) from dados_hist') == history, 'conflito recusado não polui histórico')
sql(f"update dados set valor=jsonb_set(valor,'{{nota}}','\"direto\"'),base_atualizado={literal(new)} where chave='{K}' returning atualizado;", role='authenticated')
upsert('direto antigo', new, fail='PT409')
ok(True, 'UPDATE direto obedece à mesma comparação de revisão')
sql(f"""do $$ declare a timestamptz; b timestamptz; c timestamptz;
begin
 select atualizado into a from dados where chave='{K}';
 update dados set base_atualizado=a where chave='{K}' returning atualizado into b;
 update dados set base_atualizado=b where chave='{K}' returning atualizado into c;
 if not (a<b and b<c) then raise exception 'revisões não avançaram'; end if;
end $$;""", role='authenticated')
ok(True, 'duas gravações na mesma transação têm revisões diferentes')
upsert('nutri 1', None, key='mtapp:ntStudio')
upsert('nutri 2', None, key='mtapp:ntStudio')
ok(True, 'outros agregados continuam compatíveis com clientes anteriores')
upsert('ressurreição inválida', base, aid=BID, fail='PT409')
ok(sql(f"select count(*) from dados where academia_id='{BID}'") == '0', 'revisão antiga não recria agregado inexistente')
sql(f"update dados set chave='outro',base_atualizado={literal(revision())} where chave='{K}';", role='authenticated', fail='PT409')
ok(True, 'renomear chave não contorna CAS')

# Concorre com uma transação que efetivamente já segura o lock de linha.
base = revision()
env = dict(os.environ, PGAPPNAME='reliability-writer-a')
writer = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
writer.stdin.write('begin; set role authenticated; set test.academia=' + literal(AID) + ';' + upsert_statement('sessão A', base) + 'select pg_sleep(2); commit;')
writer.stdin.close()
for _ in range(100):
    if sql("select count(*) from pg_stat_activity where application_name='reliability-writer-a' and wait_event='PgSleep'") == '1':
        break
    time.sleep(.025)
else:
    raise AssertionError('sessão A não chegou ao ponto de sincronização')
upsert('sessão B atrasada', base, fail='PT409')
writer.wait(timeout=10)
ok(writer.returncode == 0 and sql("select valor->>'nota' from dados where chave='mtapp:ptStudio'") == 'sessão A', 'duas conexões: só a primeira revisão é aceita após disputar o lock')

base = revision()
ok(publish(package(base)) == TOKEN, 'pacote Personal confirmado publica normalmente')
upsert('prescrição nova', base)
publish(package(base), fail='PT409')
ok(publish(package(revision())) == TOKEN, 'pacote atualizado passa e publicação atrasada é recusada')
legacy = {'html': '<p>Pacote antigo</p>', 'dados': {'a': {'id': 'aluno-ficticio', 'appTokenP': TOKEN}}}
publish(legacy, fail='PT409')
publish({'html': '<p>Formato antigo sem dados</p>'}, fail='PT409')
ok(True, 'clientes Personal legados não sobrescrevem por falta de sourceUpdatedAt')
publish(package('data-inválida'), fail='PT409')
publish(package(revision(), student='outro-aluno'), fail='PT409')
publish(package(revision(), token='token-forjado'), token='token-forjado', fail='PT409')
ok(True, 'fonte inválida ou aluno/token divergente é recusado')
# Não marcar Nutri/Academia como Personal só porque compartilham a mesma tabela.
publish({'dados': {'tipo': 'nutri', 'a': {'id': 'paciente'}}}, token='nutri-ficticio-807', aid=BID)
publish({'html': '<p>App Academia</p>', 'stamp': 'fixture'}, token='academia-ficticia-807', aid=BID)
publish({'dados': {'tipo': 'nutri', 'a': {'id': 'outro-paciente'}}}, token='nutri-mesma-equipe-807')
ok(True, 'Nutri e Academia publicam sem revisão do Personal, inclusive na mesma equipe')
# RPC canônica do aluno não tem permissão direta nas tabelas e segue funcionando.
base = revision()
upsert('painel mudou sem republicar', base)
out = sql(f"select app_aluno_devolve('{TOKEN}','{{\"feitos\":[\"2026-09-09\"]}}');", role='anon')
ok(json.loads(out).get('ok') is True, 'retorno do aluno continua funcionando por RPC com pacote anterior')
sql(f"update app_aluno set retorno='{{}}' where token='{TOKEN}';", role='authenticated')
ok(int(sql('select count(*) from app_aluno_hist')) > 0, 'histórico de retorno continua guardando redução de registros')
sql(f"update app_aluno set revogado_em=now() where token='{TOKEN}';", role='authenticated')
out = sql(f"select app_aluno_devolve('{TOKEN}','{{\"feitos\":[\"2026-09-09\"]}}');", role='anon')
ok(json.loads(out).get('erro') == 'sem_acesso', 'revogação permanece efetiva sem republicar pacote')
sql(f"update app_aluno set revogado_em=null where token='{TOKEN}';", role='authenticated')
ok(sql(f"select count(*) from app_aluno where academia_id='{BID}';", role='authenticated') == '0', 'RLS não expõe outra equipe')
sql("select * from dados", role='anon', fail='42501')
sql(f"update dados set valor='{{}}' where academia_id='{BID}'", role='authenticated')
ok(sql(f"select count(*) from dados where academia_id='{BID}'") == '0', 'sem permissão não há leitura anônima nem gravação em outra equipe')

# A validação da fonte espera uma gravação concorrente já iniciada e rejeita
# a revisão que deixou de ser atual ao liberar o lock.
base = revision()
writer = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
writer.stdin.write('begin; set role authenticated; set test.academia=' + literal(AID) + ';' + upsert_statement('durante publicação', base) + 'select pg_sleep(2); commit;')
writer.stdin.close()
for _ in range(100):
    if sql("select count(*) from pg_stat_activity where application_name='reliability-writer-a' and wait_event='PgSleep'") == '1':
        break
    time.sleep(.025)
else:
    raise AssertionError('escritor concorrente não sincronizou')
publish(package(base), fail='PT409')
writer.wait(timeout=10)
ok(writer.returncode == 0, 'publicação concorrente revalida depois de esperar o lock da fonte')
ok(publish(package(revision())) == TOKEN, 'publicação volta a funcionar ao usar revisão atual')
for name in ('dados_carimba', 'dados_base_insercao_valida', 'app_aluno_valida_fonte'):
    ok(sql(f"select has_function_privilege('anon','public.{name}()','execute') or has_function_privilege('authenticated','public.{name}()','execute')") == 'f', name + ' sem EXECUTE direto para clientes')
print(f'{checks} verificações PostgreSQL reais passaram; dados exclusivamente fictícios.', flush=True)
