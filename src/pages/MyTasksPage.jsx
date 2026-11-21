import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { api, parseApiError } from '../lib/api';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, LoadingSkeleton, Pagination } from '../components/ui/StateViews';
import {
  formatShortDate,
  isTaskOverdue,
  TaskPriorityLabel,
  TaskStatusLabel,
} from '../components/ui/StatusText';

const STATUS_TABS = ['', 'Todo', 'In Progress', 'Review', 'Completed', 'Cancelled'];

export function MyTasksPage() {
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState('dueDate');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);

  const fetchMyTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/tasks', {
        params: {
          assignedTo: 'me',
          page,
          limit: 10,
          q,
          status,
          priority,
          overdue: overdueOnly ? 'true' : '',
          sortBy,
          sortOrder,
        },
      });
      setData(res.data.data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [page, q, status, priority, overdueOnly, sortBy, sortOrder]);

  useEffect(() => {
    void fetchMyTasks();
  }, [fetchMyTasks]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void fetchMyTasks();
    socket.on('task:created', refresh);
    socket.on('task:updated', refresh);
    socket.on('task:deleted', refresh);
    return () => {
      socket.off('task:created', refresh);
      socket.off('task:updated', refresh);
      socket.off('task:deleted', refresh);
    };
  }, [socket, fetchMyTasks]);

  return (
    <AppShell
      title="My Tasks"
      subtitle="All tasks assigned to you across active workspace projects."
      breadcrumbs={[{ label: 'Workspace', to: '/dashboard' }, { label: 'My Tasks' }]}
      actions={
        <Link to="/tasks/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </Link>
      }
    >
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {STATUS_TABS.map((s) => (
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

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            Overdue only
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search your tasks by title, description, or label..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            aria-label="Sort tasks"
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [col, ord] = e.target.value.split(':');
              setSortBy(col);
              setSortOrder(ord);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="dueDate:asc">Due date (soonest)</option>
            <option value="priority:desc">Priority (highest)</option>
            <option value="createdAt:desc">Newest first</option>
            <option value="title:asc">Title (A–Z)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMyTasks} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No matching tasks assigned to you"
          description="Try clearing your filters or create a new task."
          action={
            <Link to="/tasks/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Create Task
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
                  <th className="px-5 py-3">Project</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3 text-right">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((task) => {
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
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <Link to={`/projects/${task.projectId}`} className="hover:text-blue-600 hover:underline">
                          {task.projectName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <TaskStatusLabel status={task.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <TaskPriorityLabel priority={task.priority} />
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-mono text-xs tabular-nums whitespace-nowrap ${
                          overdue ? 'font-semibold text-red-600' : 'text-slate-600'
                        }`}
                      >
                        {overdue ? 'Overdue · ' : ''}
                        {formatShortDate(task.dueDate)}
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
    </AppShell>
  );
}
