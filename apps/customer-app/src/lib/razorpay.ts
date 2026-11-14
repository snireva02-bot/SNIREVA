/** Web / fallback: Razorpay's native SDK only runs in the Android/iOS dev build. */
export interface CheckoutOptions {
  keyId: string; orderId: string; amountPaise: number; description: string; name?: string; contact?: string;
}
/** The client result is never trusted; the webhook decides. 'submitted' just means "wait for confirmation". */
export type CheckoutResult = 'submitted' | 'cancelled' | 'error';

export async function openCheckout(_o: CheckoutOptions): Promise<CheckoutResult> {
  throw new Error('UPI payment works in the Android app.');
}
