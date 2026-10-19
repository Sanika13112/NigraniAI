import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (value: T | ((prev: T | undefined) => T)) => void;
}

/** Loads data with loading/error state and a reload function. Stale responses are ignored. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const current = ++seq.current;
    setLoading(true);
    setError(null);
    fn()
      .then((value) => {
        if (current === seq.current) setDataState(value);
      })
      .catch((err) => {
        if (current === seq.current) setError(errorMessage(err));
      })
      .finally(() => {
        if (current === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((value: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof value === 'function' ? (value as (p: T | undefined) => T)(prev) : value));
  }, []);
  return { data, error, loading, reload, setData };
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · ShopSmart` : 'ShopSmart';
  }, [title]);
}
