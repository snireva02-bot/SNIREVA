// Demo data: 8 riders, one at each stage of the journey, plus fleet, payments history,
// agreements, handovers, service requests and notifications. Safe to re-run (resets demo riders).
//   node scripts/seed-demo.mjs          -> (re)create demo data
//   node scripts/seed-demo.mjs --remove -> delete all demo riders and their data
// Demo riders sign in with <name>@demo.snireva.in and DEMO_PASSWORD (from .env).
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { dbUrl, loadEnv, root } from './env.mjs';

const env = loadEnv();
const PASSWORD = env.DEMO_PASSWORD;
if (!PASSWORD) throw new Error('Set DEMO_PASSWORD in .env');
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: dbUrl().replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("set timezone = 'Asia/Kolkata'");
const q = (sql, params) => db.query(sql, params);
const asset = (f) => readFileSync(path.join(root, 'scripts', 'demo-assets', f));

const RIDERS = [
  { key: 'priya', name: 'Priya Sharma', phone: '+919100000101', platform: 'zepto', stage: 'new' },
  { key: 'arjun', name: 'Arjun Reddy', phone: '+919100000102', platform: 'swiggy', stage: 'kyc_submitted' },
  { key: 'imran', name: 'Mohammed Imran', phone: '+919100000103', platform: 'blinkit', stage: 'approved' },
  { key: 'kiran', name: 'Kiran Kumar', phone: '+919100000104', platform: 'zomato', stage: 'booking_pending' },
  { key: 'lakshmi', name: 'Lakshmi Devi', phone: '+919100000105', platform: 'swiggy_instamart', stage: 'sign_agreement' },
  { key: 'ravi', name: 'Ravi Teja', phone: '+919100000106', platform: 'zepto', stage: 'active' },
  { key: 'suresh', name: 'Suresh Babu', phone: '+919100000107', platform: 'blinkit', stage: 'overdue' },
  { key: 'anitha', name: 'Anitha Rao', phone: '+919100000108', platform: 'swiggy', stage: 'returned' },
  { key: 'venkat', name: 'Venkat Fleet Services', phone: '+919100000109', platform: 'zepto', stage: 'fleet_3_scooters' },
];
const email = (k) => `${k}@demo.snireva.in`;

