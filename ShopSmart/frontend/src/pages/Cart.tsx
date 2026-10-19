import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { orderApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useCart } from '../state/CartContext';
import { useAuth } from '../state/AuthContext';
import { useWishlist } from '../state/WishlistContext';
import { EmptyState, ErrorState, Notice, Price, ProductImage, QuantityStepper, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { money } from '../lib/format';
import type { Quote } from '../lib/types';

export function useQuote() {
  const cart = useCart();
  const key = useMemo(() => cart.items.map((i) => `${i.productId}:${i.quantity}`).join(','), [cart.items]);
  const state = useAsync<Quote | null>(
    () => (cart.items.length ? orderApi.quote(cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))) : Promise.resolve(null)),
    [key],
  );
  // Keep the cart's display snapshot in line with server prices and stock.
  useEffect(() => {
    if (state.data) {
      cart.refreshSnapshot(state.data.lines.map((l) => ({ productId: l.productId, price: l.unitPrice, stock: l.availableStock, name: l.name })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);
  return state;
}

export function OrderSummary({ quote, loading, children }: { quote: Quote | null | undefined; loading: boolean; children?: React.ReactNode }) {
  return (
    <aside className="summary card" aria-label="Order summary">
      <h2>Price details</h2>
      {loading || !quote ? (
        <div className="summary-rows"><Skeleton width="100%" /><Skeleton width="100%" /><Skeleton width="60%" height={22} /></div>
      ) : (
        <dl className="summary-rows">
          <div><dt>Items ({quote.lines.filter((l) => !l.problem).reduce((n, l) => n + l.quantity, 0)})</dt><dd>{money(quote.subtotal, true)}</dd></div>
          <div><dt>Delivery</dt><dd>{quote.shippingFee > 0 ? money(quote.shippingFee, true) : <span className="text-success">Free</span>}</dd></div>
          {quote.discountAmount > 0 && <div><dt>Discount</dt><dd>−{money(quote.discountAmount, true)}</dd></div>}
          <div className="summary-total"><dt>Total</dt><dd>{money(quote.total, true)}</dd></div>
          <p className="summary-note">{quote.taxInclusive ? 'Prices include GST.' : ''} {quote.shippingNote}</p>
        </dl>
      )}
      {children}
    </aside>
  );
}

export default function Cart() {
  useDocumentTitle('Cart');
  const cart = useCart();
  const { status, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: quote, error, loading, reload } = useQuote();
  const wishlist = useWishlist();

  if (cart.items.length === 0) {
    return (
      <div className="container section">
        <EmptyState icon="cart" title="Your cart is empty" action={<Link to="/shop" className="btn btn-primary">Start shopping</Link>}>
          Browse the catalogue and add the products you like.
        </EmptyState>
      </div>
    );
  }

  const lineFor = (id: number) => quote?.lines.find((l) => l.productId === id);
  const problems = quote?.lines.filter((l) => l.problem) ?? [];

  const itemCount = cart.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="cart-page">
      <div className="checkout-layout">
        <div className="stack">
          {error && <ErrorState message={error} onRetry={reload} title="We couldn't check current prices" />}
          {problems.length > 0 && (
            <Notice tone="warning" title="Some items need your attention">
              Adjust the highlighted items before checking out.
            </Notice>
          )}
          <section className="cart-card card">
            <div className="cart-card-head">
              <h1>Shopping cart</h1>
              <span className="muted small hide-sm">Price</span>
            </div>
            <ul className="cart-list">
              {cart.items.map((item) => {
                const line = lineFor(item.productId);
                const unit = line?.unitPrice ?? item.price;
                const available = line?.availableStock ?? item.stock;
                const max = Math.max(1, Math.min(10, available));
                const saved = wishlist.has(item.productId);
                return (
                  <li key={item.productId} className={`cart-line ${line?.problem ? 'has-problem' : ''}`}>
                    <Link to={`/product/${item.productId}`} className="cart-thumb"><ProductImage src={line?.imageUrl ?? item.imageUrl} alt={item.name} /></Link>
                    <div className="cart-info">
                      <Link to={`/product/${item.productId}`} className="cart-name">{line?.name ?? item.name}</Link>
                      {line?.problem ? (
                        <span className="line-problem"><Icon name="alert" size={14} /> {line.problem}</span>
                      ) : (
                        <span className={`stock ${available > 0 && available <= 5 ? 'stock-low' : 'stock-ok'}`}>{available > 0 && available <= 5 ? `Only ${available} left in stock` : 'In stock'}</span>
                      )}
                      <span className="muted small">Sold by ShopSmart · {item.category}</span>
                      <div className="cart-controls">
                        <QuantityStepper value={item.quantity} max={max} onChange={(q) => cart.setQuantity(item.productId, q)} label={`Quantity for ${item.name}`} />
                        <span className="cart-sep" aria-hidden="true" />
                        <button className="link-btn" onClick={() => cart.remove(item.productId)}>Delete</button>
                        <span className="cart-sep" aria-hidden="true" />
                        <button
                          className="link-btn"
                          onClick={() => {
                            if (!saved) wishlist.toggle(item.productId);
                            cart.remove(item.productId);
                          }}
                        >
                          Save for later
                        </button>
                      </div>
                    </div>
                    <div className="cart-price">
                      {loading && !line ? <Skeleton width={70} /> : <Price value={unit * item.quantity} />}
                      {item.quantity > 1 && <small className="muted">{money(unit)} each</small>}
                      {line && item.price !== line.unitPrice && line.unitPrice !== null && <small className="text-warning">Price updated</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="cart-subtotal">
              Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'}): {quote && !loading ? <strong>{money(quote.subtotal, true)}</strong> : <Skeleton width={80} />}
            </p>
          </section>
        </div>
        <OrderSummary quote={quote} loading={loading}>
          {isAdmin ? (
            <p className="muted small">Staff accounts can’t place orders.</p>
          ) : (
            <button
              className="btn btn-buy btn-block btn-lg"
              disabled={!quote || !quote.valid || loading}
              onClick={() => navigate(status === 'authenticated' ? '/checkout' : '/login', { state: { from: '/checkout' } })}
            >
              {status === 'authenticated' ? 'Proceed to checkout' : 'Sign in to check out'}
            </button>
          )}
          <p className="summary-secure"><Icon name="lock" size={14} /> Prices and stock are confirmed again when you place the order.</p>
        </OrderSummary>
      </div>
    </div>
  );
}
