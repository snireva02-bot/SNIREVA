// Exercises the real razorpay-webhook function (run locally via scripts/serve-fn.mjs razorpay-webhook)
import { createHmac } from 'node:crypto';
import { signIn, check, summary, admin, env } from './helpers.mjs';

console.log('Webhook function (local Deno)');
const secret = env.RAZORPAY_WEBHOOK_SECRET ?? 'local_test_webhook_secret';
const url = process.env.WEBHOOK_URL ?? 'http://localhost:8000';
const c1 = await signIn('customer1');
const { data: rental } = await c1.from('rentals').select('id, next_due_date').eq('status', 'active').single();
const { data: prep } = await c1.rpc('prepare_rent_payment', { p_rental: rental.id });
const orderId = `order_wh_${Date.now()}`, payId = `pay_wh_${Date.now()}`;
await admin.from('payments').update({ razorpay_order_id: orderId }).eq('id', prep[0].payment_id);

const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: payId, order_id: orderId, amount: Math.round(prep[0].amount * 100), status: 'captured' } } } });
const sign = (b) => createHmac('sha256', secret).update(b).digest('hex');
const post = (b, sig) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body: b });

let res = await post(body, 'deadbeef');
check('forged signature rejected (400)', res.status === 400);
res = await post(body.replace(/"amount":\d+/, '"amount":100'), sign(body));
check('tampered body rejected', res.status === 400);
res = await post(body, sign(body));
const j = await res.json();
check('valid webhook -> paid', res.status === 200 && j.result === 'paid', JSON.stringify(j));
res = await post(body, sign(body));
check('replayed webhook is a no-op', (await res.json()).result === 'duplicate');
const { data: p } = await admin.from('payments').select('status, razorpay_payment_id').eq('id', prep[0].payment_id).single();
check('payment row paid with razorpay id', p.status === 'paid' && p.razorpay_payment_id === payId);
summary();
