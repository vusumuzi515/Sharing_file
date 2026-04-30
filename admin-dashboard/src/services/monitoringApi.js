/**
 * Node portal API base. Empty = same origin as the admin app (recommended in dev: Vite proxies
 * `/api` → http://localhost:3000 per vite.config.js). Set `VITE_BACKEND_API_URL` only when the API
 * is on another host (production or remote Node). Do not use the Windows bridge port (5200) here.
 */
const BASE_URL = String(import.meta.env.VITE_BACKEND_API_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const DEPARTMENTS_API_URL = import.meta.env.VITE_DEPARTMENTS_API_URL || '';
const DEPARTMENTS_API_KEY = import.meta.env.VITE_DEPARTMENTS_API_KEY || '';
/** Sent to Node portal API for audit logs (upload / visit / delete source). */
const PORTAL_CLIENT_HEADER = { 'X-Portal-Client': 'inyatsi-web' };
const USER_KEY = 'inyatsi-auth-user';
const AUTH_CHANGED = 'inyatsi-auth-changed';

/**
 * ngrok free tier returns an interstitial for browser requests without this header, which breaks
 * JSON and auth. Set VITE_NGROK_SKIP_BROWSER_WARNING=0 to disable. Value forwarded by Node to
 * EXTERNAL_AUTH_URL — keep backend NGROK_SKIP_BROWSER_WARNING in sync when using a tunnel.
 * @see https://ngrok.com/docs/http/request-headers#skip-browser-warning
 */
function getNgrokHeaders() {
  const v = import.meta.env.VITE_NGROK_SKIP_BROWSER_WARNING;
  if (v === '0' || String(v).toLowerCase() === 'false') return {};
  return { 'ngrok-skip-browser-warning': String(v || '1') };
}

function departmentsAuthHeaders(token) {
  return {
    ...getNgrokHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(DEPARTMENTS_API_KEY
      ? { 'x-api-key': DEPARTMENTS_API_KEY, 'x-external-dashboard-key': DEPARTMENTS_API_KEY }
      : {}),
  };
}

function decodeJwtPayload(token) {
  try {
    const t = String(token || '');
    const parts = t.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getRemoteQueryCandidatesFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') {
    return { usernames: [], orgIds: [] };
  }

  const usernames = [
    payload.username,
    payload.employeeId,
    payload.preferred_username,
    payload.name,
    payload.sub,
  ]
    .map((x) => (x == null ? '' : String(x)).trim())
    .filter(Boolean);

  const orgIds = [
    payload.orgId,
    payload.organizationId,
    payload.organization_id,
    payload.org_id,
    payload.x_org_id,
  ]
    .map((x) => (x == null ? '' : String(x)).trim())
    .filter(Boolean);

  // de-dupe (case-insensitive)
  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x).toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  };

  return { usernames: dedupe(usernames), orgIds: dedupe(orgIds) };
}

async function fetchDepartmentsViaGateway({ refresh = false, token }) {
  const base = DEPARTMENTS_API_URL;
  const headers = departmentsAuthHeaders(token);

  const { usernames, orgIds } = getRemoteQueryCandidatesFromToken(token);
  const usernameTry = usernames.length ? usernames : [];
  const orgTry = orgIds.length ? orgIds : [];

  const candidates = [];

  // Internal endpoints on remote server
  candidates.push(`${base}/api/departments${refresh ? '?refresh=1' : ''}`);
  candidates.push(`${base}/api/v1/departments`);

  // External dashboard routes (from screenshot) - try username first
  if (usernameTry.length) {
    for (const u of usernameTry) {
      candidates.push(`${base}/api/external/dashboard/departments?username=${encodeURIComponent(u)}`);
    }
    // If orgId exists in JWT, try it too
    if (orgTry.length) {
      for (const u of usernameTry) {
        for (const orgId of orgTry) {
          candidates.push(
            `${base}/api/external/dashboard/departments?username=${encodeURIComponent(u)}&orgId=${encodeURIComponent(orgId)}`
          );
        }
      }
    }
  }

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 401) {
        clearToken();
        throw new Error('Session expired');
      }
      if (!res.ok) {
        lastErr = new Error(`Remote departments failed: ${res.status}`);
        continue;
      }
      const data = await res.json().catch(() => ({}));

      const depts = data?.departments ?? data?.data?.departments ?? (Array.isArray(data) ? data : []);
      return { departments: depts };
    } catch (e) {
      lastErr = e;
    }
  }

  const msg = lastErr?.message || 'Could not fetch departments via gateway';
  throw new Error(msg);
}

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED));
  }
}

