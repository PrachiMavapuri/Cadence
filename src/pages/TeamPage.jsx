import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, parseApiError } from '../lib/api';
import { AppShell } from '../components/layout/AppShell';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingSkeleton } from '../components/ui/StateViews';

const ROLES = ['Admin', 'Manager', 'Member'];

export function TeamPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users');
      setUsers(res.data.data.users);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (targetId, nextRole) => {
    setUpdatingId(targetId);
    try {
      await api.patch(`/users/${targetId}/role`, { role: nextRole });
      setUsers((prev) => prev.map((u) => (u.id === targetId ? { ...u, role: nextRole } : u)));
      toast.success('Role updated');
    } catch (err) {
      toast.error('Role update failed', parseApiError(err).message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusToggle = async (target) => {
    setUpdatingId(target.id);
    try {
      const res = await api.patch(`/users/${target.id}/status`, { isActive: !target.isActive });
      const updated = res.data.data.user;
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isActive: updated.isActive } : u)));
      toast.success(updated.isActive ? 'Account activated' : 'Account deactivated');
    } catch (err) {
      toast.error('Status update failed', parseApiError(err).message);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = users.filter((u) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.jobTitle.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  });

  const isAdmin = currentUser?.role === 'Admin';

  return (
    <AppShell
      title="Team & Access Management"
      subtitle="View team capacity and manage workspace role permissions."
      breadcrumbs={[{ label: 'Workspace', to: '/dashboard' }, { label: 'Team' }]}
    >
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Filter members by name or role..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
        <p className="text-xs text-slate-500">
          {isAdmin
            ? 'Administrators can change member roles and account status.'
            : 'Managers can view team directory and workload metrics.'}
        </p>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchUsers} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Auth Provider</th>
                  <th className="px-5 py-3 text-right">Projects</th>
                  <th className="px-5 py-3 text-right">Open Tasks</th>
                  <th className="px-5 py-3">Status</th>
                  {isAdmin && <th className="px-5 py-3 text-right">Account Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                        <div>
                          <p className="font-medium text-slate-900">{member.name}</p>
                          <p className="text-xs text-slate-500">
                            {member.email} · {member.jobTitle}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {isAdmin ? (
                        <select
                          aria-label={`Role for ${member.name}`}
                          disabled={updatingId === member.id}
                          value={member.role}
                          onChange={(e) => void handleRoleChange(member.id, e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-slate-700">{member.role}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs capitalize text-slate-500">
                      {member.authProvider || 'local'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                      {member.projectCount ?? 0}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                      {member.openTaskCount ?? 0}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-xs font-medium ${
                          member.isActive ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={updatingId === member.id || member.id === currentUser?.id}
                          onClick={() => void handleStatusToggle(member)}
                        >
                          {member.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
