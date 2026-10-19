import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LogoMark, SplashIntro, WelcomePopup } from './Brand';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from './Icon';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';
import { useTheme } from '../state/ThemeContext';
import { useWishlist } from '../state/WishlistContext';
import { customerApi, notificationApi, productApi } from '../lib/endpoints';
import { money } from '../lib/format';
import type { Address, Product } from '../lib/types';
import { ProductImage } from './ui';

export const CATEGORIES = ['Electronics', 'Fashion', 'Accessories', 'Beauty', 'Home', 'Sports', 'Books', 'Kitchen', 'Grocery', 'Toys'];

export { LogoMark };

export function Logo() {
  return (
    <Link to="/" className="logo nav-item" aria-label="ShopSmart home">
      <LogoMark />
      <span className="logo-text">Shop<b>Smart</b></span>
    </Link>
  );
}

type Suggestion = Product;

/** Ranks names whose words start with the query first, then names that merely contain it. */
function rankSuggestions(products: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  const score = (p: Product) => {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (p.category.toLowerCase().startsWith(q)) return 2;
    if (name.includes(q)) return 3;
    return 9;
  };
  return products
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 9 || q.length > 2)
    .sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let idx = lower.startsWith(ql) ? 0 : lower.indexOf(` ${ql}`);
  if (idx > 0) idx += 1;
  if (idx < 0) idx = lower.indexOf(ql);
  if (idx < 0) return <>{text}</>;
  return <>{text.slice(0, idx)}<mark>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
}

function SearchBar() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const onShop = location.pathname === '/shop';
  const [q, setQ] = useState(onShop ? params.get('q') ?? '' : '');
  const [dept, setDept] = useState(onShop ? params.get('category') ?? '' : '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (location.pathname === '/shop') {
      setQ(params.get('q') ?? '');
      setDept(params.get('category') ?? '');
    }
    setOpen(false);
  }, [location.pathname, params]);

  // Live suggestions (debounced; stale requests are cancelled).
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setItems([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      productApi
        .search({ q: term, category: dept || undefined, size: 30 }, controller.signal)
        .then((page) => {
          setItems(rankSuggestions(page.content, term).slice(0, 8));
          setActive(-1);
        })
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, dept]);

  // Close when clicking outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const matchingCategories = q.trim() && !dept
    ? CATEGORIES.filter((c) => c.toLowerCase().startsWith(q.trim().toLowerCase()))
    : [];

  const goToResults = () => {
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    if (dept) next.set('category', dept);
    setOpen(false);
    navigate(`/shop${next.toString() ? `?${next}` : ''}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (open && active >= 0 && items[active]) {
      setOpen(false);
      navigate(`/product/${items[active].id}`);
      return;
    }
    goToResults();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && q.trim().length > 0;

  return (
    <form className="search nav-search" role="search" onSubmit={submit} ref={boxRef}>
      <label className="nav-search-dept">
        <span className="nav-search-dept-label" aria-hidden="true">{dept || 'All'}</span>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Search in department">
          <option value="">All departments</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={dept ? `Search ${dept}` : 'Search ShopSmart'}
        aria-label="Search products"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls="search-suggestions"
        autoComplete="off"
        maxLength={100}
      />
      <button type="submit" className="nav-search-go" aria-label="Search"><Icon name="search" size={22} /></button>
      {showPanel && (
        <div className="suggest" id="search-suggestions" role="listbox" aria-label="Suggestions">
          {matchingCategories.map((c) => (
            <button
              type="button"
              key={c}
              className="suggest-cat"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                navigate(`/shop?category=${encodeURIComponent(c)}`);
              }}
            >
              <Icon name="grid" size={16} /> <span>in <strong>{c}</strong></span>
            </button>
          ))}
          {loading && items.length === 0 ? (
            <div className="suggest-empty">Searching…</div>
          ) : items.length === 0 ? (
            <div className="suggest-empty">No products match “{q.trim()}”{dept ? ` in ${dept}` : ''}</div>
          ) : (
            items.map((p, i) => (
              <button
                type="button"
                key={p.id}
                role="option"
                aria-selected={i === active}
                className={`suggest-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  navigate(`/product/${p.id}`);
                }}
              >
                <span className="suggest-thumb"><ProductImage src={p.imageUrl} alt="" /></span>
                <span className="suggest-text">
                  <span className="suggest-name"><Highlight text={p.name} query={q} /></span>
                  <span className="suggest-meta">{p.category}{p.stockQuantity <= 0 ? ' · Out of stock' : ''}</span>
                </span>
                <span className="suggest-price">{money(p.price)}</span>
              </button>
            ))
          )}
          <button type="button" className="suggest-all" onMouseDown={(e) => e.preventDefault()} onClick={goToResults}>
            See all results for “{q.trim()}” <Icon name="chevronRight" size={14} />
          </button>
        </div>
      )}
    </form>
  );
}

