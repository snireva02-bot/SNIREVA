import { signIn, accounts, check, summary, admin } from './helpers.mjs';

console.log('M5: payments + due dates + cron');
const c1 = await signIn('customer1');
const staff = await signIn('staff');
const iso = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = iso(new Date());

const { data: rental } = await c1.from('rentals').select('*').eq('status', 'active').single();
check('active rental from M4', !!rental);
const due0 = rental.next_due_date;

// ---- gateway payment (as the Edge Function would do it)
let r = await c1.rpc('prepare_rent_payment', { p_rental: rental.id });
check('prepare_rent_payment computes amount server-side', !r.error && Number(r.data[0].amount) === 1820, r.error?.message ?? JSON.stringify(r.data));
const pay = r.data[0];
const orderId = `order_test_${Date.now()}`;
await admin.from('payments').update({ razorpay_order_id: orderId }).eq('id', pay.payment_id);

r = await c1.rpc('apply_gateway_payment', { p_order_id: orderId, p_payment_id: 'pay_x', p_amount_paise: 182000 });
check('customer cannot mark a payment paid', !!r.error);
const { error: upErr } = await c1.from('payments').update({ status: 'paid' }).eq('id', pay.payment_id).select();
const { data: still } = await admin.from('payments').select('status').eq('id', pay.payment_id).single();
check('client cannot flip payment status', still.status === 'created', upErr?.message);

const payId = `pay_test_${Date.now()}`;
r = await admin.rpc('apply_gateway_payment', { p_order_id: orderId, p_payment_id: payId, p_amount_paise: 182000 });
check('webhook marks paid', r.data === 'paid', r.error?.message ?? r.data);
r = await admin.rpc('apply_gateway_payment', { p_order_id: orderId, p_payment_id: payId, p_amount_paise: 182000 });
check('webhook is idempotent (duplicate)', r.data === 'duplicate', r.data);
const { data: afterPay } = await c1.from('rentals').select('next_due_date, status').eq('id', rental.id).single();
check('early payment extends from due date (+7), not from today', afterPay.next_due_date === addDays(due0, 7), `${due0} -> ${afterPay.next_due_date}`);
const { data: p1 } = await c1.from('payments').select('status, receipt_no, period_start, period_end').eq('id', pay.payment_id).single();
check('paid row has receipt no + period', p1.status === 'paid' && !!p1.receipt_no && p1.period_start === due0 && p1.period_end === addDays(due0, 6), JSON.stringify(p1));
const { data: notes } = await c1.from('notifications').select('title').order('created_at', { ascending: false }).limit(2);
check('payment + renewal notifications', notes.map((n) => n.title).sort().join('|') === 'Payment received|Rental renewed', JSON.stringify(notes));

// ---- amount mismatch
r = await c1.rpc('prepare_rent_payment', { p_rental: rental.id });
const order2 = `order_test2_${Date.now()}`;
await admin.from('payments').update({ razorpay_order_id: order2 }).eq('id', r.data[0].payment_id);
r = await admin.rpc('apply_gateway_payment', { p_order_id: order2, p_payment_id: `pay_bad_${Date.now()}`, p_amount_paise: 100 });
check('amount mismatch is rejected', r.data === 'amount_mismatch', r.data);

// ---- failure event
r = await c1.rpc('prepare_rent_payment', { p_rental: rental.id });
const order3 = `order_test3_${Date.now()}`;
await admin.from('payments').update({ razorpay_order_id: order3 }).eq('id', r.data[0].payment_id);
r = await admin.rpc('mark_gateway_failed', { p_order_id: order3, p_payment_id: 'pay_f', p_reason: 'UPI declined' });
check('payment.failed marks failed', r.data === 'failed');

