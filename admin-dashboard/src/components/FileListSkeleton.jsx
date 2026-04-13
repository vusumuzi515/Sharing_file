/** Skeleton loader for file/folder lists */
export function FileListSkeleton({ rows = 5 }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for department cards */
export function DepartmentCardsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-200/80 bg-slate-100 p-6 shadow-sm">
          <div className="mx-auto mb-2 h-12 w-12 rounded-lg bg-slate-200" />
          <div className="mx-auto h-4 w-24 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
