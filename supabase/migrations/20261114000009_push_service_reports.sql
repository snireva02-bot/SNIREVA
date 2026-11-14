-- M6: push delivery for every in-app notification
create or replace function private.on_notification_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.call_edge('send-push', jsonb_build_object('id', new.id));
  return new;
end $$;
create trigger send_push after insert on public.notifications
  for each row execute function private.on_notification_insert();

-- Customer saves / clears their device token (also allowed via direct update; RPC is convenient)
create or replace function public.set_fcm_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- one device token belongs to one account
  update public.profiles set fcm_token = null where fcm_token = p_token and id <> auth.uid();
  update public.profiles set fcm_token = nullif(p_token, '') where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- M7: service requests – notify customer on status change / assignment
-- ---------------------------------------------------------------------------
create or replace function private.on_service_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare label text;
begin
  if new.status is distinct from old.status then
    label := case new.status
      when 'assigned' then 'A technician has been assigned'
      when 'in_progress' then 'Work has started'
      when 'resolved' then 'Marked as resolved'
      when 'closed' then 'Closed'
      else 'Reopened' end;
    perform public.notify(new.user_id, 'Service request update',
      format('%s: %s.', initcap(replace(new.category::text, '_', ' ')), label)
        || case when new.admin_notes is not null and new.status in ('resolved', 'closed') then ' ' || new.admin_notes else '' end,
      jsonb_build_object('type', 'service', 'status', new.status, 'service_id', new.id, 'route', '/service/' || new.id));
  end if;
  return new;
end $$;
create trigger notify_service_update after update on public.service_requests
  for each row execute function private.on_service_update();

-- Auto-move to 'assigned' when staff picks an assignee on an open request
create or replace function private.service_autoassign()
returns trigger language plpgsql as $$
begin
  if new.assigned_to is not null and old.assigned_to is null and new.status = 'open' then
    new.status := 'assigned';
  end if;
  return new;
end $$;
create trigger service_autoassign before update on public.service_requests
  for each row execute function private.service_autoassign();

-- ---------------------------------------------------------------------------
-- M8: dashboard + reports
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  st public.settings;
  week_start date := date_trunc('week', current_date)::date;  -- Monday
  out jsonb;
begin
  perform public.require_staff();
  select * into st from public.settings where id = 1;

  with due as (
    select r.id, r.status, r.next_due_date, d.*
      from public.rentals r, lateral public.rental_amount_due(r.id) d
     where r.status in ('active', 'overdue')
  )
  select jsonb_build_object(
    'scooters', (select jsonb_build_object(
        'total', count(*) filter (where status <> 'retired'),
        'available', count(*) filter (where status = 'available'),
        'rented', count(*) filter (where status = 'rented'),
        'reserved', count(*) filter (where status = 'reserved'),
        'maintenance', count(*) filter (where status = 'under_maintenance')) from public.scooters),
    'active_customers', (select count(distinct user_id) from public.rentals where status in ('active', 'overdue')),
    'collected_week', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and paid_at >= week_start),
    'collected_today', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and paid_at >= current_date),
    'pending_amount', (select coalesce(sum(outstanding), 0) from due),
    'overdue_amount', (select coalesce(sum(outstanding), 0) from due where status = 'overdue'),
    'overdue_count', (select count(*) from due where status = 'overdue'),
    'due_soon_count', (select count(*) from due where status = 'active' and next_due_date between current_date and current_date + 3),
    'due_soon_amount', (select coalesce(sum(total), 0) from due where status = 'active' and next_due_date between current_date and current_date + 3),
    'pending_kyc', (select count(*) from public.profiles where role = 'customer' and kyc_status in ('submitted', 'under_review')),
    'pending_bookings', (select count(*) from public.booking_requests where status = 'pending'),
    'awaiting_handover', (select count(*) from public.rentals where status = 'pending_handover'),
    'open_service', (select count(*) from public.service_requests where status in ('open', 'assigned', 'in_progress')),
    'week_start', week_start
  ) into out;
  return out;
end $$;

