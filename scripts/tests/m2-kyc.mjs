import { signIn, accounts, check, summary, admin } from './helpers.mjs';

console.log('M2: onboarding + KYC');
const c1 = await signIn('customer1');
const c2 = await signIn('customer2');
const staff = await signIn('staff');
const id = accounts.customer1.id;

// reset customer1 for a repeatable run
await admin.from('kyc_documents').delete().eq('user_id', id);
await admin.from('profiles').update({ kyc_status: 'not_submitted', kyc_reject_reason: null, full_name: 'Test Rider One', address: null }).eq('id', id);

let r = await c1.rpc('submit_kyc');
check('cannot submit with incomplete profile', r.error?.message.includes('Complete your profile'), r.error?.message);

r = await c1.from('profiles').update({
  full_name: 'Test Rider One', address: '12-3-45, Ameerpet, Hyderabad 500016',
  emergency_contact_name: 'Ramesh', emergency_contact_phone: '9876543210', delivery_platform: 'zepto',
}).eq('id', id);
check('customer saves profile', !r.error, r.error?.message);
await c1.rpc('record_consent');

r = await c1.rpc('submit_kyc');
check('cannot submit without documents', r.error?.message.includes('Upload these documents'), r.error?.message);

const png = new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])], { type: 'image/png' });
for (const t of ['aadhaar', 'pan', 'driving_licence']) {
  const path = `${id}/${t}-${Date.now()}.png`;
  const up = await c1.storage.from('kyc').upload(path, png, { contentType: 'image/png' });
  const ins = await c1.from('kyc_documents').insert({ user_id: id, doc_type: t, file_path: path });
  check(`upload ${t}`, !up.error && !ins.error, up.error?.message ?? ins.error?.message);
}
const forged = await c1.from('kyc_documents').insert({ user_id: id, doc_type: 'other', file_path: 'x', status: 'approved' });
check('customer cannot insert a pre-approved doc', !!forged.error);

r = await c1.rpc('submit_kyc');
check('submit_kyc -> submitted', r.data === 'submitted', r.error?.message);

const { data: otherDocs } = await c2.from('kyc_documents').select('id').eq('user_id', id);
check('other customer cannot see these docs', otherDocs.length === 0);
const { data: files } = await c2.storage.from('kyc').list(id);
check('other customer cannot list these files', (files ?? []).length === 0);

const { data: docs } = await staff.from('kyc_documents').select('id, doc_type').eq('user_id', id);
check('staff sees the 3 documents', docs.length === 3);
r = await c1.rpc('review_kyc_document', { p_doc: docs[0].id, p_approve: true });
check('customer cannot review documents', !!r.error);
r = await staff.rpc('decide_kyc', { p_user: id, p_approve: true });
check('cannot approve customer before docs approved', r.error?.message.includes('Approve Aadhaar'), r.error?.message);

r = await staff.rpc('review_kyc_document', { p_doc: docs[1].id, p_approve: false });
check('reject document needs a reason', !!r.error);
for (const d of docs) await staff.rpc('review_kyc_document', { p_doc: d.id, p_approve: true });
const { data: p1 } = await staff.from('profiles').select('kyc_status').eq('id', id).single();
check('profile moved to under_review', p1.kyc_status === 'under_review', p1.kyc_status);

r = await staff.rpc('decide_kyc', { p_user: id, p_approve: true });
check('staff approves KYC', !r.error, r.error?.message);
const { data: me } = await c1.from('profiles').select('kyc_status').eq('id', id).single();
check('customer sees approved', me.kyc_status === 'approved');
const { data: notes } = await c1.from('notifications').select('title').order('created_at', { ascending: false }).limit(1);
check('approval notification in inbox', notes[0]?.title === "You're verified");

const { data: audit } = await admin.from('audit_log').select('id').eq('entity', 'kyc_documents').eq('entity_id', docs[0].id);
check('KYC review is audited', audit.length >= 2);

// customer2: rejection path
await admin.from('profiles').update({ kyc_status: 'submitted' }).eq('id', accounts.customer2.id);
r = await staff.rpc('decide_kyc', { p_user: accounts.customer2.id, p_approve: false, p_reason: 'PAN photo is blurred' });
const { data: p2 } = await c2.from('profiles').select('kyc_status, kyc_reject_reason').single();
check('reject with reason', p2.kyc_status === 'rejected' && p2.kyc_reject_reason === 'PAN photo is blurred');
summary();
