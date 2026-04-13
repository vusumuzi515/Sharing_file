import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { loginDashboard } from '../services/monitoringApi';
import { useIsAdmin } from '../hooks/useIsAdmin';
export default function AdminSignIn() {
  const { isAdmin, isAuthenticated } = useIsAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && isAdmin) {
    return <Navigate to="/system-settings" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter administrator username and password.');
      return;
    }
    setLoading(true);
    try {
      await loginDashboard({
        username: username.trim(),
        password,
        departmentId: 'admin',
      });
      await queryClient.invalidateQueries();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not sign in. Use the admin account from your server configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Administrator sign-in</h1>
        <p className="text-sm text-slate-500">Use your administrator account.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 rounded-2xl bg-white/82 p-6 shadow-sm backdrop-blur-md">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input w-full"
            autoComplete="username"
            placeholder="Administrator username"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input w-full"
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="text-sm text-amber-800">{error}</p> : null}
        <button type="submit" className="btn btn-primary w-full min-h-[48px]" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in as administrator'}
        </button>
      </form>
    </div>
  );
}
