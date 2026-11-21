import * as userService from '../services/userService.js';

export async function listUsers(req, res) {
  const users = await userService.listUsers(req.user);
  res.status(200).json({
    success: true,
    data: { users },
  });
}

export async function updateRole(req, res) {
  const user = await userService.updateUserRole(String(req.params.id), req.body.role, req.user);
  res.status(200).json({
    success: true,
    message: 'User role updated.',
    data: { user },
  });
}

export async function updateStatus(req, res) {
  const user = await userService.updateUserStatus(String(req.params.id), req.body.isActive, req.user);
  res.status(200).json({
    success: true,
    message: user.isActive ? 'User account activated.' : 'User account deactivated.',
    data: { user },
  });
}
