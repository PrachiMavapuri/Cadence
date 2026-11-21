import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name is too long'),
  email: z.string().trim().email('Enter a valid email address'),
  jobTitle: z.string().trim().max(80, 'Job title must be under 80 characters').optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const projectFormSchema = z.object({
  name: z.string().trim().min(3, 'Project name must be at least 3 characters').max(120),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  status: z.enum(['Planning', 'Active', 'On Hold', 'Completed', 'Archived']),
  startDate: z.string().min(1, 'Start date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  memberIds: z.array(z.string()),
}).refine((data) => new Date(data.dueDate) >= new Date(data.startDate), {
  message: 'Due date must be on or after the start date',
  path: ['dueDate'],
});

export const taskFormSchema = z.object({
  title: z.string().trim().min(3, 'Task title must be at least 3 characters').max(160),
  description: z.string().trim().max(4000),
  projectId: z.string().min(1, 'Please select a project'),
  assignedTo: z.string().nullable(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  status: z.enum(['Todo', 'In Progress', 'Review', 'Completed', 'Cancelled']),
  dueDate: z.string().nullable(),
  labelsText: z.string().optional(),
});

export const profileFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  jobTitle: z.string().trim().min(2, 'Job title must be at least 2 characters').max(80),
  avatarUrl: z.string().trim().max(500).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.newPassword && data.newPassword.length > 0) {
    if (!data.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current password is required to change your password',
        path: ['currentPassword'],
      });
    }
    if (data.newPassword.length < 8 || !/[A-Z]/.test(data.newPassword) || !/[0-9]/.test(data.newPassword)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password must be 8+ chars with an uppercase letter and a number',
        path: ['newPassword'],
      });
    }
  }
});

export function zodErrorsToMap(err) {
  const map = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'form';
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}