// ---- overdue: push due date into the past, run the daily job
const past = addDays(today, -5);
await admin.from('rentals').update({ next_due_date: past }).eq('id', rental.id);
r = await admin.rpc('mark_overdue_rentals');
const { data: od } = await c1.from('rentals').select('status').eq('id', rental.id).single();
check('daily job flips to overdue after grace', od.status === 'overdue', JSON.stringify(r));
const { data: due } = await c1.rpc('rental_amount_due', { p_rental: rental.id });
check('late fee = 5 days × ₹50 = ₹250 (grace 1 day)', Number(due[0].late_fee) === 250 && Number(due[0].total) === 2070, JSON.stringify(due[0]));

// ---- offline rent payment by staff (with late fee) clears overdue partially/fully
r = await staff.rpc('record_offline_payment', { p_rental: rental.id, p_amount: 1000, p_type: 'rent', p_method: 'cash' });
check('offline rent below weekly rent rejected', !!r.error);
r = await staff.rpc('record_offline_payment', { p_rental: rental.id, p_amount: 2070, p_type: 'rent', p_method: 'cash', p_notes: 'Paid at hub' });
check('staff records offline rent', !r.error, r.error?.message);
const { data: off } = await staff.from('payments').select('late_fee_amount, recorded_by, receipt_no').eq('id', r.data).single();
check('offline payment stores late fee portion + who recorded', Number(off.late_fee_amount) === 250 && off.recorded_by === accounts.staff.id && !!off.receipt_no);
const { data: back } = await c1.from('rentals').select('status, next_due_date').eq('id', rental.id).single();
check('rental back to active, due moved +7 from old due date', back.status === 'active' && back.next_due_date === addDays(past, 7), JSON.stringify(back));
const { data: aud } = await admin.from('audit_log').select('actor_id, action').eq('entity', 'payments').eq('entity_id', r.data);
check('offline payment in audit log', aud.some((a) => a.actor_id === accounts.staff.id && a.action === 'insert'));

// ---- due reminders: due in 2 days
await admin.from('rentals').update({ next_due_date: addDays(today, 2) }).eq('id', rental.id);
r = await admin.rpc('send_due_reminders');
const { data: rem } = await c1.from('notifications').select('title').order('created_at', { ascending: false }).limit(1);
check('reminder 2 days before due', rem[0]?.title === 'Rent due in 2 days', JSON.stringify(rem));

// ---- renewal hold
await staff.rpc('set_renewal_block', { p_rental: rental.id, p_blocked: true, p_reason: 'Damage inspection' });
r = await c1.rpc('prepare_rent_payment', { p_rental: rental.id });
check('renewal hold blocks online payment', r.error?.message.includes('Renewal is on hold'), r.error?.message);
await staff.rpc('set_renewal_block', { p_rental: rental.id, p_blocked: false });

// ---- rate change does not touch running rentals
await admin.from('settings').update({ weekly_rent: 1900 }).eq('id', 1);
const { data: snap } = await c1.from('rentals').select('weekly_rent').eq('id', rental.id).single();
check('settings rent change does not alter running rental', Number(snap.weekly_rent) === 1820);
await admin.from('settings').update({ weekly_rent: 1820 }).eq('id', 1);

// ---- return with outstanding
await admin.from('rentals').update({ next_due_date: addDays(today, -3), status: 'overdue' }).eq('id', rental.id);
r = await staff.rpc('complete_return', { p_rental: rental.id, p_checklist: { customer_ack: true, scooter_condition: 'Good' } });
check('return blocked while outstanding unsettled', r.error?.message.includes('must be settled'), r.error?.message);
r = await staff.rpc('complete_return', { p_rental: rental.id, p_checklist: { customer_ack: true, scooter_condition: 'Good', damage_notes: '' }, p_scooter_status: 'under_maintenance', p_settlement_note: 'Adjusted from deposit' });
check('return with settlement note', !r.error && Number(r.data) > 0, r.error?.message);
const { data: closed } = await c1.from('rentals').select('status, scooter:scooters(status)').eq('id', rental.id).single();
check('rental returned, scooter to maintenance', closed.status === 'returned' && closed.scooter.status === 'under_maintenance', JSON.stringify(closed));
await admin.from('scooters').update({ status: 'available' }).eq('id', rental.scooter_id);

summary();
