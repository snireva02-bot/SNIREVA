# SNIREVA – EV scooter rental (Phase 1)

Weekly scooter rentals for delivery partners (₹1,820/week). One Supabase backend, two front ends:

| Folder | What | Stack |
|---|---|---|
| `apps/customer-app` | Rider app (Android first, iOS-ready) | Expo SDK 58, Expo Router, TypeScript, React Query |
| `apps/admin-web` | Owner / manager / staff dashboard | Vite, React 19, TanStack Table + Query, Tailwind v4 |
| `supabase/` | Database, auth, storage, Edge Functions | Postgres + RLS, pg_cron, pg_net, Deno functions |
| `packages/shared` | Generated DB types, INR/date formatting, status labels, zod schemas | TypeScript |
| `scripts/` | DB push/types, test accounts, test suites, screenshots | Node |

More docs: [docs/schema.md](docs/schema.md) (database), [docs/api.md](docs/api.md) (RPCs + Edge Functions), [docs/admin-training.md](docs/admin-training.md) (staff guide).

---

## 1. Prerequisites

- Node 20+ (tested on 24), npm 10+
- Supabase CLI 2.x (`npm i -g supabase` or scoop/brew)
- Docker Desktop (only for `npm run db:types`)
- Expo account in team `snirevas-team` (EAS builds), Android phone for the dev build
- Accounts the client must own: Supabase (Pro for daily backups), Razorpay, Firebase, SMS provider (MSG91/Twilio), Google Play Console, Vercel or Netlify

## 2. Environment variables

Root `.env` (gitignored, used by scripts):

| Variable | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | scripts, copied into both apps |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts + Edge Functions only. **Never in an app.** |
| `POSTGRES_URL_NON_POOLING` (or `SUPABASE_DB_URL`) | `npm run db:push`, `db:types`, `scripts/sql.mjs` |
| `INTERNAL_SECRET` | shared secret between the database (pg_net) and Edge Functions |

`apps/admin-web/.env.local` – see `.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

`apps/customer-app/.env` – see `.env.example`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_RAZORPAY_KEY_ID`. For EAS builds set the same values with `eas env:create` (environments `development`, `preview`, `production`).

Edge Function secrets (`supabase secrets set …`):

| Secret | Notes |
|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | test keys until Razorpay KYC is done |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when creating the webhook |
| `FCM_SERVICE_ACCOUNT_JSON` | full JSON of a Firebase service account (Cloud Messaging) |
| `INTERNAL_SECRET` | same value as in root `.env` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

## 3. First-time setup

```bash
npm install                              # all workspaces
npm run db:push                          # applies supabase/migrations + seed.sql to the project
npm run db:types                         # regenerates packages/shared/src/database.types.ts (needs Docker)
node scripts/seed-users.mjs              # owner/manager/staff + 2 test riders -> scripts/.test-accounts.json
```

Change the owner's password after first login and delete the test accounts before go-live
(Supabase dashboard → Authentication → Users).

### Edge Functions

```bash
supabase login                                           # account that owns the project
supabase link --project-ref <project-ref>
supabase secrets set --env-file ./supabase/.env.functions  # file with the secrets above (gitignored)
supabase functions deploy create-payment-order admin-users
supabase functions deploy razorpay-webhook send-push generate-pdf --no-verify-jwt
```

Then tell the database where the functions live (once):

```sql
insert into private.app_config (key, value) values
  ('functions_url', 'https://<project-ref>.supabase.co/functions/v1'),
  ('internal_secret', '<INTERNAL_SECRET>')
on conflict (key) do update set value = excluded.value;
```

Until this row exists, agreement/receipt PDFs and push notifications are queued in the
database but not sent (the in-app inbox still works).

### Razorpay

1. Dashboard → Settings → Webhooks → Add: URL `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`,
   events `payment.captured`, `payment.failed`, `order.paid`, and a secret → `RAZORPAY_WEBHOOK_SECRET`.
2. Payment capture: automatic.
3. Keep **test mode** until the client's Razorpay KYC is approved, then swap keys.

### Firebase (push)

1. Create a Firebase project → add Android app with package `com.snireva.rental`.
2. Download `google-services.json` to `apps/customer-app/` (gitignored). For EAS, upload it as a file
   env var: `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`.
3. Project settings → Service accounts → Generate key → put the JSON in `FCM_SERVICE_ACCOUNT_JSON`.

### SMS / OTP login

Supabase → Authentication → Providers → Phone → enable, choose **MSG91** or **Twilio**. In India the
sender ID and OTP template need **DLT registration** (takes 1–2 weeks – start early). Recommended
auth rate limits: 1 OTP per 60 s per number. The app also locks the number for 15 min after 5 wrong codes.

## 4. Running locally

```bash
npm run admin:dev                    # http://localhost:5173
cd apps/customer-app
npx eas-cli build --profile development --platform android   # once; install the APK on a phone
npx expo start --dev-client
```

Push and Razorpay need the **development build** (not Expo Go). The web build (`npx expo start --web`)
is useful for layout checks; signing and payments show a "works in the Android app" message there.

Run the app from `apps/customer-app` (or `npm start` at the repo root). Running `npx expo start` in the repo
root itself fails with *Unable to resolve "../../App"* because the root is not an Expo project.

## 5. Demo mode, APK and over-the-air updates

