/**
 * Sticky bottom action bar for mobile — Upload & Refresh.
 * Min 48px touch targets for field workers.
 */
export default function BottomActionBar({ onUpload, onRefresh, uploading, refreshing, showUpload = true }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-4 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-sm sm:hidden"
      style={{ boxShadow: '0 -4px 6px -1px rgb(0 0 0 / 0.07)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {showUpload && (
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading}
          className="btn btn-primary flex min-h-[48px] min-w-[48px] flex-1 max-w-[160px] gap-2 shadow-md"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span>{uploading ? 'Uploading...' : 'Upload'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="btn btn-secondary flex min-h-[48px] min-w-[48px] gap-2"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
      </button>
    </div>
  );
}
