import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { customerApi, notificationApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { useAuth } from '../state/AuthContext';
import { AddressBlock, AddressForm } from '../components/AddressForm';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Field, Modal, Skeleton, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';
import { relative } from '../lib/format';
import type { Address } from '../lib/types';

export function AccountNav() {
  return (
    <nav className="account-nav card" aria-label="Account">
      <NavLink to="/account/orders" end><Icon name="box" size={18} /> Order history</NavLink>
      <NavLink to="/account/returns"><Icon name="undo" size={18} /> Returns & refunds</NavLink>
      <NavLink to="/account" end><Icon name="user" size={18} /> Profile & addresses</NavLink>
      <NavLink to="/wishlist"><Icon name="heart" size={18} /> Wishlist</NavLink>
      <NavLink to="/account/notifications"><Icon name="bell" size={18} /> Notifications</NavLink>
    </nav>
  );
}

function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => customerApi.me(), []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) {
      setName(data.name);
      setPhone(data.phone ?? '');
    }
  }, [data]);

  if (loading) return <section className="card"><Skeleton width="100%" height={120} /></section>;
  if (error || !data) return <ErrorState message={error ?? ''} onRetry={reload} />;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Enter your name');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setErr('Enter a valid 10-digit mobile number');
    setBusy(true);
    setErr(null);
    try {
      setData(await customerApi.updateMe({ name: name.trim(), phone }));
      toast.success('Profile updated');
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Profile</h2>
      <form className="form-grid" onSubmit={save} noValidate>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="form-row">
          <Field label="Full name" htmlFor="p-name"><input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
          <Field label="Mobile number" htmlFor="p-phone"><input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={10} /></Field>
        </div>
        <Field label="Email" htmlFor="p-email" hint="Your email is your sign-in ID and can’t be changed here.">
          <input id="p-email" value={user?.email ?? data.email} disabled />
        </Field>
        <div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy && <Spinner />} Save changes</button></div>
      </form>
    </section>
  );
}

function Addresses() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => customerApi.addresses(), []);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (value: Parameters<typeof customerApi.addAddress>[0]) => {
    setFormError(null);
    try {
      if (editing === 'new') await customerApi.addAddress(value);
      else if (editing) await customerApi.updateAddress(editing.id, value);
      setEditing(null);
      toast.success('Address saved');
      reload();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <section className="card">
      <div className="section-head">
        <h2>Saved addresses</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => { setFormError(null); setEditing('new'); }}><Icon name="plus" size={16} /> Add address</button>
      </div>
      {loading ? <Skeleton width="100%" height={90} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon="map" title="No saved addresses">Add one now, or during checkout.</EmptyState>
      ) : (
        <div className="address-grid">
          {data.map((a) => (
            <div key={a.id} className={`address-card ${a.defaultAddress ? 'is-default' : ''}`}>
              <div className="address-card-head">
                {a.label && <Badge>{a.label}</Badge>}
                {a.defaultAddress && <Badge tone="brand">Default</Badge>}
              </div>
              <AddressBlock a={a} />
              <div className="address-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => { setFormError(null); setEditing(a); }}><Icon name="edit" size={14} /> Edit</button>
                {!a.defaultAddress && (
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    try { await customerApi.makeDefault(a.id); reload(); } catch (err) { toast.error(errorMessage(err)); }
                  }}>Set as default</button>
                )}
                <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDeleting(a)}><Icon name="trash" size={14} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'Add address' : 'Edit address'} onClose={() => setEditing(null)}>
        {editing !== null && <AddressForm initial={editing === 'new' ? null : editing} onSubmit={submit} onCancel={() => setEditing(null)} serverError={formError} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Delete this address?"
        message="Past orders keep their own copy of the address."
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await customerApi.deleteAddress(deleting.id); setDeleting(null); reload(); toast.success('Address deleted'); }
          catch (err) { toast.error(errorMessage(err)); }
          finally { setBusy(false); }
        }}
      />
    </section>
  );
}

