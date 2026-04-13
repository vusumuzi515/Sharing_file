import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchActivity } from '../services/monitoringApi';
import PageHeader from '../components/PageHeader';
import { useAuthSync } from '../hooks/useAuthSync';
import { useIsAdmin } from '../hooks/useIsAdmin';

const POLL_MS = 30_000;

export default function ActivityLogs() {
  const { isAuthenticated } = useAuthSync();
  const { isAdmin } = useIsAdmin();
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await fetchActivity();
      setActivity(data?.activity ?? []);
      setError('');
    } catch {
      setError('Could not load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, load]);

  if (!isAuthenticated) {
    return (
      <div className="space-y-8">
        <PageHeader title="File Activity Logs" />
        <div className="card rounded-2xl p-8 text-center text-slate-600">
          <p>
            <Link to="/site-files" className="font-semibold text-[#0e5b45] underline">
              Sign in
            </Link>{' '}
            to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="File Activity Logs" />
      <div className="card rounded-2xl">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading activity logs...</p>
        ) : error ? (
          <div className="mx-5 my-4">
            <p className="alert-error">{error}</p>
          </div>
        ) : activity.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((entry) => {
              const who = entry.visitorName || entry.employeeId || 'Unknown user';
              const verb =
                entry.action === 'visited'
                  ? 'opened / downloaded'
                  : entry.action === 'updated'
                    ? 'replaced / updated'
                    : entry.action === 'uploaded'
                      ? 'uploaded'
                      : entry.action === 'deleted'
                        ? 'deleted'
                        : entry.action || 'acted on';
              const client =
                entry.client === 'mobile' ? 'Mobile app' : entry.client === 'web' ? 'Web portal' : 'Client';
              return (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{who}</span>{' '}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                      {verb}
                    </span>{' '}
                    <span className="font-medium">{entry.fileName}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.department ?? 'Unknown department'} • {entry.project ?? 'General'} • {client} •{' '}
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
