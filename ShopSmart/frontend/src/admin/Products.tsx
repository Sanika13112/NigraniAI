import { useMemo, useState, type FormEvent } from 'react';
import { productApi, type ProductInput } from '../lib/endpoints';
import { ApiError, errorMessage } from '../lib/api';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { useToast } from '../state/ToastContext';
import { ConfirmDialog, EmptyState, ErrorState, Field, Modal, ProductImage, Skeleton, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';
import { CATEGORIES } from '../components/Layout';
import { money } from '../lib/format';
import type { Product } from '../lib/types';

function ProductForm({ initial, onSaved, onCancel }: { initial: Product | null; onSaved: (p: Product) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial ? String(initial.price) : '',
    category: initial?.category ?? '',
    stockQuantity: initial ? String(initial.stockQuantity) : '0',
    imageUrl: initial?.imageUrl ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    const price = Number(form.price);
    const stock = Number(form.stockQuantity);
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!Number.isFinite(price) || price < 1 || !/^\d+(\.\d{1,2})?$/.test(form.price.trim())) errs.price = 'Enter a price of at least ₹1 with up to 2 decimals';
    if (!CATEGORIES.includes(form.category)) errs.category = 'Choose a category';
    if (!Number.isInteger(stock) || stock < 0) errs.stockQuantity = 'Stock must be a whole number, 0 or more';
    if (form.imageUrl && !/^https?:\/\/\S+$/i.test(form.imageUrl.trim())) errs.imageUrl = 'Use an http(s) image URL';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: ProductInput = {
      name: form.name.trim(), description: form.description.trim(), price, category: form.category,
      stockQuantity: stock, imageUrl: form.imageUrl.trim() || null,
    };
    setBusy(true);
    setServerError(null);
    try {
      onSaved(initial ? await productApi.update(initial.id, body) : await productApi.create(body));
    } catch (err) {
      setServerError(err instanceof ApiError && err.details.length ? err.details.join(' ') : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      {serverError && <div className="form-error" role="alert">{serverError}</div>}
      <Field label="Name" htmlFor="pf-name" error={errors.name}><input id="pf-name" value={form.name} onChange={set('name')} maxLength={180} /></Field>
      <Field label="Description" htmlFor="pf-desc" error={errors.description}><textarea id="pf-desc" rows={3} value={form.description} onChange={set('description')} maxLength={2000} /></Field>
      <div className="form-row">
        <Field label="Price (₹, incl. GST)" htmlFor="pf-price" error={errors.price}><input id="pf-price" inputMode="decimal" value={form.price} onChange={set('price')} /></Field>
        <Field label="Category" htmlFor="pf-cat" error={errors.category}>
          <select id="pf-cat" value={form.category} onChange={set('category')}><option value="">Choose…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
      </div>
      <div className="form-row">
        <Field label={initial ? 'Stock (set exact value)' : 'Opening stock'} htmlFor="pf-stock" error={errors.stockQuantity} hint={initial ? 'Prefer “Adjust stock” for audited changes.' : undefined}>
          <input id="pf-stock" inputMode="numeric" value={form.stockQuantity} onChange={set('stockQuantity')} />
        </Field>
        <Field label="Image URL" htmlFor="pf-img" error={errors.imageUrl}><input id="pf-img" value={form.imageUrl} onChange={set('imageUrl')} maxLength={2048} placeholder="https://…" /></Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy && <Spinner />} {initial ? 'Save changes' : 'Create product'}</button>
      </div>
    </form>
  );
}

export function StockAdjustDialog({ product, onClose, onDone }: { product: Product | null; onClose: () => void; onDone: (p: Product) => void }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = Number(delta);
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length > 0 && product !== null && product.stockQuantity + n >= 0;
  return (
    <Modal
      open={!!product}
      title={`Adjust stock: ${product?.name ?? ''}`}
      onClose={onClose}
      size="sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={!valid || busy} onClick={async () => {
          if (!product) return;
          setBusy(true); setError(null);
          try { onDone(await productApi.adjustStock(product.id, n, reason.trim())); setDelta(''); setReason(''); }
          catch (err) { setError(errorMessage(err)); }
          finally { setBusy(false); }
        }}>{busy && <Spinner />} Apply</button>
      </>}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <p className="muted">Current stock: <strong>{product?.stockQuantity}</strong>{Number.isInteger(n) && n !== 0 && product ? <> → <strong>{product.stockQuantity + n}</strong></> : null}</p>
      <div className="form-grid">
        <Field label="Change (use − to remove)" htmlFor="sa-delta" hint="e.g. 20 for a delivery, −2 for damaged stock"><input id="sa-delta" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} /></Field>
        <Field label="Reason" htmlFor="sa-reason"><input id="sa-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Supplier delivery, damaged, recount…" /></Field>
      </div>
    </Modal>
  );
}

export default function Products() {
  useDocumentTitle('Products');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => productApi.all(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data ?? []).filter((p) =>
    (!category || p.category === category) && (!query || `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase()))), [data, query, category]);

  const upsert = (p: Product) => setData((all) => {
    const list = all ?? [];
    return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
  });

  return (
    <div className="stack">
      <div className="admin-head">
        <h1>Products</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> New product</button>
      </div>
      <div className="toolbar card">
        <input type="search" placeholder="Search by name or ID" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <span className="muted small">{rows.length} of {data?.length ?? 0}</span>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="card"><Skeleton width="100%" height={200} /></div> : rows.length === 0 ? (
        <EmptyState icon="grid" title="No products found" />
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><div className="cell-product"><ProductImage src={p.imageUrl} alt="" /><div><strong>{p.name}</strong><span className="muted small">#{p.id}</span></div></div></td>
                  <td>{p.category}</td>
                  <td className="num">{money(p.price, true)}</td>
                  <td className={`num ${p.stockQuantity === 0 ? 'text-danger' : p.stockQuantity <= 5 ? 'text-warning' : ''}`}>{p.stockQuantity}</td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setAdjusting(p)}>Adjust stock</button>
                    <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn text-danger" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><Icon name="trash" size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'New product' : 'Edit product'} onClose={() => setEditing(null)} size="lg">
        {editing !== null && (
          <ProductForm
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(p) => { upsert(p); setEditing(null); toast.success(editing === 'new' ? 'Product created' : 'Product updated'); }}
          />
        )}
      </Modal>
      <StockAdjustDialog product={adjusting} onClose={() => setAdjusting(null)} onDone={(p) => { upsert(p); setAdjusting(null); toast.success('Stock updated'); }} />
      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.name}”?`}
        message="The product will be removed from the catalogue. Past orders keep their own copy of the item details. This cannot be undone."
        confirmLabel="Delete product"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await productApi.remove(deleting.id); setData((all) => (all ?? []).filter((x) => x.id !== deleting.id)); setDeleting(null); toast.success('Product deleted'); }
          catch (err) { toast.error(errorMessage(err)); }
          finally { setBusy(false); }
        }}
      />
    </div>
  );
}
