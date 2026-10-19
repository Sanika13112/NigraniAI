import { Link, useNavigate } from 'react-router-dom';
import type { Product } from '../lib/types';
import { Icon } from './Icon';
import { Price, ProductImage } from './ui';
import { Stars } from './Stars';
import { useCart } from '../state/CartContext';
import { useWishlist } from '../state/WishlistContext';
import { useToast } from '../state/ToastContext';

export function stockLabel(stock: number): { text: string; tone: 'ok' | 'low' | 'out' } {
  if (stock <= 0) return { text: 'Out of stock', tone: 'out' };
  if (stock <= 5) return { text: `Only ${stock} left`, tone: 'low' };
  return { text: 'In stock', tone: 'ok' };
}

/** Star row with the review count, linking to the reviews. Nothing until a product has reviews. */
export function RatingLine({ product }: { product: Product }) {
  if (!product.ratingAverage || !product.ratingCount) return null;
  return (
    <Link to={`/product/${product.id}#reviews`} className="rating-line" aria-label={`Rated ${Number(product.ratingAverage).toFixed(1)} out of 5 from ${product.ratingCount} reviews`}>
      <span className="rating-num" aria-hidden="true">{Number(product.ratingAverage).toFixed(1)}</span>
      <Stars value={Number(product.ratingAverage)} size={15} />
      <span className="rating-count" aria-hidden="true">({product.ratingCount.toLocaleString('en-IN')})</span>
    </Link>
  );
}

export function ProductCard({ product, variant = 'grid' }: { product: Product; variant?: 'grid' | 'shelf' }) {
  const cart = useCart();
  const wishlist = useWishlist();
  const toast = useToast();
  const navigate = useNavigate();
  const stock = stockLabel(product.stockQuantity);
  const saved = wishlist.has(product.id);

  const add = () => {
    const r = cart.add(product, 1);
    if (r.added > 0) toast.success(product.name, { label: 'View cart', onClick: () => navigate('/cart') }, { title: 'Added to cart', image: product.imageUrl });
    else toast.info(r.limited ? 'You already have the maximum available quantity in your cart' : 'Not available right now');
  };

  if (variant === 'shelf') {
    return (
      <article className="product-card product-card-shelf">
        <Link to={`/product/${product.id}`} className="product-media" aria-label={product.name}>
          <ProductImage src={product.imageUrl} alt={product.name} />
        </Link>
        <div className="product-body">
          <Price value={product.price} />
          <Link to={`/product/${product.id}`} className="product-name">{product.name}</Link>
          <RatingLine product={product} />
        </div>
      </article>
    );
  }

  return (
    <article className="product-card">
      <div className="product-media-wrap">
        <Link to={`/product/${product.id}`} className="product-media" aria-label={product.name}>
          <ProductImage src={product.imageUrl} alt={product.name} />
        </Link>
        <button
          className={`wish-btn ${saved ? 'is-saved' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          onClick={() => wishlist.toggle(product.id)}
        >
          <Icon name="heart" size={18} />
        </button>
      </div>
      <div className="product-body">
        <Link to={`/product/${product.id}`} className="product-name">{product.name}</Link>
        <RatingLine product={product} />
        <Price value={product.price} />
        <span className="product-sub">Inclusive of all taxes · {product.category}</span>
        {stock.tone === 'low' && <span className="stock stock-low">{stock.text} in stock</span>}
        {stock.tone === 'out' ? (
          <span className="stock stock-out">Currently unavailable</span>
        ) : (
          <button className="btn btn-cart btn-sm" onClick={add}>Add to cart</button>
        )}
      </div>
    </article>
  );
}
