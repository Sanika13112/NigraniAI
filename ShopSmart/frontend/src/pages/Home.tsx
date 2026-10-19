import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, ProductCardSkeleton, ProductImage, Skeleton } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { Icon } from '../components/Icon';
import { CATEGORIES } from '../components/Layout';
import { CategoryArt, categoryHue } from '../components/CategoryArt';
import { LogoMark } from '../components/Brand';
import type { Product } from '../lib/types';

const CATEGORY_BLURB: Record<string, string> = {
  Electronics: 'Audio, phones, laptops',
  Fashion: 'Everyday wear and shoes',
  Accessories: 'Watches, bags, eyewear',
  Beauty: 'Skincare and fragrance',
  Home: 'Furniture and decor',
  Sports: 'Fitness and outdoor play',
  Books: 'Reading and stationery',
  Kitchen: 'Cookware and coffee',
  Grocery: 'Pantry and fresh picks',
  Toys: 'Kids and baby',
};

/** A horizontally scrolling row of real products (marketplace "shelf"). */
function Shelf({ title, category, sort, link, linkLabel = 'See all' }: { title: string; category?: string; sort: string; link: string; linkLabel?: string }) {
  const { data, error, loading, reload } = useAsync(
    () => productApi.search({ category, sort, size: 12, inStock: true }),
    [category, sort],
  );
  if (!loading && data && data.content.length === 0) return null;
  return (
    <section className="home-panel shelf" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <Link to={link}>{linkLabel}</Link>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="shelf-track" tabIndex={0} aria-label={`${title}, scroll for more`}>
          {loading || !data
            ? Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)
            : data.content.map((p) => <ProductCard key={p.id} product={p} variant="shelf" />)}
        </div>
      )}
    </section>
  );
}

/** Four real products from one department, Amazon-style "quad" card. */
function QuadCard({ category, products, loading }: { category: string; products: Product[]; loading: boolean }) {
  const picks = products.slice(0, 4);
  return (
    <section className="home-panel quad-card">
      <h2>{SLIDE_COPY[category] ?? category}</h2>
      <div className="quad-grid">
        {loading
          ? Array.from({ length: 4 }, (_, i) => <span key={i} className="quad-item"><Skeleton width="100%" height="100%" radius={4} /></span>)
          : picks.map((p) => (
              <Link key={p.id} to={`/product/${p.id}`} className="quad-item">
                <span className="quad-img"><ProductImage src={p.imageUrl} alt="" /></span>
                <span className="quad-label">{p.name}</span>
              </Link>
            ))}
      </div>
      <Link to={`/shop?category=${encodeURIComponent(category)}`} className="panel-link">See all in {category}</Link>
    </section>
  );
}

/** One large photo for a department. */
function FeatureCard({ category, product, count }: { category: string; product: Product | undefined; count: number }) {
  return (
    <section className="home-panel feature-card" style={{ '--hue': categoryHue(category) } as CSSProperties}>
      <h2>{category}</h2>
      <Link to={`/shop?category=${encodeURIComponent(category)}`} className="feature-img" aria-label={`Shop ${category}`}>
        {product ? <ProductImage src={product.imageUrl} alt="" /> : <CategoryArt category={category} />}
      </Link>
      <p className="muted small">{CATEGORY_BLURB[category]}{count ? ` · ${count} ${count === 1 ? 'product' : 'products'}` : ''}</p>
      <Link to={`/shop?category=${encodeURIComponent(category)}`} className="panel-link">Shop now</Link>
    </section>
  );
}

function SignInCard() {
  return (
    <section className="home-panel signin-card">
      <h2>Sign in for the best experience</h2>
      <p className="muted small">Save addresses, track every order and keep your wishlist on every device.</p>
      <Link to="/login" className="btn btn-primary btn-block">Sign in securely</Link>
      <p className="small">New here? <Link to="/register">Create an account</Link></p>
      <div className="signin-perks">
        <span><Icon name="shield" size={16} /> Secure Razorpay checkout</span>
        <span><Icon name="truck" size={16} /> Order tracking</span>
        <span><Icon name="undo" size={16} /> Returns after delivery</span>
      </div>
    </section>
  );
}