-- Collections grouped by day / week / month (IST)
create or replace function public.report_collections(p_from date, p_to date, p_group text default 'day')
returns table (period date, total numeric, online numeric, offline numeric, payments bigint, rent numeric, deposit numeric, late_fees numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(array['manager', 'owner']::public.user_role[]) then raise exception 'Managers only' using errcode = '42501'; end if;
  if p_group not in ('day', 'week', 'month') then raise exception 'Invalid grouping'; end if;
  return query
  select date_trunc(p_group, p.paid_at)::date,
         sum(p.amount), sum(p.amount) filter (where p.method = 'upi_gateway'), sum(p.amount) filter (where p.method <> 'upi_gateway'),
         count(*), sum(p.amount - p.late_fee_amount) filter (where p.type = 'rent'), sum(p.amount) filter (where p.type = 'deposit'),
         sum(p.late_fee_amount) + coalesce(sum(p.amount) filter (where p.type = 'late_fee'), 0)
    from public.payments p
   where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to + 1
   group by 1 order by 1;
end $$;

-- Per-customer totals in a date range
create or replace function public.report_customers(p_from date, p_to date)
returns table (user_id uuid, full_name text, phone text, payments bigint, total numeric, last_paid timestamptz, outstanding numeric, rental_status public.rental_status)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(array['manager', 'owner']::public.user_role[]) then raise exception 'Managers only' using errcode = '42501'; end if;
  return query
  select pr.id, pr.full_name, pr.phone,
         count(p.id), coalesce(sum(p.amount), 0), max(p.paid_at),
         coalesce((select sum(d.outstanding) from public.rentals r2, lateral public.rental_amount_due(r2.id) d
                    where r2.user_id = pr.id and r2.status in ('active', 'overdue')), 0),
         (select r3.status from public.rentals r3 where r3.user_id = pr.id order by r3.created_at desc limit 1)
    from public.profiles pr
    left join public.payments p on p.user_id = pr.id and p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to + 1
   where pr.role = 'customer'
   group by pr.id
  having count(p.id) > 0 or exists (select 1 from public.rentals r where r.user_id = pr.id and r.status in ('active', 'overdue'))
   order by 5 desc;
end $$;

-- Outstanding / overdue list
create or replace function public.report_outstanding()
returns table (rental_id uuid, full_name text, phone text, scooter_code text, status public.rental_status, next_due_date date,
               days_late int, weeks_due int, late_fee numeric, outstanding numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.require_staff();
  return query
  select r.id, pr.full_name, pr.phone, s.code, r.status, r.next_due_date, d.days_late, d.weeks_due, d.late_fee, d.outstanding
    from public.rentals r
    join public.profiles pr on pr.id = r.user_id
    join public.scooters s on s.id = r.scooter_id,
    lateral public.rental_amount_due(r.id) d
   where r.status in ('active', 'overdue') and (d.outstanding > 0 or r.next_due_date <= current_date + 3)
   order by r.next_due_date;
end $$;

-- Scooter utilisation + maintenance in a date range
create or replace function public.report_utilisation(p_from date, p_to date)
returns table (scooter_id uuid, code text, model text, status public.scooter_status, rented_days int, range_days int,
               utilisation numeric, revenue numeric, rentals bigint, service_requests bigint, maintenance_notes text)
language plpgsql stable security definer set search_path = public
as $$
declare n int := (p_to - p_from) + 1;
begin
  if not public.has_role(array['manager', 'owner']::public.user_role[]) then raise exception 'Managers only' using errcode = '42501'; end if;
  return query
  select s.id, s.code, s.model, s.status,
         coalesce(sum(greatest(0, least(coalesce(r.ended_at::date, current_date), p_to) - greatest(r.start_date, p_from) + 1)), 0)::int,
         n,
         round(100.0 * coalesce(sum(greatest(0, least(coalesce(r.ended_at::date, current_date), p_to) - greatest(r.start_date, p_from) + 1)), 0) / n, 1),
         coalesce((select sum(p.amount) from public.payments p join public.rentals r2 on r2.id = p.rental_id
                    where r2.scooter_id = s.id and p.status = 'paid' and p.type in ('rent', 'late_fee') and p.paid_at >= p_from and p.paid_at < p_to + 1), 0),
         count(r.id),
         (select count(*) from public.service_requests sr join public.rentals r3 on r3.id = sr.rental_id
           where r3.scooter_id = s.id and sr.created_at >= p_from and sr.created_at < p_to + 1),
         s.maintenance_notes
    from public.scooters s
    left join public.rentals r on r.scooter_id = s.id and r.start_date is not null
         and r.start_date <= p_to and coalesce(r.ended_at::date, current_date) >= p_from
   where s.status <> 'retired' or exists (select 1 from public.rentals x where x.scooter_id = s.id)
   group by s.id
   order by s.code;
end $$;

-- Owner: explicitly apply the current settings rent to running rentals (otherwise snapshots are kept)
create or replace function public.apply_current_rent(p_rental_ids uuid[] default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  if not public.has_role(array['owner']::public.user_role[]) then raise exception 'Owner only' using errcode = '42501'; end if;
  update public.rentals r
     set weekly_rent = coalesce(s.weekly_rent, st.weekly_rent)
    from public.scooters s, public.settings st
   where s.id = r.scooter_id and st.id = 1
     and r.status in ('active', 'overdue', 'pending_agreement', 'pending_handover')
     and (p_rental_ids is null or r.id = any (p_rental_ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- Owner: new agreement template version
create or replace function public.save_agreement_template(p_body text)
returns int
language plpgsql security definer set search_path = public
as $$
declare v int;
begin
  if not public.has_role(array['owner']::public.user_role[]) then raise exception 'Owner only' using errcode = '42501'; end if;
  if length(coalesce(trim(p_body), '')) < 200 then raise exception 'Agreement text looks too short' using errcode = 'P0001'; end if;
  select coalesce(max(version), 0) + 1 into v from public.agreement_templates;
  insert into public.agreement_templates (version, body, created_by) values (v, p_body, auth.uid());
  return v;
end $$;

select private.pin_timezone();
