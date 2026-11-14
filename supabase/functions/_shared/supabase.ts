import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { env, HttpError } from './http.ts';

/** Service-role client. Never exposed to apps. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Client acting as the caller (RLS + auth.uid() apply). */
export function userClient(req: Request): SupabaseClient {
  const auth = req.headers.get('Authorization');
  if (!auth) throw new HttpError(401, 'Sign in required');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

/** Validates the caller's JWT and returns their profile (id, role, is_active). */
export async function caller(req: Request) {
  const client = userClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Session expired. Sign in again.');
  const { data: profile } = await client.from('profiles').select('id, role, is_active, full_name, phone, email').eq('id', user.id).single();
  if (!profile || !profile.is_active) throw new HttpError(403, 'Account inactive');
  return { client, user, profile };
}

export const isStaffRole = (r: string) => r === 'staff' || r === 'manager' || r === 'owner';
