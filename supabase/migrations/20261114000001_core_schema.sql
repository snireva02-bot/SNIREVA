-- SNIREVA Phase 1: core schema (enums + tables)

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'staff', 'manager', 'owner');
create type public.kyc_status as enum ('not_submitted', 'submitted', 'under_review', 'approved', 'rejected');
create type public.delivery_platform as enum ('blinkit', 'zepto', 'swiggy_instamart', 'swiggy', 'zomato', 'other');
create type public.doc_type as enum ('aadhaar', 'pan', 'address_proof', 'driving_licence', 'other');
create type public.doc_status as enum ('pending', 'approved', 'rejected');
create type public.scooter_status as enum ('available', 'reserved', 'rented', 'under_maintenance', 'retired');
create type public.booking_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.rental_status as enum ('pending_agreement', 'pending_handover', 'active', 'overdue', 'returned', 'terminated');
create type public.payment_type as enum ('rent', 'deposit', 'late_fee', 'other');
create type public.payment_method as enum ('upi_gateway', 'cash', 'offline_upi', 'bank');
create type public.payment_status as enum ('created', 'paid', 'failed', 'refunded');
create type public.handover_kind as enum ('handover', 'return');
create type public.service_category as enum ('battery', 'charging', 'motor', 'brakes', 'tyres', 'complaint', 'other');
create type public.service_status as enum ('open', 'assigned', 'in_progress', 'resolved', 'closed');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Branches (Phase 2 multi-branch; one default branch for now)
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branches (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Hyderabad (main)');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  delivery_platform public.delivery_platform,
  photo_path text,
  role public.user_role not null default 'customer',
  kyc_status public.kyc_status not null default 'not_submitted',
  kyc_reject_reason text,
  is_active boolean not null default true,
  fcm_token text,
  consent_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_kyc_idx on public.profiles (kyc_status);
create index profiles_phone_idx on public.profiles (phone);

-- ---------------------------------------------------------------------------
-- KYC documents
-- ---------------------------------------------------------------------------
create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc_type public.doc_type not null,
  file_path text not null,
  status public.doc_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index kyc_documents_user_idx on public.kyc_documents (user_id, doc_type);

-- ---------------------------------------------------------------------------
-- Fleet
-- ---------------------------------------------------------------------------
create table public.scooters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  model text not null,
  chassis_no text,
  motor_no text,
  battery_no text,
  battery_details text,
  photo_paths text[] not null default '{}',
  weekly_rent numeric(10, 2),
  status public.scooter_status not null default 'available',
  maintenance_notes text,
  branch_id uuid default '00000000-0000-0000-0000-000000000001' references public.branches (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scooters_status_idx on public.scooters (status);

create table public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  branch_id uuid default '00000000-0000-0000-0000-000000000001' references public.branches (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pickup_location_id uuid references public.pickup_locations (id),
  status public.booking_status not null default 'pending',
  scooter_id uuid references public.scooters (id),
  admin_note text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index booking_one_pending_per_user on public.booking_requests (user_id) where status = 'pending';
create index booking_status_idx on public.booking_requests (status, created_at);

-- ---------------------------------------------------------------------------
-- Rentals
-- ---------------------------------------------------------------------------
create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  scooter_id uuid not null references public.scooters (id),
  booking_request_id uuid references public.booking_requests (id),
  pickup_location_id uuid references public.pickup_locations (id),
  start_date date,
  next_due_date date,
  weekly_rent numeric(10, 2) not null,
  deposit_amount numeric(10, 2) not null default 0,
  status public.rental_status not null default 'pending_agreement',
  renewal_blocked boolean not null default false,
  renewal_block_reason text,
  ended_at timestamptz,
  end_reason text,
  branch_id uuid default '00000000-0000-0000-0000-000000000001' references public.branches (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rentals_one_open_per_scooter on public.rentals (scooter_id)
  where status not in ('returned', 'terminated');
create unique index rentals_one_open_per_user on public.rentals (user_id)
  where status not in ('returned', 'terminated');
create index rentals_due_idx on public.rentals (status, next_due_date);

create table public.agreement_templates (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  body text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  version int not null,
  terms_snapshot jsonb not null,
  terms_hash text,
  signature_path text,
  signed_at timestamptz,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index agreements_one_per_rental on public.agreements (rental_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create sequence public.receipt_no_seq start 1001;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid references public.rentals (id),
  user_id uuid not null references public.profiles (id),
  amount numeric(10, 2) not null check (amount > 0),
  late_fee_amount numeric(10, 2) not null default 0,
  type public.payment_type not null default 'rent',
  method public.payment_method not null,
  status public.payment_status not null default 'created',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  failure_reason text,
  period_start date,
  period_end date,
  notes text,
  recorded_by uuid references public.profiles (id),
  receipt_no text unique,
  receipt_path text,
  paid_at timestamptz,
  branch_id uuid default '00000000-0000-0000-0000-000000000001' references public.branches (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_rental_idx on public.payments (rental_id, created_at desc);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, paid_at);

-- ---------------------------------------------------------------------------
-- Handover / return
-- ---------------------------------------------------------------------------
create table public.handover_records (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  kind public.handover_kind not null,
  scooter_condition text,
  battery_condition text,
  charger_ok boolean,
  accessories text,
  damage_notes text,
  photo_paths text[] not null default '{}',
  customer_ack_at timestamptz,
  outstanding_amount numeric(10, 2) not null default 0,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index handover_rental_idx on public.handover_records (rental_id);

-- ---------------------------------------------------------------------------
-- Service requests
-- ---------------------------------------------------------------------------
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  rental_id uuid references public.rentals (id),
  category public.service_category not null,
  description text not null,
  photo_paths text[] not null default '{}',
  status public.service_status not null default 'open',
  assigned_to uuid references public.profiles (id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_status_idx on public.service_requests (status, created_at);
create index service_user_idx on public.service_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications (in-app inbox; every push is stored here)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  channel text not null default 'default',
  read_at timestamptz,
  push_sent_at timestamptz,
  push_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  weekly_rent numeric(10, 2) not null default 1820,
  deposit_amount numeric(10, 2) not null default 0,
  late_fee_per_day numeric(10, 2) not null default 0,
  grace_days int not null default 0 check (grace_days >= 0),
  support_phone text,
  support_whatsapp text,
  support_email text,
  company_name text not null default 'SNIREVA Pvt. Ltd.',
  company_address text,
  company_gstin text,
  company_cin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'branches','profiles','kyc_documents','scooters','pickup_locations','booking_requests',
    'rentals','agreement_templates','agreements','payments','handover_records',
    'service_requests','notifications','settings'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
