import type { CheckoutOptions, CheckoutResult } from './razorpay';

export async function openCheckout(o: CheckoutOptions): Promise<CheckoutResult> {
  // Loaded lazily: the native module isn't in Expo Go, so importing it at startup would crash there.
  let RazorpayCheckout: typeof import('react-native-razorpay').default;
  try {
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch {
    throw new Error('UPI payment needs the SNIREVA app build (not Expo Go).');
  }
  try {
    await RazorpayCheckout.open({
      key: o.keyId,
      order_id: o.orderId,
      amount: o.amountPaise,
      currency: 'INR',
      name: 'SNIREVA',
      description: o.description,
      prefill: { name: o.name, contact: o.contact },
      theme: { color: '#23915C' },
      method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
      retry: { enabled: true, max_count: 2 },
    });
    return 'submitted';
  } catch (e) {
    const code = (e as { code?: number }).code;
    return code === 0 || code === 2 ? 'cancelled' : 'error';
  }
}
