-- Business dates are Indian dates. Session timezone can be UTC (pooler / API roles),
-- so every SNIREVA function pins its own timezone. Re-run private.pin_timezone()
-- at the end of any migration that adds functions.

create or replace function private.pin_timezone()
returns int
language plpgsql security definer set search_path = public
as $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname in ('public', 'private')
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
       and p.proname <> 'pin_timezone'
  loop
    execute format('alter function %s set timezone = %L', f.sig, 'Asia/Kolkata');
    n := n + 1;
  end loop;
  return n;
end $$;

select private.pin_timezone();
