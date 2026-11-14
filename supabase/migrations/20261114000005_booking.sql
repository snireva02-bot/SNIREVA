-- M3: fleet browsing, booking requests, allocation -> rental

alter table public.booking_requests
  add column preferred_scooter_id uuid references public.scooters (id);

-- ---------------------------------------------------------------------------
-- Customer: request a scooter (KYC must be approved)
-- ---------------------------------------------------------------------------
create or replace function public.request_scooter(p_pickup uuid, p_preferred_scooter uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  p public.profiles;
  v_id uuid;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not p.is_active then raise exception 'Your account is inactive. Contact support.' using errcode = 'P0001'; end if;
  if p.kyc_status <> 'approved' then
    raise exception 'Your documents must be approved before you can request a scooter' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rentals r where r.user_id = p.id and r.status not in ('returned', 'terminated')) then
    raise exception 'You already have a scooter' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_requests b where b.user_id = p.id and b.status = 'pending') then
    raise exception 'You already have a pending request' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pickup_locations l where l.id = p_pickup and l.is_active) then
    raise exception 'Choose a pickup location' using errcode = 'P0001';
  end if;

  insert into public.booking_requests (user_id, pickup_location_id, preferred_scooter_id)
  values (p.id, p_pickup, p_preferred_scooter)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.booking_requests set status = 'cancelled'
   where id = p_booking and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Request not found or already handled' using errcode = 'P0001'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: allocate a scooter -> scooter reserved, rental pending_agreement
-- ---------------------------------------------------------------------------
create or replace function public.allocate_scooter(p_booking uuid, p_scooter uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  b public.booking_requests;
  sc public.scooters;
  st public.settings;
  v_rental uuid;
begin
  perform public.require_staff();

  select * into b from public.booking_requests where id = p_booking for update;
  if b.id is null or b.status <> 'pending' then
    raise exception 'This request is no longer pending' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = b.user_id and kyc_status = 'approved' and is_active) then
    raise exception 'Customer is not approved or is inactive' using errcode = 'P0001';
  end if;

  select * into sc from public.scooters where id = p_scooter for update;
  if sc.id is null or sc.status <> 'available' then
    raise exception 'Scooter is not available' using errcode = 'P0001';
  end if;

  select * into st from public.settings where id = 1;

  update public.scooters set status = 'reserved' where id = sc.id;

  insert into public.rentals (user_id, scooter_id, booking_request_id, pickup_location_id, weekly_rent, deposit_amount, status, branch_id)
  values (b.user_id, sc.id, b.id, b.pickup_location_id,
          coalesce(sc.weekly_rent, st.weekly_rent), st.deposit_amount, 'pending_agreement', sc.branch_id)
  returning id into v_rental;

  update public.booking_requests
     set status = 'approved', scooter_id = sc.id, admin_note = nullif(trim(p_note), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = b.id;

  perform public.notify(b.user_id, 'Scooter allocated',
    format('%s (%s) is reserved for you. Sign your rental agreement in the app.', sc.code, sc.model),
    jsonb_build_object('type', 'booking', 'status', 'approved', 'rental_id', v_rental, 'route', '/agreement'));
  return v_rental;
end $$;

create or replace function public.reject_booking(p_booking uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare b public.booking_requests;
begin
  perform public.require_staff();
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note for the customer' using errcode = 'P0001'; end if;
  update public.booking_requests
     set status = 'rejected', admin_note = trim(p_note), decided_by = auth.uid(), decided_at = now()
   where id = p_booking and status = 'pending'
  returning * into b;
  if b.id is null then raise exception 'This request is no longer pending' using errcode = 'P0001'; end if;
  perform public.notify(b.user_id, 'Scooter request declined', trim(p_note),
    jsonb_build_object('type', 'booking', 'status', 'rejected', 'route', '/scooters'));
end $$;

-- Scooter status changes from the dashboard must not break open rentals.
create or replace function public.guard_scooter_status()
returns trigger language plpgsql as $$
begin
  if public.is_trusted_context() then return new; end if;
  if new.status is distinct from old.status
     and exists (select 1 from public.rentals r where r.scooter_id = new.id and r.status not in ('returned', 'terminated')) then
    raise exception 'Scooter % is on an open rental; change it through the rental' , new.code using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_scooter_status before update on public.scooters
  for each row execute function public.guard_scooter_status();
