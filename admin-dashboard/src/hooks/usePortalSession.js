import { useQuery } from '@tanstack/react-query';
import { fetchMeSession, getToken } from '../services/monitoringApi';

/**
 * Portal capabilities from Node (/api/me/session): aligns with users.json and JWT.
 */
export function usePortalSession() {
  return useQuery({
    queryKey: ['portal-session'],
    queryFn: fetchMeSession,
    enabled: Boolean(getToken()),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
