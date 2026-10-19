import { LogoMark } from '../components/Layout';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';

const NAV: [string, string, string][] = [
  ['/admin', 'Overview', 'chart'],
  ['/admin/orders', 'Orders', 'box'],
  ['/admin/products', 'Products', 'grid'],
  ['/admin/inventory', 'Inventory', 'activity'],
  ['/admin/customers', 'Customers', 'users'],
  ['/admin/payments', 'Payments', 'card'],
  ['/admin/reviews', 'Reviews', 'heart'],
  ['/admin/demo', 'Demo violations', 'alert'],
  ['/admin/reports', 'Reports', 'file'],
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin">
      <a className="skip-link" href="#admin-main">Skip to content</a>
      <aside className={`admin-side ${open ? 'open' : ''}`} aria-label="Admin navigation">
        <Link to="/admin" className="admin-brand"><LogoMark /> ShopSmart <small>Admin</small></Link>
        <nav>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/admin'}><Icon name={icon} size={18} /> {label}</NavLink>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Link to="/"><Icon name="store" size={16} /> View store</Link>
          <button onClick={async () => { await logout(); navigate('/'); }}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>
      {open && <div className="admin-scrim" onClick={() => setOpen(false)} />}
      <div className="admin-body">
        <header className="admin-top">
          <button className="icon-btn show-md" aria-label="Open navigation" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <span className="muted small">Signed in as <strong>{user?.email}</strong></span>
          <button className="icon-btn" onClick={toggle} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </header>
        <main id="admin-main" className="admin-main"><Outlet /></main>
      </div>
    </div>
  );
}
