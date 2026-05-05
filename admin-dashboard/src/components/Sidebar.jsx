import { NavLink, Link } from 'react-router-dom';
import {
  IconFolder,
  IconUsers,
  IconClipboard,
  IconGear,
  IconCloudUpload,
  IconHome,
  IconLock,
  IconPermission,
  IconArrowLeft,
} from './Icons';
import { useAuthSync } from '../hooks/useAuthSync';
import { useIsAdmin } from '../hooks/useIsAdmin';

const baseMenu = [
  { path: '/dashboard', label: 'File Portal', Icon: IconHome, requireAuth: false },
  { path: '/admin-sign-in', label: 'Administrator', Icon: IconPermission, requireAuth: false, adminEntry: true },
  { path: '/site-files', label: 'Department', Icon: IconFolder, requireAuth: false },
];

const teamMenu = [
  { path: '/recent-uploads', label: 'Recent', Icon: IconCloudUpload, requireAuth: true },
  { path: '/users', label: 'Users', Icon: IconUsers, requireAuth: true },
  { path: '/activity-logs', label: 'Activity', Icon: IconClipboard, requireAuth: true },
];

const adminMenu = [{ path: '/system-settings', label: 'Settings', Icon: IconGear, requireAuth: true, adminOnly: true }];

export default function Sidebar({ isOpen, onClose }) {
  const { isAuthenticated } = useAuthSync();
  const { isAdmin } = useIsAdmin();

  const items = [
    ...baseMenu,
    ...teamMenu.map((item) => ({ ...item, locked: !isAuthenticated })),
    ...(isAuthenticated && isAdmin ? adminMenu : []),
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-[100dvh] w-64 min-h-0 flex-col border-r border-white/10 bg-[#0a0d12] text-zinc-300 shadow-2xl shadow-black/50
          transition-transform duration-200 ease-out lg:static lg:z-0 lg:h-full lg:max-h-[100dvh] lg:translate-x-0 lg:shadow-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
          <div className="flex h-11 w-11 shrink-0 rounded-full border border-white/15 bg-white p-0.5 shadow-inner sm:h-12 sm:w-12">
            <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden rounded-full bg-white">
              <img
                src="/splash-logo.png"
                alt=""
                className="absolute left-1/2 top-1/2 block"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: 'translate(-50%, -50%) scale(1.28)',
                }}
              />
            </div>
          </div>
          <div>
            <p className="font-semibold tracking-wide text-white">Inyatsi</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">File Portal</p>
          </div>
        </div>

        <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-8">
          <ul className="space-y-1">
            {items.map(({ path, label, Icon, locked, requireAuth, adminOnly, adminEntry }) => {
              const isLocked = requireAuth && locked;
              if (isLocked) {
                return (
                  <li key={path}>
                    <div
                      className="flex min-h-[48px] cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-zinc-600 opacity-70"
                      title="Sign in: open Department and enter your credentials for your team"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{label}</span>
                      <IconLock className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                    </div>
                  </li>
                );
              }
              return (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === '/dashboard'}
                    onClick={() => onClose?.()}
                    className={({ isActive }) =>
                      `flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? adminEntry
                            ? 'bg-amber-600 text-white shadow-md shadow-black/30'
                            : 'bg-white text-zinc-950 shadow-md shadow-black/25'
                          : adminEntry
                            ? 'border border-amber-500/35 bg-amber-950/40 text-amber-100 hover:bg-amber-950/55'
                            : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" />
                    {label}
                    {adminOnly ? (
                      <span className="ml-auto text-[10px] font-semibold uppercase text-zinc-600">Admin</span>
                    ) : null}
                    {adminEntry ? (
                      <span className="ml-auto text-[10px] font-bold uppercase text-amber-200/90">Sign in</span>
                    ) : null}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/10 px-3 py-4">
          <Link
            to="/"
            onClick={() => onClose?.()}
            className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <IconArrowLeft className="h-5 w-5 shrink-0" />
            <span>Back to landing</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
