-- Run only after confirming dashboard project fqdquhhuvdrsreukfwai.
-- Catalog/journal only: no salary rows, employee identities or secrets are read.
-- No DDL, fixture, purge, backup or configuration change.
begin read only;
set local statement_timeout = '15s';
do $verify$
declare r record; actual text; fn record; policy record;
begin
  if (select count(*) from supabase_migrations.schema_migrations where version='20261013134624' and name='cache_live_access_policy_plans') <> 1 then
    raise exception 'Missing RLS performance migration journal';
  end if;
  for r in select * from (values
    ('private.current_app_role()','949c54b03f6261a9cdac7d3e1205b2f5'),
    ('private.employee_access_active(uuid)','a924ac6ee976b5147d713fadf405ba97'),
    ('private.current_profile_id()','a1f775326b3fc359cc74f75e2de7c9a1'),
    ('private.current_agency_id()','7e1ca24a2cd3920159abdce0ba421904'),
    ('private.is_global_reader()','a3caabca61e575c41629a145502521f4')
  ) as expected(signature,definition_md5) loop
    select p.*, l.lanname into fn from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(r.signature);
    if not found or fn.lanname <> 'plpgsql' or fn.provolatile <> 's' or not fn.prosecdef or not ('search_path=pg_catalog'=any(fn.proconfig)) then
      raise exception 'Unexpected security/function settings: %', r.signature;
    end if;
    if md5(pg_get_functiondef(to_regprocedure(r.signature))) <> r.definition_md5 then
      raise exception 'Function definition differs from verified local migration: %', r.signature;
    end if;
    if has_function_privilege('anon',r.signature,'execute') or not has_function_privilege('authenticated',r.signature,'execute') or not has_function_privilege('service_role',r.signature,'execute') then
      raise exception 'Unexpected function privileges: %', r.signature;
    end if;
  end loop;
  for r in select * from (values
    ('employees','employees_select_scoped','b3b3b4c2da9b550ceebef24b3cb8a07f','PERMISSIVE'),
    ('payslip_versions','payslip_versions_select_scoped','748b9b388a42e86d141d908b904ffb9d','PERMISSIVE'),
    ('profiles','profiles_select_self_or_global','8d83f7f30717310e591f611684934a1f','PERMISSIVE'),
    ('payslips','payslips_active_employee','ea273f775ecd66146d47b279bd62f1c2','RESTRICTIVE'),
    ('payslips','payslips_select_scoped','22ad0f14b076250014a45b5ebfa03bd4','PERMISSIVE'),
    ('employees','employees_active_self','bacff540b4ebde68327b2c3061203b08','RESTRICTIVE')
  ) as expected(table_name,policy_name,expression_md5,policy_mode) loop
    select * into policy from pg_policies where schemaname='public' and tablename=r.table_name and policyname=r.policy_name;
    if not found or policy.cmd <> 'SELECT' or policy.roles <> array['authenticated']::name[] or policy.permissive <> r.policy_mode or md5(policy.qual) <> r.expression_md5 then
      raise exception 'Policy differs from verified expression/scope: %', r.policy_name;
    end if;
    if not (select relrowsecurity from pg_class where oid=to_regclass('public.'||r.table_name)) then
      raise exception 'RLS disabled: %', r.table_name;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname='public' and policyname in ('payslips_within_retention','versions_within_retention','imports_within_retention','import_rows_within_retention','import_errors_within_retention') and permissive='RESTRICTIVE') <> 5 then
    raise exception 'Retention policies missing';
  end if;
end $verify$;
select 'PASS: migration journal, five live-access helpers, six SELECT policies, privileges and retention' as postflight;
rollback;
