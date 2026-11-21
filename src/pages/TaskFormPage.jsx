import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, parseApiError } from '../lib/api';
import { taskFormSchema, zodErrorsToMap } from '../lib/validators';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/FormControls';
import { ErrorState, LoadingSkeleton } from '../components/ui/StateViews';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES = ['Todo', 'In Progress', 'Review', 'Completed', 'Cancelled'];

export function TaskFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('Todo');
  const [dueDate, setDueDate] = useState('');
  const [labelsText, setLabelsText] = useState('');

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
        const projRes = await api.get('/projects', { params: { limit: 100 } });
        if (!active) return;
        const projList = projRes.data.data.items;
        setProjects(projList);

        if (isEdit && id) {
          const taskRes = await api.get(`/tasks/${id}`);
          if (!active) return;
          const t = taskRes.data.data.task;
          setProjectId(t.projectId);
          setTitle(t.title);
          setDescription(t.description || '');
          setAssignedTo(t.assignedTo || '');
          setPriority(t.priority);
          setStatus(t.status);
          setDueDate(t.dueDate || '');
          setLabelsText((t.labels || []).join(', '));
        } else {
          const initialPid = searchParams.get('projectId') || projList[0]?.id || '';
          setProjectId(initialPid);
          if (user?.role === 'Member') {
            setAssignedTo(user.id);
          }
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
  }, [id, isEdit, searchParams, user?.id, user?.role]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const projectMembers = selectedProject?.members || [];
  const isMemberOnly = user?.role === 'Member';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const parsed = taskFormSchema.safeParse({
      title,
      description,
      projectId,
      assignedTo: assignedTo || null,
      priority,
      status,
      dueDate: dueDate || null,
      labelsText,
    });

    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      return;
    }

    const labels = labelsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setErrors({});
    setSubmitting(true);
    try {
      if (isEdit && id) {
        const payload = {
          title: parsed.data.title,
          description: parsed.data.description,
          priority: parsed.data.priority,
          status: parsed.data.status,
          dueDate: parsed.data.dueDate,
          labels,
        };
        if (!isMemberOnly) {
          payload.assignedTo = parsed.data.assignedTo;
        }
        await api.put(`/tasks/${id}`, payload);
        toast.success('Task updated');
        navigate(`/tasks/${id}`);
      } else {
        const res = await api.post('/tasks', {
          title: parsed.data.title,
          description: parsed.data.description,
          projectId: parsed.data.projectId,
          assignedTo: parsed.data.assignedTo,
          priority: parsed.data.priority,
          status: parsed.data.status,
          dueDate: parsed.data.dueDate,
          labels,
        });
        toast.success('Task created');
        navigate(`/tasks/${res.data.data.task.id}`);
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
      title={isEdit ? 'Edit Task' : 'Create Task'}
      subtitle={
        isEdit
          ? 'Modify task details, schedule, and workflow status.'
          : 'Create a task inside a project and assign it to a project member.'
      }
      breadcrumbs={[
        { label: 'Workspace', to: '/dashboard' },
        { label: 'Projects', to: '/projects' },
        { label: isEdit ? 'Edit Task' : 'New Task' },
      ]}
    >
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : loadError ? (
        <ErrorState message={loadError} />
      ) : projects.length === 0 ? (
        <ErrorState
          title="No projects available"
          message="Create a project first before creating tasks."
          onRetry={() => navigate('/projects/new')}
        />
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

          <Select
            label="Project"
            name="projectId"
            value={projectId}
            disabled={isEdit}
            onChange={(e) => {
              setProjectId(e.target.value);
              setAssignedTo('');
              setErrors((prev) => ({ ...prev, projectId: '' }));
            }}
            error={errors.projectId}
            requiredMark
          >
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Input
            label="Task Title"
            name="title"
            placeholder="e.g., Add Zod schema validation on webhook handler"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErrors((prev) => ({ ...prev, title: '' }));
            }}
            error={errors.title}
            requiredMark
          />

          <Textarea
            label="Description"
            name="description"
            rows={4}
            placeholder="Provide acceptance criteria and context (10+ characters required to mark Completed)..."
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors((prev) => ({ ...prev, description: '' }));
            }}
            error={errors.description}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Assignee"
              name="assignedTo"
              value={assignedTo}
              disabled={isEdit && isMemberOnly}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                setErrors((prev) => ({ ...prev, assignedTo: '' }));
              }}
              error={errors.assignedTo}
              hint={
                isMemberOnly
                  ? 'Only Managers or Admins can assign tasks to other teammates.'
                  : 'Filtered to active members of this project.'
              }
            >
              <option value="">Unassigned</option>
              {projectMembers
                .filter((m) => !isMemberOnly || m.id === user?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
            </Select>

            <Input
              label="Due Date"
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              error={errors.dueDate}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Priority"
              name="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              error={errors.priority}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>

            <Select
              label="Status"
              name="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setErrors((prev) => ({ ...prev, status: '' }));
              }}
              error={errors.status}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Labels"
            name="labelsText"
            placeholder="backend, security, release (comma-separated)"
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            error={errors.labels}
            hint="Optional comma-separated tags (max 8)."
          />

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
            <Link to={isEdit && id ? `/tasks/${id}` : projectId ? `/projects/${projectId}` : '/my-tasks'}>
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={submitting}>
              {isEdit ? 'Save Task' : 'Create Task'}
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
