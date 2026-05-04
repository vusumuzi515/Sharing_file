import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  checkSetupStatus,
  getToken,
  loginDashboard,
  fetchDepartmentsPublic,
} from './services/monitoringApi';
import Layout from './components/Layout';
import { DepartmentProvider } from './context/DepartmentContext';
import FileSharingSystemPage from './pages/FileSharingSystemPage';
import FilePreview from './pages/FilePreview';
import SiteFiles from './pages/SiteFiles';
import ActivityLogs from './pages/ActivityLogs';
import RecentUploads from './pages/RecentUploads';
import SystemSettings from './pages/SystemSettings';
import UsersManagement from './pages/UsersManagement';
import AdminRoute from './components/AdminRoute';
import AdminSignIn from './pages/AdminSignIn';
import Landing from './pages/Landing';

export default function App() {
  const [configured, setConfigured] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    checkSetupStatus()
      .then(setConfigured)
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const fallback = setTimeout(() => {
      setConfigured((c) => (c === null ? false : c));
      setLoading(false);
    }, 8000);
    return () => clearTimeout(fallback);
  }, []);

  /* Optional dev auto-login — disabled by default so sign-out shows public departments */
  useEffect(() => {
    if (import.meta.env.VITE_AUTO_LOGIN_ADMIN !== 'true') return;
    if (!configured || getToken()) return;
    fetchDepartmentsPublic()
      .then((depts) => {
        const adminDept = depts.find((d) => d.id === 'admin') || depts[0];
        return loginDashboard({
          username: 'Inyatsi',
          password: 'Inyatsi',
          departmentId: adminDept?.id || 'admin',
        });
      })
      .catch(() => {});
  }, [configured]);

  if (loading) {
    return (
      <div className="portal-shell-bg flex h-[100dvh] min-h-0 items-center justify-center">
        <p className="rounded-xl border border-neutral-300 bg-white px-6 py-3 text-sm font-medium text-neutral-700 shadow-sm">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <DepartmentProvider>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/" element={<Layout />}>
        <Route path="dashboard" element={<FileSharingSystemPage />} />
        <Route path="admin-sign-in" element={<AdminSignIn />} />
        <Route path="file-preview" element={<FilePreview />} />
        <Route path="site-files" element={<SiteFiles />} />
        <Route path="recent-uploads" element={<RecentUploads />} />
        <Route path="recent" element={<RecentUploads />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
        <Route path="activity" element={<ActivityLogs />} />
        <Route
          path="system-settings"
          element={
            <AdminRoute>
              <SystemSettings />
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
    </DepartmentProvider>
  );
}
