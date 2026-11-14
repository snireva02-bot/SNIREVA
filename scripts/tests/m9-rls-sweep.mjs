// Customer 2 tries to read / write customer 1's data in every table and bucket.
import { signIn, accounts, check, summary, admin, env } from './helpers.mjs';
import { createClient } from '@supabase/supabase-js';

console.log('M9: RLS sweep (cross-customer + anonymous)');
const c2 = await signIn('customer2');
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const victim = accounts.customer1.id;

const owned = {
  profiles: 'id', kyc_documents: 'user_id', booking_requests: 'user_id', rentals: 'user_id', payments: 'user_id',
  service_requests: 'user_id', notifications: 'user_id',
};
for (const [table, col] of Object.entries(owned)) {
  const { count: real } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(col, victim);
  const { data } = await c2.from(table).select('*').eq(col, victim);
  check(`${table}: other customer reads 0 of ${real} rows`, (data ?? []).length === 0);
  const { data: a } = await anon.from(table).select('*').limit(1);
  check(`${table}: anonymous reads nothing`, (a ?? []).length === 0);
}
for (const table of ['agreements', 'handover_records']) {
  const { data } = await c2.from(table).select('*');
  check(`${table}: other customer reads none`, (data ?? []).length === 0);
}
for (const table of ['audit_log', 'agreement_templates']) {
  const { data } = await c2.from(table).select('*').limit(1);
  check(`${table}: customers read none`, (data ?? []).length === 0);
}

// writes
const w = [
  ['rentals insert', () => c2.from('rentals').insert({ user_id: accounts.customer2.id, scooter_id: '00000000-0000-0000-0000-000000000000', weekly_rent: 1 })],
  ['payments insert', () => c2.from('payments').insert({ user_id: accounts.customer2.id, amount: 1, method: 'cash', status: 'paid' })],
  ['booking direct insert', () => c2.from('booking_requests').insert({ user_id: accounts.customer2.id })],
  ['agreement insert', () => c2.from('agreements').insert({ rental_id: '00000000-0000-0000-0000-000000000000', version: 1, terms_snapshot: {} })],
  ['audit insert', () => c2.from('audit_log').insert({ action: 'x', entity: 'y' })],
  ['victim notification update', () => c2.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', victim).select()],
  ['service request for victim', () => c2.from('service_requests').insert({ user_id: victim, category: 'other', description: 'not mine at all' })],
];
for (const [name, fn] of w) {
  const { error, data } = await fn();
  check(`blocked: ${name}`, !!error || (Array.isArray(data) && data.length === 0), error?.message);
}

// storage
for (const bucket of ['kyc', 'agreements', 'receipts', 'service', 'handover', 'avatars']) {
  const { data } = await c2.storage.from(bucket).list(victim);
  check(`storage ${bucket}: cannot list victim folder`, (data ?? []).length === 0);
}
const { data: rec } = await admin.storage.from('receipts').list(victim);
if (rec?.length) {
  const { data: url } = await c2.storage.from('receipts').createSignedUrl(`${victim}/${rec[0].name}`, 60);
  check('storage receipts: cannot sign victim file URL', !url);
}
const { data: up } = await anon.storage.from('kyc').upload(`${victim}/evil.png`, new Blob(['x']));
check('anonymous cannot upload', !up);

// RPC abuse
const rpcs = [
  ['apply_gateway_payment', { p_order_id: 'x', p_payment_id: 'y', p_amount_paise: 1 }],
  ['mark_overdue_rentals', {}], ['send_due_reminders', {}], ['notify', { p_user: victim, p_title: 'x', p_body: 'y' }],
  ['dashboard_overview', {}], ['report_outstanding', {}], ['decide_kyc', { p_user: accounts.customer2.id, p_approve: true }],
  ['record_offline_payment', { p_rental: '00000000-0000-0000-0000-000000000000', p_amount: 1, p_type: 'rent', p_method: 'cash' }],
];
for (const [fn, args] of rpcs) {
  const { error } = await c2.rpc(fn, args);
  check(`rpc ${fn} denied to customer`, !!error);
}
summary();
