# Database schema

Source of truth: `supabase/migrations/*.sql`. Types: `packages/shared/src/database.types.ts`.

Every table has `id uuid`, `created_at`, `updated_at` (trigger-maintained) and **RLS enabled**.
`branch_id` (default branch `00000000-…-0001`) is on scooters, rentals, payments, pickup_locations for Phase 2.

## Tables

| Table | Purpose | Who can read | Who can write |
|---|---|---|---|
| `profiles` | One per auth user. `role` (customer/staff/manager/owner), KYC status, `fcm_token`, consent | self, staff | self (name, address, contacts, photo, token); staff (KYC, active); owner (role) – guarded by trigger |
| `kyc_documents` | Uploaded identity docs + review status | owner of doc, staff | customer inserts own `pending` docs; staff reviews via RPC |
| `scooters` | Fleet: code, chassis/motor/battery, photos, `weekly_rent` override, status | staff; customers see `available` + their own | staff (status of scooters on open rentals only via rental RPCs) |
| `pickup_locations` | Hubs | everyone signed in (active only) | staff |
| `booking_requests` | Customer request → approved/rejected/cancelled | self, staff | RPCs only |
| `rentals` | Rental with snapshot `weekly_rent`, `deposit_amount`, `next_due_date`, status, renewal hold | self, staff | RPCs only |
| `agreement_templates` | Versioned agreement text with `{{placeholders}}` | staff | owner (new version) |
| `agreements` | Signed agreement: terms snapshot, SHA-256 hash, signature path, PDF path | rental owner, staff | `sign_agreement()` / generate-pdf |
| `payments` | Rent/deposit/late fee/other; method; status; Razorpay ids; period; receipt | self, staff | RPCs / webhook only |
| `handover_records` | Handover and return checklists with photos | rental owner, staff | RPCs only |
| `service_requests` | Problems and complaints | self, staff | customer inserts own; staff updates |
| `notifications` | In-app inbox; each row is pushed via FCM | self | system only (customer may set `read_at`) |
| `settings` | Single row: rent, deposit, late fee, grace days, support numbers, company details | everyone signed in | owner |
| `audit_log` | Before/after JSON for payments, rentals, scooters, kyc_documents, settings, profiles | manager, owner | triggers only (no UPDATE/DELETE possible) |
| `branches` | Phase 2 | everyone signed in | owner |
| `private.app_config` | Functions URL + internal secret (not exposed via API) | – | SQL only |

## Enums

`user_role`, `kyc_status` (not_submitted, submitted, under_review, approved, rejected),
`delivery_platform`, `doc_type`, `doc_status`, `scooter_status` (available, reserved, rented,
under_maintenance, retired), `booking_status`, `rental_status` (pending_agreement,
pending_handover, active, overdue, returned, terminated), `payment_type` (rent, deposit, late_fee,
other), `payment_method` (upi_gateway, cash, offline_upi, bank), `payment_status` (created, paid,
failed, refunded), `handover_kind`, `service_category` (battery, charging, motor, brakes, tyres,
complaint, other), `service_status`.

## Storage buckets

All private (signed URLs) except `scooters` (public catalogue photos). Paths start with the
customer's user id so RLS can scope by folder.

| Bucket | Path | Customer | Staff |
|---|---|---|---|
| `kyc` | `<uid>/<doc>-<ts>.jpg` | upload/read own | read |
| `avatars` | `<uid>/photo-<ts>.jpg` | upload/read own | read |
| `service` | `<uid>/issue-<ts>.jpg` | upload/read own | read |
| `agreements` | `<uid>/signature-…png`, `<uid>/agreement-<rental>.pdf` | upload signature, read own | read |
| `handover` | `<uid>/<rental>/handover-…jpg` | read own | upload/read |
| `receipts` | `<uid>/SNR-000123.pdf` | read own | read |
| `scooters` | `<CODE>/…jpg`, `_brand/logo-wide.png` | public read | upload/delete |

## Scheduled jobs (pg_cron, UTC)

| Job | Schedule | Function |
|---|---|---|
| `snireva-mark-overdue` | `30 3 * * *` (09:00 IST) | `mark_overdue_rentals()` – flips to overdue, sends daily overdue alert |
| `snireva-due-reminders` | `35 3 * * *` (09:05 IST) | `send_due_reminders()` – 2 days before and on the due date |

All SNIREVA functions run with `timezone = Asia/Kolkata`, so "today" is the Indian date.
