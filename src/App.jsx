import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ProtectedRoute } from './components/auth/ProtectedRoute.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { MyTasksPage } from './pages/MyTasksPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { ProjectDetailPage } from './pages/ProjectDetailPage.jsx';
import { ProjectFormPage } from './pages/ProjectFormPage.jsx';
import { ProjectsPage } from './pages/ProjectsPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { TaskDetailPage } from './pages/TaskDetailPage.jsx';
import { TaskFormPage } from './pages/TaskFormPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/projects"
                  element={
                    <ProtectedRoute>
                      <ProjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/new"
                  element={
                    <ProtectedRoute>
                      <ProjectFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:id"
                  element={
                    <ProtectedRoute>
                      <ProjectDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:id/edit"
                  element={
                    <ProtectedRoute>
                      <ProjectFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tasks/new"
                  element={
                    <ProtectedRoute>
                      <TaskFormPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tasks/:id"
                  element={
                    <ProtectedRoute>
                      <TaskDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tasks/:id/edit"
                  element={
                    <ProtectedRoute>
                      <TaskFormPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/my-tasks"
                  element={
                    <ProtectedRoute>
                      <MyTasksPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/team"
                  element={
                    <ProtectedRoute allowedRoles={['Admin', 'Manager']}>
                      <TeamPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
