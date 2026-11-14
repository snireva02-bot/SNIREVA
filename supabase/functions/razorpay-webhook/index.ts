// Razorpay -> webhook. The ONLY path that marks gateway payments as paid.
// Deploy with --no-verify-jwt (Razorpay can't send a Supabase JWT); authenticity comes from the HMAC signature.
import { env, json, safeEqual } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const expected = await hmacHex(env('RAZORPAY_WEBHOOK_SECRET'), raw);
  if (!signature || !safeEqual(signature, expected)) return json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(raw);
  const db = adminClient();
  const payment = event?.payload?.payment?.entity;
  const order = event?.payload?.order?.entity;

  try {
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        const orderId = payment?.order_id ?? order?.id;
        const { data, error } = await db.rpc('apply_gateway_payment', {
          p_order_id: orderId, p_payment_id: payment?.id, p_amount_paise: payment?.amount ?? order?.amount_paid,
        });
        if (error) throw error;
        return json({ ok: true, result: data });
      }
      case 'payment.failed': {
        const reason = [payment?.error_description, payment?.error_reason].filter(Boolean).join(' – ');
        const { data, error } = await db.rpc('mark_gateway_failed', { p_order_id: payment?.order_id, p_payment_id: payment?.id, p_reason: reason });
        if (error) throw error;
        return json({ ok: true, result: data });
      }
      default:
        return json({ ok: true, ignored: event.event });
    }
  } catch (e) {
    console.error('webhook error', event?.event, e);
    // 500 makes Razorpay retry; processing is idempotent.
    return json({ error: 'Processing failed' }, 500);
  }
});
