import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchActivity, fetchMonitoringStats } from '../services/monitoringApi';
import { IconFolder, IconCloudUpload, IconDocument, IconDashboard } from '../components/Icons';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchMonitoringStats(), fetchActivity()])
      .then(([statsData, activityData]) => {
        setStats(statsData);
        setActivity(activityData?.activity ?? []);
      })
      .catch(() => setError('Could not load dashboard data.'));
  }, []);

  const recentUploads = stats?.recentUploads ?? [];
  const summaryCards = useMemo(
    () => [
      {
        key: 'files',
        title: 'Files',
        value: String(stats?.totalFiles ?? 0),
        Icon: IconDocument,
        tone: 'text-blue-700 bg-blue-50',
        to: '/site-files',
      },
      {
        key: 'departments',
        title: 'Departments',
        value: String(stats?.totalDepartments ?? 0),
        Icon: IconFolder,
        tone: 'text-zinc-900 bg-slate-100',
        to: '/site-files',
      },
      {
        key: 'uploads',
        title: 'Recent uploads',
        value: String(recentUploads.length),
        Icon: IconCloudUpload,
        tone: 'text-amber-700 bg-amber-50',
        to: '/recent-uploads',
      },
      {
        key: 'activity',
        title: 'Activity',
        value: String(activity.length),
        Icon: IconDashboard,
        tone: 'text-slate-700 bg-slate-100',
        to: '/activity-logs',
      },
    ],
    [activity.length, recentUploads.length, stats?.totalDepartments, stats?.totalFiles]
  );

  return (
    <div className="space-y-6">
      {error ? <p className="alert-error">{error}</p> : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const CardIcon = card.Icon;
          return (
            <Link
              key={card.key}
              to={card.to}
              className="card block w-full rounded-2xl border border-slate-200/90 p-5 text-left transition-all hover:border-zinc-950/25 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.tone}`}>
                  <CardIcon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold tabular-nums leading-tight text-slate-900">{card.value}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
