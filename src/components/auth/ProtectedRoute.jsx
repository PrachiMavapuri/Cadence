import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../ui/Button.jsx';
import { AppShell } from '../layout/AppShell.jsx';

export function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="text-sm font-medium">Verifying workspace session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <AppShell title="Access Restricted" breadcrumbs={[{ label: 'Workspace', to: '/dashboard' }, { label: 'Restricted' }]}>
        <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            Permission Required
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Your current role ({user.role}) does not have permission to access this view. Contact a workspace Administrator if you need elevated access.
          </p>
          <div className="mt-6">
            <Button variant="primary" onClick={() => (window.location.href = '/dashboard')}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}
