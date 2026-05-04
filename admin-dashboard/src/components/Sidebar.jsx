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
import { INYATSI_BRAND } from '../brand';

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

  const { groupName, portalLabel, tagline, valuesPrimary, valuesSecondary, subsidiaries } = INYATSI_BRAND;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-[100dvh] w-72 min-h-0 flex-col border-r border-neutral-800 bg-neutral-950 text-neutral-100 shadow-xl
          transition-transform duration-200 ease-out lg:static lg:z-0 lg:h-full lg:max-h-[100dvh] lg:translate-x-0 lg:shadow-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-start gap-3 border-b border-neutral-800 px-5 py-6">
          <div className="flex h-11 w-11 shrink-0 rounded-xl border border-neutral-600 bg-neutral-900 p-px shadow-inner sm:h-12 sm:w-12">
            <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden rounded-[11px] bg-white">
              <img
                src="/splash-logo.png"
                alt=""
                className="absolute left-1/2 top-1/2 block grayscale"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: 'translate(-50%, -50%) scale(1.32)',
                }}
              />
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-snug text-white">{groupName}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{portalLabel}</p>
            <p className="tagline-serif mt-2 text-[11px] italic leading-snug text-neutral-400">{tagline}</p>
          </div>
        </div>

        <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-6">
          <ul className="space-y-1">
            {items.map(({ path, label, Icon, locked, requireAuth, adminOnly, adminEntry }) => {
              const isLocked = requireAuth && locked;
              if (isLocked) {
                return (
                  <li key={path}>
                    <div
                      className="flex min-h-[48px] cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-neutral-600 opacity-70"
                      title="Sign in: open Department and enter your credentials for your team"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{label}</span>
                      <IconLock className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden />
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
                            ? 'bg-neutral-100 text-neutral-950'
                            : 'bg-white text-neutral-950'
                          : adminEntry
                            ? 'border border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800'
                            : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" />
                    {label}
                    {adminOnly ? <span className="ml-auto text-[10px] font-semibold uppercase text-neutral-600">Admin</span> : null}
                    {adminEntry ? (
                      <span className="ml-auto text-[10px] font-bold uppercase text-neutral-500">Sign in</span>
                    ) : null}
                  </NavLink>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 border-t border-neutral-800 pt-5">
            <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Values</p>
            <div className="mt-2 flex flex-wrap gap-1.5 px-2">
              {valuesPrimary.map((v) => (
                <span
                  key={v}
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-neutral-200"
                >
                  {v}
                </span>
              ))}
            </div>
            <p className="mt-3 px-4 text-[10px] text-neutral-500">{valuesSecondary.join(' · ')}</p>
          </div>

          <div className="mt-6 border-t border-neutral-800 pt-5">
            <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Group companies</p>
            <ul className="no-scrollbar mt-2 max-h-[9.5rem] space-y-1 overflow-y-auto px-4 text-[11px] leading-snug text-neutral-500">
              {subsidiaries.map((name) => (
                <li key={name} className="truncate border-l border-neutral-800 pl-2">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="shrink-0 border-t border-neutral-800 px-3 py-4">
          <Link
            to="/"
            onClick={() => onClose?.()}
            className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
          >
            <IconArrowLeft className="h-5 w-5 shrink-0" />
            <span>Back to landing</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
