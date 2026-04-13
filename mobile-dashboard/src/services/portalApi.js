import { apiRequest } from './api';
import { API_BASE_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DEPARTMENTS_PUBLIC = 'inyatsi.mobile.cache.departments.public.v1';
const KEY_LAST_API_BASE = 'inyatsi.mobile.last_api_base.v1';
const CACHE_DEPARTMENTS_AUTH = 'inyatsi.mobile.cache.departments.auth.v1';
const CACHE_FILES_PREFIX = 'inyatsi.mobile.cache.files.v1:'; // + departmentId + ':' + project
const CACHE_TTL_MS = 10 * 60 * 1000;

async function cacheSet(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* ignore */
  }
}

async function cacheGet(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - Number(parsed.at || 0) > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export async function invalidateCachedDepartments() {
  try {
    await AsyncStorage.removeItem(CACHE_DEPARTMENTS_PUBLIC);
    await AsyncStorage.removeItem(CACHE_DEPARTMENTS_AUTH);
  } catch {
    /* ignore */
  }
}

/** Call before department fetches. If EXPO_PUBLIC_API_BASE_URL changed (e.g. LAN → ngrok), drop stale cache. */
export async function ensureApiBaseCacheCoherent() {
  try {
    const prev = await AsyncStorage.getItem(KEY_LAST_API_BASE);
    const cur = API_BASE_URL;
    if (prev && prev !== cur) await invalidateCachedDepartments();
    await AsyncStorage.setItem(KEY_LAST_API_BASE, cur);
  } catch {
    /* ignore */
  }
}

export async function invalidateCachedFiles(departmentId = '') {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${CACHE_FILES_PREFIX}${String(departmentId || '').toLowerCase()}:`;
    const toRemove = keys.filter((k) => k.startsWith(prefix) || k.startsWith(CACHE_FILES_PREFIX));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch {
    /* ignore */
  }
}

async function fetchDepartmentsViaGateway({ token } = {}) {
  // Gateway behavior (mirror admin dashboard idea):
  // - try cached list
  // - then force refresh (server may re-fetch remote departments/files)
  const opts = token ? { token } : undefined;
  const cacheKey = token ? CACHE_DEPARTMENTS_AUTH : CACHE_DEPARTMENTS_PUBLIC;
  try {
    const data = await apiRequest('/api/departments', opts);
    const departments = data?.departments || [];
    await cacheSet(cacheKey, departments);
    return departments;
  } catch (e1) {
    const cached = await cacheGet(cacheKey);
    if (cached && Array.isArray(cached) && cached.length) return cached;
    try {
      const data2 = await apiRequest('/api/departments?refresh=1', opts);
      const departments2 = data2?.departments || [];
      await cacheSet(cacheKey, departments2);
      return departments2;
    } catch (e2) {
      // keep original error message if refresh also fails
      throw e1;
    }
  }
}

export async function fetchDepartmentsPublic() {
  return fetchDepartmentsViaGateway({ token: '' });
}

export async function login({ employeeId, password, departmentId }) {
  return apiRequest('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, password, role: 'Engineer', departmentId }),
  });
}

/** Shorter timeout so startup does not sit on the splash for the full ngrok window (45s) if API is down. */
export async function fetchMeSession(token) {
  return apiRequest('/api/me/session', { token, timeoutMs: 12000 });
}

export async function fetchDepartments(token) {
  return fetchDepartmentsViaGateway({ token });
}

export async function fetchProjects(token, departmentId) {
  const dep = encodeURIComponent(departmentId || '');
  const data = await apiRequest(`/api/projects?department=${dep}`, { token });
  return data?.projects || [];
}

export async function fetchFiles(token, { departmentId, project = '', q = '', refresh = false } = {}) {
  const dep = encodeURIComponent(departmentId || '');
  const qp = new URLSearchParams();
  qp.set('department', dep);
  if (project) qp.set('project', project);
  if (q) qp.set('q', q);
  if (refresh) qp.set('refresh', '1');
  const cacheKey = `${CACHE_FILES_PREFIX}${String(departmentId || '').toLowerCase()}:${String(project || '').toLowerCase()}`;
  try {
    const data = await apiRequest(`/api/files?${qp.toString()}`, { token });
    if (!q) {
      await cacheSet(cacheKey, data);
    }
    return data;
  } catch (e) {
    if (!q) {
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;
    }
    throw e;
  }
}

export async function refreshServerCaches(token) {
  const res = await apiRequest('/api/files/refresh-cache', { token, method: 'POST' });
  await invalidateCachedDepartments();
  await invalidateCachedFiles();
  return res;
}

export async function fetchActivity(token) {
  const data = await apiRequest('/api/activity', { token });
  return data?.activity || [];
}

/** Same directory as web dashboard: users grouped by department (respects server ACL). */
export async function fetchUsersGrouped(token) {
  const data = await apiRequest('/api/users?grouped=1', { token });
  return {
    users: data?.users || [],
    groups: data?.groups || [],
    viewer: data?.viewer || null,
  };
}

/** Recent file opens / downloads — same feed everyone in the department sees (server-scoped activity). */
export async function fetchRecentFileVisits(token, limit = 40) {
  const rows = await fetchActivity(token);
  const visitActions = new Set(['visited', 'downloaded', 'opened']);
  return (rows || [])
    .filter((a) => visitActions.has(String(a.action || '').toLowerCase()))
    .slice(0, limit);
}

export async function deleteFile(token, { fileId, departmentId }) {
  return apiRequest('/api/delete', {
    token,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, departmentId }),
  });
}

