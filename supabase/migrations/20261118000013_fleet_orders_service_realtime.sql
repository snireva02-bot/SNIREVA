-- Bulk (multi-scooter) bookings, combined payments, scooter-linked service requests with a
-- handling timeline + scooter replacement, and Realtime for both apps.

-- =============================================================================
-- 1. Bulk bookings
-- =============================================================================
alter table public.settings add column if not exists max_scooters_per_customer int not null default 10
  check (max_scooters_per_customer between 1 and 100);

alter table public.booking_requests
  add column quantity int not null default 1 check (quantity between 1 and 100),
  add column preferred_scooter_ids uuid[] not null default '{}';
update public.booking_requests set preferred_scooter_ids = array[preferred_scooter_id] where preferred_scooter_id is not null;
alter table public.booking_requests drop column preferred_scooter_id;
alter table public.booking_requests drop column scooter_id;   -- allocated scooters live on rentals.booking_request_id

-- A rider may now hold several scooters at once.
drop index if exists public.rentals_one_open_per_user;
create index if not exists rentals_booking_idx on public.rentals (booking_request_id);
create index if not exists rentals_user_open_idx on public.rentals (user_id) where status not in ('returned', 'terminated');

drop function if exists public.request_scooter(uuid, uuid);
create or replace function public.request_scooter(p_pickup uuid, p_quantity int default 1, p_preferred uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  p public.profiles;
  st public.settings;
  v_open int;
  v_pref uuid[] := coalesce(p_preferred, '{}');
  v_id uuid;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not p.is_active then raise exception 'Your account is inactive. Contact support.' using errcode = 'P0001'; end if;
  if p.kyc_status <> 'approved' then
    raise exception 'Your documents must be approved before you can request a scooter' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rentals r where r.user_id = p.id and r.status = 'overdue') then
    raise exception 'Clear your overdue rent before requesting more scooters' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_requests b where b.user_id = p.id and b.status = 'pending') then
    raise exception 'You already have a pending request. Cancel it to change the number of scooters.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pickup_locations l where l.id = p_pickup and l.is_active) then
    raise exception 'Choose a pickup location' using errcode = 'P0001';
  end if;

  select * into st from public.settings where id = 1;
  select count(*) into v_open from public.rentals r where r.user_id = p.id and r.status not in ('returned', 'terminated');
  if p_quantity < 1 then raise exception 'Choose at least one scooter' using errcode = 'P0001'; end if;
  if v_open + p_quantity > st.max_scooters_per_customer then
    raise exception 'You can have up to % scooters. You already have %.', st.max_scooters_per_customer, v_open using errcode = 'P0001';
  end if;
  if cardinality(v_pref) > p_quantity then
    raise exception 'You picked more scooters than the quantity requested' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_pref) x where not exists (select 1 from public.scooters s where s.id = x and s.status = 'available')) then
    raise exception 'One of the scooters you picked was just taken. Refresh and try again.' using errcode = 'P0001';
  end if;

  insert into public.booking_requests (user_id, pickup_location_id, quantity, preferred_scooter_ids)
  values (p.id, p_pickup, p_quantity, v_pref)
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.allocate_scooter(uuid, uuid, text);
create or replace function public.allocate_scooters(p_booking uuid, p_scooters uuid[], p_note text default null)
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare
  b public.booking_requests;
  st public.settings;
  sc public.scooters;
  v_ids uuid[] := '{}';
  v_codes text[] := '{}';
  v_rental uuid;
  n int := coalesce(cardinality(p_scooters), 0);
