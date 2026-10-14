do $$ begin
 if not exists(select 1 from public.employees where id='b3000000-0000-4000-8000-000000000001' and employee_id='LEGACY-AB' and profile_id='b2000000-0000-4000-8000-000000000001') then raise exception 'UUID/profile not preserved'; end if;
 if not exists(select 1 from public.employee_invitations where token_hash='identity-migration-token' and employee_id='LEGACY-AB') then raise exception 'invitation not preserved'; end if;
 if not exists(select 1 from public.payroll_import_rows where import_id='b4000000-0000-4000-8000-000000000001' and employee_id='LEGACY-AB' and normalized_data->>'employeeId'='LEGACY-AB') then raise exception 'import not normalized'; end if;
 if (select unknown_employee_count from public.payroll_imports where id='b4000000-0000-4000-8000-000000000001')<>0 then raise exception 'unknown employee count not refreshed'; end if;
 raise notice 'PASS: migration UUID/profile/invitation token/import preserved and unknown count recalculated';
end $$;
