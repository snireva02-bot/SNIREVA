import { signIn, accounts, check, summary, admin, ensureActiveRental } from './helpers.mjs';

console.log('M6-M8: push trigger, service requests, reports');
const c1 = await signIn('customer1');
const c2 = await signIn('customer2');
const staff = await signIn('staff');
const mgr = await signIn('manager');
const owner = await signIn('owner');

// M6: token handling
let r = await c1.rpc('set_fcm_token', { p_token: 'test-token-abc' });
r = await c2.rpc('set_fcm_token', { p_token: 'test-token-abc' });
const { data: t1 } = await admin.from('profiles').select('id, fcm_token').in('id', [accounts.customer1.id, accounts.customer2.id]);
check('a device token belongs to one account only', t1.find((x) => x.id === accounts.customer1.id).fcm_token === null && t1.find((x) => x.id === accounts.customer2.id).fcm_token === 'test-token-abc');
await c2.rpc('set_fcm_token', { p_token: '' });
const { error: ne } = await c1.from('notifications').insert({ user_id: accounts.customer1.id, title: 'x', body: 'y' });
check('customers cannot create notifications', !!ne);

// M7: service request
const rentalId = await ensureActiveRental('customer1');
r = await c1.from('service_requests').insert({ user_id: accounts.customer1.id, category: 'brakes', description: 'No scooter chosen here' });
check('scooter problem without choosing a scooter is rejected', r.error?.message.includes('Choose which scooter'), r.error?.message);
r = await c1.from('service_requests').insert({ user_id: accounts.customer1.id, rental_id: rentalId, category: 'brakes', description: 'Rear brake is weak since yesterday' }).select().single();
check('customer creates service request', !r.error, r.error?.message);
const sr = r.data;
r = await c1.from('service_requests').update({ status: 'resolved' }).eq('id', sr.id).select();
check('customer cannot change status', (r.data ?? []).length === 0);
r = await c2.from('service_requests').select('id').eq('id', sr.id);
check('other customer cannot see it', r.data.length === 0);
r = await staff.from('service_requests').update({ assigned_to: accounts.staff.id }).eq('id', sr.id).select().single();
check('assigning moves to assigned', r.data?.status === 'assigned', r.error?.message);
const { data: srow } = await c1.from('service_requests').select('scooter_id').eq('id', sr.id).single();
const { data: rrow } = await c1.from('rentals').select('scooter_id').eq('id', rentalId).single();
check('request is linked to the rented scooter id', srow.scooter_id === rrow.scooter_id && !!srow.scooter_id);
await staff.rpc('service_update', { p_request: sr.id, p_status: 'resolved', p_note: 'Brake pads replaced.' });
const { data: n } = await c1.from('notifications').select('body').order('created_at', { ascending: false }).limit(1);
check('status change notifies customer', n[0]?.body.includes('Marked as fixed'), n[0]?.body);

// M8: reports
r = await staff.rpc('dashboard_overview');
check('overview for staff', !r.error && r.data.scooters.total >= 6, r.error?.message);
console.log('   overview:', JSON.stringify(r.data));
r = await staff.rpc('report_collections', { p_from: '2026-11-01', p_to: '2026-11-30', p_group: 'day' });
check('collections report is manager-only', !!r.error);
r = await mgr.rpc('report_collections', { p_from: '2026-11-01', p_to: '2026-11-30', p_group: 'week' });
check('manager gets collections', !r.error && r.data.length > 0, r.error?.message);
r = await mgr.rpc('report_utilisation', { p_from: '2026-11-01', p_to: '2026-11-30' });
check('utilisation report', !r.error && r.data.length >= 6, r.error?.message);
r = await mgr.rpc('report_customers', { p_from: '2026-11-01', p_to: '2026-11-30' });
check('customer report', !r.error && r.data.length >= 1, r.error?.message);
r = await staff.rpc('report_outstanding');
check('outstanding report', !r.error, r.error?.message);
r = await mgr.rpc('apply_current_rent');
check('only owner can apply new rent to running rentals', !!r.error);
r = await owner.rpc('apply_current_rent', { p_rental_ids: [] });
check('owner can apply rent (explicit)', !r.error && r.data === 0, r.error?.message);
r = await mgr.rpc('save_agreement_template', { p_body: 'x'.repeat(300) });
check('only owner edits agreement template', !!r.error);
summary();
