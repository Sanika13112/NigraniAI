import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Product } from '../lib/types';
import { readJson, writeJson } from './storage';

/**
 * The cart remembers what the shopper picked. Prices and stock shown here are a convenience
 * snapshot only; the order service re-prices and re-checks stock at checkout.
 */
export interface CartItem {
  productId: number;
  quantity: number;
  name: string;
  price: number;
  imageUrl: string | null;
  category: string;
  stock: number;
}

export const MAX_PER_ITEM = 10;
const KEY = 'ss_cart_v2';

interface CartApi {
  items: CartItem[];
  count: number;
  add: (product: Product, quantity?: number) => { added: number; limited: boolean };
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  refreshSnapshot: (updates: { productId: number; price?: number | null; stock?: number; name?: string | null }[]) => void;
}

const CartContext = createContext<CartApi | null>(null);

function limitFor(stock: number) {
  return Math.max(0, Math.min(MAX_PER_ITEM, stock));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() =>
    readJson<CartItem[]>(KEY, []).filter((i) => Number.isInteger(i.productId) && i.quantity > 0),
  );

  useEffect(() => {
    writeJson(KEY, items);
  }, [items]);

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(readJson<CartItem[]>(KEY, []));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const add = useCallback((product: Product, quantity = 1) => {
    const current = itemsRef.current;
    const existing = current.find((i) => i.productId === product.id);
    const limit = limitFor(product.stockQuantity);
    const wanted = (existing?.quantity ?? 0) + quantity;
    const next = Math.min(wanted, limit);
    const result = { added: Math.max(0, next - (existing?.quantity ?? 0)), limited: wanted > limit };
    if (next <= 0) return result;
    const snapshot: CartItem = {
      productId: product.id,
      quantity: next,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      category: product.category,
      stock: product.stockQuantity,
    };
    const updated = existing ? current.map((i) => (i.productId === product.id ? snapshot : i)) : [...current, snapshot];
    itemsRef.current = updated;
    writeJson(KEY, updated);
    setItems(updated);
    return result;
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setItems((current) =>
      current
        .map((i) => (i.productId === productId ? { ...i, quantity: Math.max(0, Math.min(quantity, limitFor(i.stock) || MAX_PER_ITEM)) } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    const updated = itemsRef.current.filter((i) => i.productId !== productId);
    itemsRef.current = updated;
    writeJson(KEY, updated);
    setItems(updated);
  }, []);
  // Persist immediately (not in an effect) so a navigation or tab close right after
  // checkout can never resurrect an already-ordered cart.
  const clear = useCallback(() => {
    itemsRef.current = [];
    writeJson(KEY, []);
    setItems([]);
  }, []);

  const refreshSnapshot = useCallback<CartApi['refreshSnapshot']>((updates) => {
    setItems((current) =>
      current.map((i) => {
        const u = updates.find((x) => x.productId === i.productId);
        if (!u) return i;
        return {
          ...i,
          price: u.price ?? i.price,
          stock: u.stock ?? i.stock,
          name: u.name ?? i.name,
        };
      }),
    );
  }, []);

  const value = useMemo<CartApi>(
    () => ({ items, count: items.reduce((n, i) => n + i.quantity, 0), add, setQuantity, remove, clear, refreshSnapshot }),
    [items, add, setQuantity, remove, clear, refreshSnapshot],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
