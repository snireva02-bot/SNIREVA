-- Fix: scooters with no rentals in range showed 100% utilisation (left join null handling).
do $$
declare src text;
begin
  select pg_get_functiondef('public.report_utilisation(date, date)'::regprocedure) into src;
  src := replace(src,
    'coalesce(sum(greatest(0, least(coalesce(r.ended_at::date, current_date), p_to) - greatest(r.start_date, p_from) + 1)), 0)',
    'coalesce(sum(case when r.id is null then 0 else greatest(0, least(coalesce(r.ended_at::date, current_date), p_to) - greatest(r.start_date, p_from) + 1) end), 0)');
  execute src;

  -- Fix: empty damage notes produced "DD Mon YYYY: " maintenance lines
  select pg_get_functiondef('public.complete_return(uuid, jsonb, public.scooter_status, text)'::regprocedure) into src;
  src := replace(src, 'coalesce(p_checklist ->> ''damage_notes'', ''Sent for maintenance after return'')',
                      'coalesce(nullif(trim(p_checklist ->> ''damage_notes''), ''''), ''Sent for maintenance after return'')');
  execute src;
end $$;
update public.scooters set maintenance_notes = nullif(regexp_replace(maintenance_notes, '(^|\n)\d{1,2} \w{3} \d{4}: ?(\n|$)', '\1', 'g'), '');
select private.pin_timezone();
