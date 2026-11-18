-- Riders see available scooters + the scooters on their OPEN rentals (not ones they returned long ago).
drop policy if exists scooters_read on public.scooters;
create policy scooters_read on public.scooters for select to authenticated
  using (
    public.is_staff()
    or status = 'available'
    or exists (select 1 from public.rentals r where r.scooter_id = scooters.id and r.user_id = auth.uid()
               and r.status not in ('returned', 'terminated'))
    or exists (select 1 from public.service_requests s where s.scooter_id = scooters.id and s.user_id = auth.uid())
  );
