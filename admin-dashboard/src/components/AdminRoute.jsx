import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '../hooks/useIsAdmin';

export default function AdminRoute({ children }) {
  const { isAdmin, isAuthenticated } = useIsAdmin();
  if (!isAuthenticated) return <Navigate to="/site-files" replace />;
  if (!isAdmin) return <Navigate to="/site-files" replace />;
  return children;
}
