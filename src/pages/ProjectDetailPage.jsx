import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Kanban,
  List,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, parseApiError } from '../lib/api.js';
import { AppShell } from '../components/layout/AppShell.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConfirmModal, Modal } from '../components/ui/Modal.jsx';
import { EmptyState, ErrorState, LoadingSkeleton, Pagination } from '../components/ui/StateViews.jsx';
import {
  formatShortDate,
  isTaskOverdue,
  ProjectStatusLabel,
  TaskPriorityLabel,
  TaskStatusLabel,
} from '../components/ui/StatusText.jsx';

const KANBAN_STATUSES = ['Todo', 'In Progress', 'Review', 'Completed', 'Cancelled'];
const PRIORITIES = ['', 'Critical', 'High', 'Medium', 'Low'];

export function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [tasksData, setTasksData] = useState(null);
  const [boardTasks, setBoardTasks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('list');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  const loadProjectAndTasks = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [projRes, listRes, boardRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get('/tasks', {
          params: {
            projectId: id,
            page,
            limit: 8,
            q,
            status: statusFilter,
            priority: priorityFilter,
            sortBy,
            sortOrder,
          },
        }),
        api.get('/tasks', {
          params: {
            projectId: id,
            page: 1,
            limit: 100,
            q,
            priority: priorityFilter,
            sortBy: 'orderIndex',
            sortOrder: 'asc',
          },
        }),
      ]);
      setProject(projRes.data.data.project);
      setTasksData(listRes.data.data);
      setBoardTasks(boardRes.data.data.items);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id, page, q, statusFilter, priorityFilter, sortBy, sortOrder]);

  useEffect(() => {
    setLoading(true);
    void loadProjectAndTasks();
  }, [loadProjectAndTasks]);

  useEffect(() => {
    if (user?.role === 'Admin' || user?.role === 'Manager') {
      api
        .get('/users')
        .then((res) => setAllUsers(res.data.data.users.filter((u) => u.isActive)))
        .catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => {
    if (!socket) return;
    const handleSync = () => void loadProjectAndTasks();
    socket.on('task:created', handleSync);
    socket.on('task:updated', handleSync);
    socket.on('task:deleted', handleSync);
    socket.on('project:updated', handleSync);
    return () => {
      socket.off('task:created', handleSync);
      socket.off('task:updated', handleSync);
      socket.off('task:deleted', handleSync);
      socket.off('project:updated', handleSync);
    };
  }, [socket, loadProjectAndTasks]);

  const canManageProject =
    project && (user?.role === 'Admin' || user?.role === 'Manager' || project.ownerId === user?.id);
  const canManageMembers = user?.role === 'Admin' || user?.role === 'Manager';

  const handleDeleteProject = async () => {
    if (!project) return;
    setDeletingProject(true);
    try {
      await api.delete(`/projects/${project.id}`);
      toast.success('Project deleted');
      navigate('/projects', { replace: true });
    } catch (err) {
      toast.error('Failed to delete project', parseApiError(err).message);
    } finally {
      setDeletingProject(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!project || !selectedUserId) return;
    setAddingMember(true);
    try {
      const res = await api.post(`/projects/${project.id}/members`, { userId: selectedUserId });
      setProject(res.data.data.project);
      setSelectedUserId('');
      setMemberModalOpen(false);
      toast.success('Member added to project');
    } catch (err) {
      toast.error('Unable to add member', parseApiError(err).message);
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!project) return;
    try {
      const res = await api.delete(`/projects/${project.id}/members/${memberId}`);
      setProject(res.data.data.project);
      toast.success('Member removed from project');
      void loadProjectAndTasks();
    } catch (err) {
      toast.error('Unable to remove member', parseApiError(err).message);
    }
  };

  const handleStatusChange = async (task, nextStatus) => {
    if (task.status === nextStatus) return;

    const prevBoard = [...boardTasks];
    const prevList = tasksData ? { ...tasksData, items: [...tasksData.items] } : null;

    setBoardTasks((curr) => curr.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    if (tasksData) {
      setTasksData({
        ...tasksData,
        items: tasksData.items.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)),
      });
    }

    try {
      const res = await api.patch(`/tasks/${task.id}/status`, { status: nextStatus });
      const updated = res.data.data.task;
      setBoardTasks((curr) => curr.map((t) => (t.id === task.id ? updated : t)));
      toast.success(`Moved to ${nextStatus}`);
    } catch (err) {
      setBoardTasks(prevBoard);
      if (prevList) setTasksData(prevList);
      toast.error('Status update rejected', parseApiError(err).message);
    }
  };

  const nonMembers = allUsers.filter(
    (u) => !project?.members.some((m) => m.id === u.id)
  );

  return (
    <AppShell
      title={project?.name || 'Project Details'}
      subtitle={project?.description}
      breadcrumbs={[
        { label: 'Workspace', to: '/dashboard' },
        { label: 'Projects', to: '/projects' },
        { label: project?.name || 'Details' },
      ]}
      actions={
        project && (
          <div className="flex items-center gap-2">
            {canManageProject && (
              <>
                <Link to={`/projects/${project.id}/edit`}>
                  <Button variant="secondary" size="sm">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </Link>
                <Button variant="danger" size="sm" onClick={() => setDeleteProjectOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}
            <Link to={`/tasks/new?projectId=${project.id}`}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </Link>
          </div>
        )
      }
    >
      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadProjectAndTasks} />
      ) : project ? (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <div className="mt-1">
                    <ProjectStatusLabel status={project.status} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Start Date</p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-slate-900">
                    {formatShortDate(project.startDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Due Date</p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-slate-900">
                    {formatShortDate(project.dueDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Completion</p>
                  <p className="mt-1 font-mono text-xs tabular-nums font-semibold text-slate-900">
                    {project.stats?.completedTasks ?? 0} / {project.stats?.totalTasks ?? 0} tasks
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Team Members ({project.members.length})
                </h2>
                {canManageMembers && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMemberModalOpen(true)}
                    disabled={nonMembers.length === 0}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Member
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {project.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                    <span className="font-medium text-slate-800">{m.name}</span>
                    <span className="text-slate-400">· {m.role}</span>
                    {canManageMembers && m.id !== project.ownerId && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="ml-1 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title={`Remove ${m.name}`}
                        aria-label={`Remove ${m.name}`}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === 'board' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Kanban className="h-3.5 w-3.5" />
                  Kanban Board
                </button>
              </div>

              {viewMode === 'list' && (
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value="">All Statuses</option>
                  {KANBAN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="">All Priorities</option>
                {PRIORITIES.filter(Boolean).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search project tasks..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
              {viewMode === 'list' && (
                <select
                  aria-label="Sort tasks"
                  value={`${sortBy}:${sortOrder}`}
                  onChange={(e) => {
                    const [col, ord] = e.target.value.split(':');
                    setSortBy(col);
                    setSortOrder(ord);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value="createdAt:desc">Newest first</option>
                  <option value="dueDate:asc">Due date (soonest)</option>
                  <option value="priority:desc">Highest priority</option>
                  <option value="title:asc">Title (A–Z)</option>
                </select>
              )}
            </div>
          </section>

          {viewMode === 'list' ? (
            !tasksData || tasksData.items.length === 0 ? (
              <EmptyState
                title="No tasks found in this project"
                description="Create a task to start tracking work across your project team."
                action={
                  <Link to={`/tasks/new?projectId=${project.id}`}>
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                      Create First Task
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
                        <th className="px-5 py-3">Task</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Priority</th>
                        <th className="px-5 py-3">Assignee</th>
                        <th className="px-5 py-3">Due Date</th>
                        <th className="px-5 py-3 text-right">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tasksData.items.map((task) => {
                        const overdue = isTaskOverdue(task.dueDate, task.status);
                        return (
                          <tr key={task.id} className="hover:bg-slate-50/70">
                            <td className="px-5 py-3.5 max-w-md">
                              <Link
                                to={`/tasks/${task.id}`}
                                className="font-medium text-slate-900 hover:text-blue-600"
                              >
                                {task.title}
                              </Link>
                              {task.labels.length > 0 && (
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {task.labels.join(' · ')}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <TaskStatusLabel status={task.status} />
                            </td>
                            <td className="px-5 py-3.5">
                              <TaskPriorityLabel priority={task.priority} />
                            </td>
                            <td className="px-5 py-3.5">
                              {task.assigneeName ? (
                                <div className="flex items-center gap-2">
                                  <Avatar name={task.assigneeName} src={task.assigneeAvatar} size="xs" />
                                  <span className="text-xs text-slate-700 whitespace-nowrap">
                                    {task.assigneeName}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">Unassigned</span>
                              )}
                            </td>
                            <td
                              className={`px-5 py-3.5 font-mono text-xs tabular-nums whitespace-nowrap ${
                                overdue ? 'font-semibold text-red-600' : 'text-slate-600'
                              }`}
                            >
                              {overdue ? 'Overdue · ' : ''}
                              {formatShortDate(task.dueDate)}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {task.commentCount || 0}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={tasksData.pagination} onPageChange={setPage} />
              </div>
            )
          ) : (
            <div>
              <p className="mb-3 text-xs text-slate-500">
                Drag tasks across columns or use the quick status menu to update workflow state in real time.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {KANBAN_STATUSES.map((colStatus) => {
                  const columnTasks = boardTasks.filter((t) => t.status === colStatus);
                  return (
                    <div
                      key={colStatus}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedTaskId) return;
                        const task = boardTasks.find((t) => t.id === draggedTaskId);
                        setDraggedTaskId(null);
                        if (task) void handleStatusChange(task, colStatus);
                      }}
                      className="flex min-h-[340px] flex-col rounded-xl border border-slate-200 bg-slate-100/70 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between px-1">
                        <TaskStatusLabel status={colStatus} />
                        <span className="font-mono text-xs tabular-nums text-slate-500">
                          {columnTasks.length}
                        </span>
                      </div>

                      <div className="flex-1 space-y-2.5">
                        {columnTasks.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                            Drop task here
                          </div>
                        ) : (
                          columnTasks.map((task) => {
                            const overdue = isTaskOverdue(task.dueDate, task.status);
                            return (
                              <div
                                key={task.id}
                                draggable
                                onDragStart={() => setDraggedTaskId(task.id)}
                                onDragEnd={() => setDraggedTaskId(null)}
                                className="cursor-grab active:cursor-grabbing rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300"
                              >
                                <Link
                                  to={`/tasks/${task.id}`}
                                  className="block text-sm font-medium text-slate-900 hover:text-blue-600 leading-snug"
                                >
                                  {task.title}
                                </Link>
                                <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                                  <TaskPriorityLabel priority={task.priority} />
                                  <span
                                    className={`font-mono tabular-nums ${
                                      overdue ? 'font-semibold text-red-600' : 'text-slate-400'
                                    }`}
                                  >
                                    {task.dueDate ? formatShortDate(task.dueDate) : 'No due'}
                                  </span>
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                                  {task.assigneeName ? (
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Avatar name={task.assigneeName} src={task.assigneeAvatar} size="xs" />
                                      <span className="truncate text-xs text-slate-600">
                                        {task.assigneeName.split(' ')[0]}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400">Unassigned</span>
                                  )}
                                  <select
                                    aria-label={`Change status for ${task.title}`}
                                    value={task.status}
                                    onChange={(e) => void handleStatusChange(task, e.target.value)}
                                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700"
                                  >
                                    {KANBAN_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <ConfirmModal
        open={deleteProjectOpen}
        onClose={() => !deletingProject && setDeleteProjectOpen(false)}
        onConfirm={handleDeleteProject}
        loading={deletingProject}
        title="Delete Project"
        description={`Deleting "${project?.name}" will permanently delete all tasks, comments, and activity records inside this project.`}
        confirmLabel="Delete Project"
      />

      <Modal
        open={memberModalOpen}
        onClose={() => !addingMember && setMemberModalOpen(false)}
        title="Add Project Member"
        description="Select a workspace teammate to grant access and allow task assignment."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="add-member-select" className="block text-sm font-medium text-slate-700">
              Team Member
            </label>
            <select
              id="add-member-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Choose a team member...</option>
              {nonMembers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role} · {u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setMemberModalOpen(false)} disabled={addingMember}>
              Cancel
            </Button>
            <Button type="submit" loading={addingMember} disabled={!selectedUserId}>
              Add Member
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
