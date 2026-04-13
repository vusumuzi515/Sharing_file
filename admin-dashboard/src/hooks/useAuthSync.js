import { useEffect, useState } from 'react';
import { getCurrentUser, getToken } from '../services/monitoringApi';

const AUTH_CHANGED = 'inyatsi-auth-changed';

/**
 * Re-renders when auth storage changes (login / sign-out).
 */
export function useAuthSync() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(AUTH_CHANGED, bump);
    return () => window.removeEventListener(AUTH_CHANGED, bump);
  }, []);

  return {
    isAuthenticated: Boolean(getToken()),
    user: getCurrentUser(),
    token: getToken(),
  };
}
