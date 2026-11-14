import { signIn, accounts, check, summary, admin } from './helpers.mjs';

console.log('M3: fleet + booking + allocation');
const c1 = await signIn('customer1');
const c2 = await signIn('customer2');
const staff = await signIn('staff');
const id1 = accounts.customer1.id;

// reset: close any open rentals/bookings for customer1, free scooters
await admin.from('rentals').update({ status: 'terminated' }).eq('user_id', id1).not('status', 'in', '(returned,terminated)');
await admin.from('booking_requests').update({ status: 'cancelled' }).eq('user_id', id1).eq('status', 'pending');
await admin.from('scooters').update({ status: 'available' }).in('code', ['SNR-001', 'SNR-002', 'SNR-003']);

const { data: list } = await c1.from('scooters').select('id, code, status');
check('customer sees only available scooters', list.length > 0 && list.every((s) => s.status === 'available'));
const { data: hubs } = await c1.from('pickup_locations').select('id');

let r = await c2.rpc('request_scooter', { p_pickup: hubs[0].id });
check('unapproved customer cannot request', r.error?.message.includes('must be approved'), r.error?.message);

r = await c1.rpc('request_scooter', { p_pickup: hubs[0].id, p_preferred_scooter: list[0].id });
check('approved customer can request', !r.error, r.error?.message);
const bookingId = r.data;
r = await c1.rpc('request_scooter', { p_pickup: hubs[0].id });
check('only one pending request', r.error?.message.includes('pending request'), r.error?.message);

r = await c1.rpc('allocate_scooter', { p_booking: bookingId, p_scooter: list[0].id });
check('customer cannot allocate', !!r.error);

const { data: maint } = await staff.from('scooters').select('id').eq('code', 'SNR-005').single();
r = await staff.rpc('allocate_scooter', { p_booking: bookingId, p_scooter: maint.id });
check('cannot allocate a scooter under maintenance', r.error?.message.includes('not available'), r.error?.message);

const target = list.find((s) => s.code === 'SNR-001') ?? list[0];
r = await staff.rpc('allocate_scooter', { p_booking: bookingId, p_scooter: target.id, p_note: 'Collect from Madhapur hub' });
check('staff allocates scooter', !r.error, r.error?.message);
const rentalId = r.data;

const { data: sc } = await staff.from('scooters').select('status').eq('id', target.id).single();
check('scooter -> reserved', sc.status === 'reserved');
const { data: rental } = await c1.from('rentals').select('status, weekly_rent, deposit_amount').eq('id', rentalId).single();
check('rental pending_agreement with rent snapshot 1820', rental.status === 'pending_agreement' && Number(rental.weekly_rent) === 1820, JSON.stringify(rental));
const { data: n } = await c1.from('notifications').select('title').order('created_at', { ascending: false }).limit(1);
check('allocation notification', n[0]?.title === 'Scooter allocated');
const { data: seen } = await c1.from('scooters').select('id').eq('id', target.id);
check('customer can still see their reserved scooter', seen.length === 1);

r = await staff.from('scooters').update({ status: 'available' }).eq('id', target.id).select();
check('cannot free a scooter on an open rental directly', !!r.error, r.error?.message);

r = await c1.rpc('request_scooter', { p_pickup: hubs[0].id });
check('customer with open rental cannot request again', r.error?.message.includes('already have a scooter'), r.error?.message);

const { data: c2rows } = await c2.from('rentals').select('id');
check('other customer cannot see the rental', c2rows.length === 0);

// rejection path
await admin.from('profiles').update({ kyc_status: 'approved' }).eq('id', accounts.customer2.id);
await admin.from('booking_requests').update({ status: 'cancelled' }).eq('user_id', accounts.customer2.id).eq('status', 'pending');
r = await c2.rpc('request_scooter', { p_pickup: hubs[1].id });
const b2 = r.data;
r = await staff.rpc('reject_booking', { p_booking: b2, p_note: '' });
check('reject needs a note', !!r.error);
r = await staff.rpc('reject_booking', { p_booking: b2, p_note: 'No scooters at Kukatpally this week' });
const { data: b2row } = await c2.from('booking_requests').select('status, admin_note').eq('id', b2).single();
check('booking rejected with note', b2row.status === 'rejected');
await admin.from('profiles').update({ kyc_status: 'rejected' }).eq('id', accounts.customer2.id);

console.log('  rental for next milestone:', rentalId);
summary();
