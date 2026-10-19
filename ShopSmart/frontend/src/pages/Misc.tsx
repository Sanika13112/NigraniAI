import { Link } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useWishlist } from '../state/WishlistContext';
import { EmptyState, ErrorState, Notice, ProductCardSkeleton } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { ApiError } from '../lib/api';
import type { Product } from '../lib/types';

export function Wishlist() {
  useDocumentTitle('Wishlist');
  const wishlist = useWishlist();
  const key = wishlist.ids.join(',');
  const { data, error, loading, reload } = useAsync(async () => {
    const results = await Promise.all(
      wishlist.ids.map((id) =>
        productApi.get(id).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
      ),
    );
    return results.filter((p): p is Product => p !== null);
  }, [key]);

  return (
    <div className="container section">
      <h1>Wishlist</h1>
      {!wishlist.syncedToAccount && wishlist.ids.length > 0 && (
        <Notice tone="info">Saved on this device only. <Link to="/login">Sign in</Link> to keep your wishlist across devices.</Notice>
      )}
      {wishlist.ids.length === 0 ? (
        <EmptyState icon="heart" title="Your wishlist is empty" action={<Link to="/shop" className="btn btn-primary">Discover products</Link>}>
          Tap the heart on any product to save it for later.
        </EmptyState>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="product-grid">{wishlist.ids.map((id) => <ProductCardSkeleton key={id} />)}</div>
      ) : (
        <>
          <div className="product-grid">{data.map((p) => <ProductCard key={p.id} product={p} />)}</div>
          {data.length < wishlist.ids.length && <p className="muted small">Some saved products are no longer in the catalogue.</p>}
        </>
      )}
    </div>
  );
}

export function Help() {
  useDocumentTitle('Help');
  return (
    <div className="container section prose">
      <h1>Help</h1>
      <h2>Payments</h2>
      <p>Online payments are processed by Razorpay. ShopSmart never sees or stores your card number, CVV or UPI PIN. An order shows as paid only after our server has verified the payment with Razorpay. If your payment window closes or your connection drops after paying, open the order and choose <em>I already paid, check status</em>. We check with Razorpay directly.</p>
      <p>Unpaid online orders hold your items for 30 minutes and are then cancelled automatically.</p>
      <h2>Cash on delivery</h2>
      <p>Choose cash on delivery at checkout and pay the courier when your order arrives.</p>
      <h2>Cancellations & refunds</h2>
      <p>You can cancel an order until it ships. If you paid online, the refund goes back to your original payment method. It is marked <em>Refunded</em> only after the payment provider confirms it. Banks usually take 5–7 working days.</p>
      <h2>Returns</h2>
      <p>After delivery, open the order and choose <em>Request a return</em>. When ShopSmart accepts the return, the refund is started.</p>
      <h2>Delivery tracking</h2>
      <p>Your order page shows every status update. Carrier tracking numbers are not available yet.</p>
      <h2>Privacy</h2>
      <p>We use your name, phone and address only to deliver your orders, and every access to customer records is logged.</p>
    </div>
  );
}

export function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="container section">
      <EmptyState icon="search" title="Page not found" action={<Link to="/" className="btn btn-primary">Go to home</Link>}>
        The page you’re looking for doesn’t exist or has moved.
      </EmptyState>
    </div>
  );
}