/** In-stock products with a photo, grouped by category (real catalogue data). */
function groupImages(products: Product[] | undefined) {
  const byCategory = new Map<string, Product[]>();
  for (const p of products ?? []) {
    if (!p.imageUrl || p.stockQuantity <= 0) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  return byCategory;
}

const SLIDE_COPY: Record<string, string> = {
  Electronics: 'Sound, screens and smart gear',
  Fashion: 'Fresh fits for every day',
  Accessories: 'Finish the look',
  Beauty: 'Your daily glow routine',
  Home: 'Make your space feel like home',
  Sports: 'Get moving, indoors or out',
  Books: 'Your next favourite read',
  Kitchen: 'Cook, brew and serve in style',
  Grocery: 'Pantry staples, sorted',
  Toys: 'Play, build and learn',
};
const SLIDE_ORDER = ['Sports', 'Electronics', 'Kitchen', 'Fashion', 'Books', 'Beauty', 'Toys', 'Home', 'Grocery', 'Accessories'];

function HeroCarousel({ images, counts, loading }: { images: Map<string, Product[]>; counts: Map<string, number>; loading: boolean }) {
  const cats = SLIDE_ORDER.filter((c) => (images.get(c)?.length ?? 0) > 0).slice(0, 6);
  const brandPics = [...images.values()].map((l) => l[0]).slice(0, 4);
  const total = cats.length + 1;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (paused || reduced || total < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % total), 5500);
    return () => clearTimeout(t);
  }, [index, paused, reduced, total]);

  const go = (i: number) => setIndex(((i % total) + total) % total);

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured departments"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="container hero-stage">
        <article className={`slide slide-brand ${index === 0 ? 'is-active' : ''}`} aria-roledescription="slide" aria-label={`1 of ${total}`} aria-hidden={index !== 0}>
          <div className="slide-copy">
            <span className="slide-brandline"><LogoMark /> ShopSmart</span>
            <h1>Everyday essentials, delivered to your door.</h1>
            <p>Ten departments, from phones and fashion to groceries and toys. Live prices and stock, secure checkout, and tracking until it arrives.</p>
            <div className="hero-cta">
              <Link to="/shop" className="btn btn-primary btn-lg" tabIndex={index === 0 ? 0 : -1}>Shop all products</Link>
              <Link to="/shop?sort=rating" className="btn btn-ghost btn-lg" tabIndex={index === 0 ? 0 : -1}>Top rated</Link>
            </div>
          </div>
          <div className="hero-mosaic" aria-hidden="true">
            {loading || brandPics.length < 4
              ? Array.from({ length: 4 }, (_, i) => <div key={i} className={`mosaic-cell m${i}`}><Skeleton width="100%" height="100%" radius={0} /></div>)
              : brandPics.map((p, i) => (
                  <span key={p.id} className={`mosaic-cell m${i}`}><ProductImage src={p.imageUrl} alt="" /></span>
                ))}
          </div>
        </article>

        {cats.map((c, i) => {
          const pics = images.get(c)!.slice(0, 3);
          const active = index === i + 1;
          return (
            <article
              key={c}
              className={`slide slide-cat ${active ? 'is-active' : ''}`}
              style={{ '--hue': categoryHue(c) } as CSSProperties}
              aria-roledescription="slide"
              aria-label={`${i + 2} of ${total}: ${c}`}
              aria-hidden={!active}
            >
              <div className="slide-copy">
                <span className="slide-kicker">{counts.get(c) ?? 0} products in {c}</span>
                <h2 className="slide-title">{SLIDE_COPY[c] ?? c}</h2>
                <p>{CATEGORY_BLURB[c]}, with live stock and prices.</p>
                <div className="hero-cta">
                  <Link to={`/shop?category=${encodeURIComponent(c)}`} className="btn btn-primary btn-lg" tabIndex={active ? 0 : -1}>Shop {c}</Link>
                </div>
              </div>
              <div className={`slide-pics n${pics.length}`} aria-hidden="true">
                {pics.map((p, k) => (
                  <span key={p.id} className={`slide-pic p${k}`}><ProductImage src={p.imageUrl} alt="" /></span>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {total > 1 && (
        <div className="container hero-controls">
          <div className="hero-dots" role="group" aria-label="Choose slide">
            {Array.from({ length: total }, (_, i) => (
              <button key={i} className={i === index ? 'is-active' : ''} aria-label={`Show slide ${i + 1}`} aria-current={i === index} onClick={() => go(i)}>
                <span style={{ animationPlayState: paused || reduced ? 'paused' : 'running' }} />
              </button>
            ))}
          </div>
          <div className="hero-arrows">
            <button className="icon-btn" aria-label="Previous slide" onClick={() => go(index - 1)}><Icon name="chevronLeft" /></button>
            <button className="icon-btn" aria-label="Next slide" onClick={() => go(index + 1)}><Icon name="chevronRight" /></button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  useDocumentTitle('');
  const { status } = useAuth();
  const catalogue = useAsync(() => productApi.all(), []);
  const images = groupImages(catalogue.data);
  const counts = new Map<string, number>();
  for (const p of catalogue.data ?? []) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const loading = catalogue.loading;
  const withPhotos = CATEGORIES.filter((c) => (images.get(c)?.length ?? 0) >= 4);
  const anonymous = status === 'anonymous';
  // Departments with four photographed products get a "quad" card; the rest get one large picture.
  const panels: { category: string; quad: boolean }[] = [
    ...withPhotos.map((c) => ({ category: c, quad: true })),
    ...CATEGORIES.filter((c) => !withPhotos.includes(c)).map((c) => ({ category: c, quad: false })),
  ];
  const firstCount = anonymous ? 3 : 4;
  const firstRow = panels.slice(0, firstCount);
  const secondRow = panels.slice(firstCount, firstCount + 4);
  const renderPanel = ({ category, quad }: { category: string; quad: boolean }) =>
    quad || loading
      ? <QuadCard key={category} category={category} products={images.get(category) ?? []} loading={loading} />
      : <FeatureCard key={category} category={category} product={images.get(category)?.[0]} count={counts.get(category) ?? 0} />;

  return (
    <div className="home">
      <HeroCarousel images={images} counts={counts} loading={loading} />

      <div className="home-body">
        {catalogue.error && <ErrorState message={catalogue.error} onRetry={catalogue.reload} />}
        <div className="panel-grid panel-grid-lift">
          {firstRow.map(renderPanel)}
          {anonymous && <SignInCard />}
        </div>

        <Shelf title="Top rated on ShopSmart" sort="rating" link="/shop?sort=rating" />

        {secondRow.length > 0 && <div className="panel-grid">{secondRow.map(renderPanel)}</div>}

        <Shelf title="New arrivals" sort="newest" link="/shop?sort=newest" />
        <Shelf title="Best of Electronics" category="Electronics" sort="rating" link="/shop?category=Electronics" />

        <section className="home-panel promo-strip">
          <div>
            <h2>Pay the way you like</h2>
            <p className="muted">UPI, cards, netbanking and wallets through Razorpay, or cash on delivery. An order is marked paid only after the payment is confirmed with the provider.</p>
          </div>
          <Link to="/help" className="btn btn-secondary">How payments work</Link>
        </section>

        <Shelf title="Fashion picks" category="Fashion" sort="rating" link="/shop?category=Fashion" />
        <Shelf title="For your home and kitchen" category="Home" sort="newest" link="/shop?category=Home" />
      </div>
    </div>
  );
}
