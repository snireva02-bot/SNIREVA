# SNIREVA EV Scooter Rental — Build Spec (MVP / Phase 1)

> Hand this file to Claude Code. Build **Phase 1 only**. Work milestone by milestone (Section 14), run and verify each one before starting the next. Ask before adding anything outside this spec.

## 1. What we are building

SNIREVA Pvt. Ltd. rents electric scooters to delivery partners (Blinkit, Zepto, Swiggy, Zomato etc.) on a **weekly rental of ₹1,820 per scooter** (≈ ₹260/day, reference only).

Two interfaces, one backend:

1. **Customer mobile app** (Expo / React Native, Android first, iOS-ready)
2. **Admin web dashboard** (web, used by owner / managers / staff)

Backend: **Supabase**. Push notifications: **Firebase Cloud Messaging (FCM)**. Payments: **Razorpay (UPI)**.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Customer app | Expo (SDK latest), TypeScript, Expo Router, EAS Build (dev build, not Expo Go, because of FCM) |
| Admin dashboard | Vite + React + TypeScript + TanStack Table + React Query, deployed on Vercel/Netlify. Separate folder, same repo |
| Backend | Supabase: Postgres, Auth, Storage, Edge Functions (Deno), pg_cron, Realtime |
| Notifications | FCM via `expo-notifications` (native FCM token, `getDevicePushTokenAsync`). Sent from Edge Functions using FCM HTTP v1 |
| Payments | Razorpay Orders + Checkout (UPI). Webhook verified in an Edge Function |
| OTP login | Supabase phone auth with an Indian SMS provider (MSG91 or Twilio). DLT registration is needed in India, flag this to the client early |
| PDFs | Agreement and receipts generated in an Edge Function (pdf-lib), stored in Storage |
| Exports | Excel via SheetJS, PDF via same PDF helper, in the admin dashboard |

Repo layout (monorepo):

```
snireva/
  apps/
    customer-app/      # Expo
    admin-web/         # Vite React
  supabase/
    migrations/        # SQL, versioned
    functions/         # Edge Functions
    seed.sql
  packages/
    shared/            # generated DB types, constants (RENT_AMOUNT etc.), zod schemas
  README.md
```

## 3. Roles and permissions

- `customer`: only sees and edits own data.
- `staff`: day-to-day ops (approve docs, allocate scooters, record offline payments, service requests).
- `manager`: staff + reports, rate/deposit settings view.
- `owner`: everything, including staff management and settings changes.

Store role in `profiles.role`. **Row Level Security on every table.** Admin checks via a `public.is_staff()` / `public.has_role()` SQL function. Never trust the client for role.

## 4. Database schema (Postgres)

Use enums for statuses. All tables have `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`. Add `branch_id` (nullable now, default branch) to scooters, rentals, payments so multi-branch (Phase 2) needs no migration pain.

**profiles**: `id` (= auth.users.id), `full_name`, `phone`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `delivery_platform` (enum: blinkit, zepto, swiggy_instamart, swiggy, zomato, other), `photo_path`, `role`, `kyc_status` (submitted, under_review, approved, rejected), `kyc_reject_reason`, `is_active`, `fcm_token`, `consent_at`.

**kyc_documents**: `user_id`, `doc_type` (aadhaar, pan, address_proof, driving_licence, other), `file_path`, `status`, `reviewed_by`, `review_note`.

**scooters**: `code` (unique Scooter ID), `model`, `chassis_no`, `motor_no`, `battery_no`, `battery_details`, `photo_paths[]`, `weekly_rent` (nullable, falls back to setting), `status` (available, reserved, rented, under_maintenance, retired), `branch_id`.

**booking_requests**: `user_id`, `pickup_location_id`, `status` (pending, approved, rejected, cancelled), `scooter_id` (set on allocation), `admin_note`.

**pickup_locations**: `name`, `address`, `branch_id`, `is_active`.

**rentals**: `user_id`, `scooter_id`, `start_date`, `next_due_date`, `weekly_rent` (snapshot at start), `deposit_amount`, `status` (pending_agreement, pending_handover, active, overdue, returned, terminated), `ended_at`.

