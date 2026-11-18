import { signIn, accounts, check, summary, admin, prepareGateway } from './helpers.mjs';

console.log('M10: bulk booking, combined payment, scooter-linked service, replacement, realtime');
const c1 = await signIn('customer1');
const c2 = await signIn('customer2');
const staff = await signIn('staff');
const uid = accounts.customer1.id;

// reset customer1
const { data: openR } = await admin.from('rentals').select('id').eq('user_id', uid).not('status', 'in', '(returned,terminated)');
for (const r of openR ?? []) await staff.rpc('terminate_rental', { p_rental: r.id, p_reason: 'test reset', p_scooter_status: 'available' });
await admin.from('booking_requests').update({ status: 'cancelled' }).eq('user_id', uid).eq('status', 'pending');
await admin.from('profiles').update({ kyc_status: 'approved', is_active: true }).eq('id', uid);

// Own test scooters so the suite never depends on how many demo scooters are free.
const TEST_CODES = ['TEST-01', 'TEST-02', 'TEST-03', 'TEST-04', 'TEST-05'];
for (const code of TEST_CODES) {
  const { data: ex } = await admin.from('scooters').select('id').eq('code', code).maybeSingle();
  if (ex) {
    const { count } = await admin.from('rentals').select('id', { count: 'exact', head: true }).eq('scooter_id', ex.id).not('status', 'in', '(returned,terminated)');
    if (!count) await admin.from('scooters').update({ status: 'available' }).eq('id', ex.id);
  } else {
    await admin.from('scooters').insert({ code, model: 'Test scooter', battery_details: 'Automated test only', status: 'available' });
  }
}

// ---------------------------------------------------------------- bulk booking
const { data: avail } = await c1.from('scooters').select('id, code, weekly_rent').eq('status', 'available').in('code', TEST_CODES).order('code');
const { data: hubs } = await c1.from('pickup_locations').select('id').order('name');
let r = await c1.rpc('request_scooter', { p_pickup: hubs[0].id, p_quantity: 3, p_preferred: [avail[0].id, avail[1].id] });
check('customer requests 3 scooters with 2 preferred', !r.error, r.error?.message);
const bookingId = r.data;
const { data: b } = await staff.from('booking_requests').select('quantity, preferred_scooter_ids').eq('id', bookingId).single();
check('booking stores quantity + preferences', b.quantity === 3 && b.preferred_scooter_ids.length === 2);

r = await staff.rpc('allocate_scooters', { p_booking: bookingId, p_scooters: avail.slice(0, 4).map((s) => s.id) });
check('cannot allocate more scooters than requested', r.error?.message.includes('asked for 3'), r.error?.message);
r = await staff.rpc('allocate_scooters', { p_booking: bookingId, p_scooters: [avail[0].id, avail[0].id] });
check('cannot allocate the same scooter twice', !!r.error);
const picked = avail.slice(0, 3);
r = await staff.rpc('allocate_scooters', { p_booking: bookingId, p_scooters: picked.map((s) => s.id) });
check('staff allocates 3 scooters in one go', !r.error && r.data.length === 3, r.error?.message);
const rentalIds = r.data;
const { data: rs } = await c1.from('rentals').select('id, status, scooter_id, booking_request_id').in('id', rentalIds);
check('3 rentals pending agreement, all linked to the booking', rs.length === 3 && rs.every((x) => x.status === 'pending_agreement' && x.booking_request_id === bookingId));
const { data: n1 } = await c1.from('notifications').select('title').order('created_at', { ascending: false }).limit(1);
check('one notification for the allocation', n1[0]?.title === '3 scooters allocated', n1[0]?.title);

