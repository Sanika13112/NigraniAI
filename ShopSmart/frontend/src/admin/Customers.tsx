import { useMemo, useState } from 'react';
import { customerApi, notificationApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { ErrorState, Modal, Skeleton, Spinner, EmptyState } from '../components/ui';
import { AddressBlock } from '../components/AddressForm';
import { date } from '../lib/format';

export default function Customers() {
  useDocumentTitle('Customers');
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => customerApi.list(), []);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const detail = useAsync(() => (openId ? customerApi.get(openId) : Promise.resolve(null)), [openId]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const rows = useMemo(() => (data ?? []).filter((c) => !query || `${c.name} ${c.email} ${c.phone ?? ''} ${c.id}`.toLowerCase().includes(query.toLowerCase())), [data, query]);

  return (
    <div className="stack">
      <div className="admin-head"><h1>Customers</h1></div>
      <p className="small muted">Viewing customer records is logged for privacy auditing.</p>
      <div className="toolbar card">
        <input type="search" placeholder="Search name, email, phone or ID" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search customers" />
        <span className="muted small">{rows.length} customers</span>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="card"><Skeleton width="100%" height={200} /></div> : rows.length === 0 ? <EmptyState icon="users" title="No customers found" /> : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th aria-label="Actions" /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}>
                <td>#{c.id}</td><td>{c.name}</td><td>{c.email}</td><td>{c.phone ?? '—'}</td><td>{date(c.createdAt)}</td>
                <td className="actions"><button className="btn btn-ghost btn-sm" onClick={() => { setMessage(''); setOpenId(c.id); }}>View</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={openId !== null} title={detail.data ? detail.data.customer.name : 'Customer'} onClose={() => setOpenId(null)}>
        {detail.loading ? <Skeleton width="100%" height={120} /> : detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : detail.data && (
          <div className="stack">
            <dl className="kv">
              <div><dt>Email</dt><dd>{detail.data.customer.email}</dd></div>
              <div><dt>Phone</dt><dd>{detail.data.customer.phone ?? '—'}</dd></div>
              <div><dt>Customer ID</dt><dd>#{detail.data.customer.id}</dd></div>
            </dl>
            <h3>Addresses</h3>
            {detail.data.addresses.length === 0 ? <p className="muted">None saved.</p> : detail.data.addresses.map((a) => <AddressBlock key={a.id} a={a} />)}
            <h3>Send a message</h3>
            <textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message to customer" placeholder="Appears in the customer’s notifications" />
            <div className="form-actions">
              <button className="btn btn-primary" disabled={!message.trim() || sending} onClick={async () => {
                setSending(true);
                try { await notificationApi.send(detail.data!.customer.id, message.trim()); setMessage(''); toast.success('Message sent'); }
                catch (err) { toast.error(errorMessage(err)); }
                finally { setSending(false); }
              }}>{sending && <Spinner />} Send</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
