-- M4: digital agreement, handover and return checklists

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Private config + Edge Function caller (used for PDFs and push).
-- Not exposed through the API (schema "private" is not in PostgREST).
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key text primary key,
  value text not null
);
-- Set after deploying functions:
--   insert into private.app_config values ('functions_url', 'https://<ref>.supabase.co/functions/v1'),
--                                          ('internal_secret', '<same as INTERNAL_SECRET function secret>');

create or replace function private.call_edge(p_fn text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_url text := (select value from private.app_config where key = 'functions_url');
  v_secret text := (select value from private.app_config where key = 'internal_secret');
begin
  if v_url is null or v_secret is null then
    return; -- functions not configured yet; nothing to call
  end if;
  perform net.http_post(
    url := v_url || '/' || p_fn,
    body := p_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;

-- ---------------------------------------------------------------------------
-- Amount due (used by payments, return settlement and the app).
-- Rent is prepaid weekly. A payment covers [next_due_date, next_due_date + 7).
-- Late fee: if not paid within grace_days of the due date, late_fee_per_day is
-- charged for every day since the due date.
-- ---------------------------------------------------------------------------
create or replace function public.rental_amount_due(p_rental uuid)
returns table (
  rent numeric, late_fee numeric, total numeric, period_start date, period_end date,
  days_late int, weeks_due int, outstanding numeric, renewal_blocked boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.rentals;
  st public.settings;
  v_days int;
  v_late int;
  v_weeks int;
begin
  select * into r from public.rentals where id = p_rental;
  if r.id is null or (r.user_id <> auth.uid() and not public.is_staff() and not public.is_trusted_context()) then
    raise exception 'Rental not found' using errcode = 'P0001';
  end if;
  select * into st from public.settings where id = 1;

  if r.status not in ('active', 'overdue') or r.next_due_date is null then
    return query select 0::numeric, 0::numeric, 0::numeric, null::date, null::date, 0, 0, 0::numeric, r.renewal_blocked;
    return;
  end if;

  v_days := current_date - r.next_due_date;                       -- >0 means past due
  v_late := case when v_days > st.grace_days then v_days else 0 end;
  v_weeks := case when v_days >= 0 then (v_days / 7) + 1 else 0 end;

  return query select
    r.weekly_rent,
    (v_late * st.late_fee_per_day)::numeric,
    (r.weekly_rent + v_late * st.late_fee_per_day)::numeric,
    r.next_due_date,
    r.next_due_date + 6,
    v_late,
    v_weeks,
    (v_weeks * r.weekly_rent + v_late * st.late_fee_per_day)::numeric,
    r.renewal_blocked;
end $$;

-- ---------------------------------------------------------------------------
-- Agreement text: template filled with rental / customer / scooter values
-- ---------------------------------------------------------------------------
create or replace function public.render_agreement(p_rental uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.rentals; p public.profiles; sc public.scooters; st public.settings; tpl public.agreement_templates;
  vals jsonb; body text; k text; v text;
  inr text;
begin
  select * into r from public.rentals where id = p_rental;
  if r.id is null or (r.user_id <> auth.uid() and not public.is_staff() and not public.is_trusted_context()) then
    raise exception 'Rental not found' using errcode = 'P0001';
  end if;
  select * into p from public.profiles where id = r.user_id;
  select * into sc from public.scooters where id = r.scooter_id;
  select * into st from public.settings where id = 1;
  select * into tpl from public.agreement_templates order by version desc limit 1;

  vals := jsonb_build_object(
    'company_name', st.company_name,
    'company_address', coalesce(st.company_address, ''),
    'customer_name', coalesce(p.full_name, ''),
    'customer_phone', coalesce(p.phone, ''),
    'customer_address', coalesce(p.address, ''),
    'scooter_code', sc.code,
    'scooter_model', sc.model,
    'chassis_no', coalesce(sc.chassis_no, '—'),
    'motor_no', coalesce(sc.motor_no, '—'),
    'battery_no', coalesce(sc.battery_no, '—'),
    'weekly_rent', 'Rs. ' || to_char(r.weekly_rent, 'FM99,99,999'),
    'deposit_amount', 'Rs. ' || to_char(r.deposit_amount, 'FM99,99,999'),
    'late_fee_per_day', 'Rs. ' || to_char(st.late_fee_per_day, 'FM99,99,999'),
    'grace_days', st.grace_days::text,
    'start_date', to_char(coalesce(r.start_date, current_date), 'DD Mon YYYY')
  );
  body := tpl.body;
  for k, v in select * from jsonb_each_text(vals) loop
    body := replace(body, '{{' || k || '}}', v);
  end loop;

  return jsonb_build_object('template_version', tpl.version, 'values', vals, 'body', body);
end $$;

-- ---------------------------------------------------------------------------
-- Customer signs: signature already uploaded to agreements/<uid>/...
-- ---------------------------------------------------------------------------
create or replace function public.sign_agreement(p_rental uuid, p_signature_path text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  r public.rentals;
  terms jsonb;
  v_id uuid;
begin
  select * into r from public.rentals where id = p_rental for update;
  if r.id is null or r.user_id <> auth.uid() then raise exception 'Rental not found' using errcode = 'P0001'; end if;
  if r.status <> 'pending_agreement' then raise exception 'This agreement is already signed' using errcode = 'P0001'; end if;
  if split_part(p_signature_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid signature file' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'agreements' and o.name = p_signature_path) then
    raise exception 'Signature upload not found. Try again.' using errcode = 'P0001';
  end if;

  terms := public.render_agreement(p_rental);
  insert into public.agreements (rental_id, version, terms_snapshot, terms_hash, signature_path, signed_at)
  values (r.id, (terms ->> 'template_version')::int, terms,
          encode(extensions.digest(terms ->> 'body', 'sha256'), 'hex'), p_signature_path, now())
  returning id into v_id;

  update public.rentals set status = 'pending_handover' where id = r.id;
  perform private.call_edge('generate-pdf', jsonb_build_object('kind', 'agreement', 'id', v_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Internal: insert a paid payment row with a receipt number
-- ---------------------------------------------------------------------------
create or replace function private.insert_paid_payment(
  p_rental uuid, p_user uuid, p_amount numeric, p_type public.payment_type, p_method public.payment_method,
  p_period_start date, p_period_end date, p_notes text, p_recorded_by uuid, p_late_fee numeric default 0
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.payments (rental_id, user_id, amount, late_fee_amount, type, method, status, period_start, period_end,
                               notes, recorded_by, receipt_no, paid_at, branch_id)
  select p_rental, p_user, p_amount, coalesce(p_late_fee, 0), p_type, p_method, 'paid', p_period_start, p_period_end,
         nullif(trim(p_notes), ''), p_recorded_by, 'SNR-' || lpad(nextval('public.receipt_no_seq')::text, 6, '0'), now(), r.branch_id
    from public.rentals r where r.id = p_rental
  returning id into v_id;
  perform private.call_edge('generate-pdf', jsonb_build_object('kind', 'receipt', 'id', v_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: handover checklist -> rental active, scooter rented
-- p_checklist: {scooter_condition, battery_condition, charger_ok, accessories, damage_notes, photo_paths[], customer_ack}
-- ---------------------------------------------------------------------------
create or replace function public.complete_handover(
  p_rental uuid, p_checklist jsonb,
  p_collect_deposit boolean default false, p_collect_first_week boolean default false,
  p_method public.payment_method default 'cash', p_notes text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare r public.rentals;
begin
  perform public.require_staff();
  select * into r from public.rentals where id = p_rental for update;
  if r.id is null then raise exception 'Rental not found'; end if;
  if r.status <> 'pending_handover' then
    raise exception 'Customer must sign the agreement before handover' using errcode = 'P0001';
  end if;
  if not coalesce((p_checklist ->> 'customer_ack')::boolean, false) then
    raise exception 'Customer must acknowledge the checklist' using errcode = 'P0001';
  end if;
  if (p_collect_deposit or p_collect_first_week) and p_method = 'upi_gateway' then
    raise exception 'Use cash, offline UPI or bank for payments collected at handover' using errcode = 'P0001';
  end if;

  insert into public.handover_records (rental_id, kind, scooter_condition, battery_condition, charger_ok, accessories,
                                       damage_notes, photo_paths, customer_ack_at, recorded_by)
  values (r.id, 'handover', p_checklist ->> 'scooter_condition', p_checklist ->> 'battery_condition',
          (p_checklist ->> 'charger_ok')::boolean, p_checklist ->> 'accessories', p_checklist ->> 'damage_notes',
          coalesce(array(select jsonb_array_elements_text(p_checklist -> 'photo_paths')), '{}'), now(), auth.uid());

  perform public.enter_trusted();
  update public.scooters set status = 'rented' where id = r.scooter_id;
  update public.rentals
     set status = 'active', start_date = current_date, next_due_date = current_date + 7
   where id = r.id;

  if p_collect_deposit and r.deposit_amount > 0 then
    perform private.insert_paid_payment(r.id, r.user_id, r.deposit_amount, 'deposit', p_method, null, null,
                                        coalesce(p_notes, 'Collected at handover'), auth.uid());
  end if;
  if p_collect_first_week then
    perform private.insert_paid_payment(r.id, r.user_id, r.weekly_rent, 'rent', p_method, current_date, current_date + 6,
                                        coalesce(p_notes, 'First week, collected at handover'), auth.uid());
  end if;

  perform public.notify(r.user_id, 'Rental started',
    format('Your rental is active. Next rent is due on %s.', to_char(current_date + 7, 'DD Mon')),
    jsonb_build_object('type', 'rental', 'rental_id', r.id, 'route', '/rental'));
end $$;

-- ---------------------------------------------------------------------------
-- Staff: return checklist -> rental returned, scooter available / maintenance
-- ---------------------------------------------------------------------------
create or replace function public.complete_return(
  p_rental uuid, p_checklist jsonb, p_scooter_status public.scooter_status default 'available',
  p_settlement_note text default null
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  r public.rentals;
  v_out numeric;
begin
  perform public.require_staff();
  select * into r from public.rentals where id = p_rental for update;
  if r.id is null or r.status not in ('active', 'overdue') then
    raise exception 'Only active or overdue rentals can be returned' using errcode = 'P0001';
  end if;
  if p_scooter_status not in ('available', 'under_maintenance') then
    raise exception 'After return the scooter must be available or under maintenance' using errcode = 'P0001';
  end if;

  select outstanding into v_out from public.rental_amount_due(r.id);
  if v_out > 0 and coalesce(trim(p_settlement_note), '') = '' then
    raise exception 'Outstanding % must be settled. Record the payment, or add a settlement note (e.g. adjusted from deposit).', v_out
      using errcode = 'P0001';
  end if;

  insert into public.handover_records (rental_id, kind, scooter_condition, battery_condition, charger_ok, accessories,
                                       damage_notes, photo_paths, customer_ack_at, outstanding_amount, recorded_by)
  values (r.id, 'return', p_checklist ->> 'scooter_condition', p_checklist ->> 'battery_condition',
          (p_checklist ->> 'charger_ok')::boolean, p_checklist ->> 'accessories',
          concat_ws(E'\n', nullif(p_checklist ->> 'damage_notes', ''), nullif('Settlement: ' || trim(p_settlement_note), 'Settlement: ')),
          coalesce(array(select jsonb_array_elements_text(p_checklist -> 'photo_paths')), '{}'),
          case when coalesce((p_checklist ->> 'customer_ack')::boolean, false) then now() end, v_out, auth.uid());

  perform public.enter_trusted();
  update public.rentals set status = 'returned', ended_at = now(), end_reason = 'returned' where id = r.id;
  update public.scooters set status = p_scooter_status,
         maintenance_notes = case when p_scooter_status = 'under_maintenance'
                                  then concat_ws(E'\n', maintenance_notes, to_char(now(), 'DD Mon YYYY') || ': ' || coalesce(p_checklist ->> 'damage_notes', 'Sent for maintenance after return'))
                                  else maintenance_notes end
   where id = r.scooter_id;

  perform public.notify(r.user_id, 'Scooter returned', 'Thanks for riding with SNIREVA. Your rental is closed.',
    jsonb_build_object('type', 'rental', 'rental_id', r.id, 'route', '/rental'));
  return v_out;
end $$;

-- Staff: terminate (non-payment, misuse, or cancelling before handover)
create or replace function public.terminate_rental(p_rental uuid, p_reason text, p_scooter_status public.scooter_status default 'available')
returns void
language plpgsql security definer set search_path = public
as $$
declare r public.rentals;
begin
  perform public.require_staff();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason' using errcode = 'P0001'; end if;
  select * into r from public.rentals where id = p_rental for update;
  if r.id is null or r.status in ('returned', 'terminated') then
    raise exception 'Rental is already closed' using errcode = 'P0001';
  end if;
  perform public.enter_trusted();
  update public.rentals set status = 'terminated', ended_at = now(), end_reason = trim(p_reason) where id = r.id;
  update public.scooters set status = p_scooter_status where id = r.scooter_id;
  perform public.notify(r.user_id, 'Rental ended', trim(p_reason),
    jsonb_build_object('type', 'rental', 'rental_id', r.id, 'route', '/rental'));
end $$;

-- Staff: block / allow renewal ("subject to company approval")
create or replace function public.set_renewal_block(p_rental uuid, p_blocked boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_staff();
  if p_blocked and coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason' using errcode = 'P0001'; end if;
  update public.rentals set renewal_blocked = p_blocked, renewal_block_reason = case when p_blocked then trim(p_reason) end
   where id = p_rental;
end $$;

revoke execute on function private.insert_paid_payment(uuid, uuid, numeric, public.payment_type, public.payment_method, date, date, text, uuid, numeric) from public;
revoke execute on function private.call_edge(text, jsonb) from public;
