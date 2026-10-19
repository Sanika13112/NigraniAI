import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { ApiError, errorMessage } from '../lib/api';
import { useDocumentTitle } from '../lib/useAsync';
import { Field, Spinner } from '../components/ui';
import { Logo } from '../components/Layout';
import { TERMS_VERSION } from '../lib/terms';

function useRedirectTarget() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith('/') && !from.startsWith('//') ? from : null;
}

export function Login() {
  useDocumentTitle('Sign in');
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated' && user && !busy) {
    return <Navigate to={target ?? (user.role === 'ADMIN' ? '/admin' : '/')} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const u = await login(email.trim(), password);
      navigate(target ?? (u.role === 'ADMIN' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Logo />
        <h1>Sign in</h1>
        <p className="muted">Welcome back. Sign in to check out, track orders and manage your account.</p>
        <form onSubmit={submit} className="form-grid" noValidate>
          {error && <div className="form-error" role="alert">{error}</div>}
          <Field label="Email" htmlFor="login-email">
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={150} required />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} required />
          </Field>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy && <Spinner />} Sign in</button>
        </form>
        <p className="auth-switch">New to ShopSmart? <Link to="/register" state={{ from: target }}>Create an account</Link></p>
      </div>
    </div>
  );
}

export function Register() {
  useDocumentTitle('Create account');
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [consent, setConsent] = useState({ terms: false, notice: false, marketing: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated' && !busy) return <Navigate to={target ?? '/'} replace />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) e.phone = 'Enter a valid 10-digit mobile number';
    if (form.password.length < 8 || form.password.length > 72) e.password = 'Use 8 to 72 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Include at least one letter and one number';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';
    if (!consent.terms) e.terms = 'Please accept the Terms and Conditions to continue.';
    if (!consent.notice) e.notice = 'Please accept the privacy notice to create an account';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setServerError(null);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone || undefined, acceptPrivacyNotice: consent.notice, marketingConsent: consent.marketing, termsAccepted: consent.terms, termsVersion: TERMS_VERSION });
      navigate(target ?? '/', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError && err.details.length ? err.details.join(' ') : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Logo />
        <h1>Create your account</h1>
        <p className="muted">Save addresses, track orders and keep your wishlist across devices.</p>
        <form onSubmit={submit} className="form-grid" noValidate>
          {serverError && <div className="form-error" role="alert">{serverError}</div>}
          <Field label="Full name" htmlFor="r-name" error={errors.name}>
            <input id="r-name" autoComplete="name" value={form.name} onChange={set('name')} maxLength={100} />
          </Field>
          <Field label="Email" htmlFor="r-email" error={errors.email}>
            <input id="r-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} maxLength={150} />
          </Field>
          <Field label="Mobile number (optional)" htmlFor="r-phone" error={errors.phone}>
            <input id="r-phone" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={set('phone')} maxLength={10} />
          </Field>
          <Field label="Password" htmlFor="r-password" error={errors.password} hint="At least 8 characters, with a letter and a number">
            <input id="r-password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} maxLength={72} />
          </Field>
          <Field label="Confirm password" htmlFor="r-confirm" error={errors.confirm}>
            <input id="r-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} maxLength={72} />
          </Field>
          <div className="terms-accept">
            <label className="check">
              <input id="r-terms" type="checkbox" checked={consent.terms} onChange={(e) => setConsent((c) => ({ ...c, terms: e.target.checked }))} aria-invalid={!!errors.terms} aria-describedby={errors.terms ? 'r-terms-err' : undefined} />
              <span>I have read and agree to the <Link to="/terms" target="_blank" rel="noopener">Terms and Conditions</Link> and <a href="#notice-title">Privacy Notice</a>.</span>
            </label>
            {errors.terms && <span id="r-terms-err" className="field-error" role="alert">{errors.terms}</span>}
          </div>
          <section className="consent-box" aria-labelledby="notice-title">
            <h2 id="notice-title">How we use your data</h2>
            <p>
              ShopSmart uses your name, email, mobile number and delivery addresses to run your account, deliver orders,
              take payments and send order updates. We keep order records as tax law requires and erase the rest when you
              delete your account. You can change your choices any time in your account.
            </p>
            <label className="check">
              <input id="r-notice" type="checkbox" checked={consent.notice} onChange={(e) => setConsent((c) => ({ ...c, notice: e.target.checked }))} aria-describedby={errors.notice ? 'r-notice-err' : undefined} />
              <span>I have read this notice and agree to ShopSmart using my data for my account, orders, delivery and payments.</span>
            </label>
            {errors.notice && <span id="r-notice-err" className="field-error">{errors.notice}</span>}
            <label className="check">
              <input id="r-marketing" type="checkbox" checked={consent.marketing} onChange={(e) => setConsent((c) => ({ ...c, marketing: e.target.checked }))} />
              <span>Also send me offers and new arrivals (optional).</span>
            </label>
          </section>
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy && <Spinner />} Create account</button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login" state={{ from: target }}>Sign in</Link></p>
      </div>
    </div>
  );
}
