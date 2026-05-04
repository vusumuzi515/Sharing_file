import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminCredentials,
  updateAdminCredentials,
  getFileServerConnectionStatus,
  configureFileServerConnection,
  refreshDepartments,
  testFileServerConnection,
} from '../services/monitoringApi';
export default function SystemSettings() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');
  const [fileError, setFileError] = useState('');
  const [fileSuccess, setFileSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fsUrl, setFsUrl] = useState('');
  const [fsUser, setFsUser] = useState('');
  const [fsPass, setFsPass] = useState('');
  const [fsStatus, setFsStatus] = useState(null);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsSaving, setFsSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const reloadStatus = () => {
    setFsLoading(true);
    getFileServerConnectionStatus()
      .then((s) => {
        setFsStatus(s);
        if (s?.url) setFsUrl(s.url);
        if (s?.username) setFsUser(s.username);
      })
      .catch(() => setFsStatus({ configured: false, connected: false, folders: [], url: '', username: '' }))
      .finally(() => setFsLoading(false));
  };

  useEffect(() => {
    fetchAdminCredentials()
      .then((data) => {
        setEmail(data?.email || '');
        setUsername(data?.username || '');
      })
      .catch(() => setAdminError('Could not load credentials'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reloadStatus();
  }, []);

  const handleTestConnection = async (e) => {
    e.preventDefault();
    setFileError('');
    setFileSuccess('');
    setAdminError('');
    setAdminSuccess('');
    setTestResult(null);
    if (!fsUrl.trim() || !fsUser.trim()) {
      setFileError('Enter server URL and server username.');
      return;
    }
    if (!fsPass.trim() && !fsStatus?.hasActiveConnection) {
      setFileError('Enter password, or save a connection first to reuse the stored password.');
      return;
    }
    setTestLoading(true);
    try {
      const r = await testFileServerConnection({
        url: fsUrl.trim(),
        username: fsUser.trim(),
        password: fsPass.trim(),
      });
      setTestResult(r);
      setFileSuccess(`OK · ${r.folderCount ?? 0} folder(s) at root`);
    } catch (err) {
      setTestResult({ ok: false, error: err?.message });
      setFileError(err?.message || 'Test failed');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveFileServer = async (e) => {
    e.preventDefault();
    setFileError('');
    setFileSuccess('');
    setAdminError('');
    setAdminSuccess('');
    if (!fsUrl.trim() || !fsUser.trim()) {
      setFileError('Server URL and server username are required.');
      return;
    }
    if (!fsPass.trim() && !fsStatus?.hasActiveConnection) {
      setFileError('Password is required on first setup. After that, leave blank to keep the saved password.');
      return;
    }
    setFsSaving(true);
    try {
      await configureFileServerConnection({ url: fsUrl.trim(), username: fsUser.trim(), password: fsPass.trim() });
      setFileSuccess('Saved');
      setFsPass('');
      setTestResult(null);
      reloadStatus();
      await refreshDepartments();
      await queryClient.invalidateQueries();
      await queryClient.invalidateQueries({ queryKey: ['file-server-status'] });
    } catch (err) {
      setFileError(err?.message || 'Could not save');
    } finally {
      setFsSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    setFileError('');
    setFileSuccess('');
    if (!password.trim()) {
      setAdminError('Password is required');
      return;
    }
    setSaving(true);
    try {
      await updateAdminCredentials({ email, username, password });
      setAdminSuccess('Saved.');
      setPassword('');
    } catch (err) {
      setAdminError(err?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="sr-only">Settings</h1>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 sm:px-8">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">File server</h2>
          <p className="mt-0.5 text-sm text-slate-500">Windows file server bridge</p>
          {fsStatus?.inheritance?.usersInFileConfigNotInUsersJson?.length ? (
            <p className="mt-2 text-xs text-amber-900/90">
              Add to <span className="font-mono">users.json</span> for sign-in:{' '}
              {fsStatus?.inheritance?.usersInFileConfigNotInUsersJson?.join(', ')}
            </p>
          ) : null}
        </div>

        {fsLoading ? (
          <p className="px-6 py-8 text-sm text-slate-500 sm:px-8">Loading…</p>
        ) : (
          <div className="space-y-5 px-6 py-6 sm:px-8">
            {fileSuccess ? <div className="alert-success text-sm">{fileSuccess}</div> : null}
            {fileError ? <div className="alert-error text-sm">{fileError}</div> : null}

            {fsStatus?.connected && !fileSuccess ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-950">
                <span className="font-semibold">Connected</span>
                <span className="text-neutral-700">
                  {fsStatus.folders?.slice(0, 6).join(' · ') || '—'}
                  {fsStatus.folders?.length > 6 ? '…' : ''}
                </span>
              </div>
            ) : null}
            {fsStatus?.configured && !fsStatus?.connected && fsStatus?.error && !fileError ? (
              <div className="alert-error text-sm">{fsStatus.error}</div>
            ) : null}

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="block text-sm font-medium text-slate-800">Server URL</label>
                <input
                  type="text"
                  value={fsUrl}
                  onChange={(e) => setFsUrl(e.target.value)}
                  placeholder="http://server-ip:5200"
                  className="input mt-2 w-full max-w-xl"
                  autoComplete="url"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800">Bridge username</label>
                <input
                  type="text"
                  value={fsUser}
                  onChange={(e) => setFsUser(e.target.value)}
                  className="input mt-2 max-w-xl"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800">Password</label>
                <input
                  type="password"
                  value={fsPass}
                  onChange={(e) => setFsPass(e.target.value)}
                  placeholder={fsStatus?.hasActiveConnection ? 'Leave blank to keep saved' : 'Bridge password'}
                  className="input mt-2 max-w-xl"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={testLoading}
                  onClick={handleTestConnection}
                  className="btn btn-secondary min-h-[44px]"
                >
                  {testLoading ? 'Testing…' : 'Test'}
                </button>
                <button
                  type="button"
                  disabled={fsSaving}
                  onClick={handleSaveFileServer}
                  className="btn btn-primary min-h-[44px]"
                >
                  {fsSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>

            {testResult?.folders?.length > 0 ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">Root · </span>
                {testResult.folders.join(', ')}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 sm:px-8">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Portal account</h2>
          <p className="mt-0.5 text-sm text-slate-500">Dashboard administrator credentials</p>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-500 sm:px-8">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6 sm:px-8">
            {adminError ? <p className="alert-error">{adminError}</p> : null}
            {adminSuccess ? <p className="alert-success">{adminSuccess}</p> : null}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mt-1 max-w-md"
                autoComplete="email"
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
                className="input mt-1 max-w-md"
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1 max-w-md"
                autoComplete="new-password"
                minLength={4}
                placeholder="New password"
              />
            </div>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