**agreements**: `rental_id`, `version`, `terms_snapshot` (jsonb), `signature_path` (drawn signature image), `signed_at`, `pdf_path`.

**payments**: `rental_id`, `user_id`, `amount`, `type` (rent, deposit, late_fee, other), `method` (upi_gateway, cash, offline_upi, bank), `status` (created, paid, failed, refunded), `razorpay_order_id`, `razorpay_payment_id` (unique), `period_start`, `period_end`, `recorded_by` (for offline), `receipt_no` (sequential), `receipt_path`, `paid_at`.

**handover_records**: `rental_id`, `kind` (handover, return), `scooter_condition`, `battery_condition`, `charger_ok`, `accessories`, `damage_notes`, `photo_paths[]`, `customer_ack_at`, `outstanding_amount`, `recorded_by`.

**service_requests**: `user_id`, `rental_id`, `category` (battery, charging, motor, brakes, tyres, other), `description`, `photo_paths[]`, `status` (open, assigned, in_progress, resolved, closed), `assigned_to`.

**notifications**: `user_id`, `title`, `body`, `data` (jsonb), `read_at`. Every push is also stored here so the app has an in-app inbox.

**settings** (single row / key-value): `weekly_rent` (default 1820), `deposit_amount`, `late_fee_per_day`, `grace_days`, `support_phone`, `support_whatsapp`, company details for agreements.

**audit_log**: `actor_id`, `action`, `entity`, `entity_id`, `before`, `after`, `at`. Written by DB triggers on payments, rentals, scooters, kyc_documents, settings. Admin can never edit or delete audit rows (no UPDATE/DELETE policy).

Storage buckets (all **private**, access via signed URLs, RLS by folder = user id): `kyc`, `scooters` (public read is fine for catalogue photos), `handover`, `service`, `agreements`, `receipts`.

## 5. Business rules (do not get these wrong)

1. A customer cannot request a scooter until `kyc_status = approved`.
2. Only staff can allocate a scooter. Allocation sets scooter `reserved` and creates a `rental` in `pending_agreement`.
3. Customer signs agreement, then staff completes handover checklist, which sets scooter `rented` and rental `active`, `start_date = today`, `next_due_date = start + 7 days`.
4. Rent is **weekly, 7-day periods**. Paying a period moves `next_due_date` by +7 days. Paying early does not shorten the period, it extends from the current due date.
5. Renewal is "subject to payment and company approval": if admin has flagged the rental, renewal is blocked until staff clears it.
6. Rental flips to `overdue` automatically (pg_cron, daily) when `today > next_due_date + grace_days`.
7. **Payment is only marked paid by the Razorpay webhook** (signature verified) or by staff recording an offline payment. The client app returning "success" is never trusted.
8. Webhook must be **idempotent** (unique `razorpay_payment_id`).
9. Rent amount is read from settings at rental start and snapshotted on the rental, so changing the rate later does not alter running rentals unless admin explicitly applies it.
10. Return: staff completes return checklist, system shows outstanding balance, on settlement scooter goes `available` or `under_maintenance`, rental `returned`.
11. Every offline payment records who, when, amount, and appears in the audit log.

## 6. Customer app, screens and behaviour

1. **Onboarding / Login**: phone number, OTP, resend timer, clear errors.
2. **Profile setup**: name, address, emergency contact, delivery platform (picker), profile photo.
3. **Documents**: upload (camera or gallery) each required doc, show per-document status. Compress images client-side (max about 1600px, quality 0.7) before upload.
4. **Verification status**: Submitted, Under Review, Approved, Rejected (with reason and re-upload).
5. **Browse scooters**: list with photo, model, battery details, weekly price. Pickup location selector. "Request scooter".
6. **My rental**: scooter details, start date, next due date, status, amount due.
7. **Pay rent**: big due card, "Pay ₹1,820", Razorpay UPI checkout, success/failure screen, receipt.
8. **Payment history**: list, tap for receipt (PDF download/share).
9. **Agreement**: read terms, draw signature, accept, download PDF copy.
10. **Service requests**: create (category, text, photos), list, track status.
11. **Support**: call, WhatsApp (deep link to company number), complaint form.
12. **Notifications inbox** and settings (logout, privacy notice, delete-account request).

