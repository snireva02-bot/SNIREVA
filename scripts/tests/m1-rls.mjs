import { signIn, accounts, check, summary } from './helpers.mjs';

console.log('M1: roles + RLS');
const c1 = await signIn('customer1');
const staff = await signIn('staff');

const { data: own } = await c1.from('profiles').select('id, role');
check('customer sees only own profile', own?.length === 1 && own[0].id === accounts.customer1.id, JSON.stringify(own));

const { data: other } = await c1.from('profiles').select('id').eq('id', accounts.customer2.id);
check('customer cannot read another customer', other?.length === 0);

const { error: roleErr } = await c1.from('profiles').update({ role: 'owner' }).eq('id', accounts.customer1.id);
check('customer cannot promote self', !!roleErr, roleErr?.message);

const { data: cur } = await c1.from('profiles').select('kyc_status').single();
const { error: kycErr } = await c1.from('profiles').update({ kyc_status: cur.kyc_status === 'approved' ? 'submitted' : 'approved' }).eq('id', accounts.customer1.id);
check('customer cannot change own KYC status', !!kycErr);

const { error: nameErr } = await c1.from('profiles').update({ full_name: 'Test Rider One' }).eq('id', accounts.customer1.id);
check('customer can edit own name', !nameErr, nameErr?.message);

const { data: audit } = await c1.from('audit_log').select('id').limit(1);
check('customer cannot read audit log', audit?.length === 0);

const { error: scootErr } = await c1.from('scooters').insert({ code: 'HACK-1', model: 'x' });
check('customer cannot create scooters', !!scootErr);

const { data: allProfiles } = await staff.from('profiles').select('id');
check('staff can read all profiles', (allProfiles?.length ?? 0) >= 5);

const { error: staffRole } = await staff.from('profiles').update({ role: 'owner' }).eq('id', accounts.staff.id);
check('staff cannot change roles', !!staffRole);

const { data: staffAudit } = await staff.from('audit_log').select('id').limit(1);
check('staff cannot read audit log (manager+ only)', staffAudit?.length === 0);

const mgr = await signIn('manager');
const { data: mgrAudit } = await mgr.from('audit_log').select('id').limit(1);
check('manager can read audit log', (mgrAudit?.length ?? 0) > 0);

const { error: auditDel } = await (await signIn('owner')).from('audit_log').delete().not('id', 'is', null).select();
const { count } = await mgr.from('audit_log').select('id', { count: 'exact', head: true });
check('owner cannot delete audit rows', !auditDel ? count > 0 : true);

const { error: setErr } = await c1.from('settings').update({ weekly_rent: 1 }).eq('id', 1).select();
const { data: s } = await c1.from('settings').select('weekly_rent').single();
check('customer cannot change settings', Number(s.weekly_rent) === 1820, setErr?.message);

const { error: upErr } = await c1.storage.from('kyc').upload(`${accounts.customer2.id}/x.png`, new Blob(['x'], { type: 'image/png' }));
check('customer cannot upload into another user folder', !!upErr);

summary();
