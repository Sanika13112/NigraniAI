import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productApi } from '../lib/endpoints';
import { useAsync, useDocumentTitle } from '../lib/useAsync';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState, Pagination, ProductCardSkeleton } from '../components/ui';
import { CATEGORIES } from '../components/Layout';
import { Icon } from '../components/Icon';

const SORTS: [string, string][] = [
  ['relevance', 'Featured'],
  ['rating', 'Top rated'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['newest', 'Newest first'],
  ['name', 'Name A–Z'],
];

const PRICE_BANDS: [string, number | undefined, number | undefined][] = [
  ['Any price', undefined, undefined],
  ['Under ₹1,000', undefined, 999.99],
  ['₹1,000 – ₹2,500', 1000, 2500],
  ['₹2,500 – ₹10,000', 2500, 10000],
  ['Above ₹10,000', 10000, undefined],
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const band = Number(params.get('price') ?? 0);
  const inStock = params.get('inStock') === '1';
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useDocumentTitle(q ? `Results for “${q}”` : category || 'All products');

  const [, minPrice, maxPrice] = PRICE_BANDS[band] ?? PRICE_BANDS[0];
  const { data, error, loading, reload } = useAsync(
    () => productApi.search({ q: q || undefined, category: category || undefined, sort, minPrice, maxPrice, inStock, page, size: 12 }),
    [q, category, sort, band, inStock, page],
  );

  useEffect(() => {
    if (data && page > 0 && page >= data.totalPages && data.totalPages > 0) update({ page: String(data.totalPages - 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === null || v === '' ? next.delete(k) : next.set(k, v)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  const activeFilters = [category, band ? PRICE_BANDS[band][0] : '', inStock ? 'In stock' : ''].filter(Boolean).length;

  return (
    <div className="catalog">
      <div className="catalog-head results-bar">
        <div>
          <p className="results-count" aria-live="polite">
            {loading ? 'Loading products…' : data ? (data.totalElements === 0 ? 'No results' : `${data.page * data.size + 1}–${data.page * data.size + data.content.length} of ${data.totalElements} ${data.totalElements === 1 ? 'result' : 'results'}`) : ''}
            {category && !q && <> in <strong>{category}</strong></>}
          </p>
          <h1>{q ? <>Results for “{q}”</> : category || 'All products'}</h1>
        </div>
        <div className="catalog-tools">
          <button className="btn btn-secondary btn-sm show-sm" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
            <Icon name="filter" size={16} /> Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          <label className="sort-select">
            <span className="hide-sm">Sort by</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value })} aria-label="Sort products">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="catalog-layout">
        <aside className={`filters ${filtersOpen ? 'open' : ''}`} aria-label="Filters">
          <fieldset>
            <legend>Department</legend>
            <label className="radio"><input type="radio" name="cat" checked={!category} onChange={() => update({ category: null })} /> All departments</label>
            {CATEGORIES.map((c) => (
              <label key={c} className="radio"><input type="radio" name="cat" checked={category === c} onChange={() => update({ category: c })} /> {c}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Price</legend>
            {PRICE_BANDS.map(([label], i) => (
              <label key={label} className="radio"><input type="radio" name="price" checked={band === i} onChange={() => update({ price: i ? String(i) : null })} /> {label}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Availability</legend>
            <label className="check"><input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: e.target.checked ? '1' : null })} /> In stock only</label>
          </fieldset>
          {(activeFilters > 0 || q) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams())}>Clear all</button>
          )}
        </aside>

        <div className="catalog-results">
          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading || !data ? (
            <div className="product-grid">{Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>
          ) : data.content.length === 0 ? (
            <EmptyState icon="search" title="No products match" action={<button className="btn btn-primary" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>}>
              Try a different search term or remove some filters.
            </EmptyState>
          ) : (
            <>
              {q && <h2 className="results-title">Results</h2>}
              <div className="product-grid">{data.content.map((p) => <ProductCard key={p.id} product={p} />)}</div>
              <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => { update({ page: p ? String(p) : null }); window.scrollTo({ top: 0 }); }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