export function getToken() {
  return localStorage.getItem('inyatsi-auth-token') || '';
}

export function setToken(token) {
  if (!token) {
    localStorage.removeItem('inyatsi-auth-token');
  } else {
    localStorage.setItem('inyatsi-auth-token', token);
  }
  notifyAuthChanged();
}

export function clearToken() {
  localStorage.removeItem('inyatsi-auth-token');
  localStorage.removeItem(USER_KEY);
  notifyAuthChanged();
}

export function setCurrentUser(user) {
  if (!user) {
    localStorage.removeItem(USER_KEY);
  } else {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  notifyAuthChanged();
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function checkSetupStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE_URL}/api/admin/setup-status`, {
      signal: controller.signal,
      headers: { ...getNgrokHeaders() },
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return data?.configured ?? false;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Backend not responding');
    throw err;
  }
}

export async function setupAdmin({ email, username, password }) {
  const res = await fetch(`${BASE_URL}/api/admin/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getNgrokHeaders() },
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Setup failed: ${res.status}`);
  }
  return res.json();
}

/** Fetch departments (public, no auth) - for login page department selector. Uses Node API only. */
export async function fetchDepartmentsPublic() {
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/departments`, { headers: { ...getNgrokHeaders() } });
  } catch (e) {
    throw new Error(
      `Could not reach portal API (${e?.message || 'network error'}). Confirm the dev server proxies to Node on port 3000 or set VITE_BACKEND_API_URL.`,
    );
  }
  if (!res.ok) {
    const hint =
      res.status === 503 || res.status === 502
        ? 'File server tunnel offline (503/502). On the PC with the bridge: run ngrok http 5200 and dotnet windows-bridge-api; copy the new https URL into backend EXTERNAL_AUTH_URL and restart Node.'
        : `HTTP ${res.status}`;
    throw new Error(`Could not load departments: ${hint}`);
  }
  const data = await res.json();
  return data?.departments ?? [];
}

/** Login with file server credentials. */
export async function loginDashboard({ username, password, departmentId }) {
  const deptId = String(departmentId || '').trim().toLowerCase();
  if (!deptId) throw new Error('Select your department');
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getNgrokHeaders() },
    body: JSON.stringify({
      employeeId: username,
      password,
      role: 'Project Manager',
      departmentId: deptId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error || 'Sign-in failed. Check your username, password, and department, then try again.',
    );
  }
  const data = await res.json();
  setToken(data.token);
  setCurrentUser(data.user);
  return data;
}

