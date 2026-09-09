from pathlib import Path
root = Path.cwd()
old = "  if tg_op = 'UPDATE' then\n    if new.dados is not distinct from old.dados"
new = """  if tg_op = 'UPDATE' then
    -- Revogação canônica remove pacote/login; não é publicação. A exceção
    -- exige acesso cortado e pacote NULL, sem trocar aluno ou academia.
    if new.revogado_em is not null and new.dados is null
       and new.token is not distinct from old.token
       and new.academia_id is not distinct from old.academia_id then return new; end if;
    if new.dados is not distinct from old.dados"""
for name in ['migrations/20260909_ptstudio_cas_v807.sql', 'supabase-setup.sql']:
    p=root/name; text=p.read_text(); assert text.count(old)==1, name
    p.write_text(text.replace(old,new,1))
p=root/'tests/sql/test-reliability.py'; text=p.read_text()
old='retorno jsonb,atualizado timestamptz not null default now(),revogado_em timestamptz);'
new="""retorno jsonb,atualizado timestamptz not null default now(),revogado_em timestamptz,
 login text not null default '',senha text not null default '');
create table push_subs(token text);
alter table push_subs enable row level security;"""
assert text.count(old)==1; text=text.replace(old,new,1)
old="'app_retorno_mescla', 'app_aluno_ativo', 'app_aluno_devolve']"
new="'app_lista_mescla', 'app_retorno_mescla', 'app_aluno_ativo', 'app_aluno_devolve', 'aluno_revoga_acesso', 'aluno_religa_acesso', 'app_aluno_faxina']"
assert text.count(old)==1; text=text.replace(old,new,1)
old='grant execute on function app_aluno_devolve(text,jsonb) to anon,authenticated;'
new="""grant execute on function app_aluno_devolve(text,jsonb) to anon,authenticated;
grant execute on function aluno_revoga_acesso(text,boolean) to authenticated;
grant execute on function aluno_religa_acesso(text) to authenticated;
grant execute on function app_aluno_faxina(text[],uuid,text) to authenticated;"""
assert text.count(old)==1; text=text.replace(old,new,1)
old="for name in ('dados_carimba', 'dados_base_insercao_valida', 'app_aluno_valida_fonte'):"
new='''# Fluxos canônicos completos, não só a edição direta da marca de revogação.
sql(f"update app_aluno set login='fixture',senha='fixture' where token='{TOKEN}'; insert into push_subs values('{TOKEN}');")
returned = sql(f"select retorno::text from app_aluno where token='{TOKEN}';")
out = json.loads(sql(f"select aluno_revoga_acesso('{TOKEN}',false);", role='authenticated'))
ok(out.get('revogado') is True, 'RPC canônica corta acesso e remove pacote sem conflito de publicação')
ok(sql(f"select dados is null and revogado_em is not null and login='' and senha='' from app_aluno where token='{TOKEN}';") == 't', 'revogação apaga pacote e credenciais')
ok(sql(f"select retorno::text from app_aluno where token='{TOKEN}';") == returned and sql(f"select count(*) from push_subs where token='{TOKEN}';") == '0', 'revogação conserva retorno e remove inscrição push')
ok(json.loads(sql(f"select app_aluno_devolve('{TOKEN}','{{}}');", role='anon')).get('erro') == 'sem_acesso', 'aluno revogado pela RPC não devolve dados')
# Ter revogado_em não dispensa revisão quando ainda há um pacote na operação.
sql(f"update app_aluno set dados='{{}}' where token='{TOKEN}';", role='authenticated', fail='PT409')
ok(True, 'marca de revogação não permite escrever pacote sem revisão')
out = json.loads(sql("select aluno_revoga_acesso('nutri-ficticio-807',false);", role='authenticated'))
ok(bool(out.get('erro')) and sql("select revogado_em is null from app_aluno where token='nutri-ficticio-807';") == 't', 'RPC recusa cortar acesso de outra equipe')
out = json.loads(sql(f"select aluno_religa_acesso('{TOKEN}');", role='authenticated'))
ok(out.get('republicar') is True and sql(f"select dados is null and revogado_em is null from app_aluno where token='{TOKEN}';") == 't', 'devolver acesso não ressuscita pacote apagado')
ok(publish(package(revision())) == TOKEN, 'republicação após devolver acesso usa revisão confirmada')
sql(f"update app_aluno set dados=null where token='{TOKEN}';", role='authenticated', fail='PT409')
ok(True, 'apagar pacote ativo não contorna a barreira de publicação')
# Segundo retorno chama as funções reais de mescla de listas.
sql(f"select app_aluno_devolve('{TOKEN}','{{\\\"feitos\\\":[\\\"2026-09-08\\\"]}}');", role='anon')
sql(f"select app_aluno_devolve('{TOKEN}','{{\\\"feitos\\\":[\\\"2026-09-09\\\"]}}');", role='anon')
actual = json.loads(sql(f"select retorno->'feitos' from app_aluno where token='{TOKEN}';"))
ok(set(actual) == {'2026-09-08','2026-09-09'}, 'retornos consecutivos preservam os dias anteriores pela mescla canônica')
sql(f"insert into push_subs values('{TOKEN}');")
out = json.loads(sql(f"select app_aluno_faxina(array[]::text[],'{AID}','personal');", role='authenticated'))
ok(out.get('revogados') == 1 and sql(f"select dados is null and revogado_em is not null from app_aluno where token='{TOKEN}';") == 't', 'faxina canônica revoga o pacote Personal inteiro')
ok(sql("select revogado_em is null and dados is not null from app_aluno where token='nutri-mesma-equipe-807';") == 't' and sql(f"select count(*) from push_subs where token='{TOKEN}';") == '0', 'faxina remove push do revogado e conserva Nutri da mesma equipe')
for name in ('dados_carimba', 'dados_base_insercao_valida', 'app_aluno_valida_fonte'):'''
assert text.count(old)==1; text=text.replace(old,new,1)
compile(text,str(p),'exec');p.write_text(text)
