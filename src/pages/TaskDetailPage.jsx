import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { History, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { api, parseApiError } from '../lib/api';
import { AppShell } from '../components/layout/AppShell';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/Modal';
import { ErrorState, LoadingSkeleton } from '../components/ui/StateViews';
import {
  formatDateTime,
  formatShortDate,
  isTaskOverdue,
  TaskPriorityLabel,
  TaskStatusLabel,
} from '../components/ui/StatusText';

const STATUSES = ['Todo', 'In Progress', 'Review', 'Completed', 'Cancelled'];

export function TaskDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [project, setProject] = useState(null);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadTaskDetails = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [taskRes, commentsRes, activityRes] = await Promise.all([
        api.get(`/tasks/${id}`),
        api.get(`/tasks/${id}/comments`),
        api.get(`/tasks/${id}/activity`),
      ]);
      const loadedTask = taskRes.data.data.task;
      setTask(loadedTask);
      setComments(commentsRes.data.data.comments);
      setActivity(activityRes.data.data.activity);

      const projRes = await api.get(`/projects/${loadedTask.projectId}`);
      setProject(projRes.data.data.project);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void loadTaskDetails();
  }, [loadTaskDetails]);

  useEffect(() => {
    if (!socket || !id) return;
    const onUpdate = (payload) => {
      if (payload?.id === id || payload?.taskId === id) {
        void loadTaskDetails();
      }
    };
    socket.on('task:updated', onUpdate);
    socket.on('comment:created', onUpdate);
    return () => {
      socket.off('task:updated', onUpdate);
      socket.off('comment:created', onUpdate);
    };
  }, [socket, id, loadTaskDetails]);

  const handleStatusChange = async (nextStatus) => {
    if (!task) return;
    try {
      const res = await api.patch(`/tasks/${task.id}/status`, { status: nextStatus });
      setTask(res.data.data.task);
      const actRes = await api.get(`/tasks/${task.id}/activity`);
      setActivity(actRes.data.data.activity);
      toast.success(`Status updated to ${nextStatus}`);
    } catch (err) {
      toast.error('Status update failed', parseApiError(err).message);
    }
  };

  const handleReassign = async (nextAssigneeId) => {
    if (!task) return;
    try {
      const res = await api.put(`/tasks/${task.id}`, {
        assignedTo: nextAssigneeId || null,
      });
      setTask(res.data.data.task);
      const actRes = await api.get(`/tasks/${task.id}/activity`);
      setActivity(actRes.data.data.activity);
      toast.success('Assignee updated');
    } catch (err) {
      toast.error('Reassignment failed', parseApiError(err).message);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!task) return;
    if (!commentText.trim()) {
      setCommentError('Please write a comment before posting.');
      return;
    }
    setCommentError('');
    setPostingComment(true);
    try {
      await api.post(`/tasks/${task.id}/comments`, { content: commentText.trim() });
      setCommentText('');
      const [cRes, aRes] = await Promise.all([
        api.get(`/tasks/${task.id}/comments`),
        api.get(`/tasks/${task.id}/activity`),
      ]);
      setComments(cRes.data.data.comments);
      setActivity(aRes.data.data.activity);
      toast.success('Comment posted');
    } catch (err) {
      setCommentError(parseApiError(err).message);
    } finally {
      setPostingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success('Task deleted');
      navigate(`/projects/${task.projectId}`, { replace: true });
    } catch (err) {
      toast.error('Unable to delete task', parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  };

  const canEditTask =
    task &&
    (user?.role === 'Admin' ||
      user?.role === 'Manager' ||
      task.assignedTo === user?.id ||
      task.createdBy === user?.id);

  const canDeleteTask =
    task && (user?.role === 'Admin' || user?.role === 'Manager' || task.createdBy === user?.id);

  const canReassign = user?.role === 'Admin' || user?.role === 'Manager';

  return (
    <AppShell
      title={task?.title || 'Task Details'}
      breadcrumbs={[
        { label: 'Workspace', to: '/dashboard' },
        { label: task?.projectName || 'Project', to: task ? `/projects/${task.projectId}` : '/projects' },
        { label: 'Task' },
      ]}
      actions={
        task && (
          <div className="flex items-center gap-2">
            {canEditTask && (
              <Link to={`/tasks/${task.id}/edit`}>
                <Button variant="secondary" size="sm">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </Link>
            )}
            {canDeleteTask && (
              <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        )
      }
    >
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadTaskDetails} />
      ) : task ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Main Column: Description & Comments */}
          <div className="space-y-6 lg:col-span-8">
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <TaskStatusLabel status={task.status} />
                <span aria-hidden="true">·</span>
                <TaskPriorityLabel priority={task.priority} />
                <span aria-hidden="true">·</span>
                <span>Created by {task.creatorName}</span>
                {task.labels.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-600">{task.labels.join(' / ')}</span>
                  </>
                )}
              </div>

              <h2 className="mt-5 font-display text-sm font-semibold text-slate-900">
                Description
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {task.description || 'No description provided yet.'}
              </p>
            </section>

            {/* Comments Thread */}
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Discussion ({comments.length})
                </h2>
              </div>

              <div className="divide-y divide-slate-100">
                {comments.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-slate-500">
                    No comments yet. Start the discussion below.
                  </p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 px-6 py-4">
                      <Avatar name={c.authorName} src={c.authorAvatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-900">{c.authorName}</span>
                          <span className="text-slate-400">{c.authorRole}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums text-slate-400">
                            {formatDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-6">
                <label htmlFor="comment-box" className="sr-only">
                  Add a comment
                </label>
                <textarea
                  id="comment-box"
                  rows={3}
                  placeholder="Write an update or question for the team..."
                  value={commentText}
                  onChange={(e) => {
                    setCommentText(e.target.value);
                    setCommentError('');
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
                {commentError && (
                  <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
                    {commentError}
                  </p>
                )}
                <div className="mt-3 flex justify-end">
                  <Button type="submit" size="sm" loading={postingComment}>
                    <Send className="h-3.5 w-3.5" />
                    Post Comment
                  </Button>
                </div>
              </form>
            </section>
          </div>

          {/* Right Sidebar: Controls & Immutable Activity History */}
          <div className="space-y-6 lg:col-span-4">
            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Workflow Controls
              </h2>

              <div className="space-y-1.5">
                <label htmlFor="task-status-select" className="block text-xs font-medium text-slate-500">
                  Status
                </label>
                <select
                  id="task-status-select"
                  disabled={!canEditTask}
                  value={task.status}
                  onChange={(e) => void handleStatusChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  Requires assignee & 10+ char description to mark Completed.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="task-assignee-select" className="block text-xs font-medium text-slate-500">
                  Assignee
                </label>
                {canReassign && project ? (
                  <select
                    id="task-assignee-select"
                    value={task.assignedTo || ''}
                    onChange={(e) => void handleReassign(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">Unassigned</option>
                    {project.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {task.assigneeName ? (
                      <>
                        <Avatar name={task.assigneeName} src={task.assigneeAvatar} size="xs" />
                        <span>{task.assigneeName}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Due Date</span>
                  <span
                    className={`font-mono tabular-nums ${
                      isTaskOverdue(task.dueDate, task.status)
                        ? 'font-semibold text-red-600'
                        : 'text-slate-800'
                    }`}
                  >
                    {formatShortDate(task.dueDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Updated</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    {formatDateTime(task.updatedAt)}
                  </span>
                </div>
              </div>
            </section>

            {/* Immutable Activity Log */}
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
                <History className="h-4 w-4 text-slate-500" />
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Activity History
                </h2>
              </div>
              <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {activity.length === 0 ? (
                  <p className="p-5 text-xs text-slate-500">No activity recorded.</p>
                ) : (
                  activity.map((item) => (
                    <div key={item.id} className="px-5 py-3 text-xs">
                      <p className="text-slate-800">
                        <span className="font-medium text-slate-900">{item.actorName}</span>{' '}
                        {item.details.toLowerCase()}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteModalOpen}
        onClose={() => !deleting && setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Task"
        description={`Are you sure you want to delete "${task?.title}"? All comments and activity logs for this task will also be removed.`}
        confirmLabel="Delete Task"
      />
    </AppShell>
  );
}
