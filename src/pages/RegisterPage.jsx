import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { parseApiError } from '../lib/api.js';
import { registerFormSchema, zodErrorsToMap } from '../lib/validators.js';
import { SocialAuthButtons } from '../components/auth/SocialAuthButtons.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/FormControls.jsx';

export function RegisterPage() {
  const { isAuthenticated, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const parsed = registerFormSchema.safeParse({
      name,
      email,
      jobTitle,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await register({
        name: parsed.data.name,
        email: parsed.data.email,
        jobTitle: parsed.data.jobTitle || 'Team Member',
        password: parsed.data.password,
      });
      toast.success('Account created', 'Your Cadence workspace is ready.');
      navigate('/dashboard', { replace: true });
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="mb-6">
          <Link to="/login" className="font-display text-lg font-bold text-slate-900">
            Cadence
          </Link>
          <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Join your team to collaborate on projects and track tasks.
          </p>
        </div>

        <SocialAuthButtons redirectTo="/dashboard" />

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">or register with email</span>
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
            label="Full Name"
            name="name"
            placeholder="Alex Rivera"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            error={errors.name}
            requiredMark
          />

          <Input
            label="Work Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="alex@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: '' }));
            }}
            error={errors.email}
            requiredMark
          />

          <Input
            label="Role / Job Title"
            name="jobTitle"
            placeholder="Software Engineer"
            value={jobTitle}
            onChange={(e) => {
              setJobTitle(e.target.value);
              setErrors((prev) => ({ ...prev, jobTitle: '' }));
            }}
            error={errors.jobTitle}
          />

          <div className="relative">
            <Input
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
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

          <Input
            label="Confirm Password"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setErrors((prev) => ({ ...prev, confirmPassword: '' }));
            }}
            error={errors.confirmPassword}
            requiredMark
          />

          <Button type="submit" className="w-full" size="lg" loading={submitting}>
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