Handle: offline/poor network (cache last known rental and payment state, retry uploads), loading and empty states, re-login persistence, and the Android back button.

## 7. Admin web dashboard, pages

1. **Login** (email + password, Supabase Auth, role-gated).
2. **Overview**: total / available / rented / maintenance scooters, active customers, collected this week, pending and overdue amounts, due in next 3 days, pending KYC count.
3. **Customers**: table with search and filters, detail page with documents (image viewer, approve / reject with reason), rental and payment history, activate/deactivate.
4. **Booking requests**: pending queue, allocate scooter (dropdown of available scooters), reject with note.
5. **Scooters**: CRUD, unique code, chassis / motor / battery numbers, photos, status changes, maintenance notes.
6. **Rentals**: list with due dates and overdue highlighting, rental detail, start handover, record return, terminate.
7. **Payments**: all payments, filters (date, status, method), record offline payment, view/regenerate receipt, failed and overdue lists.
8. **Service requests**: assign to staff, change status, notes.
9. **Reports**: daily / weekly / monthly collections, customer-wise history, outstanding and overdue, scooter utilisation and maintenance. **Export to Excel and PDF**.
10. **Settings**: weekly rent, deposit, late fee, grace days, support numbers, agreement template text, staff users and roles (owner only).
11. **Audit log** (read-only).

Tables must be fast, sortable, paginated server-side, and usable on a laptop screen. No decorative charts; use simple numbers and one or two clean charts at most.

## 8. Notifications (Firebase)

Setup:
- Create Firebase project, add Android app (package name from `app.json`), download `google-services.json`, reference it in `app.json` (`android.googleServicesFile`).
- Use `expo-notifications` with a **development build** via EAS (push does not work in Expo Go on Android).
- On login, get the device token, save to `profiles.fcm_token`. Refresh on token change; clear on logout.
- Edge Function `send-push` signs a Google service-account JWT and calls **FCM HTTP v1**. Service account JSON is stored as a Supabase secret, never in the app.
- Create an Android notification channel (`default`, high importance, plus `payments`).

Events that must send a push (and write to `notifications`):

| Event | Trigger |
|---|---|
| KYC approved / rejected | admin action (DB trigger or function) |
| Booking approved + scooter allocated | allocation |
| Payment success / failure | Razorpay webhook |
| Rent due reminder | pg_cron daily: 2 days before and on due date |
| Overdue alert | pg_cron daily after due date |
| Renewal confirmed | after payment moves due date |
| Service request status change | admin action |

SMS / WhatsApp: **out of Phase 1 build**, but keep a `notify()` function with a provider interface so it can be added later. Only through approved providers and with customer consent.

## 9. Payments (Razorpay)

Flow:
1. App calls Edge Function `create-payment-order` with `rental_id`. Function checks the caller owns the rental, computes the amount **server-side**, creates Razorpay order, inserts `payments` row `created`.
2. App opens Razorpay Checkout (UPI) with the order id. Needs a dev build (native SDK).
3. Razorpay calls Edge Function `razorpay-webhook`. Verify `X-Razorpay-Signature` with the webhook secret, mark payment `paid`, set period dates, advance `next_due_date`, generate receipt PDF, send push.
4. App listens via Supabase Realtime on the payment row, shows result.
5. `payment.failed` event marks failed and notifies.

Never store card or UPI PIN data. Keys live in Edge Function secrets. Use test mode until the client completes Razorpay KYC.

## 10. Digital agreement

- Template text editable in settings (owner), versioned.
- On rental creation, fill template with company, customer, scooter IDs, rent, start date, deposit, late-payment and termination terms, battery/charger/damage/accident/return responsibilities.
- Customer signs on a canvas, signature image stored, a PDF generated with the signature, signed time and a hash of the terms. Downloadable from the app and dashboard.
- Show a visible note in the admin settings: *"Final wording must be reviewed by a lawyer."*

