import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { fetchFileServerStatus } from '../services/monitoringApi';
import { useIsAdmin } from '../hooks/useIsAdmin';

/**
 * Live storage status for signed-in users; admins get a Settings shortcut.
 */
export default function FileServerStatusBanner() {
  const { pathname } = useLocation();
  const onSettingsPage = pathname === '/system-settings';
  const { isAdmin, isAuthenticated } = useIsAdmin();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['file-server-status'],
    queryFn: fetchFileServerStatus,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (!isAuthenticated || !isAdmin) return null;

  const w = data?.webdav;
  const localFolder = data?.localFolder;
  const ra = data?.remoteAuth;
  const n = w?.folderCount ?? w?.folders?.length ?? 0;

  let line = 'Loading…';
  let tone = 'border-amber-200 bg-amber-50 text-amber-900';
  if (!isLoading && !isError && data) {
    const storageParts = [];
    if (w?.connected) {
      const host = w.url || w.endpoint || 'File server';
      storageParts.push(
        isAdmin
          ? `Files · ${host} · ${n} folder${n === 1 ? '' : 's'}`
          : `Files · ${host}${n ? ` · ${n} folder${n === 1 ? '' : 's'}` : ''}`,
      );
      tone = 'border-emerald-200 bg-emerald-50 text-emerald-900';
    } else if (w?.configured) {
      storageParts.push(`Files · not connected · ${w.error || 'Check Settings'}`);
      tone = 'border-amber-200 bg-amber-50 text-amber-900';
    } else {
      storageParts.push(`Files · local folder · ${localFolder || '—'}`);
      tone = 'border-slate-200 bg-white text-slate-700';
    }

    if (ra?.configured) {
      if (ra.reachable) {
        const detail =
          ra.service ||
          ra.statusText ||
          (ra.probe === '/api/test-root' && ra.exists === true
            ? 'departments root OK'
            : ra.probe || 'reachable');
        storageParts.push(
          `Remote bridge · ${detail}${isAdmin && data?.remoteAuthUrl ? ` · ${data.remoteAuthUrl}` : ra.host ? ` · ${ra.host}` : ''}`,
        );
        if (tone.includes('amber') && !w?.configured) tone = 'border-emerald-200 bg-emerald-50 text-emerald-900';
      } else if (!ra.reachable) {
        const errRaw = ra.error ? String(ra.error) : '';
        const errShort =
          /fetch failed/i.test(errRaw) && !/Details:/i.test(errRaw)
            ? 'check ngrok is running & EXTERNAL_AUTH_URL in backend .env'
            : errRaw.slice(0, 72) + (errRaw.length > 72 ? '…' : '');
        storageParts.push(
          `Remote login API · unreachable${errShort ? ` (${errShort})` : ''}`,
        );
        if (tone.includes('emerald')) tone = 'border-amber-200 bg-amber-50 text-amber-900';
      }
    }

    line = storageParts.join(' · ');
  }
  if (isError) {
    line = 'Storage status unavailable.';
    tone = 'border-red-200 bg-red-50 text-red-900';
  }

  return (
    <div className={`border-b px-3 py-2 text-xs sm:px-6 sm:text-sm lg:px-10 ${tone}`}>
      <div className="mx-auto flex max-w-none flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 font-medium leading-snug">{line}</p>
        {isAdmin && !onSettingsPage ? (
          <Link
            to="/system-settings"
            className="shrink-0 rounded-lg bg-[#0e5b45] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c4d3a] min-h-[40px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:py-1.5"
          >
            Settings
          </Link>
        ) : null}
      </div>
    </div>
  );
}
