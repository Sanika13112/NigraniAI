import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAccessToken, setRefreshHandler } from '../lib/api';
import { authApi, type RegisterBody } from '../lib/endpoints';
import type { AuthResponse, SessionUser } from '../lib/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthApi {
  status: Status;
  user: SessionUser | null;
  isAdmin: boolean;
  isCustomer: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (body: RegisterBody) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  const accept = useCallback((res: AuthResponse) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Silent refresh: used on page load and whenever an access token expires.
  useEffect(() => {
    setRefreshHandler(async () => {
      try {
        const res = await authApi.refresh();
        accept(res);
        return res.accessToken;
      } catch {
        endSession();
        return null;
      }
    });
    let active = true;
    authApi
      .refresh()
      .then((res) => active && accept(res))
      .catch(() => active && endSession());
    return () => {
      active = false;
      setRefreshHandler(null);
    };
  }, [accept, endSession]);

  const login = useCallback(async (email: string, password: string) => accept(await authApi.login(email, password)), [accept]);
  const register = useCallback(
    async (body: RegisterBody) => accept(await authApi.register(body)),
    [accept],
  );
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* the local session ends regardless */
    }
    endSession();
  }, [endSession]);

  const value = useMemo<AuthApi>(
    () => ({
      status,
      user,
      isAdmin: user?.role === 'ADMIN',
      isCustomer: !!user && user.role === 'CUSTOMER' && user.customerId != null,
      login,
      register,
      logout,
    }),
    [status, user, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
