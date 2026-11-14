-- M5: payments (Razorpay + offline), due-date logic, daily jobs

-- Dates are business dates in India.
alter database postgres set timezone to 'Asia/Kolkata';
set timezone to 'Asia/Kolkata';

-- ---------------------------------------------------------------------------
-- Internal: move the rental forward by one paid week
-- ---------------------------------------------------------------------------
create or replace function private.advance_rental(p_rental uuid)
returns date
language plpgsql security definer set search_path = public
as $$
declare
  r public.rentals;
  st public.settings;
  v_next date;
begin
  select * into r from public.rentals where id = p_rental for update;
  select * into st from public.settings where id = 1;
  v_next := r.next_due_date + 7;  -- always extends from the current due date, never from today
  perform public.enter_trusted();
  update public.rentals
     set next_due_date = v_next,
         status = case when current_date > v_next + st.grace_days then 'overdue'::public.rental_status else 'active'::public.rental_status end
   where id = r.id;
  return v_next;
end $$;

-- ---------------------------------------------------------------------------
-- Customer (via Edge Function, user JWT): create a pending gateway payment.
-- Amount is computed here, never taken from the client.
-- ---------------------------------------------------------------------------
create or replace function public.prepare_rent_payment(p_rental uuid)
returns table (payment_id uuid, amount numeric, late_fee numeric, period_start date, period_end date)
language plpgsql security definer set search_path = public
as $$
declare
  r public.rentals;
  d record;
  v_id uuid;
begin
  select * into r from public.rentals where id = p_rental;
  if r.id is null or r.user_id <> auth.uid() then raise exception 'Rental not found' using errcode = 'P0001'; end if;
  if r.status not in ('active', 'overdue') then raise exception 'This rental is not active' using errcode = 'P0001'; end if;
  if r.renewal_blocked then
    raise exception 'Renewal is on hold: %. Contact support.', coalesce(r.renewal_block_reason, 'pending company approval') using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = r.user_id and is_active) then
    raise exception 'Your account is inactive. Contact support.' using errcode = 'P0001';
  end if;

  select * into d from public.rental_amount_due(r.id);

  -- Expire older unfinished attempts for the same rental so only one order is live.
  update public.payments set status = 'failed', failure_reason = 'Superseded by a newer attempt'
   where rental_id = r.id and status = 'created' and method = 'upi_gateway';

  insert into public.payments (rental_id, user_id, amount, late_fee_amount, type, method, status, period_start, period_end, branch_id)
  values (r.id, r.user_id, d.total, d.late_fee, 'rent', 'upi_gateway', 'created', d.period_start, d.period_end, r.branch_id)
  returning id into v_id;

  return query select v_id, d.total, d.late_fee, d.period_start, d.period_end;
end $$;

-- ---------------------------------------------------------------------------
-- Webhook only (service role): mark paid. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.apply_gateway_payment(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  p public.payments;
  v_next date;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_trusted_context() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Same Razorpay payment seen before -> nothing to do.
  if exists (select 1 from public.payments where razorpay_payment_id = p_payment_id and status = 'paid') then
    return 'duplicate';
  end if;

  select * into p from public.payments where razorpay_order_id = p_order_id for update;
  if p.id is null then return 'unknown_order'; end if;
  if p.status = 'paid' then return 'duplicate'; end if;
  if round(p.amount * 100) <> p_amount_paise then
    update public.payments set status = 'failed', razorpay_payment_id = p_payment_id,
           failure_reason = format('Amount mismatch: expected %s paise, got %s', round(p.amount * 100), p_amount_paise)
     where id = p.id;
    return 'amount_mismatch';
  end if;

  update public.payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), failure_reason = null,
         receipt_no = coalesce(receipt_no, 'SNR-' || lpad(nextval('public.receipt_no_seq')::text, 6, '0'))
   where id = p.id;

  if p.type = 'rent' and p.rental_id is not null then
    v_next := private.advance_rental(p.rental_id);
  end if;

  perform public.notify(p.user_id, 'Payment received',
    format('₹%s received. Thank you.', to_char(p.amount, 'FM99,99,999')),
    jsonb_build_object('type', 'payment', 'status', 'paid', 'payment_id', p.id, 'route', '/payments'), 'payments');
  if v_next is not null then
    perform public.notify(p.user_id, 'Rental renewed',
      format('Your rental is renewed. Next rent is due on %s.', to_char(v_next, 'DD Mon')),
      jsonb_build_object('type', 'rental', 'status', 'renewed', 'rental_id', p.rental_id, 'route', '/rental'), 'payments');
  end if;
  perform private.call_edge('generate-pdf', jsonb_build_object('kind', 'receipt', 'id', p.id));
  return 'paid';
end $$;

