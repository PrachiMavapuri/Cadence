import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { parseApiError } from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/FormControls.jsx';
import { Modal } from '../ui/Modal.jsx';

export function SocialAuthButtons({ redirectTo = '/dashboard' }) {
  const { loginWithSocial } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [activeProvider, setActiveProvider] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);



  const handleSocialSubmit = async (e) => {
    e.preventDefault();
    if (!activeProvider) return;

    const errs = {};
    if (name.trim().length < 2) errs.name = 'Please enter your full name (2+ characters)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Please enter a valid email address';

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      await loginWithSocial(activeProvider, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });
      toast.success('Signed in with Facebook', 'Welcome to your Cadence workspace.');
      setActiveProvider(null);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const apiErr = parseApiError(err);
      toast.error('Authentication failed', apiErr.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-2.5">
        <button
          type="button"
          onClick={() => window.location.assign('/api/auth/google')}
          className="inline-flex min-h-[42px] w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.3 0 6.08-1.09 8.105-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.225 1.18-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.03 21.18 7.19 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.02 14.03c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.17H1.01A11.96 11.96 0 0 0 0 11.67c0 1.94.46 3.77 1.01 5.5l4.01-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.19 15.3 0 12 0 7.19 0 3.03 2.82 1.01 6.83l4.01 3.14C6 6.94 8.75 4.75 12 4.75Z"
            />
          </svg>
          <span className="whitespace-nowrap">Continue with Google</span>
        </button>

       
      </div>

     
    </>
  );
}
