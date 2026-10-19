import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { Spinner, EmptyState } from './ui';
import { Link } from 'react-router-dom';

export function PageLoader() {
  return (
    <div className="page-loader"><Spinner /></div>
  );
}

/** UX-only guard: every protected endpoint is also enforced by the backend. */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { status, isCustomer, isAdmin } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!isCustomer) {
    return (
      <div className="container section">
        <EmptyState icon="user" title="This area is for customer accounts" action={isAdmin ? <Link className="btn btn-primary" to="/admin">Go to admin dashboard</Link> : undefined}>
          You're signed in with a staff account. Use a customer account to shop and place orders.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) {
    return (
      <div className="container section">
        <EmptyState icon="lock" title="Administrator access required" action={<Link className="btn btn-primary" to="/">Back to store</Link>}>
          Your account doesn't have permission to view the admin dashboard.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}
