// Creates/updates the owner, a manager, a staff user and two test customers.
// Credentials are written to scripts/.test-accounts.json (gitignored via .env.* rule? no -> see .gitignore).
// Usage: node scripts/seed-users.mjs
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, root } from './env.mjs';

const env = loadEnv();
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const outFile = path.join(root, 'scripts', '.test-accounts.json');
const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const pw = (k) => prev[k]?.password ?? `Snr-${randomBytes(6).toString('base64url')}`;

const accounts = [
  { key: 'owner', email: 'owner@snireva.test', role: 'owner', full_name: 'SNIREVA Owner' },
  { key: 'manager', email: 'manager@snireva.test', role: 'manager', full_name: 'Ravi Manager' },
  { key: 'staff', email: 'staff@snireva.test', role: 'staff', full_name: 'Anil Staff' },
  { key: 'customer1', email: 'rider1@snireva.test', phone: '919000000001', role: 'customer', full_name: 'Test Rider One' },
  { key: 'customer2', email: 'rider2@snireva.test', phone: '919000000002', role: 'customer', full_name: 'Test Rider Two' },
];

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const out = {};
for (const a of accounts) {
  const password = pw(a.key);
  const existing = list.users.find((u) => (a.phone && u.phone === a.phone) || (a.email && u.email === a.email));
  const attrs = {
    password,
    app_metadata: { role: a.role },
    user_metadata: { full_name: a.full_name },
    ...(a.email ? { email: a.email, email_confirm: true } : {}),
    ...(a.phone ? { phone: a.phone, phone_confirm: true } : {}),
  };
  const res = existing
    ? await admin.auth.admin.updateUserById(existing.id, attrs)
    : await admin.auth.admin.createUser(attrs);
  if (res.error) { console.error(a.key, res.error.message); process.exitCode = 1; continue; }
  const id = res.data.user.id;
  // Role lives in profiles.role (source of truth for RLS); keep it in sync.
  const { error } = await admin.from('profiles').update({ role: a.role, full_name: a.full_name }).eq('id', id);
  if (error) console.error(a.key, 'profile', error.message);
  out[a.key] = { id, email: a.email, phone: a.phone && `+${a.phone}`, password, role: a.role };
  console.log(`${a.key.padEnd(10)} ${a.role.padEnd(8)} ${a.email ?? '+' + a.phone}`);
}
writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log('credentials ->', path.relative(root, outFile));
