import { useAuthSync } from './useAuthSync';

export function useIsAdmin() {
  const { user, isAuthenticated } = useAuthSync();
  const isAdmin =
    isAuthenticated &&
    (user?.isAdmin === true || String(user?.departmentId || '').toLowerCase() === 'admin');
  return { isAdmin, isAuthenticated, user };
}
