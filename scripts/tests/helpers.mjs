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
