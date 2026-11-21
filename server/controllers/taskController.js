import * as taskService from '../services/taskService.js';
import * as commentService from '../services/commentService.js';

export async function listTasks(req, res) {
  const query = res.locals.validatedQuery;
  const result = await taskService.listTasks(req.user, query);
  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getTask(req, res) {
  const task = await taskService.getTaskById(String(req.params.id), req.user);
  res.status(200).json({
    success: true,
    data: { task },
  });
}

export async function createTask(req, res) {
  const task = await taskService.createTask(req.user, req.body);
  res.status(201).json({
    success: true,
    message: 'Task created successfully.',
    data: { task },
  });
}

export async function updateTask(req, res) {
  const task = await taskService.updateTask(String(req.params.id), req.user, req.body);
  res.status(200).json({
    success: true,
    message: 'Task updated successfully.',
    data: { task },
  });
}

export async function updateTaskStatus(req, res) {
  const task = await taskService.updateTaskStatus(String(req.params.id), req.user, req.body);
  res.status(200).json({
    success: true,
    message: 'Task status updated.',
    data: { task },
  });
}

export async function deleteTask(req, res) {
  await taskService.deleteTask(String(req.params.id), req.user);
  res.status(200).json({
    success: true,
    message: 'Task deleted successfully.',
  });
}

export async function listComments(req, res) {
  const comments = await commentService.listTaskComments(String(req.params.id), req.user);
  res.status(200).json({
    success: true,
    data: { comments },
  });
}

export async function addComment(req, res) {
  const comment = await commentService.addTaskComment(String(req.params.id), req.user, req.body.content);
  res.status(201).json({
    success: true,
    message: 'Comment added.',
    data: { comment },
  });
}

export async function listActivity(req, res) {
  const activity = await commentService.listTaskActivity(String(req.params.id), req.user);
  res.status(200).json({
    success: true,
    data: { activity },
  });
}
