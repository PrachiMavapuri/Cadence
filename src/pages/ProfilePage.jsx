import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, parseApiError } from '../lib/api';
import { profileFormSchema, zodErrorsToMap } from '../lib/validators';
import { AppShell } from '../components/layout/AppShell';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/FormControls';
import { formatShortDate } from '../components/ui/StatusText';

const PRESET_AVATARS = [
  '/src/assets/images/avatar_admin_elena_1795191954571.jpg',
  '/src/assets/images/avatar_manager_marcus_1795191954338.jpg',
  '/src/assets/images/avatar_member_priya_1795191953989.jpg',
];

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name || '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const parsed = profileFormSchema.safeParse({
      name,
      jobTitle,
      avatarUrl,
      currentPassword: currentPassword || undefined,
      newPassword: newPassword || undefined,
    });

    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const payload = {
        name: parsed.data.name,
        jobTitle: parsed.data.jobTitle,
        avatarUrl: parsed.data.avatarUrl || '',
      };
      if (parsed.data.newPassword) {
        payload.currentPassword = parsed.data.currentPassword || '';
        payload.newPassword = parsed.data.newPassword;
      }

      const res = await api.put('/auth/profile', payload);
      setUser(res.data.data.user);
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Profile updated');
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
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Profile & Security"
      subtitle="Manage your personal identity, workspace portrait, and credentials."
      breadcrumbs={[{ label: 'Workspace', to: '/dashboard' }, { label: 'Profile' }]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Account Overview Header */}
        <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={name || user.name} src={avatarUrl} size="lg" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">{user.name}</h2>
              <p className="text-sm text-slate-500">
                {user.email} · {user.role}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Signed in via <span className="capitalize">{user.authProvider}</span> · Joined{' '}
                {formatShortDate(user.createdAt)}
              </p>
            </div>
          </div>
        </section>

        {/* Edit Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5"
          noValidate
        >
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: '' }));
              }}
              error={errors.name}
              requiredMark
            />
            <Input
              label="Job Title"
              name="jobTitle"
              value={jobTitle}
              onChange={(e) => {
                setJobTitle(e.target.value);
                setErrors((prev) => ({ ...prev, jobTitle: '' }));
              }}
              error={errors.jobTitle}
              requiredMark
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Profile Portrait</label>
            <div className="flex flex-wrap items-center gap-3">
              {PRESET_AVATARS.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={`rounded-full p-0.5 transition-all ${
                    avatarUrl === url ? 'ring-2 ring-blue-600 ring-offset-2' : 'opacity-80 hover:opacity-100'
                  }`}
                  aria-label={`Select preset portrait ${idx + 1}`}
                >
                  <Avatar name={user.name} src={url} size="md" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAvatarUrl('')}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Use Initials
              </button>
            </div>
          </div>

          {user.authProvider === 'local' && (
            <div className="border-t border-slate-200 pt-5 space-y-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Change Password
                </h3>
                <p className="text-xs text-slate-500">
                  Leave blank to keep your current password unchanged.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Current Password"
                  name="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, currentPassword: '' }));
                  }}
                  error={errors.currentPassword}
                />
                <Input
                  label="New Password"
                  name="newPassword"
                  type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, newPassword: '' }));
                  }}
                  error={errors.newPassword}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-200 pt-5">
            <Button type="submit" loading={saving}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
