-- Additive operational contract; does not activate staff, providers or sends.
begin;
create or replace function public.hq_ops_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  r text:=torque_hq.actor_role(); perms text[]:=torque_hq.permissions(r); who uuid:=auth.uid();
  outdoc jsonb:='{}'; sources jsonb:='{}'; domain text; granted boolean;
begin
  outdoc:=jsonb_build_object('version',1,'meta',jsonb_build_object('mode','server','generatedAt',now(),'commandsAvailable',true,'exportAuditAvailable',true),'now',now(),'role',r,'permissions',perms,'currentUserId',who,
    'operators',coalesce((select jsonb_agg(jsonb_build_object('id',u.user_id,'name',u.label)) from (
      select user_id,'Administrador '||left(user_id::text,8) label from public.saas_admins where r='admin' or user_id=who or r='engineering'
      union all select user_id,role||' '||left(user_id::text,8) from torque_hq.staff where enabled and (r='admin' or user_id=who or (r='engineering' and role='engineering'))
        and not exists(select 1 from public.saas_admins a where a.user_id=staff.user_id)
    ) u),'[]'));
  foreach domain in array array['accounts','subscriptions','invoices','payments','expenses','expensePayments','leads','events','cases','incidents','audit','integrations'] loop
    granted:=case
      when domain='accounts' then 'customers.read'=any(perms)
      when domain in ('subscriptions','invoices','payments','expenses','expensePayments') then 'finance.read'=any(perms)
      when domain='leads' then 'sales.read'=any(perms)
      when domain='cases' then 'support.read'=any(perms)
      when domain='incidents' then 'health.read'=any(perms)
      when domain='audit' then 'audit.read'=any(perms)
      when domain='integrations' then r in ('admin','finance','engineering') else false end;
    outdoc:=outdoc||jsonb_build_object(domain,'[]'::jsonb);
    sources:=sources||jsonb_build_object(domain,jsonb_build_object('status',case when granted and domain not in ('subscriptions','integrations') then 'ready' else 'unavailable' end,'updatedAt',case when granted then now() end,'origin',case when domain='accounts' then 'public.academias+saas_clientes' else 'torque_hq' end,'scope',case when domain in ('invoices','payments','expenses','expensePayments') then 'manualOnly' else 'authorizedOnly' end,'reason',case when not granted then 'forbidden' when domain in ('subscriptions','integrations') then 'integration_not_connected' else null end));
  end loop;
  if 'customers.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',case when r='viewer' then 'Conta' else a.nome end,'product',coalesce(c.tipo,'unknown'),'createdAt',a.criada,'status',coalesce(c.status,'unknown'),'trialStatus',a.assinatura_status,'trialEndsAt',case when a.assinatura_status='trial' and isfinite(a.assinatura_vence) then a.assinatura_vence end,'accessStatus',coalesce(a.assinatura_status,'unknown')) order by a.criada desc)
      from public.academias a left join public.saas_clientes c on c.academia_id=a.id
      where r in ('admin','finance','viewer') or (r='support' and exists(select 1 from torque_hq.staff_account_scope s where s.user_id=who and s.account_id=a.id))), '[]'));
    -- sales nao recebe lista global de clientes; leads ainda nao possuem vinculo de conversao.
  end if;
  if 'finance.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object(
      'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'label',label,'dueDate',due_date,'competenceDate',competence_date,'totalCents',total_cents,'status',status,'origin',origin,'createdAt',created_at) order by due_date,id) from torque_hq.invoices),'[]'),
      'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'invoiceId',invoice_id,'paidAt',paid_at,'amountCents',amount_cents,'kind',kind,'confirmed',confirmed,'origin',origin,'reference',reference) order by paid_at,id) from torque_hq.payments),'[]'),
      'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'payee',payee,'label',label,'dueDate',due_date,'totalCents',total_cents,'competenceDate',competence_date,'status',status,'origin','manual') order by due_date,id) from torque_hq.expenses),'[]'),
      'expensePayments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expenseId',expense_id,'paidAt',paid_at,'amountCents',amount_cents,'kind','payment','confirmed',true,'origin','manual','reference',reference) order by paid_at,id) from torque_hq.expense_payments),'[]'),
      'subscriptionRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'externalId',external_id,'effectiveAt',effective_at,'status',status,'note',note,'createdAt',created_at)) from torque_hq.subscription_requests),'[]'));
  else outdoc:=outdoc||jsonb_build_object('subscriptionRequests','[]'::jsonb); end if;
  if 'sales.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('leads',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'stage',stage,'source',source,'notes',notes,'createdAt',created_at,'updatedAt',updated_at,'owner',owner,'nextActionAt',next_action_at,'lossReason',loss_reason) order by created_at,id) from torque_hq.leads where r='admin' or owner=who),'[]'));
  end if;
  if 'support.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('cases',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'accountId',c.account_id,'subject',c.subject,'channel',c.channel,'priority',c.priority,'status',c.status,'owner',c.owner,'nextActionAt',c.next_action_at,'createdAt',c.created_at,'updatedAt',c.updated_at,'firstResponseAt',c.first_response_at,'resolvedAt',c.resolved_at,'incidentId',c.incident_id,
      'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'text',m.body,'visibility',m.visibility,'delivery',m.delivery,'createdAt',m.created_at,'actorId',m.actor_id) order by m.created_at,m.id) from torque_hq.case_messages m where m.case_id=c.id),'[]')) order by c.created_at,c.id) from torque_hq.cases c where r='admin' or
        ((owner=who or owner is null) and
          ((account_id is null and owner=who) or exists(select 1 from torque_hq.staff_account_scope s where s.user_id=who and s.account_id=c.account_id)))),'[]'));
  end if;
  if 'health.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('incidents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'severity',severity,'status',status,'owner',owner,'release',release,'accountIds',account_ids,'createdAt',created_at,'updatedAt',updated_at) order by created_at,id) from torque_hq.incidents),'[]'));
  end if;
  if 'audit.read'=any(perms) then
    outdoc:=outdoc||jsonb_build_object('audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actorId',actor_id,'actorRole',actor_role,'action',action,'objectId',object_id,'reason',reason,'idempotencyKey',idempotency_key,'payloadHash',payload_hash,'createdAt',created_at) order by created_at,id) from torque_hq.audit),'[]'));
  end if;
  sources:=sources||jsonb_build_object('finance',jsonb_build_object('status',case when 'finance.read'=any(perms) then 'ready' else 'unavailable' end,'updatedAt',case when 'finance.read'=any(perms) then now() end,'origin','manual','scope','manualOnly','reason',case when not 'finance.read'=any(perms) then 'forbidden' end));
  sources:=sources||jsonb_build_object('subscriptionRequests',jsonb_build_object('status',case when 'finance.read'=any(perms) then 'ready' else 'unavailable' end,'updatedAt',case when 'finance.read'=any(perms) then now() end,'origin','torque_hq','scope','requestsOnly','reason',case when not 'finance.read'=any(perms) then 'forbidden' end));
  if r='admin' or 'sales.read'=any(perms) or 'health.read'=any(perms) then
    sources:=jsonb_set(sources,'{events}',jsonb_build_object('status','unavailable','updatedAt',null,'origin','not_instrumented','reason','instrumentation_not_available'));
  end if;
  if 'support.read'=any(perms) then
    sources:=jsonb_set(sources,'{cases}',sources->'cases'||jsonb_build_object('scope','opsOnly','deliveryConnected',false,'message','Somente casos criados na nova central. O historico de saas_tickets e suporte_chamados ainda nao foi incorporado; esta fila nao representa todo o atendimento anterior.'));
  end if;
  sources:=sources||jsonb_build_object('legacySupport',jsonb_build_object('status','unavailable','origin','public.saas_tickets+public.suporte_chamados','updatedAt',null,'scope','legacyOnly',
    'reason',case when 'support.read'=any(perms) then 'migration_pending' else 'forbidden' end,
    'migrationPending','support.read'=any(perms),
    'message',case when 'support.read'=any(perms) then 'Historico anterior indisponivel neste contrato. Nenhuma conversa antiga foi lida, marcada como lida ou importada.' else 'Acesso nao autorizado a este dominio.' end));
  -- A successful snapshot timestamp is not a successful integration check.
  foreach domain in array array['subscriptions','integrations'] loop
    sources:=jsonb_set(sources,array[domain,'updatedAt'],'null'::jsonb);
  end loop;
  outdoc:=outdoc||jsonb_build_object('sources',sources);
  return outdoc;
