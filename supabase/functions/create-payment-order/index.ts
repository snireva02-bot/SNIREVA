// Customer app -> one Razorpay order for the rent due on one or more of the customer's scooters.
// Amounts are computed in the database (prepare_rent_payment); the client only sends rental ids.
import { env, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, caller } from '../_shared/supabase.ts';

serve(async (req) => {
  const { client, profile } = await caller(req);
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.rental_ids) ? body.rental_ids : body.rental_id ? [body.rental_id] : [];
  if (!ids.length || ids.some((x) => typeof x !== 'string')) throw new HttpError(400, 'rental_ids is required');

  // Runs as the customer: checks ownership, status, renewal hold; computes the amount.
  const { data, error } = await client.rpc('prepare_rent_payment', { p_rentals: ids });
  if (error) throw new HttpError(400, error.message);
  const prep = data[0] as { order_id: string; total: number; items: { payment_id: string; rental_id: string; amount: number }[] };

  const keyId = env('RAZORPAY_KEY_ID');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${keyId}:${env('RAZORPAY_KEY_SECRET')}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(Number(prep.total) * 100),
      currency: 'INR',
      receipt: prep.order_id.replace(/-/g, '').slice(0, 40),
      notes: { order_id: prep.order_id, scooters: String(prep.items.length), user_id: profile.id },
    }),
  });
  const order = await res.json();
  const db = adminClient();
  if (!res.ok) {
    await db.from('payment_orders').update({ status: 'failed', failure_reason: `Order error: ${order?.error?.description ?? res.status}` }).eq('id', prep.order_id);
    await db.from('payments').update({ status: 'failed', failure_reason: 'Order could not be created' }).eq('order_id', prep.order_id);
    throw new HttpError(502, 'Payment service is unavailable. Try again shortly.');
  }
  const { error: upErr } = await db.rpc('attach_razorpay_order', { p_order: prep.order_id, p_razorpay_order_id: order.id });
  if (upErr) throw new HttpError(500, upErr.message);

  return json({
    order_id: order.id, key_id: keyId, amount: Number(prep.total), amount_paise: order.amount, currency: 'INR',
    payment_order_id: prep.order_id, items: prep.items,
    prefill: { name: profile.full_name ?? '', contact: profile.phone ?? '' },
  });
});