begin
  perform public.require_staff();
  select * into b from public.booking_requests where id = p_booking for update;
  if b.id is null or b.status <> 'pending' then
    raise exception 'This request is no longer pending' using errcode = 'P0001';
  end if;
  if n = 0 then raise exception 'Choose at least one scooter' using errcode = 'P0001'; end if;
  if n > b.quantity then raise exception 'The customer asked for % scooter(s); you chose %', b.quantity, n using errcode = 'P0001'; end if;
  if (select count(distinct x) from unnest(p_scooters) x) <> n then raise exception 'The same scooter was chosen twice' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = b.user_id and kyc_status = 'approved' and is_active) then
    raise exception 'Customer is not approved or is inactive' using errcode = 'P0001';
  end if;

  select * into st from public.settings where id = 1;
  for sc in select * from public.scooters where id = any (p_scooters) order by code for update loop
    if sc.status <> 'available' then
      raise exception 'Scooter % is not available', sc.code using errcode = 'P0001';
    end if;
    update public.scooters set status = 'reserved' where id = sc.id;
    insert into public.rentals (user_id, scooter_id, booking_request_id, pickup_location_id, weekly_rent, deposit_amount, status, branch_id)
    values (b.user_id, sc.id, b.id, b.pickup_location_id, coalesce(sc.weekly_rent, st.weekly_rent), st.deposit_amount, 'pending_agreement', sc.branch_id)
    returning id into v_rental;
    v_ids := v_ids || v_rental;
    v_codes := v_codes || sc.code;
  end loop;
  if cardinality(v_ids) <> n then raise exception 'Scooter not found' using errcode = 'P0001'; end if;

  update public.booking_requests
     set status = 'approved',
         admin_note = nullif(concat_ws(' ', nullif(trim(p_note), ''),
                       case when n < b.quantity then format('(%s of %s scooters allocated)', n, b.quantity) end), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = b.id;

  perform public.notify(b.user_id,
    case when n = 1 then 'Scooter allocated' else format('%s scooters allocated', n) end,
    format('%s reserved for you%s. Sign your rental agreement in the app.', array_to_string(v_codes, ', '),
           case when n < b.quantity then format(' (%s of %s requested)', n, b.quantity) else '' end),
    jsonb_build_object('type', 'booking', 'status', 'approved', 'route', '/agreement'));
  return v_ids;
end $$;

-- Single-scooter wrapper (kept for scripts / older callers)
create or replace function public.allocate_scooter(p_booking uuid, p_scooter uuid, p_note text default null)
returns uuid language sql security definer set search_path = public as $$
  select (public.allocate_scooters(p_booking, array[p_scooter], p_note))[1];
$$;

-- Sign several pending agreements with one signature (bulk orders)
create or replace function public.sign_agreements(p_rentals uuid[], p_signature_path text)
returns int
language plpgsql security definer set search_path = public
as $$
declare r uuid; n int := 0;
begin
  if coalesce(cardinality(p_rentals), 0) = 0 then raise exception 'Nothing to sign' using errcode = 'P0001'; end if;
  foreach r in array p_rentals loop
    perform public.sign_agreement(r, p_signature_path);
    n := n + 1;
  end loop;
  return n;
end $$;

-- =============================================================================
-- 2. Combined payments: one Razorpay order can pay rent for several scooters.
--    Idempotency moves to payment_orders (unique order id + unique payment id).
-- =============================================================================
create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  amount numeric(10, 2) not null check (amount > 0),
  status public.payment_status not null default 'created',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.payment_orders for each row execute function public.set_updated_at();
alter table public.payment_orders enable row level security;
create policy payment_orders_read on public.payment_orders for select to authenticated using (user_id = auth.uid() or public.is_staff());
create trigger audit_payment_orders after insert or update or delete on public.payment_orders for each row execute function public.audit_row();

alter table public.payments add column order_id uuid references public.payment_orders (id);
create index payments_order_idx on public.payments (order_id);
alter table public.payments drop constraint payments_razorpay_order_id_key;
alter table public.payments drop constraint payments_razorpay_payment_id_key;
create index payments_rzp_order_idx on public.payments (razorpay_order_id);

drop function if exists public.demo_pay_rent(uuid);
drop function if exists public.prepare_rent_payment(uuid);

/** Customer (via Edge Function): one pending order covering the rent due on the given rentals. */
create or replace function public.prepare_rent_payment(p_rentals uuid[])
returns table (order_id uuid, total numeric, items jsonb)
language plpgsql security definer set search_path = public
as $$
declare
  r public.rentals;
  d record;
  v_order uuid;
  v_total numeric := 0;
  v_items jsonb := '[]';
  v_pay uuid;
begin
  if coalesce(cardinality(p_rentals), 0) = 0 then raise exception 'Choose what to pay for' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is inactive. Contact support.' using errcode = 'P0001';
  end if;

  -- expire unfinished attempts for these rentals
  update public.payment_orders o set status = 'failed', failure_reason = 'Superseded by a newer attempt'
   where o.status = 'created' and o.user_id = auth.uid();
  update public.payments set status = 'failed', failure_reason = 'Superseded by a newer attempt'
   where status = 'created' and method = 'upi_gateway' and user_id = auth.uid();

  insert into public.payment_orders (user_id, amount) values (auth.uid(), 1) returning id into v_order;

  for r in select * from public.rentals where id = any (p_rentals) order by next_due_date loop
    if r.user_id <> auth.uid() then raise exception 'Rental not found' using errcode = 'P0001'; end if;
    if r.status not in ('active', 'overdue') then raise exception 'A selected rental is not active' using errcode = 'P0001'; end if;
    if r.renewal_blocked then
      raise exception 'Renewal is on hold for one scooter: %. Contact support.', coalesce(r.renewal_block_reason, 'pending company approval') using errcode = 'P0001';
    end if;
    select * into d from public.rental_amount_due(r.id);
    insert into public.payments (rental_id, user_id, amount, late_fee_amount, type, method, status, period_start, period_end, order_id, branch_id)
    values (r.id, r.user_id, d.total, d.late_fee, 'rent', 'upi_gateway', 'created', d.period_start, d.period_end, v_order, r.branch_id)
    returning id into v_pay;
    v_total := v_total + d.total;
    v_items := v_items || jsonb_build_object('payment_id', v_pay, 'rental_id', r.id, 'amount', d.total, 'late_fee', d.late_fee,
                                             'period_start', d.period_start, 'period_end', d.period_end);
  end loop;
  if jsonb_array_length(v_items) <> cardinality(p_rentals) then raise exception 'Rental not found' using errcode = 'P0001'; end if;

  update public.payment_orders set amount = v_total where id = v_order;
  return query select v_order, v_total, v_items;
end $$;

create or replace function public.attach_razorpay_order(p_order uuid, p_razorpay_order_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_trusted_context() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.payment_orders set razorpay_order_id = p_razorpay_order_id where id = p_order;
  update public.payments set razorpay_order_id = p_razorpay_order_id where order_id = p_order;
end $$;
revoke execute on function public.attach_razorpay_order(uuid, text) from public, anon, authenticated;

/** Webhook only. Idempotent on the Razorpay payment id. */
create or replace function public.apply_gateway_payment(p_order_id text, p_payment_id text, p_amount_paise bigint)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  o public.payment_orders;
  p public.payments;
  v_next date;
  v_codes text[] := '{}';
  v_dues text[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_trusted_context() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.payment_orders where razorpay_payment_id = p_payment_id and status = 'paid') then
    return 'duplicate';
  end if;
  select * into o from public.payment_orders where razorpay_order_id = p_order_id for update;
  if o.id is null then return 'unknown_order'; end if;
  if o.status = 'paid' then return 'duplicate'; end if;
  if round(o.amount * 100) <> p_amount_paise then
    update public.payment_orders set status = 'failed', razorpay_payment_id = p_payment_id,
           failure_reason = format('Amount mismatch: expected %s paise, got %s', round(o.amount * 100), p_amount_paise)
     where id = o.id;
    update public.payments set status = 'failed', failure_reason = 'Amount mismatch' where order_id = o.id;
    return 'amount_mismatch';
  end if;

  update public.payment_orders set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), failure_reason = null where id = o.id;

  for p in select * from public.payments where order_id = o.id order by created_at loop
    update public.payments
       set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), failure_reason = null,
           receipt_no = coalesce(receipt_no, 'SNR-' || lpad(nextval('public.receipt_no_seq')::text, 6, '0'))
     where id = p.id;
    if p.type = 'rent' and p.rental_id is not null then
      v_next := private.advance_rental(p.rental_id);
      v_codes := v_codes || (select s.code from public.rentals r join public.scooters s on s.id = r.scooter_id where r.id = p.rental_id);
      v_dues := v_dues || to_char(v_next, 'DD Mon');
    end if;
    perform private.call_edge('generate-pdf', jsonb_build_object('kind', 'receipt', 'id', p.id));
  end loop;

  perform public.notify(o.user_id, 'Payment received',
    format('₹%s received%s. Thank you.', to_char(o.amount, 'FM99,99,999'),
           case when cardinality(v_codes) > 1 then format(' for %s scooters', cardinality(v_codes)) else '' end),
    jsonb_build_object('type', 'payment', 'status', 'paid', 'order_id', o.id, 'route', '/payments'), 'payments');
  if cardinality(v_codes) > 0 then
    perform public.notify(o.user_id, 'Rental renewed',
      case when cardinality(v_codes) = 1 then format('Your rental is renewed. Next rent is due on %s.', v_dues[1])
           else format('%s renewed. Next due: %s.', array_to_string(v_codes, ', '), array_to_string(array(select distinct x from unnest(v_dues) x), ', ')) end,
      jsonb_build_object('type', 'rental', 'status', 'renewed', 'route', '/rental'), 'payments');
  end if;
  return 'paid';
