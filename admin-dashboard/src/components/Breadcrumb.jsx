import { Link } from 'react-router-dom';

/**
 * Breadcrumb: Home > Department > [Department] > [Folder]
 */
export default function Breadcrumb({ departmentName, folderName, departmentId }) {
  const items = [
    { label: 'Home', to: '/' },
    { label: 'Department', to: '/site-files' },
  ];

  if (departmentName && departmentId) {
    items.push({
      label: departmentName,
      to: `/site-files?department=${encodeURIComponent(departmentId)}`,
    });
  }

  if (folderName) {
    items.push({
      label: folderName,
      to: null,
    });
  }

  return (
    <nav
      className="flex min-h-[44px] flex-wrap items-center gap-1.5 text-sm text-slate-600"
      aria-label="Breadcrumb"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-400">›</span>}
          {item.to ? (
            <Link
              to={item.to}
              className="transition-colors hover:text-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-1 rounded"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
