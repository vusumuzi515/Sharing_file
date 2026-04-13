import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDepartmentFiles,
  fetchDepartments,
  fetchProjects,
  refreshFilesFromServerCache,
} from '../services/monitoringApi';
import { useAuthSync } from './useAuthSync';

/** Refetch file lists so web stays aligned with mobile / file server (short interval). */
const POLL_MS = 12_000;
const DEPT_POLL_MS = 45_000;

export function useDepartments(forceRefresh = false) {
  const { isAuthenticated } = useAuthSync();
  return useQuery({
    queryKey: ['departments', forceRefresh],
    queryFn: () => fetchDepartments(forceRefresh),
    select: (data) => data?.departments ?? [],
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated ? DEPT_POLL_MS : false,
    refetchOnWindowFocus: true,
  });
}

export function useFiles(departmentId, project = '', search = '') {
  const { isAuthenticated } = useAuthSync();
  const enabled = Boolean(departmentId) && isAuthenticated;
  return useQuery({
    queryKey: ['files', departmentId, project, search],
    queryFn: () => fetchDepartmentFiles(departmentId, search, project || undefined),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
    refetchOnWindowFocus: true,
    select: (data) => ({
      files: data?.files ?? [],
      department: data?.department,
      departmentId: data?.departmentId,
      folderPath: data?.folderPath,
      project: data?.project,
    }),
  });
}

export function useProjects(departmentId) {
  const { isAuthenticated } = useAuthSync();
  const enabled = Boolean(departmentId) && isAuthenticated;
  return useQuery({
    queryKey: ['projects', departmentId],
    queryFn: () => fetchProjects(departmentId),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
    refetchOnWindowFocus: true,
    select: (data) => data?.projects ?? [],
  });
}

export function useRefreshDepartments() {
  const queryClient = useQueryClient();
  return () =>
    refreshFilesFromServerCache()
      .then((res) => {
        queryClient.invalidateQueries({ queryKey: ['departments'] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['files'] });
        queryClient.invalidateQueries({ queryKey: ['portal-session'] });
        queryClient.invalidateQueries({ queryKey: ['file-server-status'] });
        return res;
      })
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: ['departments'] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['files'] });
      });
}

export function useInvalidateFiles() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };
}
