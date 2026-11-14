# API reference

Apps talk to Supabase directly (PostgREST + Storage + Realtime) with the **anon key + user JWT**;
RLS decides what each user sees. State changes that involve business rules go through
`security definer` RPCs that re-check the caller's role. Nothing trusts the client for role or amount.

## RPCs (`supabase.rpc(name, args)`)

### Customer
| RPC | Args | Does |
|---|---|---|
| `record_consent` | – | Sets `consent_at` once |
| `submit_kyc` | – | Checks profile complete + Aadhaar, PAN, DL uploaded → `submitted` |
| `request_scooter` | `p_pickup`, `p_preferred_scooter?` | KYC approved, no open rental/pending request → booking |
| `cancel_booking` | `p_booking` | Own pending request → cancelled |
| `render_agreement` | `p_rental` | Returns `{ template_version, values, body }` for preview |
| `sign_agreement` | `p_rental`, `p_signature_path` | Signature must exist at `agreements/<uid>/…`; stores snapshot + SHA-256, rental → `pending_handover`, queues PDF |
| `rental_amount_due` | `p_rental` | `{ rent, late_fee, total, period_start, period_end, days_late, weeks_due, outstanding, renewal_blocked }` |
| `prepare_rent_payment` | `p_rental` | (called by `create-payment-order`) creates a `created` payment with the server-computed amount |
| `set_fcm_token` | `p_token` | Saves device token (moves it off any other account) |
| `request_account_deletion` | – | Flags the account for staff |

### Staff (staff / manager / owner)
| RPC | Does |
|---|---|
| `review_kyc_document(p_doc, p_approve, p_note?)` | Approve/reject one document (reason required to reject) |
| `decide_kyc(p_user, p_approve, p_reason?)` | Approve (needs Aadhaar+PAN+DL approved) or reject with reason; notifies |
| `set_customer_active(p_user, p_active)` | Activate / deactivate |
| `allocate_scooter(p_booking, p_scooter, p_note?)` | Scooter → reserved, rental `pending_agreement` with rent snapshot; notifies |
| `reject_booking(p_booking, p_note)` | Declines with note; notifies |
| `complete_handover(p_rental, p_checklist, p_collect_deposit, p_collect_first_week, p_method, p_notes?)` | Requires signed agreement + customer ack; rental active, due = today + 7; records offline payments if ticked |
| `complete_return(p_rental, p_checklist, p_scooter_status, p_settlement_note?)` | Requires outstanding = 0 or a settlement note |
| `terminate_rental(p_rental, p_reason, p_scooter_status)` | Closes rental |
| `set_renewal_block(p_rental, p_blocked, p_reason?)` | Hold / allow renewal |
| `record_offline_payment(p_rental, p_amount, p_type, p_method, p_notes?)` | Cash/offline UPI/bank; rent advances due date +7; audited |
| `dashboard_overview()` | JSON for the Overview page |
| `report_outstanding()` | Overdue / due in 3 days list |

### Manager / owner
`report_collections(p_from, p_to, p_group day|week|month)`, `report_customers(p_from, p_to)`,
`report_utilisation(p_from, p_to)`.

### Owner
`apply_current_rent(p_rental_ids?)` – push the current rent onto running rentals.
`save_agreement_template(p_body)` – new template version.

### System only (service role / pg_cron)
`apply_gateway_payment(p_order_id, p_payment_id, p_amount_paise)` → `paid | duplicate | unknown_order | amount_mismatch`,
`mark_gateway_failed(...)`, `mark_overdue_rentals()`, `send_due_reminders()`, `notify(...)`.

## Edge Functions (`/functions/v1/<name>`)

| Function | Auth | Request | Response |
|---|---|---|---|
| `create-payment-order` | user JWT | `{ rental_id }` | `{ order_id, key_id, amount, amount_paise, payment_id, prefill }` |
| `razorpay-webhook` | `X-Razorpay-Signature` (HMAC-SHA256 of raw body) | Razorpay event | `{ ok, result }`; 400 bad signature; 500 → Razorpay retries |
| `generate-pdf` | `x-internal-secret` or staff JWT | `{ kind: 'agreement' \| 'receipt', id }` | `{ path }` |
| `send-push` | `x-internal-secret` | `{ id }` (notification) | `{ ok }` – records `push_sent_at` / `push_error`, clears dead tokens |
| `admin-users` | owner JWT | `{ action: create \| set_role \| set_active \| reset_password, … }` | `{ ok }` / `{ id }` |

### Payment flow

1. App → `create-payment-order` → DB computes amount → Razorpay order → `payments.razorpay_order_id`.
2. App opens Razorpay Checkout (UPI). Whatever the SDK returns, the app only shows "Confirming…".
3. Razorpay → `razorpay-webhook` → signature check → `apply_gateway_payment` → paid, receipt no.,
   due date +7, notifications, receipt PDF.
4. App sees the change through Realtime on its `payments` row (polling fallback, 90 s) → success / failed / still confirming.

### Notification flow

Any RPC calls `notify()` → row in `notifications` (in-app inbox) → trigger → `pg_net` →
`send-push` → FCM HTTP v1. Channels: `default`, `payments`. `data.route` deep-links the tap.
SMS/WhatsApp: add a provider in `supabase/functions/_shared/notify.ts` (interface already in place).
