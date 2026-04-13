import { useState } from 'react';
import { setupAdmin } from '../services/monitoringApi';

export default function AdminSetup({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await setupAdmin({ email, username, password });
      onSuccess?.();
    } catch (err) {
      setError(err?.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-xl font-extrabold text-white">
            I
          </div>
          <div>
            <p className="font-bold text-slate-800">Inyatsi Construction</p>
            <p className="text-xs text-slate-500">Admin Setup</p>
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Set Admin Credentials</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure your admin account before accessing the dashboard.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800"
              autoComplete="email"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800"
              autoComplete="username"
              placeholder="admin"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800"
              autoComplete="new-password"
              minLength={4}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save credentials'}
          </button>
        </form>
      </div>
    </div>
  );
}
