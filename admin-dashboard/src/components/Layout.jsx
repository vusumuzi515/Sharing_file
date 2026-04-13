import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import FileServerStatusBanner from './FileServerStatusBanner';
import { useAuthSync } from '../hooks/useAuthSync';
import { useIsAdmin } from '../hooks/useIsAdmin';

const pageTitles = {
  '/': 'Home',
  '/dashboard': 'Dashboard',
  '/admin-sign-in': 'Administrator',
  '/site-files': 'Department',
  '/recent-uploads': 'Recent',
  '/users': 'Users',
  '/activity-logs': 'Activity',
  '/system-settings': 'Settings',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuthSync();
  const { isAdmin } = useIsAdmin();
  const path = location.pathname;
  const baseTitle = pageTitles[path] ?? path.slice(1).replace(/-/g, ' ');
  const pageTitle =
    path === '/users' && !isAdmin && user?.department ? user.department : baseTitle;

  return (
    <div className="portal-shell-bg flex h-[100dvh] min-h-0 w-full overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        <div className="shrink-0">
          <TopBar onMenuClick={() => setSidebarOpen(true)} pageTitle={pageTitle} />
          <FileServerStatusBanner />
        </div>
        <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:pt-8 sm:pb-8">
          <div className="w-full max-w-none px-3 sm:px-6 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
