-- Show phone numbers as +91 98765 43210 in agreements
create or replace function public.format_phone_in(p text)
returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
    then '+91 ' || substr(right(regexp_replace(p, '\D', '', 'g'), 10), 1, 5) || ' ' || substr(right(regexp_replace(p, '\D', '', 'g'), 10), 6)
    else coalesce(p, '') end;
$$;

do $$
declare src text;
begin
  select pg_get_functiondef('public.render_agreement(uuid)'::regprocedure) into src;
  src := replace(src, '''customer_phone'', coalesce(p.phone, ''''),', '''customer_phone'', public.format_phone_in(p.phone),');
  execute src;
end $$;

select private.pin_timezone();