/** DPDP choices: marketing consent (withdraw as easily as given) and account deletion. */
function PrivacyChoices() {
  const toast = useToast();
  const { logout } = useAuth();
  const { data, error, loading, reload, setData } = useAsync(() => customerApi.consent(), []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !data) return <section className="card"><Skeleton width="100%" height={110} /></section>;
  if (error) return <section className="card"><ErrorState message={error} onRetry={reload} /></section>;
  if (!data) return null;

  const toggleMarketing = async (next: boolean) => {
    setSaving(true);
    try {
      setData(await customerApi.updateConsent(next));
      toast.success(next ? 'You will receive offers and new arrivals' : 'Marketing consent withdrawn');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const requestDeletion = async () => {
    setDeleting(true);
    try {
      const res = await customerApi.requestDeletion();
      toast.success(`Deletion requested. Your personal data will be erased after ${new Date(res.eraseDueAt).toLocaleString()}.`);
      setConfirmDelete(false);
      await logout();
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <section className="card privacy-card">
      <div className="card-head"><h2>Privacy and consent</h2></div>
      <p className="muted small">
        You agreed to notice {data.noticeVersion}{data.consentedAt ? ` on ${new Date(data.consentedAt).toLocaleDateString()}` : ''}.
        We use your data for: {data.purposes.map((p) => p.replace(/_/g, ' ')).join(', ')}.
      </p>
      <p className="muted small">
        {data.termsAccepted && data.termsVersion
          ? <>You accepted the <Link to="/terms">Terms and Conditions</Link> (version {data.termsVersion}){data.termsAcceptedAt ? ` on ${new Date(data.termsAcceptedAt).toLocaleDateString()}` : ''}.</>
          : <>No Terms and Conditions acceptance is recorded for this account; it was created before they were introduced. <Link to="/terms">Read the Terms and Conditions</Link>.</>}
      </p>
      <label className="check">
        <input id="consent-marketing" type="checkbox" checked={data.marketingConsent} disabled={saving || !!data.deletionRequestedAt}
          onChange={(e) => toggleMarketing(e.target.checked)} />
        <span>Send me offers and new arrivals</span>
      </label>
      <div className="privacy-delete">
        <div>
          <strong>Delete my account</strong>
          <p className="muted small">Your profile, addresses and wishlist are erased. Order records are kept because tax law requires them.</p>
        </div>
        {data.deletionRequestedAt
          ? <Badge tone="warning">Deletion requested</Badge>
          : <button className="btn btn-danger-outline" onClick={() => setConfirmDelete(true)}>Delete account</button>}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete your account?"
        message="You will be signed out and your personal data will be erased shortly. This can't be undone."
        confirmLabel="Delete account"
        tone="danger"
        busy={deleting}
        onConfirm={requestDeletion}
        onClose={() => setConfirmDelete(false)}
      />
    </section>
  );
}

export default function Account() {
  useDocumentTitle('Your account');
  return (
    <div className="container section account-layout">
      <AccountNav />
      <div className="account-main stack">
        <h1>Profile & addresses</h1>
        <Profile />
        <Addresses />
        <PrivacyChoices />
      </div>
    </div>
  );
}

export function Notifications() {
  useDocumentTitle('Notifications');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => notificationApi.mine(100), []);
  const unread = data?.filter((n) => n.status === 'UNREAD').length ?? 0;
  return (
    <div className="container section account-layout">
      <AccountNav />
      <div className="account-main">
        <div className="section-head">
          <h1>Notifications</h1>
          {unread > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              try { await notificationApi.markAllRead(); setData((d) => (d ?? []).map((n) => ({ ...n, status: 'READ' as const }))); }
              catch (err) { toast.error(errorMessage(err)); }
            }}>Mark all as read</button>
          )}
        </div>
        {loading ? <Skeleton width="100%" height={120} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.length ? (
          <EmptyState icon="bell" title="No notifications yet">Updates about your orders and payments will appear here.</EmptyState>
        ) : (
          <ul className="notif-list card">
            {data.map((n) => (
              <li key={n.id} className={n.status === 'UNREAD' ? 'unread' : ''}>
                <span className={`notif-icon notif-${n.type.toLowerCase()}`}><Icon name={n.type === 'PAYMENT' ? 'card' : n.type === 'ORDER' ? 'box' : n.type === 'PROMOTION' ? 'heart' : 'info'} size={18} /></span>
                <div>
                  <p>{n.message}</p>
                  <span className="muted small">{relative(n.createdAt)}</span>
                </div>
                {n.status === 'UNREAD' && (
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    try { const r = await notificationApi.markRead(n.id); setData((d) => (d ?? []).map((x) => (x.id === r.id ? r : x))); }
                    catch (err) { toast.error(errorMessage(err)); }
                  }}>Mark read</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>Looking for an order? <Link to="/account/orders">See all orders</Link>.</p>
      </div>
    </div>
  );
}