// ---------------------------------------------------------------- sign once
const sig = `${uid}/sig-bulk-${Date.now()}.png`;
await c1.storage.from('agreements').upload(sig, new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' });
r = await c1.rpc('sign_agreements', { p_rentals: rentalIds, p_signature_path: sig });
check('one signature signs all 3 agreements', r.data === 3, r.error?.message);
for (const id of rentalIds) await staff.rpc('complete_handover', { p_rental: id, p_checklist: { customer_ack: true, scooter_condition: 'Good' } });
const { data: act } = await c1.from('rentals').select('id, next_due_date, weekly_rent').in('id', rentalIds);
check('all 3 handed over and active', act.length === 3 && act.every((x) => !!x.next_due_date));

// ---------------------------------------------------------------- combined payment
const g = await prepareGateway(c1, rentalIds);
const expected = act.reduce((a, x) => a + Number(x.weekly_rent), 0);
check(`one order covers all 3 scooters (₹${expected})`, !g.error && Number(g.prep.total) === expected && g.prep.items.length === 3, g.error?.message);
r = await c2.rpc('prepare_rent_payment', { p_rentals: rentalIds });
check('another customer cannot pay for these rentals', !!r.error);
const payId = `pay_bulk_${Date.now()}`;
r = await admin.rpc('apply_gateway_payment', { p_order_id: g.rzp, p_payment_id: payId, p_amount_paise: g.paise });
check('webhook marks the combined order paid', r.data === 'paid', r.data ?? r.error?.message);
r = await admin.rpc('apply_gateway_payment', { p_order_id: g.rzp, p_payment_id: payId, p_amount_paise: g.paise });
check('replayed webhook is a no-op', r.data === 'duplicate');
const { data: paid } = await c1.from('payments').select('status, receipt_no, rental_id').eq('order_id', g.prep.order_id);
check('3 paid rows, 3 different receipt numbers', paid.length === 3 && paid.every((p) => p.status === 'paid') && new Set(paid.map((p) => p.receipt_no)).size === 3);
const { data: after } = await c1.from('rentals').select('id, next_due_date').in('id', rentalIds);
check('each rental moved +7 days', after.every((x) => {
  const before = act.find((a) => a.id === x.id).next_due_date;
  return (new Date(x.next_due_date) - new Date(before)) / 86400000 === 7;
}));
const { data: n2 } = await c1.from('notifications').select('body').eq('title', 'Payment received').order('created_at', { ascending: false }).limit(1);
check('single payment notification mentions 3 scooters', n2[0]?.body.includes('for 3 scooters'), n2[0]?.body);

// ---------------------------------------------------------------- service linked to scooter
r = await c1.from('service_requests').insert({ user_id: uid, category: 'battery', description: 'Battery drains fast after 15 km' }).select().single();
check('scooter problem must name the scooter', r.error?.message.includes('Choose which scooter'), r.error?.message);
const target = rentalIds[1];
const { data: tr } = await c1.from('rentals').select('scooter_id').eq('id', target).single();
r = await c1.from('service_requests').insert({ user_id: uid, rental_id: target, category: 'battery', description: 'Battery drains fast after 15 km' }).select().single();
check('request created for the chosen scooter', !r.error, r.error?.message);
const sr = r.data;
check('request carries the scooter id of that rental', sr.scooter_id === tr.scooter_id);
const { data: tl0 } = await c1.from('service_updates').select('author_kind, body').eq('request_id', sr.id);
check('timeline starts with the rider description', tl0.length === 1 && tl0[0].author_kind === 'customer');

// realtime: rider gets the status change live
let liveStatus = null;
const ch = c1.channel('t-service').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: `id=eq.${sr.id}` },
  (e) => { liveStatus = e.new.status; });
await new Promise((res) => ch.subscribe((st) => st === 'SUBSCRIBED' && res()));
await new Promise((res) => setTimeout(res, 1000));

await staff.rpc('service_update', { p_request: sr.id, p_assigned_to: accounts.staff.id, p_note: 'Checked battery voltage, cell imbalance.', p_visible: false });
await staff.rpc('service_update', { p_request: sr.id, p_note: 'We will swap your scooter at Madhapur hub today.' });
const { data: tlC } = await c1.from('service_updates').select('body').eq('request_id', sr.id);
check('internal staff note hidden from rider', !tlC.some((u) => u.body.includes('cell imbalance')));
check('visible staff note shown to rider', tlC.some((u) => u.body.includes('swap your scooter')));
const { data: tlS } = await staff.from('service_updates').select('body').eq('request_id', sr.id);
check('staff see internal note', tlS.some((u) => u.body.includes('cell imbalance')));
r = await c1.rpc('service_reply', { p_request: sr.id, p_body: 'OK, I will come at 4 pm.' });
check('rider can reply', !r.error, r.error?.message);
const { data: srA } = await c1.from('service_requests').select('status').eq('id', sr.id).single();
check('assigning moved it to assigned', srA.status === 'assigned');

