import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, parseApiError } from '../lib/api.js';
import { AppShell } from '../components/layout/AppShell.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConfirmModal } from '../components/ui/Modal.jsx';
import { EmptyState, ErrorState, LoadingSkeleton, Pagination } from '../components/ui/StateViews.jsx';
import { formatShortDate, ProjectStatusLabel } from '../components/ui/StatusText.jsx';

const STATUS_FILTERS = ['', 'Active', 'Planning', 'On Hold', 'Completed', 'Archived'];

export function ProjectsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/projects', {
        params: { page, limit: 8, q, status, sortBy, sortOrder },
      });
      setData(res.data.data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [page, q, status, sortBy, sortOrder]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void fetchProjects();
    socket.on('project:updated', refresh);
    socket.on('project:deleted', refresh);
    socket.on('task:created', refresh);
    socket.on('task:updated', refresh);
    return () => {
      socket.off('project:updated', refresh);
      socket.off('project:deleted', refresh);
      socket.off('task:created', refresh);
      socket.off('task:updated', refresh);
    };
  }, [socket, fetchProjects]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${deleteTarget.id}`);
      toast.success('Project deleted', `"${deleteTarget.name}" and its tasks were removed.`);
      setDeleteTarget(null);
      void fetchProjects();
    } catch (err) {
      toast.error('Delete failed', parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  };

  const canManageProject = (project) =>
    user?.role === 'Admin' || user?.role === 'Manager' || project.ownerId === user?.id;

  return (
    <AppShell
      title="Projects"
      subtitle="Manage team initiatives, timelines, and project membership."
      breadcrumbs={[{ label: 'Workspace', to: '/dashboard' }, { label: 'Projects' }]}
      actions={
        <Link to="/projects/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      }
    >
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                status === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search projects..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <select
            aria-label="Sort projects"
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [col, ord] = e.target.value.split(':');
              setSortBy(col);
              setSortOrder(ord);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="dueDate:asc">Due date (soonest)</option>
            <option value="name:asc">Name (A–Z)</option>
            <option value="updatedAt:desc">Recently updated</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchProjects} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No projects match your filters"
          description="Create a new project or clear your search and status filters."
          action={
            <Link to="/projects/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Create Project
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Due Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((project) => {
                  const total = Number(project.taskCount || 0);
                  const done = Number(project.completedTaskCount || 0);
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <tr key={project.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 max-w-md">
                        <Link
                          to={`/projects/${project.id}`}
                          className="font-display font-semibold text-slate-900 hover:text-blue-600"
                        >
                          {project.name}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          {project.description}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <ProjectStatusLabel status={project.status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={project.ownerName || 'Owner'} src={project.ownerAvatar} size="xs" />
                          <span className="text-xs text-slate-700 whitespace-nowrap">
                            {project.ownerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[140px]">
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs tabular-nums text-slate-600">
                            {done}/{total}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {formatShortDate(project.dueDate)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {canManageProject(project) && (
                            <>
                              <Link
                                to={`/projects/${project.id}/edit`}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                title="Edit project"
                                aria-label={`Edit ${project.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(project)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                title="Delete project"
                                aria-label={`Delete ${project.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Project"
        description={`Deleting "${deleteTarget?.name}" will permanently remove the project along with all of its tasks, comments, and activity history. This action cannot be undone.`}
        confirmLabel="Delete Project"
      />
    </AppShell>
  );
}
