import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, root } from '../env.mjs';

export const env = loadEnv();
export const accounts = JSON.parse(readFileSync(path.join(root, 'scripts', '.test-accounts.json'), 'utf8'));
export const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export async function signIn(key) {
  const a = accounts[key];
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword(a.email ? { email: a.email, password: a.password } : { phone: a.phone, password: a.password });
  if (error) throw new Error(`${key} sign-in failed: ${error.message}`);
  return c;
}

let pass = 0, fail = 0;
export function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}
export function summary() {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

/** Gives `key` an active rental (request -> allocate -> sign -> handover). Returns rental id. */
export async function ensureActiveRental(key, { pickupIndex = 0 } = {}) {
  const c = await signIn(key);
  const staff = await signIn('staff');
  const uid = accounts[key].id;
  const { data: open } = await c.from('rentals').select('id, status').in('status', ['active', 'overdue']).limit(1);
  if (open?.length) return open[0].id;
  await admin.from('profiles').update({ kyc_status: 'approved', is_active: true }).eq('id', uid);
  await admin.from('booking_requests').update({ status: 'cancelled' }).eq('user_id', uid).eq('status', 'pending');
  const { data: hubs } = await c.from('pickup_locations').select('id').order('name');
  const { data: bid, error: be } = await c.rpc('request_scooter', { p_pickup: hubs[pickupIndex].id, p_quantity: 1 });
  if (be) throw be;
  const { data: sc } = await staff.from('scooters').select('id').eq('status', 'available').order('code').limit(1).single();
  const { data: rids, error: ae } = await staff.rpc('allocate_scooters', { p_booking: bid, p_scooters: [sc.id] });
  if (ae) throw ae;
  const sig = `${uid}/sig-${Date.now()}.png`;
  await c.storage.from('agreements').upload(sig, new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' });
  const { error: se } = await c.rpc('sign_agreements', { p_rentals: rids, p_signature_path: sig });
  if (se) throw se;
  const { error: he } = await staff.rpc('complete_handover', { p_rental: rids[0], p_checklist: { customer_ack: true, scooter_condition: 'Good' } });
  if (he) throw he;
  return rids[0];
}

/** What the create-payment-order Edge Function does: prepare + attach a Razorpay order id. */
export async function prepareGateway(client, rentalIds) {
  const { data, error } = await client.rpc('prepare_rent_payment', { p_rentals: rentalIds });
  if (error) return { error };
  const prep = data[0];
  const rzp = `order_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin.rpc('attach_razorpay_order', { p_order: prep.order_id, p_razorpay_order_id: rzp });
  return { prep, rzp, paise: Math.round(Number(prep.total) * 100) };
}