export async function updateAdminCredentials({ email, username, password }) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api/admin/credentials`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getNgrokHeaders(),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Update failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAdminCredentials() {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api/admin/credentials`, {
    headers: { ...getNgrokHeaders(), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not load credentials');
  return res.json();
}

async function request(path, opts = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const { headers: optHeaders, ...rest } = opts;
  let response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    method: opts.method || 'GET',
    headers: {
      ...getNgrokHeaders(),
      ...PORTAL_CLIENT_HEADER,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(optHeaders || {}),
    },
  });

  if (response.status === 401) {
    clearToken();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || err?.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchMonitoringStats() {
  return request('/api/stats');
}

/** Portal session + capabilities (read/upload/delete) from admin-configured users.json permission. */
export async function fetchMeSession() {
  return request('/api/me/session');
}

/** Fetch effective NTFS permissions (read, write, delete) for a path. */
export async function fetchPathPermissions(path) {
  const base = DEPARTMENTS_API_URL || BASE_URL;
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${base}/api/permissions?path=${encodeURIComponent(path)}`, {
    headers: departmentsAuthHeaders(token),
  });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

/** Fetch cached file count from Python API (when DEPARTMENTS_API_URL set). Requires path or department. */
export async function fetchFileCount(path, department) {
  const base = DEPARTMENTS_API_URL || BASE_URL;
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (department) params.set('department', department);
  if (!params.toString()) throw new Error('Provide path or department');
  const res = await fetch(`${base}/api/stats/file-count?${params}`, {
    headers: departmentsAuthHeaders(token),
  });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired');
  }
  if (res.status === 403) throw new Error('Not authorized to view this share');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function fetchActivity() {
  return request('/api/activity');
}

/**
 * @param {{ grouped?: boolean }} [options]
 * - `grouped: true` → `/api/users?grouped=1` — `{ users, groups, viewer }` (users by department).
 * - default — flat `{ users }` (same department scope for non-admins).
 */
export async function fetchUsers(options = {}) {
  const grouped = Boolean(options?.grouped);
  const q = grouped ? '?grouped=1' : '';
  return request(`/api/users${q}`);
}

export async function fetchDepartments(refresh = false) {
  if (DEPARTMENTS_API_URL) {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    return fetchDepartmentsViaGateway({ refresh, token });
  }
  return request(`/api/departments${refresh ? '?refresh=1' : ''}`);
}

export async function refreshDepartments() {
  return request('/api/departments/refresh', { method: 'POST' });
}

/** Clears backend remote file + config caches so lists re-fetch from the file server (edit-capable users). */
export async function refreshFilesFromServerCache() {
  return request('/api/files/refresh-cache', { method: 'POST' });
}

export async function getFileServerConnectionStatus() {
  return request('/api/nextcloud/status');
}

export async function testStoredFileServerConnection() {
  const res = await fetch(`${BASE_URL}/api/nextcloud/test`, { headers: { ...getNgrokHeaders() } });
  return res.json();
}

/** Save file-server connection. Password optional if already stored (reuse). */
export async function configureFileServerConnection({ url, username, password }) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api/nextcloud/configure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getNgrokHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url, username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Configure failed: ${res.status}`);
  }
  return res.json();
}

/** Test file-server connection before saving. */
export async function testFileServerConnection({ url, username, password }) {
  return request('/api/file-server/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, username, password }),
  });
}

/** Live file-server + local folder status (admin). */
export async function fetchFileServerStatus() {
  return request('/api/file-server/status');
}

export async function fetchDepartmentFiles(departmentId, query = '', project = '', path = '') {
  const dep = encodeURIComponent(departmentId || '');
  const q = query ? `&q=${encodeURIComponent(query)}` : '';
  const proj = project ? `&project=${encodeURIComponent(project)}` : '';
  const pathParam = path ? `&path=${encodeURIComponent(path)}` : '';
  return request(`/api/files?department=${dep}${q}${proj}${pathParam}`);
}

export async function fetchProjects(departmentId) {
  const dep = encodeURIComponent(departmentId || '');
  return request(`/api/projects?department=${dep}`);
}

export async function fetchAllFiles(query = '') {
  const q = encodeURIComponent(query || '');
  return request(`/api/files/all${q ? `?q=${q}` : ''}`);
}

export function getDownloadUrl(fileId) {
  const token = getToken();
  return `${BASE_URL}/api/download?fileId=${encodeURIComponent(fileId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
}

export function getPreviewUrl(fileId) {
  const token = getToken();
  return `${BASE_URL}/api/download?fileId=${encodeURIComponent(fileId)}&preview=1${token ? `&token=${encodeURIComponent(token)}` : ''}`;
}

export function getFilePreviewPageUrl({
  fileId,
  id,
  name = '',
  fileType = '',
  type = '',
  canDownload = false,
  can_download = false,
}) {
  const resolvedFileId = String(fileId || id || '').trim();
  const params = new URLSearchParams();
  if (!resolvedFileId) return '/file-preview';
  params.set('fileId', resolvedFileId);
  if (name) params.set('name', name);
  if (fileType || type) params.set('type', String(fileType || type));
  params.set('download', canDownload || can_download ? '1' : '0');
  return `/file-preview?${params.toString()}`;
}

/** Upload naming (unique vs replace) is decided on the server from inyatsi-config.json — not sent from the UI. */
export async function uploadFile(file, departmentId, project = 'General') {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('department', departmentId);
  formData.append('project', project);
  formData.append('name', file.name);

  const response = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { ...getNgrokHeaders(), Authorization: `Bearer ${token}`, ...PORTAL_CLIENT_HEADER },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Upload failed: ${response.status}`);
  }
  
  return response.json();
}

export async function deleteFile(fileId, departmentId) {
  return request('/api/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, departmentId }),
  });
}