**Demo data.** `npm run demo:seed` creates 8 demo riders, one per stage (new, documents under review,
verified, request pending, agreement to sign, active, overdue, returned), plus 12 scooters, payment
history, agreements, handovers and service requests. Re-running resets them. `node scripts/seed-demo.mjs --remove`
deletes them. Riders sign in with `<name>@demo.snireva.in` and `DEMO_PASSWORD`.

**Demo mode** has two switches:
- App: `EXPO_PUBLIC_DEMO_MODE=true` (set in `eas.json` for the `development` and `preview` builds) shows
  **Try the demo** on the sign-in screen and makes **Pay** use simulated payments.
- Server: `private.app_config.demo_mode = 'on'` allows `demo_pay_rent()`, which records the payment through the
  same code path as the Razorpay webhook (due date +7, receipt number, notifications).

**Install the APK** (needs the Expo account that owns `snirevas-team`):

```bash
cd apps/customer-app
npx eas-cli login
npm run build:apk          # preview profile -> APK link + QR code, channel "preview"
```

**Ship updates over the air** (no reinstall). Any change to JS/TS code, screens, text or images:

```bash
cd apps/customer-app
npm run update:preview -- --message "Fix payment screen copy"
```

The installed app downloads the update in the background on launch / when reopened and shows
**New version ready · Tap to restart** (it also applies itself on the next cold start).
Updates reach builds with the same `version` in `app.json` (runtime policy `appVersion`).

You **must build and reinstall a new APK** only when native parts change: adding/upgrading a native
library, Expo SDK upgrade, `app.json` permissions/plugins/icons, or `google-services.json`. When you
do, bump `version` in `app.json` so old installs don't receive incompatible updates.

**Going live:** run `node scripts/seed-demo.mjs --remove`, set `demo_mode` to `'off'`, build with the
`production` profile and publish updates with `npm run update:prod`.

## 6. Tests

```bash
node scripts/tests/run-all.mjs       # 150 checks across M1–M9 against the real project
node scripts/serve-fn.mjs razorpay-webhook &  node scripts/tests/webhook.mjs   # signed webhook test
```

The suites cover: RLS (customer A can't read/write customer B anywhere, anonymous sees nothing),
role checks, KYC, booking/allocation, agreement signing + hash, handover/return, server-side amount,
idempotent webhook, amount mismatch, early payment (+7 from due date), late fees, overdue job,
reminders, renewal hold, rent snapshot, offline payments + audit log, service requests, reports.
They create and change data – run them on a staging project, not production.

## 7. Deploying

**Admin dashboard** – Vercel: import the repo, root `apps/admin-web`, build `npm run build`, output
`dist`, env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. (`vercel.json` handles SPA routing;
`public/_redirects` does the same on Netlify.)

**Android** –
```bash
cd apps/customer-app
npx eas-cli build --profile production --platform android     # AAB for Play Store
npx eas-cli submit --profile production --platform android    # internal testing track
```

## 8. Business rules (where they live)

| Rule | Enforced in |
|---|---|
| Request a scooter only after KYC approved | `request_scooter()` |
| Allocation → scooter reserved + rental `pending_agreement` | `allocate_scooter()` |
| Sign → `pending_handover`; handover → `active`, due = start + 7 | `sign_agreement()`, `complete_handover()` |
| Paying moves due date +7 from the current due date | `private.advance_rental()` |
| Renewal blocked when staff hold it | `prepare_rent_payment()` |
| Overdue when today > due + grace days (daily 09:00 IST) | `mark_overdue_rentals()` via pg_cron |
| Paid only by verified webhook or staff | `apply_gateway_payment()` (service role only), `record_offline_payment()` |
| Webhook idempotent | unique `razorpay_payment_id` + status check |
| Rent snapshotted at start | `rentals.weekly_rent`; `apply_current_rent()` (owner) to change running rentals |
| Return settles outstanding | `complete_return()` requires payment or a settlement note |
| Every offline payment audited | audit triggers on payments/rentals/scooters/kyc_documents/settings/profiles |

**Late fee** (configurable): no fee if paid within `grace_days` of the due date; after that
`late_fee_per_day` × days since the due date.

**Deposit and first week** are collected at handover (cash / offline UPI / bank) – tick boxes on the
handover form. Weekly UPI payments start from the second week.

## 9. Open items for the client

- Confirm **deposit, late fee, grace days, support numbers, company address/GSTIN** (seeded with placeholders; edit in Settings).
- **Agreement text must be reviewed by a lawyer** (Settings → Agreement template; saving creates a new version).
- Razorpay KYC → live keys. DLT registration for SMS. Play Console account.
- Logo: the supplied PNG has a black background, so it is shown on a dark tile. An SVG/transparent PNG would look sharper.

## 10. Recurring costs (approximate, check current pricing)

| Item | Cost |
|---|---|
| Supabase Pro (daily backups, no pausing) | ~US$25/month + usage |
| SMS OTP (MSG91/Twilio, DLT) | ~₹0.15–0.25 per SMS + one-time DLT fees |
| Razorpay | ~2% per transaction (UPI may be lower; negotiate) |
| Google Play Console | US$25 one-time |
| Vercel / Netlify | free tier is enough for an internal dashboard |
| Expo EAS | free tier (limited builds/month) or Starter plan |
| Firebase Cloud Messaging | free |
