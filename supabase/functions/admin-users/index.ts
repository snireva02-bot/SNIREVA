// Owner-only staff management (needs the Auth admin API, so it runs server-side).
import { HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, caller } from '../_shared/supabase.ts';

const ROLES = ['staff', 'manager', 'owner'];

serve(async (req) => {
  const { profile } = await caller(req);
  if (profile.role !== 'owner') throw new HttpError(403, 'Only the owner can manage staff');
  const body = await req.json();
  const db = adminClient();

  switch (body.action) {
    case 'create': {
      const { email, full_name, role, password } = body;
      if (!email || !full_name || !ROLES.includes(role)) throw new HttpError(400, 'Name, email and role are required');
      if (!password || String(password).length < 10) throw new HttpError(400, 'Temporary password must be at least 10 characters');
      const { data, error } = await db.auth.admin.createUser({
        email: String(email).trim().toLowerCase(), password, email_confirm: true,
        app_metadata: { role }, user_metadata: { full_name },
      });
      if (error) throw new HttpError(400, error.message.includes('already') ? 'A user with this email already exists' : error.message);
      await db.from('profiles').update({ role, full_name, email }).eq('id', data.user.id);
      return json({ id: data.user.id });
    }
    case 'set_role': {
      if (!ROLES.includes(body.role)) throw new HttpError(400, 'Invalid role');
      if (body.user_id === profile.id) throw new HttpError(400, "You can't change your own role");
      await db.auth.admin.updateUserById(body.user_id, { app_metadata: { role: body.role } });
      const { error } = await db.from('profiles').update({ role: body.role }).eq('id', body.user_id).neq('role', 'customer');
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }
    case 'set_active': {
      if (body.user_id === profile.id) throw new HttpError(400, "You can't deactivate yourself");
      const { error } = await db.from('profiles').update({ is_active: !!body.active }).eq('id', body.user_id).neq('role', 'customer');
      if (error) throw new HttpError(400, error.message);
      await db.auth.admin.updateUserById(body.user_id, { ban_duration: body.active ? 'none' : '876000h' });
      return json({ ok: true });
    }
    case 'reset_password': {
      if (!body.password || String(body.password).length < 10) throw new HttpError(400, 'Password must be at least 10 characters');
      const { error } = await db.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) throw new HttpError(400, error.message);
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
});
