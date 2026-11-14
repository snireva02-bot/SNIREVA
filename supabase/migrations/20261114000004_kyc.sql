-- M2: customer onboarding + KYC

-- ---------------------------------------------------------------------------
-- notify(): in-app inbox row (+ push via trigger added in M6).
-- Provider-agnostic: SMS/WhatsApp can be added later behind the same call.
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_user uuid, p_title text, p_body text, p_data jsonb default '{}', p_channel text default 'default'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.notifications (user_id, title, body, data, channel)
  values (p_user, p_title, p_body, coalesce(p_data, '{}'), coalesce(p_channel, 'default'))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.notify(uuid, text, text, jsonb, text) from public, anon, authenticated;

-- Staff guard used by RPCs
create or replace function public.require_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Customer: submit documents for verification
-- ---------------------------------------------------------------------------
create or replace function public.submit_kyc()
returns public.kyc_status
language plpgsql security definer set search_path = public
as $$
declare
  p public.profiles;
  missing text[];
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.kyc_status in ('approved') then return p.kyc_status; end if;

  if coalesce(p.full_name, '') = '' or coalesce(p.address, '') = '' or p.delivery_platform is null
     or coalesce(p.emergency_contact_phone, '') = '' then
    raise exception 'Complete your profile first' using errcode = 'P0001';
  end if;

  select array_agg(t) into missing
  from unnest(array['aadhaar', 'pan', 'driving_licence']::public.doc_type[]) t
  where not exists (
    select 1 from public.kyc_documents d
    where d.user_id = p.id and d.doc_type = t and d.status in ('pending', 'approved')
  );
  if missing is not null then
    raise exception 'Upload these documents: %', array_to_string(missing, ', ') using errcode = 'P0001';
  end if;

  perform public.enter_trusted();
  update public.profiles
     set kyc_status = 'submitted', kyc_reject_reason = null
   where id = p.id;
  return 'submitted';
end $$;

-- ---------------------------------------------------------------------------
-- Staff: review one document
-- ---------------------------------------------------------------------------
create or replace function public.review_kyc_document(p_doc uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare d public.kyc_documents;
begin
  perform public.require_staff();
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting this document' using errcode = 'P0001';
  end if;
  update public.kyc_documents
     set status = case when p_approve then 'approved'::public.doc_status else 'rejected'::public.doc_status end,
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_doc
  returning * into d;
  if d.id is null then raise exception 'Document not found'; end if;

  update public.profiles set kyc_status = 'under_review'
   where id = d.user_id and kyc_status = 'submitted';
end $$;

-- ---------------------------------------------------------------------------
-- Staff: final KYC decision for a customer
-- ---------------------------------------------------------------------------
create or replace function public.decide_kyc(p_user uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  pending_or_rejected int;
begin
  perform public.require_staff();

  if p_approve then
    select count(*) into pending_or_rejected
    from unnest(array['aadhaar', 'pan', 'driving_licence']::public.doc_type[]) t
    where not exists (select 1 from public.kyc_documents d where d.user_id = p_user and d.doc_type = t and d.status = 'approved');
    if pending_or_rejected > 0 then
      raise exception 'Approve Aadhaar, PAN and driving licence before approving the customer' using errcode = 'P0001';
    end if;
    update public.profiles set kyc_status = 'approved', kyc_reject_reason = null where id = p_user;
    perform public.notify(p_user, 'You''re verified', 'Your documents are approved. You can now request a scooter.',
                          jsonb_build_object('type', 'kyc', 'status', 'approved', 'route', '/scooters'));
  else
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Give a reason so the customer can fix it' using errcode = 'P0001';
    end if;
    update public.profiles set kyc_status = 'rejected', kyc_reject_reason = trim(p_reason) where id = p_user;
    perform public.notify(p_user, 'Verification failed', trim(p_reason),
                          jsonb_build_object('type', 'kyc', 'status', 'rejected', 'route', '/onboarding/documents'));
  end if;
end $$;

-- Staff: activate / deactivate a customer
create or replace function public.set_customer_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_staff();
  update public.profiles set is_active = p_active where id = p_user and role = 'customer';
end $$;

-- Customer: ask for account deletion (handled by staff, data kept as legally required)
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set deletion_requested_at = now() where id = auth.uid();
end $$;

-- Customer: record privacy consent (once)
create or replace function public.record_consent()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set consent_at = coalesce(consent_at, now()) where id = auth.uid();
end $$;
