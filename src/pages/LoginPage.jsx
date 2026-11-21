import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { parseApiError } from '../lib/api.js';
import { loginFormSchema, zodErrorsToMap } from '../lib/validators.js';
import { SocialAuthButtons } from '../components/auth/SocialAuthButtons.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/FormControls.jsx';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@cadence.dev', password: 'Password123!' },
  { label: 'Manager', email: 'manager@cadence.dev', password: 'Password123!' },
  { label: 'Member', email: 'member@cadence.dev', password: 'Password123!' },
];

const OAUTH_ERROR_MESSAGES = {
  not_configured: 'Google sign-in is not configured. Add the Google client ID and secret to the server environment.',
  invalid_state: 'Google sign-in could not be verified. Please try again.',
  access_denied: 'Google sign-in was cancelled.',
  missing_code: 'Google did not return an authorization code. Please try again.',
  google_auth_failed: 'Google sign-in failed. Check your Google OAuth configuration and try again.',
};

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = location.state?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const oauthError = new URLSearchParams(location.search).get('oauthError');
    if (!oauthError) return;
    setFormError(OAUTH_ERROR_MESSAGES[oauthError] || 'Google sign-in failed. Please try again.');
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  if (isAuthenticated) {
    return <Navigate to={fromPath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const parsed = loginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      toast.success('Signed in', 'Welcome back to Cadence.');
      navigate(fromPath, { replace: true });
    } catch (err) {
      const apiErr = parseApiError(err);
      setFormError(apiErr.message);
      if (apiErr.errors) {
        const mapped = {};
        for (const [k, v] of Object.entries(apiErr.errors)) {
          if (v[0]) mapped[k] = v[0];
        }
        setErrors(mapped);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoFill = async (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      await login(demoEmail, demoPassword);
      toast.success('Signed in with demo account');
      navigate(fromPath, { replace: true });
    } catch (err) {
      setFormError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-12">
      <div className="hidden lg:col-span-5 lg:flex lg:flex-col lg:justify-between border-r border-slate-200 bg-white p-12">
        <div>
          <span className="font-display text-xl font-bold tracking-tight text-slate-900">
            Cadence
          </span>
          <h1 className="mt-16 font-display text-3xl font-semibold tracking-tight text-slate-900 leading-tight text-balance">
            Structured execution for engineering and product teams.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 max-w-md">
            Coordinate milestones, enforce role-based task workflows, track real-time board updates, and audit every project decision in one workspace.
          </p>
        </div>

       
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8 lg:col-span-7">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-6">
            <span className="font-display text-lg font-bold text-slate-900 lg:hidden">Cadence</span>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">
              Sign in to your workspace
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Use your work email or continue with a connected provider.
            </p>
          </div>

          <SocialAuthButtons redirectTo={fromPath} />

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">or sign in with email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((prev) => ({ ...prev, email: '' }));
              }}
              error={errors.email}
              requiredMark
            />

            <div className="relative">
              <Input
                label="Password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: '' }));
                }}
                error={errors.password}
                requiredMark
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-[34px] rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={submitting}>
              Sign in
            </Button>
          </form>

      

          <div className="mt-6 flex flex-col items-center gap-3 border-t border-slate-100 pt-5">
            <p className="text-center text-sm text-slate-600">
              Need an account?{' '}
              <Link to="/register" className="font-medium text-blue-600 hover:underline">
                Create workspace account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
