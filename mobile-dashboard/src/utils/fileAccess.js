/**
 * File-level + portal session checks for mobile UI (aligned with backend enrichFilesWithRemoteAccess + delete guards).
 */

export function canOpenFile(file) {
  if (!file?.id) return false;
  if (file.has_access === false) return false;
  if (file.can_view === false) return false;
  const p = String(file.permission || '').toLowerCase();
  if (p === 'none') return false;
  return true;
}

/** Open / download: file allows read and portal allows download (if present). */
export function canOpenOrDownloadFile(file, session) {
  if (!canOpenFile(file)) return false;
  if (session?.capabilities && session.capabilities.download === false) return false;
  return true;
}

export function canDeleteFile(file, session) {
  if (!file?.id) return false;
  if (!session?.capabilities?.delete) return false;
  if (file.can_edit !== true) return false;
  const p = String(file.permission || '').toLowerCase();
  if (p === 'none' || p === 'view') return false;
  return true;
}