/** Name and default delivery address of the signed-in customer, from customer-service. */
function useCustomerContext(enabled: boolean) {
  const [state, setState] = useState<{ name: string | null; address: Address | null }>({ name: null, address: null });
  const location = useLocation();
  const onAccount = location.pathname.startsWith('/account') || location.pathname === '/checkout';
  useEffect(() => {
    if (!enabled) {
      setState({ name: null, address: null });
      return;
    }
    if (onAccount) return; // refreshed when the customer leaves account pages, where they edit these
    let active = true;
    Promise.allSettled([customerApi.me(), customerApi.addresses()]).then(([me, addresses]) => {
      if (!active) return;
      const list = addresses.status === 'fulfilled' ? addresses.value : [];
      setState({
        name: me.status === 'fulfilled' ? me.value.name ?? null : null,
        address: list.find((a) => a.defaultAddress) ?? list[0] ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, [enabled, onAccount]);
  return state;
}

function useUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const location = useLocation();
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let active = true;
    const load = () =>
      notificationApi.unread().then((r) => active && setCount(r.unread)).catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [enabled, location.pathname]);
  return count;
}

export function Header() {
  const { user, isAdmin, isCustomer, status, logout } = useAuth();
  const cart = useCart();
  const wishlist = useWishlist();
  const { theme, toggle } = useTheme();
  const unread = useUnreadCount(isCustomer);
  const customer = useCustomerContext(isCustomer);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const firstName = (customer.name ?? '').trim().split(/\s+/)[0] || (user ? user.email.split('@')[0] : '');
  const signInState = { from: location.pathname + location.search };
  const deliverTo = customer.address;

  return (
    <header className="site-header nav">
      <div className="nav-belt">
        <Logo />
        {isCustomer ? (
          <Link to="/account" className="nav-item nav-deliver" aria-label={deliverTo ? `Deliver to ${deliverTo.fullName}, ${deliverTo.city} ${deliverTo.pincode}. Change address` : 'Add a delivery address'}>
            <Icon name="map" size={18} />
            <span className="nav-two-line">
              <small>{deliverTo ? `Deliver to ${deliverTo.fullName.split(' ')[0]}` : 'Deliver to'}</small>
              <strong>{deliverTo ? `${deliverTo.city} ${deliverTo.pincode}` : 'Add an address'}</strong>
            </span>
          </Link>
        ) : (
          <Link to="/login" state={signInState} className="nav-item nav-deliver" aria-label="Sign in to choose a delivery address">
            <Icon name="map" size={18} />
            <span className="nav-two-line"><small>Hello</small><strong>Select your address</strong></span>
          </Link>
        )}
        <SearchBar />
        <div className="nav-tools">
          {status === 'loading' ? (
            <span className="nav-item account-placeholder" aria-hidden="true" />
          ) : user ? (
            <div className="account-menu" ref={menuRef}>
              <button className="nav-item nav-tool account-btn" aria-label={`${isAdmin ? 'Account & Admin' : 'Account & Lists'}, signed in as ${isAdmin ? 'admin' : firstName}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                <span className="tool-icon"><Icon name="user" size={22} /></span>
                <span className="nav-two-line">
                  <small>Hello, {isAdmin ? 'admin' : firstName}</small>
                  <strong>{isAdmin ? 'Account & Admin' : 'Account & Lists'} <span className="caret" aria-hidden="true" /></strong>
                </span>
              </button>
              {menuOpen && (
                <div className="dropdown nav-flyout" role="menu">
                  <div className="dropdown-head">
                    <small>Signed in as</small>
                    <strong title={user.email}>{user.email}</strong>
                  </div>
                  {isCustomer && (
                    <>
                      <Link role="menuitem" to="/account/orders"><Icon name="box" size={16} /> Your orders</Link>
                      <Link role="menuitem" to="/account"><Icon name="user" size={16} /> Your account & addresses</Link>
                      <Link role="menuitem" to="/wishlist"><Icon name="heart" size={16} /> Your wishlist</Link>
                      <Link role="menuitem" to="/account/notifications"><Icon name="bell" size={16} /> Notifications{unread ? ` (${unread})` : ''}</Link>
                    </>
                  )}
                  {isAdmin && <Link role="menuitem" to="/admin"><Icon name="chart" size={16} /> Admin dashboard</Link>}
                  <button
                    role="menuitem"
                    onClick={async () => {
                      await logout();
                      navigate('/');
                    }}
                  >
                    <Icon name="logout" size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" state={signInState} className="nav-item nav-tool account-btn" aria-label="Sign in, Account & Lists">
              <span className="tool-icon"><Icon name="user" size={22} /></span>
              <span className="nav-two-line"><small>Hello, sign in</small><strong>Account & Lists</strong></span>
            </Link>
          )}
          <Link to={isCustomer ? '/account/orders' : '/login'} state={isCustomer ? undefined : { from: '/account/orders' }} className="nav-item nav-tool nav-orders" aria-label="Returns & Orders">
            <span className="tool-icon"><Icon name="box" size={22} /></span>
            <span className="nav-two-line"><small>Returns</small><strong>& Orders</strong></span>
          </Link>
          <Link to="/wishlist" className="nav-item nav-tool nav-wishlist" aria-label={`Wishlist, ${wishlist.ids.length} items`}>
            <span className="tool-icon">
              <Icon name="heart" size={22} />
              {wishlist.ids.length > 0 && <span className="tool-badge">{wishlist.ids.length > 99 ? '99+' : wishlist.ids.length}</span>}
            </span>
            <span className="tool-label">Wishlist</span>
          </Link>
          {isCustomer && (
            <Link to="/account/notifications" className="nav-item nav-tool nav-tool-icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <span className="tool-icon">
                <Icon name="bell" size={22} />
                {unread > 0 && <span className="tool-badge">{unread > 9 ? '9+' : unread}</span>}
              </span>
            </Link>
          )}
          <button className="nav-item nav-tool nav-tool-icon" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            <span className="tool-icon"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} /></span>
          </button>
          <Link to="/cart" className="nav-item nav-tool cart-link has-count" aria-label={`Cart, ${cart.count} items`}>
            <span className="tool-icon cart-icon">
              <Icon name="cart" size={26} />
              {cart.count > 0 && <span key={cart.count} className="count tool-badge bump">{cart.count > 99 ? '99+' : cart.count}</span>}
            </span>
            <span className="tool-label">Cart</span>
          </Link>
        </div>
      </div>
      <nav className="nav-main category-bar" aria-label="Departments">
        <div className="category-scroll">
          <NavLink to="/shop" end className={({ isActive }) => `nav-all ${isActive && !location.search ? 'active' : ''}`}>
            <Icon name="menu" size={18} /> All
          </NavLink>
          <Link to="/shop?sort=rating">Top rated</Link>
          <Link to="/shop?sort=newest">New arrivals</Link>
          {CATEGORIES.map((c) => (
            <NavLink key={c} to={`/shop?category=${encodeURIComponent(c)}`} className={() => (location.search.includes(`category=${encodeURIComponent(c)}`) ? 'active' : '')}>
              {c}
            </NavLink>
          ))}
          <Link to="/help" className="nav-main-end">Customer service</Link>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  const { user } = useAuth();
  return (
    <footer className="site-footer nav-footer">
      <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button>
      <div className="footer-links">
        <div className="footer-grid">
          <div>
            <h3>Get to know us</h3>
            <Link to="/help">About ShopSmart</Link>
            <Link to="/help">Privacy and your data</Link>
            <Link to="/help">How payments work</Link>
          </div>
          <div>
            <h3>Shop by department</h3>
            {CATEGORIES.slice(0, 5).map((c) => <Link key={c} to={`/shop?category=${encodeURIComponent(c)}`}>{c}</Link>)}
          </div>
          <div>
            <h3>More departments</h3>
            {CATEGORIES.slice(5).map((c) => <Link key={c} to={`/shop?category=${encodeURIComponent(c)}`}>{c}</Link>)}
          </div>
          <div>
            <h3>Let us help you</h3>
            <Link to="/account">Your account</Link>
            <Link to="/account/orders">Your orders</Link>
            <Link to="/account/returns">Returns & replacements</Link>
            <Link to="/wishlist">Your wishlist</Link>
            <Link to="/help">Help</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <Logo />
        <span>© {new Date().getFullYear()} ShopSmart. Prices in INR, inclusive of GST.</span>
        <span className="footer-pay"><Icon name="lock" size={14} /> Payments processed by Razorpay</span>
        {!user && <Link to="/register" className="footer-cta">New customer? Start here.</Link>}
      </div>
    </footer>
  );
}

export function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="store-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <main id="main" className="site-main">
        <Outlet />
      </main>
      <Footer />
      <SplashIntro />
      <WelcomePopup />
    </div>
  );
}
