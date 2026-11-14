// Customer app -> create a Razorpay order for the rent currently due.
// Amount is computed in the database (prepare_rent_payment); the client only sends rental_id.
import { env, HttpError, json, serve } from '../_shared/http.ts';
import { adminClient, caller } from '../_shared/supabase.ts';

serve(async (req) => {
  const { client, profile } = await caller(req);
  const { rental_id } = await req.json().catch(() => ({}));
  if (!rental_id || typeof rental_id !== 'string') throw new HttpError(400, 'rental_id is required');

  // Runs as the customer: checks ownership, status, renewal hold.
  const { data, error } = await client.rpc('prepare_rent_payment', { p_rental: rental_id });
  if (error) throw new HttpError(400, error.message);
  const pay = data[0] as { payment_id: string; amount: number; late_fee: number; period_start: string; period_end: string };

  const keyId = env('RAZORPAY_KEY_ID');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${keyId}:${env('RAZORPAY_KEY_SECRET')}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(Number(pay.amount) * 100),
      currency: 'INR',
      receipt: pay.payment_id.replace(/-/g, '').slice(0, 40),
      notes: { payment_id: pay.payment_id, rental_id, user_id: profile.id },
    }),
  });
  const order = await res.json();
  if (!res.ok) {
    await adminClient().from('payments').update({ status: 'failed', failure_reason: `Order error: ${order?.error?.description ?? res.status}` }).eq('id', pay.payment_id);
    throw new HttpError(502, 'Payment service is unavailable. Try again shortly.');
  }

  const { error: upErr } = await adminClient().from('payments').update({ razorpay_order_id: order.id }).eq('id', pay.payment_id);
  if (upErr) throw new HttpError(500, upErr.message);

  return json({
    order_id: order.id, key_id: keyId, amount: Number(pay.amount), amount_paise: order.amount, currency: 'INR',
    payment_id: pay.payment_id, late_fee: Number(pay.late_fee), period_start: pay.period_start, period_end: pay.period_end,
    prefill: { name: profile.full_name ?? '', contact: profile.phone ?? '' },
  });
});
