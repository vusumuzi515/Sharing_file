import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllFiles, fetchMonitoringStats, fetchUsers, getFilePreviewPageUrl } from '../services/monitoringApi';
import PageHeader from '../components/PageHeader';
import { useAuthSync } from '../hooks/useAuthSync';
import { useIsAdmin } from '../hooks/useIsAdmin';

const POLL_MS = 35_000;

function AllFilesDropdown({ files }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="divide-y divide-slate-100">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <span>{expanded ? 'Show less' : `View more — ${files.length} files in file server`}</span>
        <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <ul className="divide-y divide-slate-100">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {file.department} • {file.project ?? 'General'}
                  {file.uploadedAt ? ` • ${new Date(file.uploadedAt).toLocaleString()}` : ''}
                </p>
                {(file.uploadedByName || file.uploadedBy) && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    Uploaded by: {file.uploadedByName || file.uploadedBy}
                  </p>
                )}
              </div>
              <a
                href={getFilePreviewPageUrl(file)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
              >
                View
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RecentUploads() {
  const { isAuthenticated } = useAuthSync();
  const { isAdmin } = useIsAdmin();
  const [recent, setRecent] = useState([]);
  const [allFiles, setAllFiles] = useState([]);
  const [usersByEmployeeId, setUsersByEmployeeId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [stats, filesData, usersData] = await Promise.allSettled([
        fetchMonitoringStats(),
        fetchAllFiles(),
        fetchUsers(),
      ]);
      const statsVal = stats.status === 'fulfilled' ? stats.value : null;
      const filesVal = filesData.status === 'fulfilled' ? filesData.value : null;
      const usersVal = usersData.status === 'fulfilled' ? usersData.value : null;
      setRecent(statsVal?.recentUploads ?? []);
      setAllFiles(filesVal?.files ?? []);
      const byId = (usersVal?.users ?? []).reduce((acc, u) => {
        acc[u.employeeId] = u.name || u.employeeId;
        return acc;
      }, {});
      setUsersByEmployeeId(byId);
      const failed = [stats, filesData, usersData].filter((p) => p.status === 'rejected');
      if (failed.length > 0) {
        const err = failed[0].reason;
        const msg = err?.message || 'Could not load files.';
        if (msg.includes('Session expired') || msg.includes('Not authenticated')) {
          setError('Session expired. Please log in again.');
        } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
          setError('Cannot reach backend. Ensure the backend is running on port 3000.');
        } else if (failed.length === 3) {
          setError(msg);
        }
      } else {
        setError('');
      }
    } catch (err) {
      const msg = err?.message || 'Could not load files.';
      setError(msg.includes('Session expired') ? 'Session expired. Please log in again.' : msg);
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
        <PageHeader title="Recent Files Shared" />
        <div className="card rounded-2xl p-8 text-center text-slate-600">
          <p>
            <Link to="/site-files" className="font-semibold text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-700">
              Sign in
            </Link>{' '}
            to continue.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Recent Files Shared" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Recent Files Shared" />

      {error ? <p className="alert-error">{error}</p> : null}

      {recent.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Latest uploads</h3>
          <div className="card rounded-2xl">
            <ul className="divide-y divide-slate-100">
              {recent.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{usersByEmployeeId[item.employeeId] || item.employeeId}</span>
                    {usersByEmployeeId[item.employeeId] && (
                      <span className="text-slate-500"> ({item.employeeId})</span>
                    )}{' '}
                    uploaded <span className="font-medium">{item.fileName}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.department} • {item.project ?? 'General'} •{' '}
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          All files (from file server)
        </h3>
        <div className="card rounded-2xl">
          {allFiles.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">No files.</p>
          ) : (
            <AllFilesDropdown files={allFiles} />
          )}
        </div>
      </section>
    </div>
  );
}