// ---------------------------------------------------------------- cleanup
async function removeDemo() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ids = data.users.filter((u) => u.email?.endsWith('@demo.snireva.in')).map((u) => u.id);
  if (!ids.length) return;
  await q(`
    delete from public.payments where user_id = any($1);
    delete from public.payment_orders where user_id = any($1);
    delete from public.handover_records where rental_id in (select id from public.rentals where user_id = any($1));
    delete from public.agreements where rental_id in (select id from public.rentals where user_id = any($1));
    delete from public.service_requests where user_id = any($1);
    update public.scooters s set status = 'available' from public.rentals r
      where r.scooter_id = s.id and r.user_id = any($1) and r.status not in ('returned','terminated');
    delete from public.rentals where user_id = any($1);
    delete from public.booking_requests where user_id = any($1);
    delete from public.kyc_documents where user_id = any($1);
    delete from public.notifications where user_id = any($1);
  `.replace(/\$1/g, `array[${ids.map((i) => `'${i}'::uuid`).join(',')}]`));
  for (const id of ids) {
    for (const b of ['kyc', 'agreements', 'receipts', 'avatars', 'service', 'handover']) {
      const { data: files } = await admin.storage.from(b).list(id);
      if (files?.length) await admin.storage.from(b).remove(files.map((f) => `${id}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`removed ${ids.length} demo riders`);
}

await removeDemo();
if (process.argv.includes('--remove')) { await db.end(); process.exit(0); }

// ---------------------------------------------------------------- fleet
await q(`
  insert into public.scooters (code, model, chassis_no, motor_no, battery_no, battery_details, status) values
    ('SNR-007','Velo Cargo 2.0','CH-24A-0007','MT-0007','BT-0007','60V 30Ah Li-ion, ~90 km range','available'),
    ('SNR-008','Velo Cargo 2.0','CH-24A-0008','MT-0008','BT-0008','60V 30Ah Li-ion, ~90 km range','available'),
    ('SNR-009','Urban Lite','CH-24B-0009','MT-0009','BT-0009','48V 26Ah Li-ion, ~70 km range','available'),
    ('SNR-010','Urban Lite','CH-24B-0010','MT-0010','BT-0010','48V 26Ah Li-ion, ~70 km range','available'),
    ('SNR-011','Velo Cargo Pro','CH-24C-0011','MT-0011','BT-0011','72V 32Ah Li-ion, ~110 km range','available'),
    ('SNR-012','Velo Cargo Pro','CH-24C-0012','MT-0012','BT-0012','72V 32Ah Li-ion, ~110 km range','under_maintenance'),
    ('SNR-013','Urban Lite','CH-24B-0013','MT-0013','BT-0013','48V 26Ah Li-ion, ~70 km range','available'),
    ('SNR-014','Urban Lite','CH-24B-0014','MT-0014','BT-0014','48V 26Ah Li-ion, ~70 km range','available'),
    ('SNR-015','Velo Cargo 2.0','CH-24A-0015','MT-0015','BT-0015','60V 30Ah Li-ion, ~90 km range','available'),
    ('SNR-016','Velo Cargo 2.0','CH-24A-0016','MT-0016','BT-0016','60V 30Ah Li-ion, ~90 km range','available')
  on conflict (code) do nothing`);
await q(`update public.scooters set weekly_rent = 2100 where code in ('SNR-011','SNR-012') and weekly_rent is null`);
await q(`update public.scooters set maintenance_notes = '12 Nov 2026: Rear brake pads worn, waiting for parts' where code = 'SNR-012'`);
await q(`update public.scooters set status = 'available' where status in ('reserved','rented')
         and not exists (select 1 from public.rentals r where r.scooter_id = scooters.id and r.status not in ('returned','terminated'))`);

const staff = (await q(`select id from public.profiles where role = 'staff' order by created_at limit 1`)).rows[0]?.id;
const hub = (await q(`select id from public.pickup_locations order by name limit 1`)).rows[0].id;
const scooterId = async (code) => (await q(`select id from public.scooters where code = $1`, [code])).rows[0].id;

// ---------------------------------------------------------------- helpers
async function createRider(r) {
  const { data, error } = await admin.auth.admin.createUser({
    email: email(r.key), password: PASSWORD, email_confirm: true, phone: r.phone, phone_confirm: true,
    user_metadata: { full_name: r.name }, app_metadata: { role: 'customer' },
  });
  if (error) throw new Error(`${r.key}: ${error.message}`);
  const id = data.user.id;
  await q(`update public.profiles set full_name=$2, address=$3, emergency_contact_name=$4, emergency_contact_phone=$5,
             delivery_platform=$6, consent_at=now() - interval '30 days', created_at = now() - interval '30 days' where id=$1`,
    [id, r.name, `H.No ${100 + RIDERS.indexOf(r)}, Kondapur, Hyderabad 500084`, 'Family contact', '9876500' + String(100 + RIDERS.indexOf(r)), r.platform]);
  return id;
}

async function uploadDocs(id, status) {
  for (const t of ['aadhaar', 'pan', 'driving_licence']) {
    const p = `${id}/${t}-demo.jpg`;
    await admin.storage.from('kyc').upload(p, asset(`${t}.jpg`), { contentType: 'image/jpeg', upsert: true });
    await q(`insert into public.kyc_documents (user_id, doc_type, file_path, status, reviewed_by, reviewed_at)
             values ($1, $2, $3, $4::public.doc_status, $5, case when $4::text = 'approved' then now() - interval '20 days' end)`,
      [id, t, p, status, status === 'approved' ? staff : null]);
  }
}

async function approve(id) {
  await uploadDocs(id, 'approved');
  await q(`update public.profiles set kyc_status = 'approved' where id = $1`, [id]);
}

/** Rental that started `daysAgo` days ago, with `weeksPaid` weeks of rent paid (incl. the first week at handover). */
async function activeRental(id, code, daysAgo, weeksPaid, signer, bookingId = null) {
  const sc = await scooterId(code);
  const start = (await q(`select current_date - $1::int as d`, [daysAgo])).rows[0].d;
  const b = bookingId ?? (await q(`insert into public.booking_requests (user_id, pickup_location_id, status, quantity, decided_by, decided_at, created_at)
                      values ($1,$2,'approved',1,$3, $4::date - 1, $4::date - 2) returning id`, [id, hub, staff, start])).rows[0].id;
  const r = (await q(`insert into public.rentals (user_id, scooter_id, booking_request_id, pickup_location_id, weekly_rent, deposit_amount,
                        status, start_date, next_due_date, created_at)
                      select $1, s.id, $2, $3, coalesce(s.weekly_rent, st.weekly_rent), st.deposit_amount, 'active', $4::date, $4::date + 7 * $5, $4::date - 1
                        from public.scooters s, public.settings st where s.id = $6 and st.id = 1 returning id, weekly_rent, deposit_amount`,
    [id, b, hub, start, weeksPaid, sc])).rows[0];
  await q(`update public.scooters set status = 'rented' where id = $1`, [sc]);

  // signed agreement
  const sig = `${id}/signature-demo.png`;
  await admin.storage.from('agreements').upload(sig, asset('signature.png'), { contentType: 'image/png', upsert: true });
  await q(`insert into public.agreements (rental_id, version, terms_snapshot, terms_hash, signature_path, signed_at)
           select $1, (t ->> 'template_version')::int, t, encode(extensions.digest(t ->> 'body', 'sha256'), 'hex'), $2, $3::date - 1 + time '18:30'
             from public.render_agreement($1) t`, [r.id, sig, start]);
  await q(`insert into public.handover_records (rental_id, kind, scooter_condition, battery_condition, charger_ok, accessories, customer_ack_at, recorded_by, created_at)
           values ($1,'handover','Good','100%, healthy',true,'Helmet, phone holder, 2 keys',$2::date + time '10:15',$3,$2::date + time '10:15')`, [r.id, start, staff]);

  // deposit + weekly rent history
  const pays = [{ type: 'deposit', amount: r.deposit_amount, day: 0, method: 'cash' }];
  for (let w = 0; w < weeksPaid; w++) pays.push({ type: 'rent', amount: r.weekly_rent, day: w === 0 ? 0 : w * 7 - 1, method: w === 0 ? 'cash' : 'upi_gateway', w });
  for (const p of pays) {
    await q(`insert into public.payments (rental_id, user_id, amount, type, method, status, period_start, period_end, recorded_by,
               receipt_no, paid_at, razorpay_order_id, razorpay_payment_id, created_at)
             values ($1,$2,$3,$4,$5,'paid', $6, $7, $8, 'SNR-' || lpad(nextval('public.receipt_no_seq')::text, 6, '0'),
                     $9::timestamptz, $10, $11, $9::timestamptz)`,
      [r.id, id, p.amount, p.type, p.method,
       p.type === 'rent' ? await addDays(start, p.w * 7) : null, p.type === 'rent' ? await addDays(start, p.w * 7 + 6) : null,
       p.method === 'cash' ? staff : null, await at(start, p.day, p.method === 'cash' ? '10:20' : '20:05'),
       p.method === 'upi_gateway' ? `order_demo_${r.id.slice(0, 8)}_${p.w}` : null, p.method === 'upi_gateway' ? `pay_demo_${r.id.slice(0, 8)}_${p.w}` : null]);
  }
  void signer;
  return r.id;
}
async function addDays(d, n) { return (await q(`select $1::date + $2::int as d`, [d, n])).rows[0].d; }
async function at(d, n, time) { return (await q(`select (($1::date + $2::int) + $3::time)::timestamptz as t`, [d, n, time])).rows[0].t; }
async function notify(id, title, body, route, ago = '1 hour') {
  await q(`insert into public.notifications (user_id, title, body, data, created_at) values ($1,$2,$3,$4, now() - $5::interval)`,
    [id, title, body, JSON.stringify({ route }), ago]);
}

// ---------------------------------------------------------------- riders
const ids = {};
for (const r of RIDERS) ids[r.key] = await createRider(r);

// arjun: documents waiting for review
await uploadDocs(ids.arjun, 'pending');
await q(`update public.profiles set kyc_status = 'submitted' where id = $1`, [ids.arjun]);

// imran: approved, ready to request
await approve(ids.imran);
await notify(ids.imran, "You're verified", 'Your documents are approved. You can now request a scooter.', '/scooters', '2 days');

// kiran: approved + pending booking
await approve(ids.kiran);
await q(`insert into public.booking_requests (user_id, pickup_location_id, quantity, preferred_scooter_ids, created_at)
         values ($1, $2, 2, array[(select id from public.scooters where code = 'SNR-007')], now() - interval '3 hours')`, [ids.kiran, hub]);

// lakshmi: allocated, needs to sign
await approve(ids.lakshmi);
{
  const sc = await scooterId('SNR-008');
  const b = (await q(`insert into public.booking_requests (user_id, pickup_location_id, status, quantity, decided_by, decided_at, created_at)
                      values ($1,$2,'approved',1,$3, now() - interval '2 hours', now() - interval '1 day') returning id`, [ids.lakshmi, hub, staff])).rows[0].id;
  await q(`insert into public.rentals (user_id, scooter_id, booking_request_id, pickup_location_id, weekly_rent, deposit_amount, status)
           select $1, $2, $3, $4, st.weekly_rent, st.deposit_amount, 'pending_agreement' from public.settings st where st.id = 1`, [ids.lakshmi, sc, b, hub]);
  await q(`update public.scooters set status = 'reserved' where id = $1`, [sc]);
  await notify(ids.lakshmi, 'Scooter allocated', 'SNR-008 (Velo Cargo 2.0) is reserved for you. Sign your rental agreement in the app.', '/agreement', '2 hours');
}

// ravi: active, 3 weeks paid, due in 2 days
await approve(ids.ravi);
const raviRental = await activeRental(ids.ravi, 'SNR-003', 19, 3, 'R. Teja');
await notify(ids.ravi, 'Rent due in 2 days', '₹1,820 due soon. Pay by UPI in the app.', '/pay', '30 minutes');
await notify(ids.ravi, 'Payment received', '₹1,820 received. Thank you.', '/payments', '5 days');

// suresh: overdue (2 weeks paid, started 17 days ago -> due 3 days ago), open service request
await approve(ids.suresh);
const sureshRental = await activeRental(ids.suresh, 'SNR-009', 17, 2, 'S. Babu');
await q(`update public.rentals set status = 'overdue' where id = $1`, [sureshRental]);
await notify(ids.suresh, 'Rent overdue', 'Your rent was due 3 days ago. Pay now to keep your scooter. Late fees apply.', '/pay', '3 hours');
{
  const sr = (await q(`insert into public.service_requests (user_id, rental_id, category, description, created_at)
         values ($1,$2,'battery','Battery drops from 60% to 10% very fast after 20 km.', now() - interval '5 hours') returning id`, [ids.suresh, sureshRental])).rows[0].id;
  await q(`update public.service_updates set created_at = now() - interval '5 hours' where request_id = $1`, [sr]);
  await q(`update public.service_requests set assigned_to = $2, status = 'assigned' where id = $1`, [sr, staff]);
  await q(`insert into public.service_updates (request_id, author_id, author_kind, body, created_at) values
           ($1, $2, 'staff', 'Technician Anil will check the battery at Madhapur hub today after 3 pm.', now() - interval '3 hours'),
           ($1, $2, 'staff', 'Likely a weak cell. Keep a replacement ready.', now() - interval '3 hours'),
           ($1, $3, 'customer', 'OK, I will come at 4 pm.', now() - interval '2 hours')`, [sr, staff, ids.suresh]);
  await q(`update public.service_updates set visible_to_customer = false where request_id = $1 and body like 'Likely a weak cell%'`, [sr]);
}

// anitha: completed rental in the past
await approve(ids.anitha);
{
  const rid = await activeRental(ids.anitha, 'SNR-010', 27, 2, 'A. Rao');
  const sr = (await q(`insert into public.service_requests (user_id, rental_id, category, description, created_at)
           values ($1,$2,'tyres','Front tyre puncture near Gachibowli.', now() - interval '18 days') returning id`, [ids.anitha, rid])).rows[0].id;
  await q(`update public.service_requests set assigned_to = $2, status = 'resolved', admin_notes = 'Tube replaced at hub.' where id = $1`, [sr, staff]);
  await q(`update public.service_requests set status = 'closed' where id = $1`, [sr]);
  await q(`insert into public.handover_records (rental_id, kind, scooter_condition, battery_condition, charger_ok, accessories, customer_ack_at, recorded_by, created_at)
           values ($1,'return','Minor scratches','85%',true,'All returned', now() - interval '13 days', $2, now() - interval '13 days')`, [rid, staff]);
  await q(`update public.rentals set status = 'returned', ended_at = now() - interval '13 days', end_reason = 'returned' where id = $1`, [rid]);
  await q(`update public.scooters set status = 'available' where code = 'SNR-010'`);
}

// venkat: fleet operator, one booking for 3 scooters, all active (due in 2 days)
await approve(ids.venkat);
{
  const start = (await q(`select current_date - 12 as d`)).rows[0].d;
  const b = (await q(`insert into public.booking_requests (user_id, pickup_location_id, status, quantity, decided_by, decided_at, created_at)
                      values ($1,$2,'approved',3,$3, $4::date - 1, $4::date - 2) returning id`, [ids.venkat, hub, staff, start])).rows[0].id;
  for (const code of ['SNR-001', 'SNR-002', 'SNR-011']) await activeRental(ids.venkat, code, 12, 2, 'V. Fleet', b);
  await notify(ids.venkat, '3 scooters allocated', 'SNR-001, SNR-002, SNR-011 reserved for you. Sign your rental agreement in the app.', '/agreement', '13 days');
}

// priya: brand new, a welcome notification
await notify(ids.priya, 'Welcome to SNIREVA', 'Upload Aadhaar, PAN and driving licence to get verified.', '/documents', '10 minutes');

await db.end();
const summary = RIDERS.map((r) => ({ stage: r.stage, email: email(r.key), name: r.name }));
console.table(summary);
console.log(`password for all demo riders: (DEMO_PASSWORD in .env)`);
const out = path.join(root, 'scripts', '.demo-accounts.json');
writeFileSync(out, JSON.stringify(summary, null, 2));
void raviRental; void existsSync;
