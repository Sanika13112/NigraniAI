import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customerApi, orderApi, paymentApi } from '../lib/endpoints';
import { ApiError, errorMessage, newId } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { usePayment } from '../lib/usePayment';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import { readSession, writeSession } from '../state/storage';
import { AddressBlock, AddressForm } from '../components/AddressForm';
import { EmptyState, ErrorState, Notice, Skeleton, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';
import { OrderSummary, useQuote } from './Cart';
import { money } from '../lib/format';
import type { Address } from '../lib/types';
import type { PayMethod } from '../lib/razorpay';

const ONLINE_METHODS: { id: PayMethod; label: string; hint: string; icon: string }[] = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm, any UPI app', icon: 'activity' },
  { id: 'card', label: 'Card', hint: 'Credit & debit cards', icon: 'card' },
  { id: 'netbanking', label: 'Netbanking', hint: 'All major banks', icon: 'store' },
  { id: 'wallet', label: 'Wallet', hint: 'Popular wallets', icon: 'box' },
];

const IDEM_KEY = 'ss_checkout_idem';

/** One idempotency key per cart content: double-clicks, retries and refreshes reuse it. */
function idempotencyKeyFor(signature: string): string {
  try {
    const stored = JSON.parse(readSession(IDEM_KEY) ?? 'null') as { sig: string; key: string } | null;
    if (stored && stored.sig === signature) return stored.key;
  } catch {
    /* ignore */
  }
  const key = newId();
  writeSession(IDEM_KEY, JSON.stringify({ sig: signature, key }));
  return key;
}

