import { Link, useLocation } from 'react-router-dom';
import { useAuthSync } from '../hooks/useAuthSync';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useSignOut } from '../hooks/useSignOut';
import { INYATSI_BRAND } from '../brand';

export default function TopBar({ onMenuClick, pageTitle }) {
  const { pathname } = useLocation();
  const onSettingsPage = pathname === '/system-settings';
  const { user, isAuthenticated } = useAuthSync();
  const { isAdmin } = useIsAdmin();
  const signOut = useSignOut();
  const displayName = user?.name || user?.employeeId || '';

  return (
    <header className="relative z-20 border-b border-neutral-800 bg-neutral-950 text-white shadow-sm">
      <div className="mx-auto flex min-h-[56px] w-full max-w-none flex-wrap items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 lg:min-h-[64px] lg:px-10">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-white/90 hover:bg-white/10 lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
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
              <h1 className="truncate text-base font-semibold tracking-[0.06em] text-white sm:text-lg lg:text-xl">
                INYATSI
              </h1>
              <p className="truncate text-xs text-neutral-400 sm:text-sm lg:text-[15px]">{pageTitle || INYATSI_BRAND.portalLabel}</p>
            </div>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {isAuthenticated && displayName ? (
            <span
              className="hidden max-w-[140px] truncate text-xs text-neutral-400 sm:max-w-[200px] md:inline"
              title={displayName}
            >
              {displayName}
            </span>
          ) : null}
          {isAdmin && !onSettingsPage ? (
            <Link
              to="/system-settings"
              className="inline-flex min-h-[40px] items-center rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 sm:text-sm"
            >
              Settings
            </Link>
          ) : null}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={signOut}
              className="min-h-[40px] min-w-[44px] rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              Log out
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
