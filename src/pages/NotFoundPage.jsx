import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-mono text-sm font-semibold text-blue-600">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The route you requested does not exist or has been moved.
        </p>
        <div className="mt-6">
          <Link to={isAuthenticated ? '/dashboard' : '/login'}>
            <Button variant="primary">
              <ArrowLeft className="h-4 w-4" />
              {isAuthenticated ? 'Back to Dashboard' : 'Back to Sign In'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
