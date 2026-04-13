import { useQuery } from '@tanstack/react-query';
import { fetchPathPermissions, getToken } from '../services/monitoringApi';

const ACL_PREFIX = import.meta.env.VITE_ACL_PATH_PREFIX || '';

/**
 * When VITE_DEPARTMENTS_API_URL points at the Python API and VITE_ACL_PATH_PREFIX is set
 * (e.g. \\\\fileserver\\share), merge NTFS effective permissions with portal session.
 */
function buildAclPath(folderPath) {
  if (!ACL_PREFIX || folderPath == null || folderPath === '') return null;
  const fp = String(folderPath)
    .replace(/^\/+/, '')
    .replace(/\//g, '\\');
  const base = ACL_PREFIX.replace(/\\+$/, '');
  return `${base}\\${fp}`;
}

export function usePathAcl(folderPath) {
  const fullPath = buildAclPath(folderPath);
  const usePythonAcl = Boolean(import.meta.env.VITE_DEPARTMENTS_API_URL && ACL_PREFIX);

  return useQuery({
    queryKey: ['path-acl', fullPath],
    queryFn: () => fetchPathPermissions(fullPath),
    enabled: Boolean(usePythonAcl && fullPath && getToken()),
    staleTime: 120_000,
  });
}
