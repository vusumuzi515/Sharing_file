import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clearToken } from '../services/monitoringApi';
import { useDepartment } from '../context/DepartmentContext';

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearDepartment } = useDepartment();

  return useCallback(() => {
    clearToken();
    clearDepartment();
    queryClient.clear();
    navigate({ pathname: '/site-files', search: '' }, { replace: true });
  }, [navigate, queryClient, clearDepartment]);
}
