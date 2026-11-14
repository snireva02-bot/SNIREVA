// Called by the database (pg_net) for every new notifications row. Sends FCM push and records the result.
import { env, HttpError, isInternal, json, serve } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';
import { FcmProvider } from '../_shared/notify.ts';

let fcm: FcmProvider | null = null;

serve(async (req) => {
  if (!isInternal(req)) throw new HttpError(401, 'Unauthorized');
  const { id } = await req.json();
  const db = adminClient();
  const { data: n } = await db.from('notifications').select('*, profile:profiles(fcm_token, is_active)').eq('id', id).single();
  if (!n) return json({ ok: false, reason: 'not found' });
  const token = n.profile?.fcm_token;
  if (!token) {
    await db.from('notifications').update({ push_error: 'No device token' }).eq('id', id);
    return json({ ok: true, skipped: 'no token' });
  }
  fcm ??= new FcmProvider(env('FCM_SERVICE_ACCOUNT_JSON'));
  const res = await fcm.send({ userId: n.user_id, fcmToken: token }, {
    title: n.title, body: n.body, channel: n.channel, data: { ...(n.data ?? {}), notification_id: n.id },
  });
  if (res.ok) await db.from('notifications').update({ push_sent_at: new Date().toISOString(), push_error: null }).eq('id', id);
  else {
    await db.from('notifications').update({ push_error: res.error }).eq('id', id);
    if (res.invalidToken) await db.from('profiles').update({ fcm_token: null }).eq('id', n.user_id).eq('fcm_token', token);
  }
  return json({ ok: res.ok });
});