## 11. Security checklist

- RLS on all tables, tested with a customer account trying to read another customer's rows.
- Storage policies scoped by user folder; staff access via `is_staff()`.
- No service-role key in either client. Only anon key in apps.
- Edge Functions validate JWT and role.
- Secrets only in Supabase secrets / EAS secrets / env files that are gitignored.
- Rate-limit OTP resend; lock after repeated failures.
- Admin actions logged. Daily backups on (Supabase Pro includes them).
- Privacy notice and consent checkbox at signup, data deletion request flow.

## 12. UI / design direction (important)

The UI must look **like a real product made by a designer, not like generated AI output**.

Brand (taken from the client's deck):
- Primary green `#23915C`, dark ink `#141F1D`, secondary text `#45534E`, borders `#DCE6E0`, soft background `#F2F7F4`, tint `#DCF1E6`, white cards.
- Use the official SNIREVA logo supplied by the client (extract `image1.jpg` from the deck or ask for a PNG/SVG).

Rules:
- One typeface family (Inter or Plus Jakarta Sans), 3 sizes of body text, clear hierarchy. Numbers (₹ amounts, dates) in tabular figures.
- Flat and calm. Thin 1px borders, 8px radius, almost no shadow. **No gradients, no glassmorphism, no neon, no emoji as icons, no purple.**
- One icon set only (Lucide), consistent stroke weight.
- Generous but consistent spacing on a 4/8px scale. Aligned grids. Real content widths, no centered paragraphs.
- Copy is short and plain: "Rent due 21 Nov", not "Your amazing journey continues!". Use rupee formatting `₹1,820` with Indian grouping (`en-IN`).
- Status chips use a small fixed palette (green, amber, red, grey) with text labels, never colour alone.
- Real empty states and skeleton loaders, not spinners everywhere.
- Mobile: bottom tab bar (Home, Rental, Payments, Support, Profile), primary action pinned at bottom, thumb-reachable, 48px touch targets.
- Admin: left sidebar, dense readable tables, sticky filters, keyboard-friendly forms.
- Support English first; structure strings in an i18n file so Hindi can be added.
- Light theme only for v1.

## 13. Out of scope for this build (Phase 2 / 3)

Multi-branch UI, QR scooter identification, wallet / advance balance, promotions, referrals, GPS, battery IoT, automated maintenance alerts, fleet analytics, SMS / WhatsApp sending, iOS store release (code stays iOS-compatible).

## 14. Milestones (build and verify in this order)

1. **Foundation**: monorepo, Supabase project, migrations for all tables, enums, RLS, audit triggers, seed data, generated types, auth with roles.
2. **Customer onboarding**: OTP login, profile, document upload, KYC statuses. Admin: login, customers, document review.
3. **Fleet and booking**: scooters CRUD, browse and request, allocation, rental creation.
4. **Agreement and handover**: agreement generation and signing, handover and return checklists.
5. **Payments**: Razorpay order + webhook, receipts, offline payment entry, due-date logic, pg_cron jobs.
6. **Notifications**: FCM setup, token handling, all events in Section 8, in-app inbox.
7. **Service requests and support**: customer + admin flows.
8. **Dashboard and reports**: overview, reports, Excel/PDF export, audit log, settings.
9. **Hardening**: RLS tests, error states, offline handling, EAS production build (AAB), admin deployment, README with setup, env vars, deploy steps and API/schema docs.

At the end of each milestone: run the app, list what was verified, list anything not done.

## 15. Handover deliverables (from the client deck)

Source code (repo owned by SNIREVA), DB schema and API docs, deployed admin dashboard, Android build, hosting/account details, admin training notes, and a short list of recurring costs (Supabase plan, SMS/OTP, Razorpay fees, Play Console).

## 16. Setup values needed from the client / developer

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (functions only), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FCM_SERVICE_ACCOUNT_JSON`, SMS provider keys + DLT template IDs, Android package name (e.g. `com.snireva.rental`), logo files, company legal details and agreement text.
