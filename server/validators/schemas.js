import { z } from 'zod';

export const ROLES = ['Admin', 'Manager', 'Member'];
export const PROJECT_STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Archived'];
export const TASK_STATUSES = ['Todo', 'In Progress', 'Review', 'Completed', 'Cancelled'];
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export const registerSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name must be under 80 characters'),
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
  jobTitle: z.string().trim().max(80, 'Job title must be under 80 characters').optional().default('Team Member'),
});

export const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required'),
});

export const oauthLoginSchema = z.object({
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  email: z.string().trim().toLowerCase().email('Valid email is required').optional(),
  name: z.string().trim().min(2, 'Name is required').max(80).optional(),
  avatarUrl: z.string().optional(),
  providerId: z.string().optional(),
}).refine(
  (data) => Boolean(data.idToken || data.accessToken || (data.email && data.name)),
  { message: 'OAuth token or verified profile payload is required' }
);

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  jobTitle: z.string().trim().min(2, 'Job title must be at least 2 characters').max(80).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'New password must include at least one uppercase letter')
    .regex(/[0-9]/, 'New password must include at least one number')
    .optional(),
}).refine(
  (data) => {
    if (data.newPassword && !data.currentPassword) return false;
    return true;
  },
  { message: 'Current password is required to set a new password', path: ['currentPassword'] }
);

export const createProjectSchema = z.object({
  name: z
    .string({ error: 'Project name is required' })
    .trim()
    .min(3, 'Project name must be at least 3 characters')
    .max(120, 'Project name must be under 120 characters'),
  description: z
    .string({ error: 'Description is required' })
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
  status: z.enum(PROJECT_STATUSES).optional().default('Active'),
  startDate: z.string().trim().min(1, 'Start date is required'),
  dueDate: z.string().trim().min(1, 'Due date is required'),
  memberIds: z.array(z.string().min(1)).optional().default([]),
}).refine(
  (data) => new Date(data.dueDate) >= new Date(data.startDate),
  { message: 'Due date must be on or after the start date', path: ['dueDate'] }
);

export const updateProjectSchema = z.object({
  name: z.string().trim().min(3, 'Project name must be at least 3 characters').max(120).optional(),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().min(1).optional(),
  memberIds: z.array(z.string().min(1)).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.dueDate) {
      return new Date(data.dueDate) >= new Date(data.startDate);
    }
    return true;
  },
  { message: 'Due date must be on or after the start date', path: ['dueDate'] }
);

export const projectMemberSchema = z.object({
  userId: z.string({ error: 'User ID is required' }).min(1, 'User ID is required'),
});

export const createTaskSchema = z.object({
  title: z
    .string({ error: 'Task title is required' })
    .trim()
    .min(3, 'Task title must be at least 3 characters')
    .max(160, 'Task title must be under 160 characters'),
  description: z
    .string()
    .trim()
    .max(4000, 'Description cannot exceed 4000 characters')
    .optional()
    .default(''),
  projectId: z.string({ error: 'Project is required' }).min(1, 'Project is required'),
  assignedTo: z.string().nullable().optional().default(null),
  priority: z.enum(TASK_PRIORITIES).optional().default('Medium'),
  status: z.enum(TASK_STATUSES).optional().default('Todo'),
  dueDate: z.string().nullable().optional().default(null),
  labels: z.array(z.string().trim().min(1).max(32)).max(8, 'Maximum 8 labels allowed').optional().default([]),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(3, 'Task title must be at least 3 characters').max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  assignedTo: z.string().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueDate: z.string().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES, { error: 'Status is required' }),
  orderIndex: z.number().int().min(0).optional(),
});

export const createCommentSchema = z.object({
  content: z
    .string({ error: 'Comment cannot be empty' })
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment cannot exceed 2000 characters'),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLES, { error: 'Valid role is required' }),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean({ error: 'isActive boolean is required' }),
});

export const idParamSchema = z.object({
  id: z.string().min(1, 'Resource ID is required'),
});

export const projectMemberParamSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  userId: z.string().min(1, 'User ID is required'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().optional().default(''),
  status: z.string().trim().optional().default(''),
  priority: z.string().trim().optional().default(''),
  projectId: z.string().trim().optional().default(''),
  assignedTo: z.string().trim().optional().default(''),
  overdue: z.enum(['true', 'false', '']).optional().default(''),
  sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'name', 'title', 'orderIndex']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