for (let i = 0; i < 20 && liveStatus !== 'assigned'; i++) await new Promise((res) => setTimeout(res, 500));
check('rider received the status change via Realtime', liveStatus === 'assigned', String(liveStatus));
await c1.removeChannel(ch);

// replacement scooter
const { data: spare } = await staff.from('scooters').select('id, code').eq('status', 'available').in('code', TEST_CODES).order('code').limit(1).single();
r = await c1.rpc('replace_scooter', { p_rental: target, p_new_scooter: spare.id, p_reason: 'x' });
check('rider cannot swap scooters', !!r.error);
r = await staff.rpc('replace_scooter', { p_rental: target, p_new_scooter: spare.id, p_reason: 'Battery fault', p_service_request: sr.id });
check('staff gives a replacement scooter', !r.error, r.error?.message);
const { data: rAfter } = await c1.from('rentals').select('scooter_id, next_due_date').eq('id', target).single();
const { data: oldSc } = await staff.from('scooters').select('status, maintenance_notes').eq('id', tr.scooter_id).single();
const { data: newSc } = await staff.from('scooters').select('status').eq('id', spare.id).single();
check('rental now points at the replacement', rAfter.scooter_id === spare.id);
check('old scooter off road with a maintenance note', oldSc.status === 'under_maintenance' && oldSc.maintenance_notes.includes('Battery fault'));
check('replacement scooter marked rented', newSc.status === 'rented');
const { data: chg } = await c1.from('rental_scooter_changes').select('from_scooter_id, to_scooter_id, service_request_id').eq('rental_id', target);
check('swap recorded and visible to rider', chg.length === 1 && chg[0].service_request_id === sr.id);
const { data: srAfterSwap } = await c1.from('service_requests').select('status, scooter_id').eq('id', sr.id).single();
check('request resolved and still shows the faulty scooter', srAfterSwap.status === 'resolved' && srAfterSwap.scooter_id === tr.scooter_id);

// rider confirms / reopens
r = await c1.rpc('service_confirm', { p_request: sr.id, p_fixed: false, p_note: 'New scooter also shows low range' });
const { data: re } = await c1.from('service_requests').select('status, reopened_count').eq('id', sr.id).single();
check('rider reopens: back in progress', re.status === 'in_progress' && re.reopened_count === 1);
await staff.rpc('service_update', { p_request: sr.id, p_status: 'resolved', p_note: 'Range setting reset on the new scooter.' });
r = await c1.rpc('service_confirm', { p_request: sr.id, p_fixed: true });
const { data: closed } = await c1.from('service_requests').select('status, closed_at, resolved_at').eq('id', sr.id).single();
check('rider confirms fix: closed with timestamps', closed.status === 'closed' && !!closed.closed_at);
r = await c1.rpc('service_reply', { p_request: sr.id, p_body: 'one more' });
check('no replies on closed requests', !!r.error);

// complaint without scooter
r = await c1.from('service_requests').insert({ user_id: uid, category: 'complaint', description: 'Hub staff were rude on Monday' }).select().single();
check('complaint does not need a scooter', !r.error && r.data.scooter_id === null, r.error?.message);

// overdue blocks new requests
await admin.from('rentals').update({ status: 'overdue' }).eq('id', rentalIds[0]);
r = await c1.rpc('request_scooter', { p_pickup: hubs[0].id, p_quantity: 1 });
check('overdue rider cannot request more scooters', r.error?.message.includes('overdue'), r.error?.message);
await admin.from('rentals').update({ status: 'active' }).eq('id', rentalIds[0]);

// cleanup: free scooters
for (const id of rentalIds) await staff.rpc('terminate_rental', { p_rental: id, p_reason: 'test cleanup', p_scooter_status: 'available' });
await admin.from('scooters').update({ status: 'retired' }).in('code', TEST_CODES);
summary();
process.exit();
