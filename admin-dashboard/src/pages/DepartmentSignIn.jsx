import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { fetchDepartmentsPublic, loginDashboard } from '../services/monitoringApi';
import { useAuthSync } from '../hooks/useAuthSync';

export default function DepartmentSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthSync();
  const [showForm, setShowForm] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentQuery, setDepartmentQuery] = useState('');
  const [deptResultsOpen, setDeptResultsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const normalizeSearchText = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .trim();


  const defaultDepartment = String(user?.departmentId || '').trim();
  const openedFromLanding = Boolean(location.state?.fromLanding);

  useEffect(() => {
    if (!showForm) return;
    setDepartmentsLoading(true);
    setDepartmentsError('');
    fetchDepartmentsPublic()
      .then((items) => {
        const mapped = (items || []).map((item) => ({
          id: String(item.id || '').trim(),
          label: String(item.label || item.department || item.id || '').trim(),
        }));
        setDepartments(mapped.filter((item) => item.id));
      })
      .catch((err) => {
        setDepartments([]);
        setDepartmentsError(err?.message || 'Could not load departments.');
      })
      .finally(() => setDepartmentsLoading(false));
  }, [showForm]);

  useEffect(() => {
    if (!showForm) return;
    if (departmentId) return;
    if (defaultDepartment) {
      setDepartmentId(defaultDepartment);
      return;
    }
    /* Do not auto-pick a department — user must type ≥3 characters and choose from matches. */
  }, [showForm, departmentId, defaultDepartment, departments]);

  const selectedDepartmentLabel = useMemo(() => {
    const match = departments.find((item) => item.id === departmentId);
    return match?.label || departmentId;
  }, [departments, departmentId]);
  const filteredDepartments = useMemo(() => {
    const q = departmentQuery.trim().toLowerCase();
    if (q.length < 3) return [];
    const nq = normalizeSearchText(q);
    return departments.filter((item) => {
      const id = String(item.id || '').toLowerCase();
      const label = String(item.label || '').toLowerCase();
      const nid = normalizeSearchText(id);
      const nlabel = normalizeSearchText(label);
      return id.includes(q) || label.includes(q) || nid.includes(nq) || nlabel.includes(nq);
    });
  }, [departmentQuery, departments]);

  if (isAuthenticated) {
    const dept = defaultDepartment || departmentId;
    const search = dept ? `?department=${encodeURIComponent(dept)}&project=` : '';
    return <Navigate to={`/site-files${search}`} replace />;
  }

  if (!openedFromLanding) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    if (!departmentId || !username.trim() || !password.trim()) {
      setAuthError('Select department, then enter username and password.');
      return;
    }
    setSubmitting(true);
    try {
      await loginDashboard({
        username: username.trim(),
        departmentId,
        password: password.trim(),
      });
      await queryClient.invalidateQueries();
      navigate(`/site-files?department=${encodeURIComponent(departmentId)}&project=`, { replace: true });
    } catch (err) {
      setAuthError(err?.message || 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepartmentQueryChange = (value) => {
    setDepartmentQuery(value);
    setDeptResultsOpen(value.trim().length >= 3);
    setAuthError('');
    const query = value.trim().toLowerCase();
    const exact = departments.find((item) => {
      const id = String(item.id || '').toLowerCase();
      const label = String(item.label || '').toLowerCase();
      return id === query || label === query;
    });
    setDepartmentId(exact?.id || '');
  };

  const pickDepartment = (item) => {
    setDepartmentId(item.id);
    setDepartmentQuery(item.label || item.id);
    setDeptResultsOpen(false);
  };

  return (
    <div className="relative min-h-[100dvh] bg-white">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-7xl grid-cols-1 px-4 py-8 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-10">
        <div
          className="hidden min-h-[76vh] rounded-3xl bg-[url('/dashboard-core-values-bg.png')] bg-left bg-cover bg-no-repeat lg:block"
          aria-hidden
        />

        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-xl backdrop-blur-sm sm:p-7 lg:ml-auto">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Domain Access</h1>

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn btn-primary mt-6 w-full min-h-[48px]"
            >
              Sign in
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="relative">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Department
                  </span>
                  <input
                    type="text"
                    value={departmentQuery}
                    onChange={(e) => handleDepartmentQueryChange(e.target.value)}
                    onFocus={() => {
                      if (departmentQuery.trim().length >= 3) setDeptResultsOpen(true);
                    }}
                    className="input w-full"
                    disabled={departmentsLoading || submitting}
                    placeholder="Type at least 3 letters"
                    autoComplete="off"
                  />
                </label>
                {deptResultsOpen && departmentQuery.trim().length >= 3 ? (
                  <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {departmentsLoading ? (
                      <p className="px-3 py-3 text-sm text-slate-500">Loading departments...</p>
                    ) : departmentsError ? (
                      <p className="px-3 py-3 text-sm text-amber-800">{departmentsError}</p>
                    ) : filteredDepartments.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-slate-500">No matching departments.</p>
                    ) : (
                      filteredDepartments.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => pickDepartment(item)}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {item.label || item.id}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
                {departmentQuery.trim().length > 0 && departmentQuery.trim().length < 3 ? (
                  <p className="mt-1 text-xs text-slate-500">Enter at least 3 letters to see departments.</p>
                ) : null}
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Username
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input w-full"
                  autoComplete="username"
                  disabled={submitting}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  autoComplete="current-password"
                  disabled={submitting}
                />
              </label>

              {selectedDepartmentLabel ? (
                <p className="text-xs text-slate-500">Signing into: {selectedDepartmentLabel}</p>
              ) : null}
              {departmentsError ? <p className="text-sm text-amber-800">{departmentsError}</p> : null}
              {authError ? <p className="text-sm text-amber-800">{authError}</p> : null}

              <button
                type="submit"
                className="btn btn-primary w-full min-h-[48px]"
                disabled={submitting || !departmentId || !username.trim() || !password.trim()}
              >
                {submitting ? 'Signing in...' : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