end $$;

create or replace function public.mark_gateway_failed(p_order_id text, p_payment_id text, p_reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare o public.payment_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_trusted_context() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.payment_orders set status = 'failed', failure_reason = left(coalesce(p_reason, 'Payment failed'), 500)
   where razorpay_order_id = p_order_id and status = 'created'
  returning * into o;
  if o.id is null then return 'ignored'; end if;
  update public.payments set status = 'failed', failure_reason = left(coalesce(p_reason, 'Payment failed'), 500)
   where order_id = o.id and status = 'created';
  perform public.notify(o.user_id, 'Payment failed',
    'Your rent payment did not go through. No money was taken, or it will be refunded by your bank. Try again.',
    jsonb_build_object('type', 'payment', 'status', 'failed', 'order_id', o.id, 'route', '/pay'), 'payments');
  return 'failed';
end $$;
revoke execute on function public.apply_gateway_payment(text, text, bigint) from public, anon, authenticated;
revoke execute on function public.mark_gateway_failed(text, text, text) from public, anon, authenticated;

create or replace function public.demo_pay_rent(p_rentals uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare o record; v_rzp text;
begin
  if not public.is_demo_mode() then raise exception 'Demo payments are switched off' using errcode = '42501'; end if;
  select * into o from public.prepare_rent_payment(p_rentals);
  v_rzp := 'order_demo_' || replace(o.order_id::text, '-', '');
  perform public.enter_trusted();
  perform public.attach_razorpay_order(o.order_id, v_rzp);
  perform public.apply_gateway_payment(v_rzp, 'pay_demo_' || substr(md5(random()::text), 1, 14), round(o.total * 100)::bigint);
  return o.order_id;
end $$;
grant execute on function public.demo_pay_rent(uuid[]) to authenticated;

-- =============================================================================
-- 3. Service requests: always about a specific scooter (except complaints),
--    a visible handling timeline, rider confirmation, scooter replacement.
-- =============================================================================
alter table public.service_requests
  add column scooter_id uuid references public.scooters (id),
  add column resolved_at timestamptz,
  add column closed_at timestamptz,
  add column reopened_count int not null default 0;
create index service_scooter_idx on public.service_requests (scooter_id, created_at desc);
update public.service_requests sr set scooter_id = r.scooter_id from public.rentals r where r.id = sr.rental_id and sr.scooter_id is null;

create table public.service_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  author_id uuid references public.profiles (id),
  author_kind text not null check (author_kind in ('customer', 'staff', 'system')),
  body text not null,
  status_to public.service_status,
  visible_to_customer boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_updates_req_idx on public.service_updates (request_id, created_at);
create trigger set_updated_at before update on public.service_updates for each row execute function public.set_updated_at();
alter table public.service_updates enable row level security;
create policy service_updates_read on public.service_updates for select to authenticated using (
  public.is_staff()
  or (visible_to_customer and exists (select 1 from public.service_requests s where s.id = request_id and s.user_id = auth.uid()))
);

-- Scooter swaps on a running rental (sync between "scooter taken" and "scooter reported")
create table public.rental_scooter_changes (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  from_scooter_id uuid not null references public.scooters (id),
  to_scooter_id uuid not null references public.scooters (id),
  reason text not null,
  service_request_id uuid references public.service_requests (id),
  changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rental_changes_idx on public.rental_scooter_changes (rental_id, created_at);
alter table public.rental_scooter_changes enable row level security;
create policy rental_changes_read on public.rental_scooter_changes for select to authenticated using (
  public.is_staff() or exists (select 1 from public.rentals r where r.id = rental_id and r.user_id = auth.uid())
);

-- Validate + link a new request to the scooter the rider actually has
create or replace function private.service_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.rentals;
begin
  if new.rental_id is not null then
    select * into r from public.rentals where id = new.rental_id;
    if r.id is null or r.user_id <> new.user_id then raise exception 'Rental not found' using errcode = 'P0001'; end if;
    if r.status in ('returned', 'terminated') then
      raise exception 'That scooter has been returned. Raise a complaint instead.' using errcode = 'P0001';
    end if;
    new.scooter_id := r.scooter_id;
  elsif new.category <> 'complaint' then
    if exists (select 1 from public.rentals x where x.user_id = new.user_id and x.status not in ('returned', 'terminated')) then
      raise exception 'Choose which scooter has the problem' using errcode = 'P0001';
    end if;
    raise exception 'You don''t have a scooter right now. Use "Raise a complaint" instead.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger service_before_insert before insert on public.service_requests
  for each row execute function private.service_before_insert();

create or replace function private.service_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.service_updates (request_id, author_id, author_kind, body, status_to)
  values (new.id, new.user_id, 'customer', new.description, 'open');
  return new;
end $$;
create trigger service_after_insert after insert on public.service_requests
  for each row execute function private.service_after_insert();

-- Replace the old status-change notifier with one that also stamps times + writes the timeline
drop trigger if exists notify_service_update on public.service_requests;
create or replace function private.service_before_update()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then new.resolved_at := now(); end if;
    if new.status = 'closed' then new.closed_at := now(); end if;
    if new.status in ('open', 'assigned', 'in_progress') then new.resolved_at := null; new.closed_at := null; end if;
  end if;
  return new;
end $$;
create trigger service_before_update before update on public.service_requests
  for each row execute function private.service_before_update();

create or replace function private.on_service_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare label text; code text;
begin
  if new.status is distinct from old.status then
    label := case new.status
      when 'assigned' then 'A technician has been assigned'
      when 'in_progress' then 'Work has started'
      when 'resolved' then 'Marked as fixed. Please confirm in the app.'
      when 'closed' then 'Closed'
      else 'Reopened' end;
    insert into public.service_updates (request_id, author_id, author_kind, body, status_to)
    values (new.id, auth.uid(), case when auth.uid() = new.user_id then 'customer' else 'system' end, label, new.status);
    if coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) <> new.user_id then
      select s.code into code from public.scooters s where s.id = new.scooter_id;
      perform public.notify(new.user_id,
        coalesce(code || ' · ', '') || initcap(replace(new.category::text, '_', ' ')),
        label, jsonb_build_object('type', 'service', 'status', new.status, 'service_id', new.id, 'route', '/service/' || new.id));
    end if;
  end if;
  return new;
end $$;
create trigger notify_service_update after update on public.service_requests
  for each row execute function private.on_service_update();

/** Staff: one call to assign / change status / post a note (visible to rider or internal). */
create or replace function public.service_update(
  p_request uuid, p_status public.service_status default null, p_assigned_to uuid default null,
  p_note text default null, p_visible boolean default true, p_unassign boolean default false
) returns void
language plpgsql security definer set search_path = public
as $$
declare s public.service_requests;
begin
  perform public.require_staff();
  select * into s from public.service_requests where id = p_request for update;
  if s.id is null then raise exception 'Request not found'; end if;
  if nullif(trim(p_note), '') is not null then
    insert into public.service_updates (request_id, author_id, author_kind, body, visible_to_customer)
    values (s.id, auth.uid(), 'staff', trim(p_note), coalesce(p_visible, true));
    if coalesce(p_visible, true) and p_status is null then
      perform public.notify(s.user_id, 'Update on your request', trim(p_note),
        jsonb_build_object('type', 'service', 'service_id', s.id, 'route', '/service/' || s.id));
    end if;
    if coalesce(p_visible, true) then update public.service_requests set admin_notes = trim(p_note) where id = s.id; end if;
  end if;
  update public.service_requests
     set assigned_to = case when p_unassign then null else coalesce(p_assigned_to, assigned_to) end,
         status = coalesce(p_status,
                   case when p_assigned_to is not null and status = 'open' then 'assigned'::public.service_status else status end)
   where id = s.id;
end $$;

/** Rider: reply on own request. */
create or replace function public.service_reply(p_request uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a message' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.service_requests where id = p_request and user_id = auth.uid() and status <> 'closed') then
    raise exception 'Request not found or closed' using errcode = 'P0001';
  end if;
  insert into public.service_updates (request_id, author_id, author_kind, body) values (p_request, auth.uid(), 'customer', trim(p_body));
end $$;

/** Rider: confirm the fix (closes) or say it's still not fixed (reopens). */
create or replace function public.service_confirm(p_request uuid, p_fixed boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.service_requests;
begin
  select * into s from public.service_requests where id = p_request and user_id = auth.uid() for update;
  if s.id is null then raise exception 'Request not found' using errcode = 'P0001'; end if;
  if s.status <> 'resolved' then raise exception 'This request is not marked as fixed yet' using errcode = 'P0001'; end if;
  if nullif(trim(p_note), '') is not null then
    insert into public.service_updates (request_id, author_id, author_kind, body) values (s.id, auth.uid(), 'customer', trim(p_note));
  end if;
  if p_fixed then
    update public.service_requests set status = 'closed' where id = s.id;
  else
    update public.service_requests set status = 'in_progress', reopened_count = reopened_count + 1 where id = s.id;
  end if;
end $$;

/** Staff: swap the scooter on a running rental (breakdown / damage). Old scooter goes to maintenance. */
create or replace function public.replace_scooter(p_rental uuid, p_new_scooter uuid, p_reason text, p_service_request uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.rentals;
  old_sc public.scooters;
  new_sc public.scooters;
begin
  perform public.require_staff();
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason' using errcode = 'P0001'; end if;
  select * into r from public.rentals where id = p_rental for update;
  if r.id is null or r.status not in ('pending_agreement', 'pending_handover', 'active', 'overdue') then
    raise exception 'Only open rentals can get a replacement scooter' using errcode = 'P0001';
  end if;
  select * into old_sc from public.scooters where id = r.scooter_id for update;
  select * into new_sc from public.scooters where id = p_new_scooter for update;
  if new_sc.id is null or new_sc.status <> 'available' then raise exception 'Replacement scooter is not available' using errcode = 'P0001'; end if;

  perform public.enter_trusted();
  update public.scooters set status = 'under_maintenance',
         maintenance_notes = concat_ws(E'\n', maintenance_notes, to_char(now(), 'DD Mon YYYY') || ': Taken off road – ' || trim(p_reason))
   where id = old_sc.id;
  update public.scooters set status = case when r.status in ('active', 'overdue') then 'rented'::public.scooter_status else 'reserved'::public.scooter_status end
   where id = new_sc.id;
  update public.rentals set scooter_id = new_sc.id where id = r.id;
  insert into public.rental_scooter_changes (rental_id, from_scooter_id, to_scooter_id, reason, service_request_id, changed_by)
  values (r.id, old_sc.id, new_sc.id, trim(p_reason), p_service_request, auth.uid());
  if r.status in ('active', 'overdue') then
    insert into public.handover_records (rental_id, kind, scooter_condition, accessories, damage_notes, recorded_by, customer_ack_at)
    values (r.id, 'handover', 'Replacement scooter', null, format('Replaced %s with %s: %s', old_sc.code, new_sc.code, trim(p_reason)), auth.uid(), now());
  end if;
  if p_service_request is not null then
    insert into public.service_updates (request_id, author_id, author_kind, body)
    values (p_service_request, auth.uid(), 'staff', format('Replacement scooter %s given. %s is with our technicians.', new_sc.code, old_sc.code));
    update public.service_requests set status = 'resolved' where id = p_service_request and status not in ('resolved', 'closed');
  end if;
  perform public.notify(r.user_id, 'Replacement scooter',
    format('%s replaces %s on your rental. Your due dates and payments stay the same.', new_sc.code, old_sc.code),
    jsonb_build_object('type', 'rental', 'rental_id', r.id, 'route', '/rental/' || r.id));
end $$;

/** Staff: add a dated maintenance note to a scooter (service history). */
create or replace function public.add_maintenance_note(p_scooter uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_staff();
  if coalesce(trim(p_note), '') = '' then raise exception 'Write a note' using errcode = 'P0001'; end if;
  update public.scooters set maintenance_notes = concat_ws(E'\n', maintenance_notes, to_char(now(), 'DD Mon YYYY') || ': ' || trim(p_note))
   where id = p_scooter;
end $$;

-- =============================================================================
-- 4. Realtime (RLS applies to every subscriber)
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array['booking_requests', 'rentals', 'service_requests', 'service_updates', 'profiles', 'kyc_documents',
                           'scooters', 'payment_orders', 'rental_scooter_changes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select private.pin_timezone();
