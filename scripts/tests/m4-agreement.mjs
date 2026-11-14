import { signIn, accounts, check, summary, admin } from './helpers.mjs';

console.log('M4: agreement + handover + return');
const c1 = await signIn('customer1');
const c2 = await signIn('customer2');
const staff = await signIn('staff');
const id1 = accounts.customer1.id;

const { data: rental } = await c1.from('rentals').select('*, scooter:scooters(code)').eq('status', 'pending_agreement').single();
check('customer has a rental awaiting agreement', !!rental);

let r = await c1.rpc('render_agreement', { p_rental: rental.id });
check('agreement renders with customer + scooter details', r.data?.body.includes('Test Rider One') && r.data.body.includes(rental.scooter.code) && !r.data.body.includes('{{'), r.error?.message);
r = await c2.rpc('render_agreement', { p_rental: rental.id });
check('another customer cannot read this agreement', !!r.error);

r = await staff.rpc('complete_handover', { p_rental: rental.id, p_checklist: { customer_ack: true } });
check('handover blocked before signing', r.error?.message.includes('sign the agreement'), r.error?.message);

r = await c1.rpc('sign_agreement', { p_rental: rental.id, p_signature_path: `${id1}/missing.png` });
check('signing requires an uploaded signature', r.error?.message.includes('not found'), r.error?.message);
r = await c1.rpc('sign_agreement', { p_rental: rental.id, p_signature_path: `${accounts.customer2.id}/x.png` });
check('cannot use another user\'s signature path', !!r.error);

const sigPath = `${id1}/signature-${Date.now()}.png`;
const up = await c1.storage.from('agreements').upload(sigPath, new Blob([Uint8Array.from([137,80,78,71])], { type: 'image/png' }), { contentType: 'image/png' });
check('signature uploaded', !up.error, up.error?.message);
r = await c1.rpc('sign_agreement', { p_rental: rental.id, p_signature_path: sigPath });
check('customer signs agreement', !r.error, r.error?.message);
const { data: ag } = await c1.from('agreements').select('terms_hash, signed_at, version').eq('rental_id', rental.id).single();
check('agreement stored with sha256 hash + timestamp', ag?.terms_hash?.length === 64 && !!ag.signed_at);
r = await c1.rpc('sign_agreement', { p_rental: rental.id, p_signature_path: sigPath });
check('cannot sign twice', !!r.error);

const { data: rs } = await c1.from('rentals').select('status').eq('id', rental.id).single();
check('rental -> pending_handover', rs.status === 'pending_handover');

r = await staff.rpc('complete_handover', { p_rental: rental.id, p_checklist: { customer_ack: false } });
check('handover requires customer acknowledgement', !!r.error);
r = await c1.rpc('complete_handover', { p_rental: rental.id, p_checklist: { customer_ack: true } });
check('customer cannot complete handover', !!r.error);

r = await staff.rpc('complete_handover', {
  p_rental: rental.id,
  p_checklist: { scooter_condition: 'Good', battery_condition: '100%', charger_ok: true, accessories: 'Helmet, phone holder', damage_notes: '', photo_paths: [], customer_ack: true },
  p_collect_deposit: true, p_collect_first_week: true, p_method: 'cash',
});
check('staff completes handover', !r.error, r.error?.message);

const today = new Date(); const iso = (d) => d.toISOString().slice(0, 10);
const plus7 = new Date(today); plus7.setDate(today.getDate() + 7);
const { data: active } = await c1.from('rentals').select('status, start_date, next_due_date, scooter_id').eq('id', rental.id).single();
check('rental active, start today, due +7', active.status === 'active' && active.start_date === iso(today) && active.next_due_date === iso(plus7), JSON.stringify(active));
const { data: sc } = await staff.from('scooters').select('status').eq('id', active.scooter_id).single();
check('scooter -> rented', sc.status === 'rented');
const { data: pays } = await c1.from('payments').select('type, amount, status, receipt_no, period_start, period_end, recorded_by').eq('rental_id', rental.id);
check('deposit + first week recorded as paid with receipt numbers', pays.length === 2 && pays.every((p) => p.status === 'paid' && /^SNR-\d{6}$/.test(p.receipt_no) && p.recorded_by === accounts.staff.id), JSON.stringify(pays));
const { data: due } = await c1.rpc('rental_amount_due', { p_rental: rental.id });
check('nothing outstanding right after handover', Number(due[0].outstanding) === 0 && Number(due[0].total) === 1820, JSON.stringify(due));
const { data: auditPay } = await admin.from('audit_log').select('actor_id').eq('entity', 'payments').eq('action', 'insert').order('at', { ascending: false }).limit(1);
check('offline payment audited with staff as actor', auditPay[0]?.actor_id === accounts.staff.id);

summary();
