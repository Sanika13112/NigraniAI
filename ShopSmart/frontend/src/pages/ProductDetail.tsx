import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { ApiError } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { EmptyState, ErrorState, Price, ProductImage, QuantityStepper, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { ProductCard, stockLabel } from '../components/ProductCard';
import { Reviews } from '../components/Reviews';
import { Stars } from '../components/Stars';
import { MAX_PER_ITEM, useCart } from '../state/CartContext';
import { useWishlist } from '../state/WishlistContext';
import { useToast } from '../state/ToastContext';

export default function ProductDetail() {
  const { id } = useParams();
  const productId = Number(id);
  const valid = Number.isInteger(productId) && productId > 0;
  const { data: product, error, loading, reload } = useAsync(
    () => (valid ? productApi.get(productId) : Promise.reject(new ApiError(404, 'Product not found'))),
    [productId],
  );
  const related = useAsync(
    () => (product ? productApi.search({ category: product.category, size: 12, inStock: true }) : Promise.resolve(null)),
    [product?.category],
  );
  const cart = useCart();
  const wishlist = useWishlist();
  const toast = useToast();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const { hash } = useLocation();
  useEffect(() => {
    if (product && hash === '#reviews') {
      setTimeout(() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, [product, hash]);
  useDocumentTitle(product?.name ?? 'Product');

  if (loading && !product) {
    return (
      <div className="pdp-page"><div className="pdp">
        <div className="pdp-media"><Skeleton width="100%" height="100%" radius={16} /></div>
        <div className="pdp-info">
          <Skeleton width="30%" /><Skeleton width="80%" height={32} /><Skeleton width="25%" height={28} /><Skeleton width="100%" height={80} />
        </div>
      </div></div>
    );
  }
  if (error || !product) {
    const notFound = error?.toLowerCase().includes('not found') || error?.toLowerCase().includes('could not find');
    return (
      <div className="container section">
        {notFound ? (
          <EmptyState icon="search" title="Product not found" action={<Link to="/shop" className="btn btn-primary">Browse products</Link>}>
            It may have been removed from the catalogue.
          </EmptyState>
        ) : (
          <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />
        )}
      </div>
    );
  }

  const stock = stockLabel(product.stockQuantity);
  const max = Math.max(1, Math.min(MAX_PER_ITEM, product.stockQuantity));
  const inCart = cart.items.find((i) => i.productId === product.id)?.quantity ?? 0;
  const saved = wishlist.has(product.id);

  const addToCart = (goToCart: boolean) => {
    const r = cart.add(product, qty);
    if (r.added > 0) {
      if (goToCart) navigate('/cart');
      else toast.success(`${r.added} × ${product.name}`, { label: 'View cart', onClick: () => navigate('/cart') }, { title: 'Added to cart', image: product.imageUrl });
    } else {
      toast.info(r.limited ? 'You already have the maximum available quantity in your cart.' : 'This product is not available right now.');
    }
  };

  return (
    <div className="pdp-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><Icon name="chevronRight" size={12} />
        <Link to={`/shop?category=${encodeURIComponent(product.category)}`}>{product.category}</Link><Icon name="chevronRight" size={12} />
        <span aria-current="page">{product.name}</span>
      </nav>
      <div className="pdp">
        <div className="pdp-media"><ProductImage src={product.imageUrl} alt={product.name} /></div>

        <div className="pdp-info">
          <h1>{product.name}</h1>
          <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="pdp-store">Visit the ShopSmart {product.category} store</Link>
          {product.ratingCount ? (
            <a href="#reviews" className="pdp-rating">
              <span>{Number(product.ratingAverage).toFixed(1)}</span>
              <Stars value={Number(product.ratingAverage)} size={16} />
              <span className="pdp-rating-count">{product.ratingCount.toLocaleString('en-IN')} {product.ratingCount === 1 ? 'rating' : 'ratings'}</span>
            </a>
          ) : (
            <span className="muted small">No ratings yet</span>
          )}
          <hr />
          <div className="pdp-price">
            <Price value={product.price} className="price-lg" />
          </div>
          <small className="muted">Inclusive of all taxes</small>
          <ul className="pdp-assurance">
            <li><span className="assure-icon"><Icon name="lock" size={20} /></span>Secure transaction</li>
            <li><span className="assure-icon"><Icon name="card" size={20} /></span>Pay online or on delivery</li>
            <li><span className="assure-icon"><Icon name="box" size={20} /></span>Stock reserved at order</li>
            <li><span className="assure-icon"><Icon name="undo" size={20} /></span>Returns after delivery</li>
          </ul>
          <hr />
          <h2 className="pdp-about">About this item</h2>
          <p className="pdp-desc">{product.description}</p>
        </div>

        <aside className="pdp-buybox" aria-label="Buying options">
          <Price value={product.price} className="price-lg" />
          <p className="muted small">Delivery charges, if any, are shown at checkout.</p>
          <p className={`stock stock-${stock.tone} stock-lg`}>{stock.tone === 'out' ? 'Currently unavailable.' : stock.tone === 'low' ? `${stock.text} in stock.` : 'In stock'}</p>
          <dl className="buybox-facts">
            <div><dt>Ships from</dt><dd>ShopSmart</dd></div>
            <div><dt>Sold by</dt><dd>ShopSmart</dd></div>
            <div><dt>Payment</dt><dd>Secure transaction</dd></div>
          </dl>
          {product.stockQuantity > 0 ? (
            <div className="pdp-buy">
              <div className="pdp-qty">
                <span>Quantity</span>
                <QuantityStepper value={Math.min(qty, max)} max={max} onChange={setQty} />
              </div>
              {inCart > 0 && <small className="muted">{inCart} already in your cart</small>}
              <div className="pdp-actions">
                <button className="btn btn-cart btn-lg" onClick={() => addToCart(false)}>Add to cart</button>
                <button className="btn btn-buy btn-lg" onClick={() => addToCart(true)}>Buy now</button>
              </div>
            </div>
          ) : (
            <p className="notice notice-warning">This product is out of stock. Save it to your wishlist and check back later.</p>
          )}
          <button className={`btn btn-ghost btn-block ${saved ? 'is-saved' : ''}`} onClick={() => wishlist.toggle(product.id)} aria-pressed={saved}>
            <Icon name="heart" size={16} /> {saved ? 'Saved to wishlist' : 'Save to wishlist'}
          </button>
        </aside>
      </div>

      {related.data && related.data.content.filter((p) => p.id !== product.id).length > 0 && (
        <section className="home-panel shelf pdp-related" aria-label={`More in ${product.category}`}>
          <div className="panel-head"><h2>More in {product.category}</h2><Link to={`/shop?category=${encodeURIComponent(product.category)}`}>See all</Link></div>
          <div className="shelf-track" tabIndex={0}>
            {related.data.content.filter((p) => p.id !== product.id).map((p) => <ProductCard key={p.id} product={p} variant="shelf" />)}
          </div>
        </section>
      )}

      <Reviews productId={product.id} onChanged={reload} />
    </div>
  );
}
