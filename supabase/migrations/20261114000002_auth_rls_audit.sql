-- SNIREVA Phase 1: roles, RLS, audit

-- ---------------------------------------------------------------------------
-- Role helpers (never trust the client for role)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(roles public.user_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = any (roles)
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(array['staff', 'manager', 'owner']::public.user_role[]);
$$;

-- True when running as service role (Edge Functions) or inside a trusted RPC.
create or replace function public.is_trusted_context()
returns boolean
language sql stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or coalesce(current_setting('app.trusted', true), '') = 'on'
      or session_user in ('postgres', 'supabase_admin');
$$;

-- Marks the current transaction as trusted (only callable from definer functions).
create or replace function public.enter_trusted()
returns void language sql as $$
  select set_config('app.trusted', 'on', true);
$$;
revoke execute on function public.enter_trusted() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Role comes only from app_metadata (server-set).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := 'customer';
begin
  if new.raw_app_meta_data ? 'role' then
    v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  end if;

  insert into public.profiles (id, phone, email, full_name, role)
  values (
    new.id,
    nullif(new.phone, ''),
    nullif(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    v_role
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Profile guard: customers cannot change role / KYC / activation fields.
-- Only owner can change roles.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.role is distinct from old.role
     and not public.has_role(array['owner']::public.user_role[]) then
    raise exception 'Only the owner can change roles' using errcode = '42501';
  end if;

  if not public.is_staff() then
    if new.kyc_status is distinct from old.kyc_status
       or new.kyc_reject_reason is distinct from old.kyc_reject_reason
       or new.is_active is distinct from old.is_active
       or new.phone is distinct from old.phone then
      raise exception 'Not allowed to change protected fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled on every table
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.kyc_documents enable row level security;
alter table public.scooters enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.booking_requests enable row level security;
alter table public.rentals enable row level security;
alter table public.agreement_templates enable row level security;
alter table public.agreements enable row level security;
alter table public.payments enable row level security;
alter table public.handover_records enable row level security;
alter table public.service_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

-- branches
create policy branches_read on public.branches for select to authenticated using (true);
create policy branches_owner_write on public.branches for all to authenticated
  using (public.has_role(array['owner']::public.user_role[]))
  with check (public.has_role(array['owner']::public.user_role[]));

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

-- kyc_documents
create policy kyc_read on public.kyc_documents for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy kyc_insert_own on public.kyc_documents for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.kyc_status <> 'approved')
  );
create policy kyc_delete_own_pending on public.kyc_documents for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');
create policy kyc_staff_update on public.kyc_documents for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- scooters: customers see available ones + the one they rent
create policy scooters_read on public.scooters for select to authenticated
  using (
    public.is_staff()
    or status = 'available'
    or exists (select 1 from public.rentals r where r.scooter_id = scooters.id and r.user_id = auth.uid())
  );
create policy scooters_staff_insert on public.scooters for insert to authenticated
  with check (public.is_staff());
create policy scooters_staff_update on public.scooters for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy scooters_manager_delete on public.scooters for delete to authenticated
  using (public.has_role(array['manager', 'owner']::public.user_role[]));

-- pickup_locations
create policy pickup_read on public.pickup_locations for select to authenticated
  using (is_active or public.is_staff());
create policy pickup_staff_write on public.pickup_locations for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- booking_requests (writes go through RPCs)
create policy booking_read on public.booking_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- rentals (writes go through RPCs)
create policy rentals_read on public.rentals for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- agreement templates
create policy templates_read on public.agreement_templates for select to authenticated
  using (public.is_staff());
create policy templates_owner_insert on public.agreement_templates for insert to authenticated
  with check (public.has_role(array['owner']::public.user_role[]));

-- agreements (written by Edge Function)
create policy agreements_read on public.agreements for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.rentals r where r.id = agreements.rental_id and r.user_id = auth.uid())
  );

-- payments (written by webhook / RPC only)
create policy payments_read on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- handover records (written by RPC)
create policy handover_read on public.handover_records for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.rentals r where r.id = handover_records.rental_id and r.user_id = auth.uid())
  );

-- service requests
create policy service_read on public.service_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy service_insert_own on public.service_requests for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'open' and assigned_to is null and admin_notes is null
    and (rental_id is null or exists (
      select 1 from public.rentals r where r.id = rental_id and r.user_id = auth.uid()))
  );
create policy service_staff_update on public.service_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- notifications
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- settings: everyone signed in can read (support numbers, rent); owner edits
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_owner_update on public.settings for update to authenticated
  using (public.has_role(array['owner']::public.user_role[]))
  with check (public.has_role(array['owner']::public.user_role[]));

-- audit log: managers/owner read; no insert/update/delete policies at all
create policy audit_read on public.audit_log for select to authenticated
  using (public.has_role(array['manager', 'owner']::public.user_role[]));

-- Customers may only flip read_at on notifications.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Column-level protection for customer profile edits is enforced by guard trigger.
revoke insert, delete on public.profiles from authenticated, anon;
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new); v_id := (to_jsonb(new) ->> 'id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old); v_after := to_jsonb(new); v_id := (to_jsonb(new) ->> 'id')::uuid;
    -- skip no-op updates and push-token refreshes
    if v_before - 'updated_at' - 'fcm_token' = v_after - 'updated_at' - 'fcm_token' then
      return new;
    end if;
  else
    v_before := to_jsonb(old); v_id := (to_jsonb(old) ->> 'id')::uuid;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_before, v_after);

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['payments', 'rentals', 'scooters', 'kyc_documents', 'settings', 'profiles'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Settings.id is an int, not uuid: dedicated audit for it.
drop trigger audit_settings on public.settings;
create or replace function public.audit_settings()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), lower(tg_op), 'settings', null,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_settings after insert or update on public.settings
  for each row execute function public.audit_settings();
