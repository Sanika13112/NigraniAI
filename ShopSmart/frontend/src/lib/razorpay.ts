import type { CheckoutSession } from './types';

/* Razorpay Standard Checkout, loaded from Razorpay's official CDN only when needed. */

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (resp: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => (window.Razorpay ? resolve() : reject(new Error('Payment window failed to load')));
      script.onerror = () => {
        loader = null;
        reject(new Error("Couldn't load the secure payment window. Check your connection and try again."));
      };
      document.body.appendChild(script);
    });
  }
  return loader;
}

export type CheckoutOutcome =
  | { kind: 'success'; response: RazorpaySuccess }
  | { kind: 'dismissed'; lastError: string | null };

/** Opens Razorpay Checkout and resolves when the shopper finishes or closes it. */
export type PayMethod = 'upi' | 'card' | 'netbanking' | 'wallet';

const METHOD_BLOCKS: Record<PayMethod, { name: string; instruments: { method: string }[] }> = {
  upi: { name: 'Pay using UPI', instruments: [{ method: 'upi' }] },
  card: { name: 'Credit / Debit card', instruments: [{ method: 'card' }] },
  netbanking: { name: 'Netbanking', instruments: [{ method: 'netbanking' }] },
  wallet: { name: 'Wallets', instruments: [{ method: 'wallet' }] },
};

export async function openCheckout(session: CheckoutSession, brandColor = '#6d28d9', preferred?: PayMethod): Promise<CheckoutOutcome> {
  await loadRazorpay();
  return new Promise<CheckoutOutcome>((resolve) => {
    let lastError: string | null = null;
    let settled = false;
    const rzp = new window.Razorpay!({
      key: session.keyId,
      order_id: session.providerOrderId,
      amount: session.amount,
      currency: session.currency,
      name: session.merchantName,
      description: `Order #${session.orderId}${session.mode === 'TEST' ? ' (sandbox)' : ''}`,
      prefill: {
        name: session.prefill.name ?? undefined,
        email: session.prefill.email ?? undefined,
        contact: session.prefill.contact ?? undefined,
      },
      notes: { shopsmart_order_id: String(session.orderId) },
      theme: { color: brandColor },
      retry: { enabled: true, max_count: 3 },
      // Show the shopper's chosen method first; every other enabled method stays available below it.
      ...(preferred
        ? {
            config: {
              display: {
                blocks: { preferred: METHOD_BLOCKS[preferred] },
                sequence: ['block.preferred'],
                preferences: { show_default_blocks: true },
              },
            },
          }
        : {}),
      handler: (response: RazorpaySuccess) => {
        if (settled) return;
        settled = true;
        resolve({ kind: 'success', response });
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          if (settled) return;
          settled = true;
          resolve({ kind: 'dismissed', lastError });
        },
      },
    });
    rzp.on('payment.failed', (resp) => {
      lastError = resp?.error?.description ?? 'The payment did not go through.';
    });
    rzp.open();
  });
}