export default function Checkout() {
  useDocumentTitle('Checkout');
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { pay } = usePayment();
  const quoteState = useQuote();
  const quote = quoteState.data;
  const addresses = useAsync(() => customerApi.addresses(), []);
  const payConfig = useAsync(() => paymentApi.config(), []);

  const [addressId, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [method, setMethod] = useState<'ONLINE' | 'COD' | null>(null);
  const [onlineMethod, setOnlineMethod] = useState<PayMethod>('upi');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  useEffect(() => {
    if (addresses.data && addressId === null) {
      const def = addresses.data.find((a) => a.defaultAddress) ?? addresses.data[0];
      if (def) setAddressId(def.id);
      else setAdding(true);
    }
  }, [addresses.data, addressId]);

  useEffect(() => {
    if (payConfig.data && method === null) setMethod(payConfig.data.onlineEnabled ? 'ONLINE' : 'COD');
    if (payConfig.error && method === null) setMethod('COD');
  }, [payConfig.data, payConfig.error, method]);

  const signature = useMemo(() => cart.items.map((i) => `${i.productId}x${i.quantity}`).join('|'), [cart.items]);
  const selected = addresses.data?.find((a) => a.id === addressId) ?? null;
  const onlineEnabled = !!payConfig.data?.onlineEnabled;
  const sandbox = payConfig.data?.mode === 'TEST';

  if (cart.items.length === 0 && !placing) {
    return (
      <div className="container section">
        <EmptyState icon="cart" title="Your cart is empty" action={<Link to="/shop" className="btn btn-primary">Continue shopping</Link>} />
      </div>
    );
  }

  const saveAddress = async (value: Parameters<typeof customerApi.addAddress>[0]) => {
    setAddressError(null);
    try {
      const created = await customerApi.addAddress({ ...value, makeDefault: value.makeDefault || !addresses.data?.length });
      addresses.setData((prev) => [...(prev ?? []).map((a) => (created.defaultAddress ? { ...a, defaultAddress: false } : a)), created]);
      setAddressId(created.id);
      setAdding(false);
      toast.success('Address saved');
    } catch (err) {
      setAddressError(errorMessage(err));
    }
  };

  const placeOrder = async () => {
    if (!quote || !selected || !method || placing) return;
    setPlacing(true);
    setPlaceError(null);
    const address: Omit<Address, 'id' | 'label' | 'defaultAddress'> = {
      fullName: selected.fullName, phone: selected.phone, line1: selected.line1, line2: selected.line2,
      city: selected.city, state: selected.state, pincode: selected.pincode,
    };
    let orderId: number;
    try {
      const order = await orderApi.create(
        {
          items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          shippingAddress: address,
          paymentMethod: method,
          expectedTotal: quote.total,
        },
        idempotencyKeyFor(signature),
      );
      orderId = order.id;
      cart.clear();
      writeSession(IDEM_KEY, null);
    } catch (err) {
      setPlacing(false);
      if (err instanceof ApiError && err.status === 409) {
        quoteState.reload();
        setPlaceError(`${err.message} We've refreshed your cart with the latest prices and stock.`);
      } else if (err instanceof ApiError && err.isNetwork) {
        setPlaceError(`${err.message} If your order went through, you'll find it in My orders. Retrying is safe: it won't create a duplicate.`);
      } else {
        setPlaceError(errorMessage(err));
      }
      return;
    }

    if (method === 'COD') {
      navigate(`/account/orders/${orderId}?placed=1`, { replace: true });
      return;
    }
    const result = await pay(orderId, onlineMethod);
    if (result.kind === 'paid') toast.success('Payment confirmed');
    else if (result.kind === 'error') toast.error(result.message);
    else toast.info(result.message);
    navigate(`/account/orders/${orderId}?placed=1`, { replace: true });
  };

  return (
    <div className="container section">
      <h1>Checkout</h1>
      <div className="checkout-layout">
        <div className="stack">
          <section className="card checkout-step">
            <h2><span className="step-no">1</span> Delivery address</h2>
            {addresses.loading ? (
              <Skeleton width="100%" height={80} />
            ) : addresses.error ? (
              <ErrorState message={addresses.error} onRetry={addresses.reload} />
            ) : (
              <>
                {!adding && addresses.data && addresses.data.length > 0 && (
                  <div className="address-options" role="radiogroup" aria-label="Delivery address">
                    {addresses.data.map((a) => (
                      <label key={a.id} className={`address-option ${addressId === a.id ? 'selected' : ''}`}>
                        <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                        <div>
                          {a.label && <span className="badge badge-neutral">{a.label}</span>}
                          <AddressBlock a={a} />
                        </div>
                      </label>
                    ))}
                    <button className="btn btn-ghost" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add a new address</button>
                  </div>
                )}
                {adding && (
                  <AddressForm
                    onSubmit={saveAddress}
                    onCancel={addresses.data && addresses.data.length > 0 ? () => setAdding(false) : undefined}
                    submitLabel="Save and deliver here"
                    serverError={addressError}
                  />
                )}
              </>
            )}
          </section>

          <section className="card checkout-step">
            <h2><span className="step-no">2</span> Payment method</h2>
            {payConfig.loading ? (
              <Skeleton width="100%" height={60} />
            ) : (
              <div className="pay-options" role="radiogroup" aria-label="Payment method">
                <label className={`pay-option ${method === 'ONLINE' ? 'selected' : ''} ${!onlineEnabled ? 'disabled' : ''}`}>
                  <input type="radio" name="pay" disabled={!onlineEnabled} checked={method === 'ONLINE'} onChange={() => setMethod('ONLINE')} />
                  <div>
                    <strong>Pay online {sandbox && <span className="badge badge-warning">Sandbox</span>}</strong>
                    <span className="muted small">
                      {onlineEnabled
                        ? 'UPI, cards, netbanking and wallets via Razorpay’s secure checkout.'
                        : 'Online payment is not available right now.'}
                    </span>
                  </div>
                  <Icon name="card" />
                </label>
                <label className={`pay-option ${method === 'COD' ? 'selected' : ''}`}>
                  <input type="radio" name="pay" checked={method === 'COD'} onChange={() => setMethod('COD')} />
                  <div>
                    <strong>Cash on delivery</strong>
                    <span className="muted small">Pay {quote ? money(quote.total, true) : ''} when your order arrives.</span>
                  </div>
                  <Icon name="truck" />
                </label>
              </div>
            )}
            {method === 'ONLINE' && onlineEnabled && (
              <div className="method-grid" role="radiogroup" aria-label="Online payment method">
                {ONLINE_METHODS.map((m) => (
                  <label key={m.id} className={`method-chip ${onlineMethod === m.id ? 'selected' : ''}`}>
                    <input type="radio" name="online-method" checked={onlineMethod === m.id} onChange={() => setOnlineMethod(m.id)} />
                    <Icon name={m.icon} size={18} />
                    <span><strong>{m.label}</strong><small>{m.hint}</small></span>
                  </label>
                ))}
              </div>
            )}
            {sandbox && method === 'ONLINE' && (
              <Notice tone="warning" title="Sandbox mode">
                Razorpay test mode: no real money is charged. Fastest test: UPI ID <strong>success@razorpay</strong>. Test card: 4100 2800 0000 1007, any future date, any CVV.
              </Notice>
            )}
          </section>

          <section className="card checkout-step">
            <h2><span className="step-no">3</span> Review items</h2>
            <ul className="review-list">
              {(quote?.lines ?? []).map((l) => (
                <li key={l.productId} className={l.problem ? 'has-problem' : ''}>
                  <span>{l.name ?? `Product #${l.productId}`} × {l.quantity}</span>
                  <span>{l.problem ? <span className="line-problem">{l.problem}</span> : money(l.lineTotal, true)}</span>
                </li>
              ))}
            </ul>
            {quote && !quote.valid && (
              <Notice tone="warning">Some items are unavailable. <Link to="/cart">Update your cart</Link> to continue.</Notice>
            )}
          </section>
        </div>

        <OrderSummary quote={quote} loading={quoteState.loading}>
          {placeError && <div className="form-error" role="alert">{placeError}</div>}
          {quoteState.error && <ErrorState message={quoteState.error} onRetry={quoteState.reload} />}
          <button
            className="btn btn-primary btn-block btn-lg"
            disabled={!quote || !quote.valid || !selected || !method || placing || quoteState.loading || adding}
            onClick={placeOrder}
          >
            {placing ? <><Spinner /> {method === 'ONLINE' ? 'Processing payment…' : 'Placing order…'}</> : method === 'ONLINE' ? `Pay ${quote ? money(quote.total, true) : ''}` : 'Place order'}
          </button>
          <p className="summary-secure"><Icon name="lock" size={14} /> {method === 'ONLINE' ? 'You’ll complete payment in Razorpay’s secure window.' : 'You can cancel before the order ships.'}</p>
        </OrderSummary>
      </div>
    </div>
  );
}
