import { Navigate, useParams } from 'react-router-dom';
import { getCurrentUser, getToken } from '../services/monitoringApi';
import { useToast } from '../context/ToastContext';

function canUserAccessDepartment(userDeptId, routeDeptId) {
  if (!userDeptId || userDeptId === 'admin') return true;
  return (
    userDeptId === routeDeptId ||
    routeDeptId.startsWith(userDeptId) ||
    userDeptId.startsWith(routeDeptId) ||
    routeDeptId.includes(userDeptId) ||
    userDeptId.includes(routeDeptId)
  );
}

/**
 * Protects routes: user must have access to the department (team sharing within dept, admin sees all)
 */
export default function ProtectedRoute({ children, requireDepartmentMatch = false }) {
  const token = getToken();
  const user = getCurrentUser();
  const params = useParams();
  const { showToast } = useToast();

  if (!token) return <Navigate to="/" replace />;

  if (requireDepartmentMatch && params.departmentId) {
    const routeDeptId = String(params.departmentId || '').trim().toLowerCase();
    const userDeptId = String(user?.departmentId || '').trim().toLowerCase();
    if (userDeptId && routeDeptId && !canUserAccessDepartment(userDeptId, routeDeptId)) {
      showToast('Permission Denied. You do not have access to this department.');
      return <Navigate to="/site-files" replace />;
    }
  }

  return children;
}