create or replace function public.mark_gateway_failed(p_order_id text, p_payment_id text, p_reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare p public.payments;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_trusted_context() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.payments
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'Payment failed'), 500)
   where razorpay_order_id = p_order_id and status = 'created'
  returning * into p;
  if p.id is null then return 'ignored'; end if;
  perform public.notify(p.user_id, 'Payment failed',
    'Your rent payment did not go through. No money was taken, or it will be refunded by your bank. Try again.',
    jsonb_build_object('type', 'payment', 'status', 'failed', 'payment_id', p.id, 'route', '/pay'), 'payments');
  return 'failed';
end $$;

revoke execute on function public.apply_gateway_payment(text, text, bigint) from public, anon, authenticated;
revoke execute on function public.mark_gateway_failed(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: offline payment (cash / offline UPI / bank). Always audited.
-- Rent payments advance the due date by one week.
-- ---------------------------------------------------------------------------
create or replace function public.record_offline_payment(
  p_rental uuid, p_amount numeric, p_type public.payment_type, p_method public.payment_method, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r public.rentals;
  d record;
  v_id uuid;
  v_next date;
begin
  perform public.require_staff();
  if p_method = 'upi_gateway' then raise exception 'Online payments are recorded automatically' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount' using errcode = 'P0001'; end if;
  select * into r from public.rentals where id = p_rental for update;
  if r.id is null then raise exception 'Rental not found'; end if;

  if p_type = 'rent' then
    if r.status not in ('active', 'overdue') then raise exception 'Rent can only be recorded for an active rental' using errcode = 'P0001'; end if;
    select * into d from public.rental_amount_due(r.id);
    if p_amount < r.weekly_rent then
      raise exception 'Rent payment must be at least the weekly rent (%)', r.weekly_rent using errcode = 'P0001';
    end if;
    v_id := private.insert_paid_payment(r.id, r.user_id, p_amount, 'rent', p_method, d.period_start, d.period_end,
                                        p_notes, auth.uid(), least(greatest(p_amount - r.weekly_rent, 0), d.late_fee));
    v_next := private.advance_rental(r.id);
    perform public.notify(r.user_id, 'Payment received',
      format('₹%s received by %s. Next rent is due on %s.', to_char(p_amount, 'FM99,99,999'),
             case p_method when 'cash' then 'cash' when 'bank' then 'bank transfer' else 'UPI' end, to_char(v_next, 'DD Mon')),
      jsonb_build_object('type', 'payment', 'status', 'paid', 'payment_id', v_id, 'route', '/payments'), 'payments');
  else
    v_id := private.insert_paid_payment(r.id, r.user_id, p_amount, p_type, p_method, null, null, p_notes, auth.uid());
    perform public.notify(r.user_id, 'Payment received', format('₹%s received. Thank you.', to_char(p_amount, 'FM99,99,999')),
      jsonb_build_object('type', 'payment', 'status', 'paid', 'payment_id', v_id, 'route', '/payments'), 'payments');
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Daily jobs (pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.mark_overdue_rentals()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  st public.settings;
  n int := 0;
  rec record;
begin
  select * into st from public.settings where id = 1;
  perform public.enter_trusted();

  for rec in
    update public.rentals set status = 'overdue'
     where status = 'active' and current_date > next_due_date + st.grace_days
    returning id
  loop n := n + 1; end loop;

  -- Overdue alert every day while overdue
  for rec in
    select r.id, r.user_id, r.next_due_date from public.rentals r where r.status = 'overdue'
  loop
    perform public.notify(rec.user_id, 'Rent overdue',
      format('Your rent was due on %s. Pay now to keep your scooter. Late fees apply.', to_char(rec.next_due_date, 'DD Mon')),
      jsonb_build_object('type', 'rental', 'status', 'overdue', 'rental_id', rec.id, 'route', '/pay'), 'payments');
  end loop;
  return n;
end $$;

create or replace function public.send_due_reminders()
returns int
language plpgsql security definer set search_path = public
as $$
declare n int := 0; rec record;
begin
  for rec in
    select r.id, r.user_id, r.next_due_date, r.weekly_rent, r.next_due_date - current_date as days
      from public.rentals r
     where r.status = 'active' and r.next_due_date - current_date in (2, 0)
  loop
    perform public.notify(rec.user_id,
      case when rec.days = 0 then 'Rent due today' else 'Rent due in 2 days' end,
      format('₹%s due on %s. Pay by UPI in the app.', to_char(rec.weekly_rent, 'FM99,99,999'), to_char(rec.next_due_date, 'DD Mon')),
      jsonb_build_object('type', 'rental', 'status', 'due', 'rental_id', rec.id, 'route', '/pay'), 'payments');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.mark_overdue_rentals() from public, anon, authenticated;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

create extension if not exists pg_cron;
grant usage on schema cron to postgres;

-- 09:00 IST = 03:30 UTC (pg_cron runs in UTC)
select cron.schedule('snireva-mark-overdue', '30 3 * * *', $$select public.mark_overdue_rentals()$$);
select cron.schedule('snireva-due-reminders', '35 3 * * *', $$select public.send_due_reminders()$$);

-- ---------------------------------------------------------------------------
-- Realtime: app listens to its own payment rows (RLS applies)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payments') then
    alter publication supabase_realtime add table public.payments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
