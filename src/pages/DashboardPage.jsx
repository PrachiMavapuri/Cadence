import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { api, parseApiError } from '../lib/api.js';
import { AppShell } from '../components/layout/AppShell.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/StateViews.jsx';
import {
  formatDateTime,
  formatShortDate,
  isTaskOverdue,
  TaskPriorityLabel,
  TaskStatusLabel,
} from '../components/ui/StatusText.jsx';

const STATUS_ORDER = ['Todo', 'In Progress', 'Review', 'Completed', 'Cancelled'];
const STATUS_BAR_COLOR = {
  Todo: 'bg-slate-400',
  'In Progress': 'bg-blue-600',
  Review: 'bg-amber-500',
  Completed: 'bg-emerald-600',
  Cancelled: 'bg-slate-300',
};

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITY_BAR_COLOR = {
  Critical: 'bg-red-600',
  High: 'bg-amber-500',
  Medium: 'bg-blue-600',
  Low: 'bg-slate-400',
};

export function DashboardPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dashboard/summary');
      setSummary(res.data.data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void fetchSummary();
    socket.on('task:created', refresh);
    socket.on('task:updated', refresh);
    socket.on('task:deleted', refresh);
    socket.on('project:updated', refresh);
    socket.on('project:deleted', refresh);
    return () => {
      socket.off('task:created', refresh);
      socket.off('task:updated', refresh);
      socket.off('task:deleted', refresh);
      socket.off('project:updated', refresh);
      socket.off('project:deleted', refresh);
    };
  }, [socket, fetchSummary]);

  const totalTasks = summary
    ? Object.values(summary.tasksByStatus).reduce((acc, val) => acc + val, 0)
    : 0;

  return (
    <AppShell
      title={`Welcome back, ${user?.name.split(' ')[0] || 'there'}`}
      subtitle="Live overview of project delivery, task workloads, and upcoming deadlines."
      breadcrumbs={[{ label: 'Workspace' }, { label: 'Dashboard' }]}
      actions={
        <Link to="/projects/new">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
          <LoadingSkeleton rows={4} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchSummary} />
      ) : summary ? (
        <div className="space-y-8">
          <section aria-label="Workspace metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Total Projects</p>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-slate-900">
                {summary.metrics.totalProjects}
              </p>
              <p className="mt-1 text-xs text-slate-500">Accessible workspace projects</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Active Projects</p>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-emerald-700">
                {summary.metrics.activeProjects}
              </p>
              <p className="mt-1 text-xs text-slate-500">Currently in active delivery</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">My Open Tasks</p>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-blue-700">
                {summary.metrics.myOpenTasks}
              </p>
              <p className="mt-1 text-xs text-slate-500">Assigned to you right now</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Overdue Tasks</p>
              <p
                className={`mt-2 font-display text-3xl font-semibold tabular-nums ${
                  summary.metrics.overdueTasks > 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {summary.metrics.overdueTasks}
              </p>
              <p className="mt-1 text-xs text-slate-500">Past due date across projects</p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tasks by Status
                </h2>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {totalTasks} total
                </span>
              </div>
              <div className="mt-5 space-y-3.5">
                {STATUS_ORDER.map((status) => {
                  const count = summary.tasksByStatus[status] || 0;
                  const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                  return (
                    <div key={status} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">{status}</span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${STATUS_BAR_COLOR[status]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Tasks by Priority
                </h2>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {totalTasks} total
                </span>
              </div>
              <div className="mt-5 space-y-3.5">
                {PRIORITY_ORDER.map((priority) => {
                  const count = summary.tasksByPriority[priority] || 0;
                  const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                  return (
                    <div key={priority} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">{priority}</span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${PRIORITY_BAR_COLOR[priority]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 bg-white lg:col-span-7 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  My Upcoming Due Tasks
                </h2>
                <Link
                  to="/my-tasks"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {summary.upcomingTasks.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No open tasks assigned"
                    description="You are caught up on your assigned tasks."
                    action={
                      <Link to="/tasks/new">
                        <Button size="sm" variant="secondary">
                          Create a task
                        </Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.upcomingTasks.map((task) => {
                    const overdue = isTaskOverdue(task.dueDate, task.status);
                    return (
                      <Link
                        key={task.id}
                        to={`/tasks/${task.id}`}
                        className="flex flex-col gap-2 px-6 py-3.5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{task.projectName}</span>
                            <span aria-hidden="true">·</span>
                            <TaskPriorityLabel priority={task.priority} />
                            <span aria-hidden="true">·</span>
                            <TaskStatusLabel status={task.status} />
                          </div>
                        </div>
                        <span
                          className={`font-mono text-xs tabular-nums whitespace-nowrap ${
                            overdue ? 'font-semibold text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {overdue ? 'Overdue · ' : ''}
                          {formatShortDate(task.dueDate)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white lg:col-span-5 overflow-hidden">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Recent Project Activity
                </h2>
              </div>
              {summary.recentActivity.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No recent activity recorded yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.recentActivity.map((item) => (
                    <Link
                      key={item.id}
                      to={`/tasks/${item.taskId}`}
                      className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <Avatar name={item.actorName} src={item.actorAvatar} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-700 leading-relaxed">
                          <span className="font-medium text-slate-900">{item.actorName}</span>{' '}
                          {item.details.toLowerCase()}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {item.taskTitle} ·{' '}
                          <span className="font-mono tabular-nums">{formatDateTime(item.createdAt)}</span>
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          {summary.teamSummary && (
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Team Workload Summary
                  </h2>
                  <p className="text-xs text-slate-500">
                    Visible to Managers and Administrators across active team members.
                  </p>
                </div>
                <Link
                  to="/team"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                >
                  Manage team <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="px-6 py-3">Member</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3 text-right">Open Tasks</th>
                      <th className="px-6 py-3 text-right">Completed</th>
                      <th className="px-6 py-3 text-right">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.teamSummary.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                            <div>
                              <p className="font-medium text-slate-900">{member.name}</p>
                              <p className="text-xs text-slate-500">{member.jobTitle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-600">{member.role}</td>
                        <td className="px-6 py-3 text-right font-mono text-xs tabular-nums text-slate-900">
                          {member.openTasks}
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-xs tabular-nums text-emerald-700">
                          {member.completedTasks}
                        </td>
                        <td
                          className={`px-6 py-3 text-right font-mono text-xs tabular-nums ${
                            member.overdueTasks > 0 ? 'font-semibold text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {member.overdueTasks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
