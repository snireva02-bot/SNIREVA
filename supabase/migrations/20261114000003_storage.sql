-- SNIREVA Phase 1: storage buckets + policies
-- Folder convention: <bucket>/<customer user id>/... so RLS can scope by folder.
-- Scooter catalogue photos live in a public-read bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('kyc',        'kyc',        false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('scooters',   'scooters',   true,  10485760, array['image/jpeg','image/png','image/webp']),
  ('handover',   'handover',   false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('service',    'service',    false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('agreements', 'agreements', false, 10485760, array['image/png','application/pdf']),
  ('receipts',   'receipts',   false, 10485760, array['application/pdf']),
  ('avatars',    'avatars',    false, 5242880,  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Own folder helper
create or replace function public.storage_owner_folder(object_name text)
returns boolean language sql stable as $$
  select (storage.foldername(object_name))[1] = auth.uid()::text;
$$;

-- Customer-uploadable buckets: kyc, service, agreements (signature), avatars
create policy "own uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('kyc', 'service', 'agreements', 'avatars')
    and public.storage_owner_folder(name)
  );

create policy "own reads" on storage.objects for select to authenticated
  using (
    bucket_id in ('kyc', 'service', 'agreements', 'avatars', 'handover', 'receipts')
    and public.storage_owner_folder(name)
  );

create policy "own pending deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('kyc', 'avatars', 'service') and public.storage_owner_folder(name));

create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.storage_owner_folder(name));

-- Staff: full access to every private bucket + catalogue
create policy "staff read all" on storage.objects for select to authenticated
  using (public.is_staff() and bucket_id in ('kyc','service','agreements','avatars','handover','receipts','scooters'));

create policy "staff write ops buckets" on storage.objects for insert to authenticated
  with check (public.is_staff() and bucket_id in ('handover', 'scooters'));

create policy "staff update ops buckets" on storage.objects for update to authenticated
  using (public.is_staff() and bucket_id in ('handover', 'scooters'));

create policy "staff delete catalogue" on storage.objects for delete to authenticated
  using (public.is_staff() and bucket_id in ('scooters', 'handover'));
