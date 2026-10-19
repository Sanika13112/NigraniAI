import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { customerApi } from '../lib/endpoints';
import { errorMessage } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { readJson, writeJson } from './storage';

/** Signed-in customers: saved on the server. Guests: kept on this device and merged at sign-in. */
const GUEST_KEY = 'ss_wishlist_guest';

interface WishlistApi {
  ids: number[];
  has: (id: number) => boolean;
  toggle: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  syncedToAccount: boolean;
}

const WishlistContext = createContext<WishlistApi | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { status, isCustomer } = useAuth();
  const toast = useToast();
  const [ids, setIds] = useState<number[]>(() => readJson<number[]>(GUEST_KEY, []));

  useEffect(() => {
    if (status === 'loading') return;
    if (!isCustomer) {
      setIds(readJson<number[]>(GUEST_KEY, []));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const guest = readJson<number[]>(GUEST_KEY, []);
        let server = (await customerApi.wishlist()).productIds;
        for (const id of guest.filter((g) => !server.includes(g))) {
          server = (await customerApi.addWishlist(id)).productIds;
        }
        writeJson(GUEST_KEY, []);
        if (!cancelled) setIds(server);
      } catch {
        /* wishlist is non-critical; keep whatever we have */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, isCustomer]);

  const has = useCallback((id: number) => ids.includes(id), [ids]);

  const toggle = useCallback(
    async (id: number) => {
      const adding = !ids.includes(id);
      if (!isCustomer) {
        const next = adding ? [id, ...ids] : ids.filter((x) => x !== id);
        setIds(next);
        writeJson(GUEST_KEY, next);
        toast.info(adding ? 'Saved to wishlist on this device. Sign in to keep it across devices.' : 'Removed from wishlist');
        return;
      }
      try {
        const res = adding ? await customerApi.addWishlist(id) : await customerApi.removeWishlist(id);
        setIds(res.productIds);
        toast.success(adding ? 'Saved to your wishlist' : 'Removed from wishlist');
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [ids, isCustomer, toast],
  );

  const remove = useCallback(
    async (id: number) => {
      if (ids.includes(id)) await toggle(id);
    },
    [ids, toggle],
  );

  const value = useMemo(() => ({ ids, has, toggle, remove, syncedToAccount: isCustomer }), [ids, has, toggle, remove, isCustomer]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist outside WishlistProvider');
  return ctx;
}
