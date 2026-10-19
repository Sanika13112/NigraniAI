import { useCallback, useState } from 'react';
import { paymentApi } from './endpoints';
import { ApiError, errorMessage } from './api';
import { openCheckout, type PayMethod } from './razorpay';

export type PayResult =
  | { kind: 'paid' }
  | { kind: 'dismissed'; message: string }
  | { kind: 'verifying'; message: string }
  | { kind: 'error'; message: string };

/**
 * Online payment for an existing order:
 * 1. backend creates/reuses the Razorpay order (amount from the persisted order),
 * 2. Razorpay Checkout collects payment,
 * 3. backend verifies the signature AND re-fetches the payment from Razorpay before confirming.
 * The browser's success callback alone never marks anything as paid.
 */
export function usePayment() {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async (orderId: number, preferred?: PayMethod): Promise<PayResult> => {
    setBusy(true);
    try {
      const session = await paymentApi.checkout(orderId);
      const outcome = await openCheckout(session, '#6d28d9', preferred);
      if (outcome.kind === 'dismissed') {
        return {
          kind: 'dismissed',
          message: outcome.lastError
            ? `Payment not completed: ${outcome.lastError}. You can try again.`
            : 'Payment window closed. Your order is saved; complete payment within 30 minutes to confirm it.',
        };
      }
      try {
        await paymentApi.verify({
          orderId,
          razorpayOrderId: outcome.response.razorpay_order_id,
          razorpayPaymentId: outcome.response.razorpay_payment_id,
          razorpaySignature: outcome.response.razorpay_signature,
        });
        return { kind: 'paid' };
      } catch (err) {
        // The payment may still be valid (e.g. network drop during verify). The webhook and
        // the "check payment status" action reconcile it with Razorpay server-side.
        if (err instanceof ApiError && (err.isNetwork || err.status >= 500)) {
          return { kind: 'verifying', message: 'We are confirming your payment with the bank. This page will update shortly.' };
        }
        return { kind: 'error', message: errorMessage(err) };
      }
    } catch (err) {
      return { kind: 'error', message: errorMessage(err) };
    } finally {
      setBusy(false);
    }
  }, []);

  return { pay, busy };
}
