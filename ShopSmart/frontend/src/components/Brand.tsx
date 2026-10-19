import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { useAuth } from '../state/AuthContext';
import { readJson, readSession, writeJson, writeSession } from '../state/storage';

export function LogoMark() {
  return (
  <span className="logo-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" width="32" height="32">
      <rect width="32" height="32" rx="10" fill="currentColor" />
      <path d="M8.5 12.5h15l-1.3 10.2a2.6 2.6 0 0 1-2.6 2.3h-7.2a2.6 2.6 0 0 1-2.6-2.3z" fill="#fff" />
      <path d="M12.2 12.5V11a3.8 3.8 0 0 1 7.6 0v1.5" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16 15.6l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" fill="currentColor" />
      <circle cx="24.6" cy="7.4" r="2.1" fill="#ffd166" />
    </svg>
  </span>
  );
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Short brand intro on the first page load of a browser session (logo and name). */
export function SplashIntro() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'done'>(() =>
    readSession('ss_splash') || reducedMotion() || navigator.webdriver ? 'done' : 'show',
  );
  useEffect(() => {
    if (phase === 'done') return;
    writeSession('ss_splash', '1');
    const leave = setTimeout(() => setPhase('leave'), 1100);
    const done = setTimeout(() => setPhase('done'), 1600);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [phase]);
  if (phase === 'done') return null;
  return (
    <div className={`splash ${phase === 'leave' ? 'is-leaving' : ''}`} aria-hidden="true" onClick={() => setPhase('done')}>
      <div className="splash-inner">
        <span className="splash-mark"><LogoMark /></span>
        <span className="splash-name">Shop<b>Smart</b></span>
        <span className="splash-line" />
      </div>
    </div>
  );
}

/** One-time welcome pop-up for first-time visitors who aren't signed in. */
export function WelcomePopup() {
  const { status, user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const primary = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (status !== 'anonymous' || user || location.pathname !== '/') return;
    if (readJson<boolean>('ss_welcomed', false) || navigator.webdriver) return;
    const t = setTimeout(() => setOpen(true), 2600);
    return () => clearTimeout(t);
  }, [status, user, location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    setTimeout(() => primary.current?.focus(), 50);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    writeJson('ss_welcomed', true);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="welcome-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="welcome-brand">
          <span className="welcome-mark"><LogoMark /></span>
          <span className="welcome-name">Shop<b>Smart</b></span>
          <span className="welcome-orbit o1" />
          <span className="welcome-orbit o2" />
        </div>
        <div className="welcome-body">
          <button className="icon-btn welcome-close" aria-label="Close" onClick={close}><Icon name="x" /></button>
          <h2 id="welcome-title">Welcome to ShopSmart</h2>
          <p>Ten departments in one place, with live prices and stock.</p>
          <ul>
            <li><Icon name="check" size={16} /> Secure checkout with UPI, cards and netbanking</li>
            <li><Icon name="check" size={16} /> Track every order until it reaches you</li>
            <li><Icon name="check" size={16} /> Easy returns on delivered orders</li>
          </ul>
          <div className="welcome-actions">
            <Link ref={primary} to="/register" className="btn btn-primary btn-lg" onClick={close}>Create a free account</Link>
            <button className="btn btn-ghost btn-lg" onClick={close}>Start shopping</button>
          </div>
        </div>
      </div>
    </div>
  );
}
