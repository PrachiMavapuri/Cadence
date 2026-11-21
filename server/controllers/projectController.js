import * as projectService from '../services/projectService.js';

export async function listProjects(req, res) {
  const query = res.locals.validatedQuery;
  const result = await projectService.listProjects(req.user, query);
  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getProject(req, res) {
  const project = await projectService.getProjectById(String(req.params.id), req.user);
  res.status(200).json({
    success: true,
    data: { project },
  });
}

export async function createProject(req, res) {
  const project = await projectService.createProject(req.user, req.body);
  res.status(201).json({
    success: true,
    message: 'Project created successfully.',
    data: { project },
  });
}

export async function updateProject(req, res) {
  const project = await projectService.updateProject(String(req.params.id), req.user, req.body);
  res.status(200).json({
    success: true,
    message: 'Project updated successfully.',
    data: { project },
  });
}

export async function addMember(req, res) {
  const project = await projectService.addProjectMember(String(req.params.id), req.body.userId, req.user);
  res.status(200).json({
    success: true,
    message: 'Member added to project.',
    data: { project },
  });
}

export async function removeMember(req, res) {
  const project = await projectService.removeProjectMember(
    String(req.params.id),
    String(req.params.userId),
    req.user
  );
  res.status(200).json({
    success: true,
    message: 'Member removed from project.',
    data: { project },
  });
}

export async function deleteProject(req, res) {
  await projectService.deleteProject(String(req.params.id), req.user);
  res.status(200).json({
    success: true,
    message: 'Project and related tasks deleted successfully.',
  });
}
