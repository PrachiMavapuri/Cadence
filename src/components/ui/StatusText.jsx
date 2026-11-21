import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  XCircle,
} from 'lucide-react';

export function TaskStatusLabel({ status }) {
  switch (status) {
    case 'Completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Completed</span>
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>In Progress</span>
        </span>
      );
    case 'Review':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span>Review</span>
        </span>
      );
    case 'Cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Cancelled</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
          <Circle className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>Todo</span>
        </span>
      );
  }
}

export function TaskPriorityLabel({ priority }) {
  switch (priority) {
    case 'Critical':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Critical</span>
        </span>
      );
    case 'High':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
          <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          <span>High</span>
        </span>
      );
    case 'Medium':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 whitespace-nowrap">
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>Medium</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 whitespace-nowrap">
          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>Low</span>
        </span>
      );
  }
}

export function ProjectStatusLabel({ status }) {
  const colorMap = {
    Active: 'text-emerald-700',
    Planning: 'text-blue-700',
    'On Hold': 'text-amber-700',
    Completed: 'text-slate-700',
    Archived: 'text-slate-500',
  };
  return <span className={`text-xs font-medium whitespace-nowrap ${colorMap[status]}`}>{status}</span>;
}

export function isTaskOverdue(dueDate, status) {
  if (!dueDate || status === 'Completed' || status === 'Cancelled') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export function formatShortDate(dateStr) {
  if (!dateStr) return 'No due date';
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
