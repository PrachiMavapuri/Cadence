import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, parseApiError } from '../lib/api.js';
import { projectFormSchema, zodErrorsToMap } from '../lib/validators.js';
import { AppShell } from '../components/layout/AppShell.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Select, Textarea } from '../components/ui/FormControls.jsx';
import { ErrorState, LoadingSkeleton } from '../components/ui/StateViews.jsx';

const STATUS_OPTIONS = ['Planning', 'Active', 'On Hold', 'Completed', 'Archived'];

export function ProjectFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Active');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [memberIds, setMemberIds] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const usersRes = await api.get('/users');
        if (!active) return;
        const usersList = usersRes.data.data.users.filter((u) => u.isActive);
        setAllUsers(usersList);

        if (isEdit && id) {
          const projRes = await api.get(`/projects/${id}`);
          if (!active) return;
          const p = projRes.data.data.project;
          setName(p.name);
          setDescription(p.description);
          setStatus(p.status);
          setStartDate(p.startDate);
          setDueDate(p.dueDate);
          setMemberIds((p.members || []).map((m) => m.id));
        } else if (user) {
          setMemberIds([user.id]);
        }
      } catch (err) {
        if (active) setLoadError(parseApiError(err).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, isEdit, user?.id]);

  const toggleMember = (uid) => {
    setMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((item) => item !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const parsed = projectFormSchema.safeParse({
      name,
      description,
      status,
      startDate,
      dueDate,
      memberIds,
    });

    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      if (isEdit && id) {
        const payload =
          user?.role === 'Member'
            ? { name: parsed.data.name, description: parsed.data.description, status: parsed.data.status, startDate: parsed.data.startDate, dueDate: parsed.data.dueDate }
            : parsed.data;
        await api.put(`/projects/${id}`, payload);
        toast.success('Project updated');
        navigate(`/projects/${id}`);
      } else {
        const res = await api.post('/projects', parsed.data);
        toast.success('Project created');
        navigate(`/projects/${res.data.data.project.id}`);
      }
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
    <AppShell
      title={isEdit ? 'Edit Project' : 'Create Project'}
      subtitle={isEdit ? 'Update project schedule, status, and team members.' : 'Define a new team project with timeline and members.'}
      breadcrumbs={[
        { label: 'Workspace', to: '/dashboard' },
        { label: 'Projects', to: '/projects' },
        { label: isEdit ? 'Edit' : 'New Project' },
      ]}
    >
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5"
          noValidate
        >
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
              {formError}
            </div>
          )}

          <Input
            label="Project Name"
            name="name"
            placeholder="e.g., Customer SSO & SCIM Provisioning"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            error={errors.name}
            requiredMark
          />

          <Textarea
            label="Description"
            name="description"
            rows={4}
            placeholder="Describe project objectives, deliverables, and scope (minimum 10 characters)..."
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors((prev) => ({ ...prev, description: '' }));
            }}
            error={errors.description}
            requiredMark
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              error={errors.status}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>

            <Input
              label="Start Date"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setErrors((prev) => ({ ...prev, startDate: '', dueDate: '' }));
              }}
              error={errors.startDate}
              requiredMark
            />

            <Input
              label="Due Date"
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setErrors((prev) => ({ ...prev, dueDate: '' }));
              }}
              error={errors.dueDate}
              requiredMark
            />
          </div>

          {(!isEdit || user?.role !== 'Member') && (
            <div className="space-y-2 pt-2">
              <label className="block text-sm font-medium text-slate-700">
                Project Members
              </label>
              <p className="text-xs text-slate-500">
                Only project members can be assigned to tasks within this project.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                {allUsers.map((u) => {
                  const selected = memberIds.includes(u.id);
                  const isCurrentOwner = !isEdit && u.id === user?.id;
                  return (
                    <label
                      key={u.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
                        selected ? 'border-blue-600 bg-blue-50/40' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={isCurrentOwner}
                        onChange={() => toggleMember(u.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <Avatar name={u.name} src={u.avatarUrl} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                        <p className="truncate text-xs text-slate-500">{u.role}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
            <Link to={isEdit && id ? `/projects/${id}` : '/projects'}>
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={submitting}>
              {isEdit ? 'Save Changes' : 'Create Project'}
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