end $$;

-- Records an authorized export request, not a claim that the device saved a file.
-- No customer rows, CSV contents, delivery or financial effects are accepted.
create or replace function public.hq_ops_export_audit(p_report text,p_filters jsonb,p_snapshot_at timestamptz,p_rows integer,p_content_sha256 text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=torque_hq.actor_role(); who uuid:=auth.uid(); perms text[]:=torque_hq.permissions(r);
 needed text[]; k text; body jsonb; hashed text; previous torque_hq.commands%rowtype; obj uuid:=gen_random_uuid(); reply jsonb;
begin
 if not 'reports.export'=any(perms) then raise exception using errcode='42501',message='Exportacao nao autorizada';end if;
 needed:=case
  when p_report in ('trials') then array['customers.read']
  when p_report in ('accounts') then array['customers.read']
  when p_report in ('subscriptions','mrr') then array['customers.read','finance.read']
  when p_report in ('cash','receivables','payables','competence') then array['finance.read']
  when p_report in ('support','support-history') then array['support.read']
  when p_report in ('incidents','incident-history') then array['health.read']
  when p_report='pipeline' then array['sales.read']
  when p_report='funnel' then array['sales.read','customers.read','finance.read'] else null end;
 if needed is null or not needed<@perms then raise exception using errcode='42501',message='Relatorio nao autorizado';end if;
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or pg_column_size(p_filters)>4096 then raise exception 'Filtros invalidos';end if;
 for k in select jsonb_object_keys(p_filters) loop
  if not k=any(array['from','to','timeZone','product','metric','rowStatus','cohort','accountId','accountStatus','status']) or jsonb_typeof(p_filters->k)<>'string' or length(p_filters->>k)>100 then raise exception 'Filtros invalidos';end if;
 end loop;
 if p_snapshot_at is null or not isfinite(p_snapshot_at) or p_snapshot_at>now()+interval '5 minutes' or p_snapshot_at<now()-interval '1 day'
   or p_rows is null or p_rows<0 or p_rows>100000 or p_content_sha256 is null or p_content_sha256 !~ '^[a-f0-9]{64}$'
   or p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9:_-]{8,120}$' then raise exception 'Exportacao invalida';end if;
 body:=jsonb_build_object('type','report.export.requested','report',p_report,'filters',p_filters,'snapshotAt',p_snapshot_at,'rows',p_rows,'contentSha256',p_content_sha256);
 hashed:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
 insert into torque_hq.commands(actor_id,idempotency_key,payload_hash) values(who,p_idempotency_key,hashed) on conflict do nothing;
 select * into previous from torque_hq.commands where actor_id=who and idempotency_key=p_idempotency_key for update;
 if previous.payload_hash<>hashed then raise exception using errcode='22023',message='Chave reutilizada com outro conteudo';end if;
 if previous.result is not null then return previous.result||jsonb_build_object('replayed',true);end if;
 insert into torque_hq.audit(id,actor_id,actor_role,action,object_id,reason,idempotency_key,payload_hash,after_value)
 values(obj,who,r,'report.export.requested',obj,'Exportacao solicitada no HQ; salvamento no aparelho nao comprovado',p_idempotency_key,hashed,body);
 reply:=jsonb_build_object('ok',true,'id',obj,'replayed',false,'effect','export_request_recorded');
 update torque_hq.commands set result=reply where actor_id=who and idempotency_key=p_idempotency_key;
 return reply;
end $$;
revoke all on function public.hq_ops_export_audit(text,jsonb,timestamptz,integer,text,text) from public,anon,service_role;
grant execute on function public.hq_ops_export_audit(text,jsonb,timestamptz,integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

