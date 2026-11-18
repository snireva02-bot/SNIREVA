-- Keep scooter-swap history even if the linked service request is deleted.
alter table public.rental_scooter_changes drop constraint rental_scooter_changes_service_request_id_fkey;
alter table public.rental_scooter_changes add constraint rental_scooter_changes_service_request_id_fkey
  foreign key (service_request_id) references public.service_requests (id) on delete set null;
