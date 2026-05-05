import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck, IconClipboard, IconFolder, IconUsers } from '../components/Icons';
import { fetchActivity, fetchDepartments, fetchMonitoringStats } from '../services/monitoringApi';

export default function FileSharingSystemPage() {
  const [stats, setStats] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([fetchMonitoringStats(), fetchDepartments(true), fetchActivity()])
      .then(([statsRes, departmentsRes, activityRes]) => {
        if (!mounted) return;
        setStats(statsRes || null);
        setDepartments(departmentsRes?.departments || []);
        setActivity(activityRes?.activity || []);
      })
      .catch(() => {
        if (!mounted) return;
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const accessibleCount = useMemo(
    () => departments.filter((department) => department.has_access !== false).length,
    [departments]
  );
  const recentFilesCount = useMemo(
    () => stats?.recentUploads?.length ?? 0,
    [stats]
  );
  const activityCount = useMemo(
    () => activity.length,
    [activity]
  );

  const summaryCards = useMemo(
    () => [
      {
        title: 'Departments',
        value: String(accessibleCount),
        Icon: IconFolder,
        tone: 'bg-blue-50 text-blue-700',
        to: '/site-files',
      },
      {
        title: 'Recent files',
        value: String(recentFilesCount),
        Icon: IconCheck,
        tone: 'bg-slate-100 text-zinc-900',
        to: '/recent',
      },
      {
        title: 'Activity',
        value: String(activityCount),
        Icon: IconClipboard,
        tone: 'bg-amber-50 text-amber-700',
        to: '/activity',
      },
      {
        title: 'Users',
        value: String(stats?.activeUsers ?? 0),
        Icon: IconUsers,
        tone: 'bg-slate-100 text-slate-700',
        to: '/users',
      },
    ],
    [accessibleCount, recentFilesCount, activityCount, stats]
  );

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const CardIcon = card.Icon;
          return (
            <Link
              key={card.title}
              to={card.to}
              className="card block cursor-pointer p-5 transition-all duration-200 hover:-translate-y-1 hover:border-zinc-950/25 hover:shadow-lg active:translate-y-0 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</p>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.tone}`}>
                  <CardIcon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold tabular-nums leading-tight text-slate-900">
                {loading ? '—' : card.value}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
