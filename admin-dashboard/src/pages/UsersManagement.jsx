import { useCallback, useEffect, useState } from 'react';
import { fetchUsers } from '../services/monitoringApi';
import PageHeader from '../components/PageHeader';
import { useAuthSync } from '../hooks/useAuthSync';
import { useIsAdmin } from '../hooks/useIsAdmin';

const POLL_MS = 55_000;

export default function UsersManagement() {
  const { isAuthenticated, user } = useAuthSync();
  const { isAdmin } = useIsAdmin();
  const [users, setUsers] = useState([]);
  /** From GET /api/users?grouped=1 — one entry per department (scoped to viewer). */
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await fetchUsers({ grouped: true });
      setUsers(response?.users ?? []);
      setGroups(Array.isArray(response?.groups) ? response.groups : []);
      setError('');
    } catch (err) {
      setError(err?.message ?? 'Could not load users from backend.');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadUsers();
    const id = window.setInterval(loadUsers, POLL_MS);
    return () => window.clearInterval(id);
  }, [isAuthenticated, loadUsers]);

  const pageTitle = isAdmin ? 'Users' : user?.department || 'Users';

  if (!isAuthenticated) {
    return (
      <div className="space-y-8">
        <PageHeader title="Users" />
        <div className="card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto p-6">
            <p className="text-center text-sm text-slate-500">No users to display.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title={pageTitle} />
      {error ? <p className="alert-error">{error}</p> : null}

      {groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.departmentId} className="card overflow-hidden rounded-2xl">
              {isAdmin ? (
                <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-3 sm:px-8">
                  <h2 className="text-base font-semibold text-slate-900">{g.label}</h2>
                  <p className="text-xs text-slate-500">{g.users?.length ?? 0} team member(s)</p>
                </div>
              ) : null}
              <div className="overflow-x-auto p-6">
                <table className={`w-full ${isAdmin ? 'min-w-[420px]' : 'min-w-[360px]'}`}>
                  <thead>
                    <tr>
                      <th className="table-header px-6 py-4">Employee ID</th>
                      <th className="table-header px-6 py-4">Name</th>
                      <th className="table-header px-6 py-4">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(g.users || []).map((u) => (
                      <tr key={u.employeeId} className="border-b border-slate-100 last:border-0">
                        <td className="table-cell px-6 font-medium text-slate-800">{u.employeeId}</td>
                        <td className="table-cell px-6">{u.name || '—'}</td>
                        <td className="table-cell px-6">{u.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto p-6">
            {users.length === 0 ? (
              <p className="text-center text-sm text-slate-500">No users in this department yet.</p>
            ) : (
              <table className={`w-full ${isAdmin ? 'min-w-[520px]' : 'min-w-[360px]'}`}>
                <thead>
                  <tr>
                    <th className="table-header px-6 py-4">Employee ID</th>
                    <th className="table-header px-6 py-4">Name</th>
                    {isAdmin ? <th className="table-header px-6 py-4">Department</th> : null}
                    <th className="table-header px-6 py-4">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.employeeId} className="border-b border-slate-100 last:border-0">
                      <td className="table-cell px-6 font-medium text-slate-800">{u.employeeId}</td>
                      <td className="table-cell px-6">{u.name || '—'}</td>
                      {isAdmin ? <td className="table-cell px-6">{u.department}</td> : null}
                      <td className="table-cell px-6">{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
