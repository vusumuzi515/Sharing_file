import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import cors from 'cors';
import express from 'express';
import fs from 'fs/promises';
import jwt from 'jsonwebtoken';
import mime from 'mime-types';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient as createWebdavClient } from 'webdav';
import { invalidateCache, loadDynamicConfig, listRootFoldersWebDav } from './config/dynamicConfig.js';
import { NYATSI_DEPARTMENTS_LIST } from './config/departments.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const EXTERNAL_AUTH_URL = String(process.env.EXTERNAL_AUTH_URL || '').trim().replace(/\/+$/, '');
const EXTERNAL_AUTH_FALLBACK_TO_LOCAL = process.env.EXTERNAL_AUTH_FALLBACK_TO_LOCAL !== 'false';
const REMOTE_API_BEARER_TOKEN = String(process.env.REMOTE_API_BEARER_TOKEN || '').trim();
const REMOTE_API_KEY = String(process.env.REMOTE_API_KEY || '').trim();
const REMOTE_DEPARTMENTS_PATHS = String(
  process.env.REMOTE_DEPARTMENTS_PATHS ||
    '/api/external/dashboard/departments?username={username},/api/departments,/api/v1/departments',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const REMOTE_FILES_PATHS = String(
  process.env.REMOTE_FILES_PATHS ||
    '/api/files?department={orgId},/api/files?department={orgId}&username={username},/api/external/dashboard/files?orgId={orgId}&username={username},/api/external/dashboard/departments/{orgId}/files?username={username},/api/files',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** When set, sent as `x-org-id` on remote API calls (required by some routes e.g. GET /api/files). */
const REMOTE_X_ORG_ID = String(process.env.REMOTE_X_ORG_ID || '').trim();
/** inyatsi-secure-access-api requires this on GET /api/departments and related routes. */
const REMOTE_X_DEVICE_ID = String(process.env.REMOTE_X_DEVICE_ID || 'inyatsi-portal-web').trim();
/**
 * If true, GET /api/departments and merged file ACL use only departments from EXTERNAL_AUTH_URL
 * (e.g. friend’s Windows bridge), not local/WebDAV/inyatsi-config.
 */
const REMOTE_DEPARTMENTS_ONLY = ['1', 'true', 'yes'].includes(
  String(process.env.REMOTE_DEPARTMENTS_ONLY || '').trim().toLowerCase(),
);
/** ngrok free: bypass interstitial; use `1` or `69420` per tunnel docs. */
const NGROK_SKIP_BROWSER_WARNING = String(process.env.NGROK_SKIP_BROWSER_WARNING ?? '1').trim();
/**
 * When `groups`, portal login verifies the password with Nextcloud WebDAV, then checks that the user
 * belongs to a Nextcloud group matching the selected department (OCS, using the service account).
 * Departments in the UI should use the same names as Nextcloud groups (slug match: engineering ↔ Engineering).
 */
const NEXTCLOUD_PORTAL_AUTH = String(process.env.NEXTCLOUD_PORTAL_AUTH || '').trim().toLowerCase();

function remoteApiHeaders(extra = {}) {
  const h = {
    'ngrok-skip-browser-warning': NGROK_SKIP_BROWSER_WARNING,
    ...extra,
  };
  if (REMOTE_X_DEVICE_ID) h['x-device-id'] = REMOTE_X_DEVICE_ID;
  if (REMOTE_API_KEY) {
    h['x-api-key'] = REMOTE_API_KEY;
    h['x-external-dashboard-key'] = REMOTE_API_KEY;
  }
  return h;
}

const FILE_SERVER_ROOT = path.resolve(process.env.FILE_SERVER_ROOT || path.join(__dirname, 'file-server'));
const TEMP_UPLOAD_ROOT = path.resolve(process.env.TEMP_UPLOAD_ROOT || path.join(__dirname, 'temp-uploads'));
const USERS_PATH = path.resolve(process.env.USERS_FILE || path.join(__dirname, 'config', 'users.json'));
const ADMIN_CONFIG_PATH = path.resolve(process.env.ADMIN_CONFIG || path.join(__dirname, 'config', 'admin-config.json'));
const NEXTCLOUD_CONFIG_PATH = path.resolve(process.env.NEXTCLOUD_CONFIG || path.join(__dirname, 'config', 'nextcloud-config.json'));
const ACTIVITY_LOG_PATH = path.resolve(process.env.ACTIVITY_LOG_PATH || path.join(__dirname, 'data', 'activity-log.json'));
const ACTIVITY_LOG_MAX = Math.min(5000, Math.max(100, Number(process.env.ACTIVITY_LOG_MAX || 2000)));

function loadNextcloudConfig() {
  try {
    if (existsSync(NEXTCLOUD_CONFIG_PATH)) {
      const raw = readFileSync(NEXTCLOUD_CONFIG_PATH, 'utf8');
      const c = JSON.parse(raw);
      if (c?.url && c?.username && c?.password) {
        return { url: c.url.trim(), username: c.username.trim(), password: c.password };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    url: process.env.NEXTCLOUD_URL || '',
    username: process.env.NEXTCLOUD_USERNAME || '',
    password: process.env.NEXTCLOUD_PASSWORD || '',
  };
}

/** Whether a full triple was saved via Settings (nextcloud-config.json). */
function hasSavedNextcloudFileConfig() {
  try {
    if (existsSync(NEXTCLOUD_CONFIG_PATH)) {
      const raw = readFileSync(NEXTCLOUD_CONFIG_PATH, 'utf8');
      const c = JSON.parse(raw);
      return Boolean(c?.url && c?.username && c?.password);
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Optional: validate credentials against external file server /api/auth/login (e.g. loca.lt tunnel). */
async function verifyExternalAuth(employeeId, password, departmentId = '') {
  if (!EXTERNAL_AUTH_URL) return null;
  const url = `${EXTERNAL_AUTH_URL}/api/auth/login`;
  const dept = String(departmentId || '').trim().toLowerCase();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...remoteApiHeaders(),
      },
      body: JSON.stringify({
        username: employeeId,
        employeeId,
        password,
        ...(dept ? { departmentId: dept } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const remoteAccessToken =
        data.accessToken ||
        data.token ||
        data.access_token ||
        data.data?.accessToken ||
        data.data?.token ||
        null;
      return {
        ok: true,
        user: data?.user ?? data?.data?.user ?? data?.data ?? data,
        remoteAccessToken,
        departmentsFromAuth: extractDepartmentsFromAuthLoginPayload(data),
      };
    }
    return { ok: false, error: data?.message ?? data?.error ?? `Auth failed: ${res.status}` };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Could not reach auth server' };
  }
}

/** Ping remote file/auth API /health (same host as EXTERNAL_AUTH_URL). */
async function fetchRemoteAuthServerHealth() {
  const base = EXTERNAL_AUTH_URL.trim();
  if (!base) {
    return { configured: false };
  }
  const headers = remoteApiHeaders();
  try {
    const res = await fetch(`${base}/health`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON */
    }
    return {
      configured: true,
      reachable: res.ok,
      status: res.status,
      service: json.service || null,
      statusText: json.status || null,
      error: res.ok ? null : text.slice(0, 200),
    };
  } catch (err) {
    const raw = err?.cause?.message || err?.message || String(err || 'Unreachable');
    let hint = String(raw);
    if (/fetch failed|socket|ECONNREFUSED|ECONNRESET|ENOTFOUND|closed|timed out|timeout/i.test(hint)) {
      hint =
        'Cannot reach remote host (ngrok tunnel stopped, URL changed, or server offline). ' +
        `Details: ${String(raw).slice(0, 120)}`;
    }
    return {
      configured: true,
      reachable: false,
      error: hint.slice(0, 280),
    };
  }
}

const remoteDeptCacheByKey = new Map();
const REMOTE_DEPT_CACHE_MS = 60 * 1000;

/** Cached GET /api/files per (token prefix, org id) — same ACL as file server. */
const remoteFileCacheByKey = new Map();
const REMOTE_FILE_CACHE_MS = 45 * 1000;

function clearRemoteFileCaches() {
  remoteFileCacheByKey.clear();
}

function clearRemoteDepartmentCaches() {
  remoteDeptCacheByKey.clear();
}

function getEffectiveRemoteBearer(req) {
  const fromUser = req?.user?.remoteAccessToken;
  const t = String(fromUser || REMOTE_API_BEARER_TOKEN || '').trim();
  return t || null;
}

/** Portal JWT on GET /api/departments is not on req.user (no auth middleware); decode from Authorization. */
function getPortalUserFromRequest(req) {
  if (req?.user) return req.user;
  const auth = String(req?.headers?.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Merge remote GET /api/departments with dynamic config so file routes see file-server department ACL. */
async function mergeRemoteDepartmentsIntoConfig(config, req) {
  let departments = REMOTE_DEPARTMENTS_ONLY ? [] : [...(config.departments || [])];
  const portalUser = getPortalUserFromRequest(req);
  if (EXTERNAL_AUTH_URL && REMOTE_API_BEARER_TOKEN) {
    departments = mergeDepartmentLists(
      departments,
      await fetchRemoteDepartments(REMOTE_API_BEARER_TOKEN, portalUser),
    );
  }
  const authHeader =
    req?.headers?.authorization?.replace(/^Bearer /i, '') || String(req?.query?.token || '').trim();
  if (authHeader && EXTERNAL_AUTH_URL) {
    try {
      const payload = jwt.verify(authHeader, JWT_SECRET);
      const remoteAccess = payload.remoteAccessToken;
      if (remoteAccess) {
        departments = mergeDepartmentLists(
          departments,
          await fetchRemoteDepartments(remoteAccess, portalUser),
        );
      }
    } catch {
      /* invalid or missing token */
    }
  }
  const departmentsById = departments.reduce((acc, d) => {
    if (d?.id) acc[String(d.id).toLowerCase()] = d;
    return acc;
  }, {});
  return { departments, departmentsById };
}

async function fetchRemoteFilesForOrgUncached(bearerToken, orgId, reqUser = null) {
  if (!EXTERNAL_AUTH_URL) return [];
  const base = EXTERNAL_AUTH_URL.trim().replace(/\/+$/, '');
  const pathsToTry = [...REMOTE_FILES_PATHS];
  const usernames = getRemoteUsernamesToTry(bearerToken, reqUser);
  for (const p of pathsToTry) {
    const usernameList = p.includes('{username}') ? (usernames.length ? usernames : [null]) : [null];
    for (const username of usernameList) {
      /* Do not skip when username is null/empty: Windows bridge lists by department and treats
       * missing user as full folder read; skipping would return no files when REMOTE_FILES_PATHS
       * only includes `?username={username}` and JWT has no username claim. */
    try {
      const headers = {
        ...remoteApiHeaders(),
        'Content-Type': 'application/json',
      };
      // Protected internal endpoints need bearer; external dashboard endpoints usually do not.
      if (bearerToken && !p.includes('/api/external/dashboard/')) {
        headers.Authorization = `Bearer ${bearerToken}`;
      }
      if (orgId && !p.includes('/api/external/dashboard/')) {
        headers['x-org-id'] = String(orgId);
      }
      const endpointPath = p
        .replace(/\{orgId\}/g, encodeURIComponent(String(orgId || '')))
        .replace(/\{username\}/g, encodeURIComponent(String(username || '')));
      const res = await fetch(`${base}${endpointPath}`, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) return data;
      const candidates = [
        data?.files,
        data?.rows,
        data?.items,
        data?.data?.files,
        data?.data?.rows,
        data?.data?.items,
      ];
      const arr = candidates.find((x) => Array.isArray(x));
      if (Array.isArray(arr)) return arr;
    } catch {
      /* try next */
    }
    }
  }
  return [];
}

/** Stream file bytes from secure API (paths tried in order). */
async function fetchRemoteFileDownloadStream(bearerToken, orgId, serverFileId) {
  if (!bearerToken || !EXTERNAL_AUTH_URL || !serverFileId) return null;
  const base = EXTERNAL_AUTH_URL.trim().replace(/\/+$/, '');
  const headers = {
    ...remoteApiHeaders(),
    Authorization: `Bearer ${bearerToken}`,
    'x-org-id': String(orgId),
  };
  // Keep path separators for catch-all routes like /api/files/content/{*fileId}.
  // Encoding the whole string turns "/" into "%2F", which bridge routing treats as a literal.
  const id = String(serverFileId)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const urls = [
    `${base}/api/files/download/${id}`,
    `${base}/api/files/content/${id}`,
    `${base}/api/files/${id}/download`,
    `${base}/api/files/${id}/content`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
      if (res.ok) return res;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function getCachedRemoteFiles(bearerToken, orgId, forceRefresh = false, reqUser = null) {
  if (!bearerToken || !orgId) return [];
  const userKey =
    String(reqUser?.username || reqUser?.employeeId || reqUser?.name || '')
      .trim()
      .toLowerCase() || 'anon';
  const k = `${bearerToken.slice(0, 48)}:${String(orgId).toLowerCase()}:${userKey}`;
  if (forceRefresh) {
    remoteFileCacheByKey.delete(k);
  }
  const now = Date.now();
  const hit = remoteFileCacheByKey.get(k);
  if (hit && now - hit.at < REMOTE_FILE_CACHE_MS) return hit.data;
  const data = await fetchRemoteFilesForOrgUncached(bearerToken, orgId, reqUser);
  remoteFileCacheByKey.set(k, { at: now, data });
  return data;
}

/** Virtual path embedded in fileId for downloads when file exists only on secure API (not WebDAV). */
function buildRemoteVirtualPath(departmentId, project, fileName) {
  const proj = String(project || 'General');
  const name = String(fileName || '').replace(/^\/+/, '');
  return `remote://${departmentId}/${proj}/${name}`;
}

function parseRemoteVirtualPath(decoded) {
  const s = String(decoded || '');
  if (!s.startsWith('remote://')) return null;
  const rest = s.slice('remote://'.length);
  const parts = rest.split('/');
  if (parts.length < 3) return null;
  const orgId = parts[0];
  const proj = parts[1] || 'General';
  const fileName = parts.slice(2).join('/') || '';
  return { orgId, project: proj, fileName };
}

function mapRemoteRowsToPortalFiles(department, remoteRows, projectFilter, q) {
  const out = [];
  const qlow = String(q || '').toLowerCase();
  const projWant = projectFilter ? String(projectFilter).trim().toLowerCase() : '';
  for (const row of remoteRows || []) {
    if (!row || typeof row !== 'object') continue;
    if (row.type === 'directory' || row.kind === 'directory') continue;
    const name = String(row.name || '').trim();
    if (!name) continue;
    const proj = String(row.folder || row.project || row.subfolder || 'General').trim() || 'General';
    if (projWant && proj.toLowerCase() !== projWant) continue;
    if (qlow && !name.toLowerCase().includes(qlow) && !proj.toLowerCase().includes(qlow)) continue;
    const uploadedAt = row.lastModified || row.updatedAt || row.modifiedAt || null;
    const virt = buildRemoteVirtualPath(department.id, proj, name);
    out.push({
      id: encodeFileId(virt),
      name,
      project: proj,
      department: department.label,
      departmentId: department.id,
      folderPath: department.folderPath,
      size: row.size != null ? Number(row.size) : null,
      uploadedAt: uploadedAt ? new Date(uploadedAt).toISOString() : null,
      fileType: path.extname(name).replace('.', '').toUpperCase() || 'FILE',
      serverFileId: row.id,
      source: 'remote_api',
    });
  }
  return out.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
}

function mergeFileListsByProjectName(localFiles, remoteFiles) {
  const byKey = new Map();
  for (const f of localFiles || []) {
    const k = `${String(f.project || 'General').toLowerCase()}/${String(f.name || '').toLowerCase()}`;
    byKey.set(k, f);
  }
  for (const f of remoteFiles || []) {
    const k = `${String(f.project || 'General').toLowerCase()}/${String(f.name || '').toLowerCase()}`;
    if (!byKey.has(k)) byKey.set(k, f);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime(),
  );
}

/**
 * WebDAV/local listing plus files that exist only on the secure file API (GET /api/files).
 */
async function listFilesCombined(department, project, q, bearerToken, forceRemoteRefresh = false, reqUser = null) {
  const local = await listFiles(department, project, q);
  let remoteRows = [];
  if (EXTERNAL_AUTH_URL && bearerToken) {
    remoteRows = await getCachedRemoteFiles(bearerToken, department.id, forceRemoteRefresh, reqUser);
  }
  const remoteMapped = mapRemoteRowsToPortalFiles(department, remoteRows, project, q);
  const files = mergeFileListsByProjectName(local, remoteMapped);
  return { files, remoteRows };
}

function findRemoteFileRow(remoteRows, fileName, project) {
  const n = String(fileName || '').toLowerCase();
  const proj = String(project || 'General').toLowerCase();
  let nameOnly = null;
  for (const row of remoteRows || []) {
    if (String(row.name || '').toLowerCase() !== n) continue;
    const rp = String(row.folder || row.project || row.subfolder || '').toLowerCase();
    if (rp === proj || (!row.folder && !row.project && !row.subfolder)) {
      return row;
    }
    if (!nameOnly) nameOnly = row;
  }
  return nameOnly;
}

/**
 * Attach file-server ACL to listed files (name match within org).
 * When `trustFileServerAcl()` and the secure API / bridge returns a row for the file, permissions come
 * only from the file server (not portal department view-only in users.json).
 */
function enrichFilesWithRemoteAccess(files, department, remoteRows, { req, deptHasAccess }) {
  const portalViewOnly = !canSessionEditDepartment(req, department);
  const deptViewOnly = isDepartmentViewOnly(department);
  return files.map((f) => {
    const row = findRemoteFileRow(remoteRows, f.name, f.project);
    const access = row?.access && typeof row.access === 'object' ? { ...row.access } : null;
    const serverCanView = access ? access.canView !== false : true;
    const serverCanEdit = access ? access.canEdit === true : true;
    const serverCanDownload =
      access && Object.prototype.hasOwnProperty.call(access, 'canDownload')
        ? access.canDownload === true
        : serverCanView;
    if (trustFileServerAcl() && row) {
      let permission = 'edit';
      if (!serverCanView) permission = 'none';
      else if (!serverCanEdit) permission = 'view';
      const has_access = serverCanView && deptHasAccess;
      return {
        ...f,
        ...(row?.id ? { serverFileId: row.id } : {}),
        ...(access ? { serverAccess: access } : {}),
        permission,
        has_access,
        can_edit: serverCanEdit && has_access,
        can_view: serverCanView,
        can_download: serverCanDownload && has_access,
      };
    }
    let permission = 'edit';
    if (!serverCanView) permission = 'none';
    else if (!serverCanEdit) permission = 'view';
    const has_access = serverCanView && deptHasAccess;
    const explicitServerEdit = Boolean(access && access.canEdit === true);
    const remoteListingUnlocksCoarseView =
      trustFileServerAcl() && Boolean(row) && !access && serverCanView && serverCanEdit;
    const webdavListingUnlocksCoarseView =
      Boolean(getWebdavClient()) &&
      (portalViewOnly || deptViewOnly) &&
      deptHasAccess &&
      has_access &&
      serverCanView &&
      serverCanEdit &&
      !row;
    const baseEdit = serverCanEdit && deptHasAccess && has_access;
    const blockedByPortalDept = portalViewOnly || deptViewOnly;
    let can_edit =
      baseEdit &&
      (!blockedByPortalDept ||
        explicitServerEdit ||
        remoteListingUnlocksCoarseView ||
        webdavListingUnlocksCoarseView);
    if (
      !can_edit &&
      permission === 'edit' &&
      has_access &&
      serverCanView &&
      blockedByPortalDept &&
      !explicitServerEdit &&
      !remoteListingUnlocksCoarseView &&
      !webdavListingUnlocksCoarseView
    ) {
      permission = 'view';
    }
    return {
      ...f,
      ...(row?.id ? { serverFileId: row.id } : {}),
      ...(access ? { serverAccess: access } : {}),
      permission,
      has_access,
      can_edit,
      can_view: serverCanView,
      can_download: serverCanDownload && has_access,
    };
  });
}

/** Folder chip / project row: allow edit when remote says edit even if portal or department config is view-only. */
function folderRowCanEditForUser(deptHasAccess, folderCanEdit, portalViewOnly, deptPerm, fp, isAdmin, restricted) {
  if (!deptHasAccess || !folderCanEdit) return false;
  if (restricted && !isAdmin) return false;
  const deptView = String(deptPerm || 'edit').toLowerCase() === 'view';
  const coarseViewLock = portalViewOnly || deptView;
  if (!coarseViewLock) return true;
  return String(fp || '').toLowerCase() === 'edit';
}

/** Folder ACL from remote file rows where project/folder matches subfolder name (or General for unscoped files). */
function folderPermissionFromRemote(folderName, remoteRows, deptPermission) {
  const fn = String(folderName || '').toLowerCase();
  const scoped = (remoteRows || []).filter((row) => {
    const rp = String(row.folder || row.project || row.subfolder || '').toLowerCase();
    if (!rp) return fn === 'general';
    return rp === fn;
  });
  const def = deptPermission === 'view' ? 'view' : 'edit';
  if (!scoped.length) return def;
  let anyView = false;
  let anyEdit = false;
  for (const row of scoped) {
    const a = row.access || {};
    if (a.canView !== false) anyView = true;
    if (a.canEdit === true) anyEdit = true;
  }
  if (anyEdit) return 'edit';
  if (anyView) return 'view';
  return 'view';
}

function toDeptIdRemote(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

/** Pull a department-like array from varied remote JSON shapes (REST + file tree listings). */
function extractDepartmentArrayFromRemoteJson(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const direct = [
    data.departments,
    data.data,
    data.results,
    data.items,
    data.files,
    data.folders,
    data.list,
    data.rows,
    data.records,
  ];
  for (const c of direct) {
    if (Array.isArray(c) && c.length) return c;
  }
  const nested = [
    data.data?.departments,
    data.data?.files,
    data.data?.folders,
    data.data?.items,
    data.payload?.departments,
    data.payload?.files,
  ];
  for (const c of nested) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
}

function normalizeRemoteDepartments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      if (item.type === 'file' || item.kind === 'file' || item.isFile === true) return null;
      if (item.isDirectory === false) return null;
      const label =
        item.name ||
        item.label ||
        item.title ||
        item.department ||
        item.departmentName ||
        item.displayName ||
        item.filename ||
        item.basename ||
        item.key ||
        (item.id != null ? String(item.id) : '');
      if (!label && item.id == null && item.slug == null) return null;
      const id = toDeptIdRemote(
        item.id ?? item.slug ?? item.departmentId ?? item.department_id ?? label,
      );
      const rawFp =
        item.folderPath ||
        item.path ||
        item.folder ||
        item.fullPath ||
        item.relativePath ||
        `/${id}`;
      const folderPath = String(rawFp).replace(/\\/g, '/').replace(/\/{2,}/g, '/') || `/${id}`;
      const fp = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
      return {
        id,
        label: String(label).trim() || id,
        folderPath: fp,
        permission: remotePermissionFromDepartmentItem(item),
      };
    })
    .filter(Boolean);
}

/** Map secure API department row to the CURRENT USER'S root access in that department. */
function remotePermissionFromDepartmentItem(item) {
  const p = String(item.permission || '').toLowerCase();
  if (p === 'view') return 'view';
  if (p === 'edit') return 'edit';
  const a = item.access;
  if (a && typeof a === 'object') {
    if (a.canEdit === true) return 'edit';
    if (a.canView === false) return 'view';
    if (a.canEdit === false && a.canView !== false) return 'view';
  }
  return 'edit';
}

function mergeDepartmentLists(local, remote) {
  const byId = new Map();
  (local || []).forEach((d) => {
    if (d?.id) byId.set(String(d.id).toLowerCase(), { ...d });
  });
  (remote || []).forEach((d) => {
    if (d?.id) {
      const k = String(d.id).toLowerCase();
      const prev = byId.get(k);
      byId.set(k, { ...(prev || {}), ...d, id: d.id });
    }
  });
  return Array.from(byId.values());
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Org ids to send as `x-org-id`: env list (comma-sep) first, then claims on the Bearer JWT if present. */
function getRemoteOrgIdsToTry(bearerToken) {
  const fromEnv = String(REMOTE_X_ORG_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fromJwt = decodeJwtPayload(bearerToken);
  const jwtOrg =
    fromJwt && typeof fromJwt === 'object'
      ? fromJwt.orgId ??
        fromJwt.org_id ??
        fromJwt.organizationId ??
        fromJwt.organization_id ??
        fromJwt.x_org_id
      : null;
  const merged = [];
  const seen = new Set();
  for (const x of [...fromEnv, ...(jwtOrg != null && String(jwtOrg).trim() ? [String(jwtOrg).trim()] : [])]) {
    if (!seen.has(x)) {
      seen.add(x);
      merged.push(x);
    }
  }
  return merged;
}

/** Usernames to try on external dashboard routes that require `?username=`. */
function getRemoteUsernamesToTry(bearerToken, reqUser) {
  const fromEnv = String(process.env.REMOTE_EXTERNAL_USERNAME || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const fromReq = [
    String(reqUser?.username || '').trim(),
    String(reqUser?.employeeId || '').trim(),
    String(reqUser?.name || '').trim(),
  ].filter(Boolean);
  const fromJwt = decodeJwtPayload(bearerToken);
  const jwtNames =
    fromJwt && typeof fromJwt === 'object'
      ? [
          String(fromJwt.username || '').trim(),
          String(fromJwt.preferred_username || '').trim(),
          String(fromJwt.sub || '').trim(),
        ].filter(Boolean)
      : [];
  const out = [];
  const seen = new Set();
  for (const u of [...fromEnv, ...fromReq, ...jwtNames]) {
    const key = String(u).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

/** Departments returned inline from POST /api/auth/login (no GET /api/departments on some deployments). */
function extractDepartmentsFromAuthLoginPayload(data) {
  if (!data || typeof data !== 'object') return [];
  const slices = [data, data.data, data.user, data.data?.user];
  for (const slice of slices) {
    if (!slice || typeof slice !== 'object') continue;
    const arr = extractDepartmentArrayFromRemoteJson(slice);
    const normalized = normalizeRemoteDepartments(arr);
    if (normalized.length) return normalized;
  }
  return [];
}

/** Fetch departments from remote secure API (Bearer). Cached ~60s per token prefix. */
async function fetchRemoteDepartments(bearerToken, reqUser = null) {
  if (!EXTERNAL_AUTH_URL) return [];
  const userKey =
    String(reqUser?.username || reqUser?.employeeId || reqUser?.name || '')
      .trim()
      .toLowerCase() || 'anon';
  const tokenKey = bearerToken ? bearerToken.slice(0, 48) : `key:${REMOTE_API_KEY ? 'api-key' : 'none'}`;
  const cacheKey = `${tokenKey}:${userKey}`;
  const now = Date.now();
  const hit = remoteDeptCacheByKey.get(cacheKey);
  if (hit && now - hit.at < REMOTE_DEPT_CACHE_MS) {
    return hit.data;
  }
  const base = EXTERNAL_AUTH_URL.trim().replace(/\/+$/, '');
  const orgIds = bearerToken ? getRemoteOrgIdsToTry(bearerToken) : [];
  const usernames = getRemoteUsernamesToTry(bearerToken, reqUser);
  const orgList = orgIds.length ? orgIds : [null];
  const pathsToTry = [...REMOTE_DEPARTMENTS_PATHS];
  if (orgIds.length && !pathsToTry.some((x) => x === '/api/files' || x.endsWith('/api/files'))) {
    pathsToTry.push('/api/files');
  }
  for (const orgId of orgList) {
    for (const p of pathsToTry) {
      const isExternalDashboardPath = p.includes('/api/external/dashboard/');
      if ((p.includes('/files') || p.endsWith('/files')) && !orgId && !isExternalDashboardPath) continue;
      const usernameList = p.includes('{username}') ? (usernames.length ? usernames : [null]) : [null];
      for (const username of usernameList) {
        if (p.includes('{username}') && !username) continue;
      try {
        const headers = {
          ...remoteApiHeaders(),
          'Content-Type': 'application/json',
        };
        // Protected internal endpoints need bearer; external dashboard endpoints usually do not.
        if (bearerToken && !p.includes('/api/external/dashboard/')) {
          headers.Authorization = `Bearer ${bearerToken}`;
        }
        if (orgId && !p.includes('/api/external/dashboard/')) headers['x-org-id'] = orgId;
        const endpointPath = p
          .replace(/\{orgId\}/g, encodeURIComponent(String(orgId || '')))
          .replace(/\{username\}/g, encodeURIComponent(String(username || '')));
        const res = await fetch(`${base}${endpointPath}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const arr = extractDepartmentArrayFromRemoteJson(data);
        const normalized = normalizeRemoteDepartments(arr);
        if (normalized.length) {
          remoteDeptCacheByKey.set(cacheKey, { at: now, data: normalized });
          return normalized;
        }
      } catch {
        /* try next path */
      }
      }
    }
  }
  return [];
}

/** For UI: where credentials come from; staff never see these — only portal login. */
function getNextcloudSetupInfo() {
  const fileSaved = hasSavedNextcloudFileConfig();
  const envSet = Boolean(
    process.env.NEXTCLOUD_URL && process.env.NEXTCLOUD_USERNAME && process.env.NEXTCLOUD_PASSWORD
  );
  const cfg = loadNextcloudConfig();
  const active = Boolean(cfg.url && cfg.username && cfg.password);
  let credentialsSource = 'none';
  if (active) {
    if (fileSaved) credentialsSource = 'dashboard';
    else credentialsSource = 'environment';
  }
  const secretsInEnv = Boolean(process.env.NEXTCLOUD_USERNAME && process.env.NEXTCLOUD_PASSWORD);
  return {
    credentialsSource,
    fileConfigSaved: fileSaved,
    environmentVariablesSet: envSet,
    hasActiveConnection: active,
    secretsInEnvironment: secretsInEnv,
    /** True when backend has a service account (env or saved file) — dashboard only needs URL. */
    serviceAccountReady: Boolean(cfg.username && cfg.password),
  };
}

/**
 * WebDAV root URL from admin input.
 * - Full WebDAV URL (path contains /dav/ or webdav): use as-is (ownCloud, custom NAS, non-Nextcloud).
 * - Otherwise: treat as Nextcloud/ownCloud **site base** and append the standard DAV files path.
 */
function buildWebDavUrl(urlInput, username) {
  const raw = String(urlInput || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('/remote.php/dav') || lower.includes('/dav/') || lower.includes('webdav')) {
    return raw.endsWith('/') ? raw : `${raw}/`;
  }
  return `${raw}/remote.php/dav/files/${encodeURIComponent(username)}/`;
}

function getWebdavClient() {
  const cfg = loadNextcloudConfig();
  if (!cfg.url || !cfg.username || !cfg.password) return null;
  return createWebdavClient(cfg.url, { username: cfg.username, password: cfg.password });
}

/** Nextcloud WebDAV or external file API: per-file ACL can override coarse portal "view" in users.json. */
function trustFileServerAcl() {
  return Boolean(EXTERNAL_AUTH_URL) || Boolean(getWebdavClient());
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function getUsingWebDav() {
  const cfg = loadNextcloudConfig();
  return Boolean(cfg.url && cfg.username && cfg.password);
}

/** Extract Nextcloud WebDAV base URL (before /files/Username/) for per-user auth */
function getNextcloudBaseUrl() {
  const cfg = loadNextcloudConfig();
  const url = String(cfg.url || '').trim().replace(/\/+$/, '');
  const match = url.match(/^(.+?\/remote\.php\/dav)(?:\/files\/[^/]+)?\/?$/i);
  return match ? match[1].replace(/\/$/, '') : url;
}

/** Create a WebDAV client for a specific Nextcloud user (for credential verification) */
function createUserWebdavClient(username, password) {
  const base = getNextcloudBaseUrl();
  const userPath = `/files/${encodeURIComponent(username)}/`;
  const fullUrl = (base.endsWith('/') ? base.slice(0, -1) : base) + userPath;
  return createWebdavClient(fullUrl, { username, password });
}

/** Verify Nextcloud credentials by attempting a simple WebDAV operation */
async function verifyNextcloudCredentials(username, password) {
  try {
    const client = createUserWebdavClient(username, password);
    await client.getDirectoryContents('/', { deep: false });
    return { ok: true };
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        error: 'Invalid credentials. Use your Nextcloud username and an App Password (Settings → Security → Create app password). Regular passwords may not work for WebDAV.',
      };
    }
    if (err?.code === 'ECONNREFUSED' || err?.message?.includes('fetch')) {
      return { ok: false, error: 'Could not reach Nextcloud. Check NEXTCLOUD_URL in backend .env.' };
    }
    return { ok: false, error: err?.message || 'Could not verify credentials' };
  }
}

/** Verify user can access a department folder in Nextcloud (shared or owned) */
async function verifyNextcloudFolderAccess(username, password, folderPath) {
  try {
    const client = createUserWebdavClient(username, password);
    const dirPath = normalizeWebDavPath(folderPath);
    await client.getDirectoryContents(dirPath, { deep: false });
    return { ok: true };
  } catch (err) {
    const status = err?.response?.status ?? err?.status;
    if (status === 401 || status === 403) return { ok: false, error: 'Invalid credentials' };
    if (status === 404) return { ok: false, error: 'Folder not found or no access' };
    return { ok: false, error: err?.message || 'Access denied' };
  }
}

/** Same slug rules as dynamicConfig (department id from folder / group name). */
function toDepartmentIdKey(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

function getNextcloudOrigin() {
  const cfg = loadNextcloudConfig();
  const url = String(cfg.url || '').trim();
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * True if a Nextcloud group name corresponds to the portal department (groups ≈ departments).
 */
function nextcloudGroupMatchesDepartment(groupName, department) {
  const g = String(groupName || '').trim();
  if (!g) return false;
  const deptId = String(department?.id || '').toLowerCase();
  const label = String(department?.label || '').trim();
  if (toDepartmentIdKey(g) === deptId) return true;
  if (g.toLowerCase() === deptId) return true;
  if (label && toDepartmentIdKey(label) === toDepartmentIdKey(g)) return true;
  if (label && g.toLowerCase() === label.toLowerCase()) return true;
  return false;
}

/**
 * List Nextcloud groups for a user (Provisioning API). Requires service account with rights to read
 * user details (typically admin or user manager).
 */
async function fetchNextcloudUserGroups(ncUserId) {
  const cfg = loadNextcloudConfig();
  if (!cfg.url || !cfg.username || !cfg.password) {
    return { ok: false, error: 'Nextcloud service account not configured', groups: [] };
  }
  const origin = getNextcloudOrigin();
  if (!origin) return { ok: false, error: 'Invalid NEXTCLOUD_URL (could not parse origin)', groups: [] };
  const url = `${origin}/ocs/v1.php/cloud/users/${encodeURIComponent(ncUserId)}/groups`;
  const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  try {
    const res = await fetch(url, {
      headers: {
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'OCS returned non-JSON', groups: [], httpStatus: res.status };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: json?.ocs?.meta?.message || `OCS groups failed (HTTP ${res.status})`,
        groups: [],
        httpStatus: res.status,
      };
    }
    const meta = json?.ocs?.meta;
    const sc = Number(meta?.statuscode);
    if (meta?.status !== 'ok' && sc !== 100 && sc !== 200) {
      return {
        ok: false,
        error: meta?.message || 'OCS returned an error',
        groups: [],
        httpStatus: res.status,
      };
    }
    const raw = json?.ocs?.data?.groups;
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === 'string') list = raw ? [raw] : [];
    else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.element)) list = raw.element;
      else list = Object.values(raw).flat();
    }
    return { ok: true, groups: list.filter(Boolean) };
  } catch (e) {
    return { ok: false, error: e?.message || 'OCS request failed', groups: [] };
  }
}

/** All Nextcloud groups (Provisioning API). Requires admin-capable service account. */
async function fetchNextcloudGroupList() {
  const cfg = loadNextcloudConfig();
  if (!cfg.url || !cfg.username || !cfg.password) {
    return { ok: false, error: 'Nextcloud service account not configured', groups: [] };
  }
  const origin = getNextcloudOrigin();
  if (!origin) return { ok: false, error: 'Invalid NEXTCLOUD_URL', groups: [] };
  const url = `${origin}/ocs/v1.php/cloud/groups`;
  const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  try {
    const res = await fetch(url, {
      headers: {
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'OCS returned non-JSON', groups: [], httpStatus: res.status };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: json?.ocs?.meta?.message || `OCS groups list failed (HTTP ${res.status})`,
        groups: [],
        httpStatus: res.status,
      };
    }
    const meta = json?.ocs?.meta;
    const sc = Number(meta?.statuscode);
    if (meta?.status !== 'ok' && sc !== 100 && sc !== 200) {
      return { ok: false, error: meta?.message || 'OCS returned an error', groups: [] };
    }
    const raw = json?.ocs?.data?.groups;
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === 'string') list = raw ? [raw] : [];
    else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.element)) list = raw.element;
      else list = Object.values(raw).flat();
    }
    return { ok: true, groups: list.filter(Boolean) };
  } catch (e) {
    return { ok: false, error: e?.message || 'OCS request failed', groups: [] };
  }
}

/** Short-lived cache so GET /api/departments does not hammer OCS. */
let ncGroupsListCache = { at: 0, groups: [] };
const NC_GROUPS_LIST_CACHE_MS = 60 * 1000;

async function fetchNextcloudGroupListCached(forceRefresh) {
  const now = Date.now();
  if (
    !forceRefresh &&
    ncGroupsListCache.groups.length &&
    now - ncGroupsListCache.at < NC_GROUPS_LIST_CACHE_MS
  ) {
    return { ok: true, groups: ncGroupsListCache.groups };
  }
  const res = await fetchNextcloudGroupList();
  if (res.ok && res.groups.length) {
    ncGroupsListCache = { at: now, groups: res.groups };
  } else if (res.ok) {
    ncGroupsListCache = { at: now, groups: [] };
  }
  return res;
}

/**
 * Build portal departments from Nextcloud group names only (no folder scan / static fallback).
 * Optional NEXTCLOUD_GROUP_EXCLUDE=comma,list of group names to hide.
 */
function departmentsFromNextcloudGroupNames(groupNames) {
  const exclude = new Set(
    String(process.env.NEXTCLOUD_GROUP_EXCLUDE || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const filtered = groupNames.filter((g) => g && !exclude.has(String(g).trim().toLowerCase()));
  return filtered
    .map((name) => {
      const label = String(name).trim();
      const id = toDepartmentIdKey(label);
      return {
        id,
        label,
        folderPath: normalizeWebDavPath(`/${label}`),
        permission: 'edit',
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

/**
 * Union: OCS group names + top-level WebDAV folders (so e.g. "Lidwala" appears if the folder exists even when
 * the group name differs or Circles/teams are not returned by /cloud/groups).
 */
function mergeNextcloudGroupAndFolderDepartments(fromGroups, folderRows) {
  const byId = new Map();
  for (const d of fromGroups || []) {
    const id = String(d?.id || '').toLowerCase();
    if (id) byId.set(id, { ...d });
  }
  for (const d of folderRows || []) {
    const id = String(d?.id || '').toLowerCase();
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        label: d.label || d.id,
        folderPath: normalizeWebDavPath(d.folderPath || `/${d.label || id}`),
        permission: d.permission === 'view' ? 'view' : 'edit',
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' }),
  );
}

/**
 * Nextcloud-first login: WebDAV password check + group (or shared-folder) matches selected department.
 */
async function authenticateWithNextcloudGroups({
  employeeId,
  password,
  department,
  selectedDepartmentId,
  config,
  role,
}) {
  const ncVerify = await verifyNextcloudCredentials(employeeId, password);
  if (!ncVerify.ok) {
    return { ok: false, status: 401, error: ncVerify.error || 'Invalid credentials' };
  }

  const groupsRes = await fetchNextcloudUserGroups(employeeId);
  const inGroup =
    groupsRes.ok &&
    (groupsRes.groups || []).some((g) => nextcloudGroupMatchesDepartment(g, department));

  let folderOk = { ok: false };
  if (!inGroup) {
    folderOk = await verifyNextcloudFolderAccess(employeeId, password, department.folderPath || '/');
  }

  if (!inGroup && !folderOk.ok) {
    const hint =
      groupsRes.ok && (groupsRes.groups || []).length === 0
        ? 'You are not in a Nextcloud group that matches this department, and the department folder is not accessible.'
        : !groupsRes.ok
          ? `${groupsRes.error || 'Could not read group membership'}. Use an admin service account in NEXTCLOUD_* or ensure the department folder is shared with this user.`
          : 'Not a member of this department’s Nextcloud group and no access to the department folder.';
    return { ok: false, status: 403, error: hint };
  }

  const users = config.users || [];
  const localUser = users.find((u) => u.employeeId?.toLowerCase() === employeeId.toLowerCase());
  const user = {
    employeeId,
    name: localUser?.name || employeeId,
    departmentId: selectedDepartmentId,
    permission: localUser?.permission || department.permission || 'edit',
    role: localUser?.role || role || 'Engineer',
  };
  return { ok: true, user, authSource: 'nextcloud-groups' };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

let activityLog = [];

function loadActivityLogFromDisk() {
  try {
    if (existsSync(ACTIVITY_LOG_PATH)) {
      const raw = readFileSync(ACTIVITY_LOG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        activityLog = parsed.slice(0, ACTIVITY_LOG_MAX);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[activity] Could not load log file:', e.message);
  }
}

let persistActivityTimer;
function schedulePersistActivityLog() {
  clearTimeout(persistActivityTimer);
  persistActivityTimer = setTimeout(() => {
    const dir = path.dirname(ACTIVITY_LOG_PATH);
    fs.mkdir(dir, { recursive: true })
      .then(() => fs.writeFile(ACTIVITY_LOG_PATH, JSON.stringify(activityLog.slice(0, ACTIVITY_LOG_MAX)), 'utf8'))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[activity] Persist failed:', err.message);
      });
  }, 1200);
}

/** Identify web vs mobile vs other API clients for audit logs (`X-Portal-Client` header). */
function portalClientFromReq(req) {
  if (!req?.headers) return 'unknown';
  const raw = String(req.get?.('x-portal-client') || req.headers['x-portal-client'] || '').toLowerCase();
  if (raw.includes('mobile')) return 'mobile';
  if (raw.includes('web')) return 'web';
  return 'unknown';
}

loadActivityLogFromDisk();

function sanitizeSegment(value) {
  return (value || '').replace(/[^\w.-]/g, '_');
}

function encodeFileId(relativePath) {
  return Buffer.from(relativePath, 'utf8').toString('base64url');
}

function decodeFileId(fileId) {
  return Buffer.from(fileId, 'base64url').toString('utf8');
}

function normalizeWebDavPath(value) {
  const raw = String(value || '/').replace(/\\/g, '/');
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.replace(/\/{2,}/g, '/');
}

function joinWebDav(...parts) {
  const merged = parts
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ''))
    .join('/');
  return normalizeWebDavPath(`/${merged}`);
}

/** Infer project folder + file name under a department WebDAV root (for remote ACL lookup). */
function projectAndFileNameFromWebDavPath(fullPath, departmentFolderPath) {
  const full = normalizeWebDavPath(fullPath);
  const base = normalizeWebDavPath(departmentFolderPath);
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  let rel = full;
  if (full === b || full === `${b}/`) {
    return { project: 'General', fileName: '' };
  }
  if (full.startsWith(`${b}/`)) {
    rel = full.slice(b.length + 1);
  }
  const parts = rel.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return { project: parts[0], fileName: parts[parts.length - 1] };
  }
  if (parts.length === 1) return { project: 'General', fileName: parts[0] };
  return { project: 'General', fileName: path.basename(full) };
}

function projectAndFileNameFromFsRel(relPath, departmentFolderPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  const base = folderPathToFsRelative(departmentFolderPath);
  let rest = rel;
  if (base && rel.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    rest = rel.slice(base.length + 1);
  }
  const parts = rest.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return { project: parts[0], fileName: parts[parts.length - 1] };
  }
  if (parts.length === 1) return { project: 'General', fileName: parts[0] };
  return { project: 'General', fileName: path.basename(rel) };
}

async function assertRemoteFileReadAllowed(req, department, fileName, project) {
  const bearer = getEffectiveRemoteBearer(req);
  if (!EXTERNAL_AUTH_URL || !bearer || !fileName) return { ok: true };
  const rows = await getCachedRemoteFiles(bearer, department.id, false, req?.user);
  const row = findRemoteFileRow(rows, fileName, project);
  if (!row?.access) return { ok: true };
  if (row.access.canView === false) {
    return { ok: false, reason: 'File server denied view access for this file.' };
  }
  return { ok: true };
}

async function assertRemoteFileDownloadAllowed(req, department, fileName, project) {
  const bearer = getEffectiveRemoteBearer(req);
  if (!EXTERNAL_AUTH_URL || !bearer || !fileName) return { ok: true };
  const rows = await getCachedRemoteFiles(bearer, department.id, false, req?.user);
  const row = findRemoteFileRow(rows, fileName, project);
  if (!row?.access) return { ok: true };
  if (row.access.canView === false) {
    return { ok: false, reason: 'File server denied view access for this file.' };
  }
  if (Object.prototype.hasOwnProperty.call(row.access, 'canDownload') && row.access.canDownload !== true) {
    return { ok: false, reason: 'File server denied download for this file.' };
  }
  return { ok: true };
}

async function assertRemoteFileEditAllowed(req, department, fileName, project) {
  const bearer = getEffectiveRemoteBearer(req);
  if (!EXTERNAL_AUTH_URL || !bearer || !fileName) return { ok: true };
  const rows = await getCachedRemoteFiles(bearer, department.id, false, req?.user);
  const row = findRemoteFileRow(rows, fileName, project);
  if (!row?.access) return { ok: true };
  if (row.access.canEdit !== true) {
    return { ok: false, reason: 'File server denied edit/delete for this file.' };
  }
  return { ok: true };
}

async function assertProjectUploadAllowed(req, department, project) {
  if (!trustFileServerAcl()) return { ok: true };
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  const deptHasAccess = isAdminUser(req) || canUserAccessDepartment(userDeptId, department);
  const portalViewOnly = !canSessionEditDepartment(req, department);
  const restricted = RESTRICTED_PROJECTS.has(String(project || '').toLowerCase());
  const bearer = getEffectiveRemoteBearer(req);
  let remoteRows = [];
  if (EXTERNAL_AUTH_URL && bearer) {
    try {
      remoteRows = await getCachedRemoteFiles(bearer, department.id, false, req?.user);
    } catch {
      remoteRows = [];
    }
  }
  const inheritFromFileServer = trustFileServerAcl() && remoteRows.length > 0;
  const deptPerm = inheritFromFileServer
    ? 'edit'
    : isDepartmentViewOnly(department)
      ? 'view'
      : 'edit';
  const folderPermission = folderPermissionFromRemote(project, remoteRows, deptPerm);
  const folderCanEdit = folderPermission === 'edit' && !restricted;
  if (inheritFromFileServer) {
    return deptHasAccess && folderCanEdit
      ? { ok: true }
      : { ok: false, reason: 'Upload is not allowed in this folder.' };
  }
  const canEdit = folderRowCanEditForUser(
    deptHasAccess,
    folderCanEdit,
    portalViewOnly,
    deptPerm,
    folderPermission,
    isAdminUser(req),
    restricted,
  );
  return canEdit ? { ok: true } : { ok: false, reason: 'Upload is not allowed in this folder.' };
}

function folderPathToFsRelative(folderPath) {
  const raw = String(folderPath || '').trim();
  if (!raw || raw === '/') return '';

  const slashNormalized = raw.replace(/\\/g, '/');
  const withoutLeadingSlash = slashNormalized.replace(/^\/+/, '');
  const looksAbsoluteWindows = /^[a-z]:\//i.test(withoutLeadingSlash);
  const looksUnc = slashNormalized.startsWith('//');

  if (looksAbsoluteWindows || looksUnc) {
    const absoluteFolder = looksAbsoluteWindows ? withoutLeadingSlash : raw;
    const resolvedRoot = path.resolve(FILE_SERVER_ROOT);
    const resolvedFolder = path.resolve(absoluteFolder);
    const relative = path.relative(resolvedRoot, resolvedFolder);
    if (!relative || relative === '.') return '';
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.replace(/\\/g, '/');
    }
  }

  return withoutLeadingSlash;
}

function withinRoot(absolutePath) {
  const normalizedRoot = path.resolve(FILE_SERVER_ROOT);
  const normalizedTarget = path.resolve(absolutePath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

async function readUsersJson() {
  try {
    const raw = await fs.readFile(USERS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getDynamicConfig(forceRefresh = false) {
  const usersJson = await readUsersJson();
  const wd = getWebdavClient();
  const envNaming = String(process.env.PORTAL_UPLOAD_FILE_NAMING || '').trim().toLowerCase();
  const portalPolicyOverrides =
    envNaming === 'preserve-name' || envNaming === 'unique-suffix'
      ? { uploadFileNaming: envNaming }
      : {};
  if (forceRefresh) {
    ncGroupsListCache = { at: 0, groups: [] };
  }
  const base = await loadDynamicConfig({
    fileServerRoot: wd ? null : FILE_SERVER_ROOT,
    webdavClient: wd,
    usersJson,
    staticFallbackDepartments: NYATSI_DEPARTMENTS_LIST,
    portalPolicyOverrides,
    forceRefresh: !!forceRefresh,
    skipAutoAdminDepartment: NEXTCLOUD_PORTAL_AUTH === 'groups',
  });

  /** Departments = Nextcloud OCS groups ∪ top-level WebDAV folders (no synthetic IT Administration). */
  if (NEXTCLOUD_PORTAL_AUTH === 'groups' && getUsingWebDav()) {
    const nc = await fetchNextcloudGroupListCached(!!forceRefresh);
    if (nc.ok) {
      const fromGroups = departmentsFromNextcloudGroupNames(nc.groups);
      let folderRows = [];
      try {
        folderRows = wd ? await listRootFoldersWebDav(wd) : [];
      } catch {
        folderRows = [];
      }
      let departments = mergeNextcloudGroupAndFolderDepartments(fromGroups, folderRows);
      let usedFolderScanFallback = false;
      if (departments.length === 0 && base.departments?.length) {
        // eslint-disable-next-line no-console
        console.warn(
          '[portal] Nextcloud groups + folders list empty; using folder scan / inyatsi-config / static fallback.',
        );
        departments = base.departments;
        usedFolderScanFallback = true;
      }
      const departmentsById = departments.reduce((acc, d) => {
        acc[d.id] = d;
        return acc;
      }, {});
      const departmentsByFolder = departments.reduce((acc, d) => {
        acc[normalizeWebDavPath(d.folderPath)] = d;
        return acc;
      }, {});
      return {
        ...base,
        departments,
        departmentsById,
        departmentsByFolder,
        inheritanceMeta: {
          ...base.inheritanceMeta,
          departmentsSource: usedFolderScanFallback ? 'nextcloud-groups-fallback-empty' : 'nextcloud-groups-plus-folders',
          rootFoldersScanned: folderRows.length,
          nextcloudGroupCount: (nc.groups || []).length,
          nextcloudDepartmentCount: departments.length,
        },
      };
    }
    // eslint-disable-next-line no-console
    console.warn('[portal] Nextcloud /cloud/groups failed; using folder scan / config fallback.', nc.error);
    if (base.departments?.length) {
      return {
        ...base,
        inheritanceMeta: {
          ...base.inheritanceMeta,
          departmentsSource: 'nextcloud-groups-ocs-failed',
          nextcloudGroupsError: nc.error,
        },
      };
    }
    return {
      ...base,
      departments: [],
      departmentsById: {},
      departmentsByFolder: {},
      inheritanceMeta: {
        ...base.inheritanceMeta,
        departmentsSource: 'nextcloud-groups-error',
        nextcloudGroupsError: nc.error,
      },
    };
  }

  return base;
}

async function readUsers() {
  const config = await getDynamicConfig();
  return config.users;
}

function resolveDepartmentByAny(departmentsById, inputValue, fallbackEmployeeId = '') {
  const value = String(inputValue || '').trim().toLowerCase();
  const byId = departmentsById[value];
  if (byId) return byId;
  const first = Object.values(departmentsById)[0];
  return first || { id: 'engineering', folderPath: '/', label: 'Engineering', permission: 'edit' };
}

async function safeStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function addActivity(entry, req) {
  const uid = entry.employeeId || req?.user?.employeeId || 'unknown';
  const visitorName = entry.visitorName || req?.user?.name || uid;
  const row = {
    ...entry,
    employeeId: uid,
    visitorName,
    client: entry.client && entry.client !== 'unknown' ? entry.client : portalClientFromReq(req),
  };
  activityLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...row,
  });
  if (activityLog.length > ACTIVITY_LOG_MAX) {
    activityLog.length = ACTIVITY_LOG_MAX;
  }
  schedulePersistActivityLog();
}

function enrichFilesWithUploader(files, users = []) {
  const byEmployeeId = users.reduce((acc, u) => {
    acc[String(u.employeeId || '').toLowerCase()] = u.name || u.employeeId;
    return acc;
  }, {});
  const uploads = activityLog.filter((a) => a.action === 'uploaded' || a.action === 'updated');
  return files.map((file) => {
    const match = uploads.find(
      (a) =>
        a.fileName === file.name &&
        a.department === file.department &&
        (a.project || 'General') === (file.project || 'General')
    );
    const employeeId = match?.employeeId || null;
    const uploadedByName = employeeId ? (byEmployeeId[employeeId.toLowerCase()] || employeeId) : null;
    return { ...file, uploadedBy: employeeId, uploadedByName };
  });
}

function isAdminUser(req) {
  if (!req.user) return false;
  if (req.user.isAdmin === true) return true;
  return String(req.user?.departmentId || '').trim().toLowerCase() === 'admin';
}

/** Departments visible for stats/activity (all for admin). */
function userDepartmentsScope(req, config) {
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  if (isAdminUser(req)) return config.departments;
  return config.departments.filter((d) => canUserAccessDepartment(userDeptId, d));
}

function activityEntryInScope(req, entry, config) {
  if (isAdminUser(req)) return true;
  const departments = userDepartmentsScope(req, config);
  const actDept = String(entry.department || '').toLowerCase();
  const actDeptId = String(entry.departmentId || '').toLowerCase();
  return departments.some((d) => {
    const did = String(d.id || '').toLowerCase();
    const dlabel = String(d.label || '').toLowerCase();
    if (actDeptId && did && actDeptId === did) return true;
    return (
      actDept === dlabel ||
      actDept === did ||
      (dlabel.length > 0 && actDept.includes(dlabel))
    );
  });
}

async function activityEntryMatchesCurrentFileServer(entry, config) {
  const department = resolveDepartmentByAny(
    config.departmentsById || {},
    entry?.departmentId || entry?.department,
    entry?.employeeId,
  );
  if (!department?.id) return false;

  const depFolder = path.join(FILE_SERVER_ROOT, folderPathToFsRelative(department.folderPath));
  const depStat = await safeStat(depFolder);
  if (!depStat?.isDirectory()) return false;

  const project = String(entry?.project || 'General').trim() || 'General';
  const fileName = String(entry?.fileName || '').trim();
  if (!fileName) return false;

  const candidatePaths = [
    path.join(depFolder, project, fileName),
    path.join(depFolder, fileName),
  ];

  for (const candidate of candidatePaths) {
    if (!withinRoot(candidate)) continue;
    const st = await safeStat(candidate);
    if (st?.isFile()) return true;
  }
  return false;
}

/** Portal capabilities from the effective session permission only; UI must not expose extra actions. */
function capabilitiesFromPermission(req) {
  const perm = String(req.user?.permission || 'edit').toLowerCase();
  const canEdit = perm === 'edit' || perm === 'admin' || isAdminUser(req);
  return {
    read: true,
    download: true,
    upload: canEdit,
    delete: canEdit,
    edit: canEdit,
  };
}

function isDepartmentViewOnly(department) {
  return String(department?.permission || 'edit').toLowerCase() === 'view';
}

function canSessionEditDepartment(req, department) {
  if (isAdminUser(req)) return true;
  return !isDepartmentViewOnly(department);
}

async function getDepartmentContext(req, usersDepartmentFallback = '', requestedDepartmentOverride = '') {
  const config = await getDynamicConfig();
  const { departmentsById } = await mergeRemoteDepartmentsIntoConfig(config, req);
  const requested = String(requestedDepartmentOverride || req.query?.department || '').trim().toLowerCase();
  const fromTokenId = String(req.user?.departmentId || '').trim().toLowerCase();
  const fromTokenLabel = String(req.user?.department || '').trim().toLowerCase();
  const fallback = fromTokenId || fromTokenLabel || usersDepartmentFallback;
  if (isAdminUser(req)) {
    return resolveDepartmentByAny(departmentsById, requested || fallback);
  }
  if (requested) {
    const dept = departmentsById[requested];
    if (dept && canUserAccessDepartment(fromTokenId, dept)) {
      return dept;
    }
  }
  return resolveDepartmentByAny(departmentsById, fallback);
}

async function listFilesFromFs(department, project, q) {
  const relativeFolder = folderPathToFsRelative(department.folderPath);
  const baseRoot = path.join(FILE_SERVER_ROOT, relativeFolder);
  const baseDir = project ? path.join(baseRoot, sanitizeSegment(project)) : baseRoot;
  if (!withinRoot(baseDir)) return [];
  const dirStat = await safeStat(baseDir);
  if (!dirStat || !dirStat.isDirectory()) return [];

  const files = await walkDirectory(baseDir);
  const mapped = await Promise.all(
    files.map(async ({ absolutePath }) => {
      const stat = await fs.stat(absolutePath);
      const absoluteRelative = path.relative(FILE_SERVER_ROOT, absolutePath);
      const fromBase = path.relative(baseRoot, absolutePath);
      const segments = fromBase.split(path.sep);
      const inferredProject = segments.length > 1 ? segments[0] : project || 'General';
      const name = path.basename(absolutePath);
      const fileType = path.extname(name).replace('.', '').toUpperCase() || 'FILE';
      return {
        id: encodeFileId(absoluteRelative),
        name,
        project: inferredProject,
        department: department.label,
        departmentId: department.id,
        folderPath: department.folderPath,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
        fileType,
      };
    }),
  );
  return mapped
    .filter((item) => !q || item.name.toLowerCase().includes(q) || item.project.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

function isRetryableWebDavError(err) {
  const status = err?.response?.status ?? err?.status;
  return status === 429 || status === 401 || status === 503;
}

/** Missing folder on Nextcloud/WebDAV often returns 404; webdav throws "Invalid response: 404" style messages. */
function isWebDavNotFoundError(err) {
  const status = err?.response?.status ?? err?.status;
  if (status === 404) return true;
  const msg = String(err?.message || err || '');
  return /(^|\s)404(\s|$)|not\s*found|invalid\s+response/i.test(msg);
}

/** List files: try WebDAV first, fallback to local FS on 429/401/503/404 (missing remote folder). */
async function listFiles(department, project, q) {
  const client = getWebdavClient();
  if (client) {
    try {
      return await listFilesFromWebDav(department, project, q);
    } catch (err) {
      if (isWebDavNotFoundError(err) || isRetryableWebDavError(err)) {
        try {
          return await listFilesFromFs(department, project, q);
        } catch {
          return [];
        }
      }
      throw err;
    }
  }
  return listFilesFromFs(department, project, q);
}

async function listFilesFromWebDav(department, project, q) {
  const baseRoot = normalizeWebDavPath(department.folderPath);
  const basePath = project ? joinWebDav(baseRoot, sanitizeSegment(project)) : baseRoot;
  const client = getWebdavClient();
  if (!client) return [];
  const entries = await client.getDirectoryContents(basePath, { deep: true });
  const files = entries.filter((entry) => entry.type === 'file');
  return files
    .map((entry) => {
      const relative = entry.filename.slice(baseRoot.length).replace(/^\/+/, '');
      const inferredProject = relative.includes('/') ? relative.split('/')[0] : project || 'General';
      const name = entry.basename || path.basename(entry.filename);
      const fileType = path.extname(name).replace('.', '').toUpperCase() || 'FILE';
      return {
        id: encodeFileId(entry.filename),
        name,
        project: inferredProject,
        department: department.label,
        departmentId: department.id,
        folderPath: department.folderPath,
        size: entry.size || null,
        uploadedAt: entry.lastmod ? new Date(entry.lastmod).toISOString() : null,
        fileType,
      };
    })
    .filter((item) => !q || item.name.toLowerCase().includes(q) || item.project.toLowerCase().includes(q))
    .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const tokenFromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const tokenFromQuery = String(req.query?.token || '').trim();
  const token = tokenFromHeader || tokenFromQuery;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function walkDirectory(rootDir, prefix = '') {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const allFiles = [];
  for (const entry of entries) {
    const rel = prefix ? path.join(prefix, entry.name) : entry.name;
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkDirectory(abs, rel);
      allFiles.push(...nested);
    } else {
      allFiles.push({ relativePath: rel, absolutePath: abs });
    }
  }
  return allFiles;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/nextcloud/test', async (_req, res) => {
  const client = getWebdavClient();
  if (!client) {
    return res.status(503).json({
      ok: false,
      error: 'File server connection is not configured. Use System Settings to save the server connection.',
    });
  }
  try {
    await client.getDirectoryContents('/');
    return res.json({ ok: true, message: 'Connected to file server' });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: err?.message || 'File server connection failed',
    });
  }
});

app.get('/api/nextcloud/status', authRequired, async (req, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ error: 'Admin access required' });
  const client = getWebdavClient();
  const cfg = loadNextcloudConfig();
  const setupInfo = getNextcloudSetupInfo();
  let inheritance = null;
  try {
    const dyn = await getDynamicConfig(false);
    inheritance = dyn.inheritanceMeta || null;
  } catch {
    inheritance = null;
  }
  const configured = Boolean(cfg.url && cfg.username);
  const baseUrl = cfg.url ? cfg.url.replace(/\/remote\.php\/dav\/files\/[^/]+\/?$/, '').replace(/\/+$/, '') : '';
  if (!client) {
    return res.json({
      configured,
      connected: false,
      folders: [],
      url: baseUrl,
      username: cfg.username || '',
      error: configured
        ? 'Cannot connect — check URL, username, and password'
        : 'Enter server URL, username, and password below.',
      inheritance,
      ...setupInfo,
    });
  }
  try {
    const entries = await client.getDirectoryContents('/', { deep: false });
    const folders = entries
      .filter((e) => String(e.type || '').toLowerCase() === 'directory' || e.type === 2)
      .map((e) => e.basename || e.filename?.split('/').filter(Boolean).pop() || '')
      .filter((n) => n && !n.startsWith('.'));
    return res.json({
      configured: true,
      connected: true,
      folders,
      url: baseUrl,
      username: cfg.username || '',
      inheritance,
      ...setupInfo,
    });
  } catch (err) {
    return res.json({
      configured: true,
      connected: false,
      folders: [],
      url: baseUrl,
      username: cfg.username || '',
      error: err?.message || 'Connection failed',
      inheritance,
      ...setupInfo,
    });
  }
});

app.post('/api/nextcloud/configure', authRequired, async (req, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ error: 'Admin access required' });
  const urlInput = String(req.body?.url || req.body?.urlInput || '').trim();
  let username = String(req.body?.username || '').trim();
  let password = String(req.body?.password || '').trim();
  const existing = loadNextcloudConfig();
  if (!username) username = existing.username || process.env.NEXTCLOUD_USERNAME || '';
  if (!password && existing?.password) password = existing.password;
  if (!password) password = process.env.NEXTCLOUD_PASSWORD || '';
  if (!urlInput) {
    return res.status(400).json({ error: 'Server URL is required' });
  }
  if (!username) {
    return res.status(400).json({ error: 'Server username is required' });
  }
  if (!password) {
    return res.status(400).json({
      error: 'Password is required on first setup. After saving once, leave password blank to keep the stored password.',
    });
  }
  const webdavUrl = buildWebDavUrl(urlInput, username);
  if (!webdavUrl) {
    return res.status(400).json({ error: 'Invalid server URL' });
  }
  const config = { url: webdavUrl, username, password };
  await fs.mkdir(path.dirname(NEXTCLOUD_CONFIG_PATH), { recursive: true });
  await fs.writeFile(NEXTCLOUD_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  invalidateCache();
  return res.json({
    ok: true,
    message: 'File server saved. Departments and files will use this WebDAV endpoint.',
    webdavUrl,
  });
});

/** Test file-server connection without saving (for live demos). */
app.post('/api/file-server/test', authRequired, async (req, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ error: 'Admin access required' });
  const urlInput = String(req.body?.url || '').trim();
  let username = String(req.body?.username || '').trim();
  let password = String(req.body?.password || '').trim();
  const existing = loadNextcloudConfig();
  if (!username) username = existing.username || process.env.NEXTCLOUD_USERNAME || '';
  if (!password && existing?.password) password = existing.password;
  if (!password) password = process.env.NEXTCLOUD_PASSWORD || '';
  if (!urlInput) {
    return res.status(400).json({ error: 'Server URL is required' });
  }
  if (!username || !password) {
    return res.status(400).json({
      error: 'Enter server username and password (or save a connection first to reuse the stored password).',
    });
  }
  const webdavUrl = buildWebDavUrl(urlInput, username);
  try {
    const client = createWebdavClient(webdavUrl, { username, password });
    const entries = await client.getDirectoryContents('/', { deep: false });
    const folders = entries
      .filter((e) => String(e.type || '').toLowerCase() === 'directory' || e.type === 2)
      .map((e) => e.basename || e.filename?.split('/').filter(Boolean).pop() || '')
      .filter((n) => n && !n.startsWith('.'))
      .slice(0, 30);
    return res.json({
      ok: true,
      connected: true,
      webdavUrl,
      folderCount: folders.length,
      folders,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      connected: false,
      webdavUrl,
      error:
        err?.message ||
        'Connection failed. Use a WebDAV URL, or your Nextcloud/ownCloud base URL (https://host).',
    });
  }
});

function sanitizeFileServerUrlForClient(baseUrl) {
  if (!baseUrl) return '';
  try {
    const u = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    return new URL(u).hostname;
  } catch {
    return 'Remote';
  }
}

/** Combined status: WebDAV + local folder (dashboard banner). Any signed-in user may read a safe summary; admins get full detail. */
app.get('/api/file-server/status', authRequired, async (req, res) => {
  const isAdmin = isAdminUser(req);
  const cfg = loadNextcloudConfig();
  const hasCreds = Boolean(cfg.url && cfg.username && cfg.password);
  const client = getWebdavClient();
  const baseUrl = cfg.url
    ? String(cfg.url).replace(/\/remote\.php\/dav\/files\/[^/]+\/?$/, '').replace(/\/+$/, '')
    : '';
  let webdav = {
    configured: hasCreds,
    connected: false,
    url: baseUrl,
    username: cfg.username || '',
    folders: [],
    error: null,
    endpoint: cfg.url || '',
  };
  if (client) {
    try {
      const entries = await client.getDirectoryContents('/', { deep: false });
      webdav.folders = entries
        .filter((e) => String(e.type || '').toLowerCase() === 'directory' || e.type === 2)
        .map((e) => e.basename || e.filename?.split('/').filter(Boolean).pop() || '')
        .filter((n) => n && !n.startsWith('.'));
      webdav.connected = true;
    } catch (err) {
      webdav.error = err?.message || 'Not connected';
    }
  } else if (hasCreds) {
    webdav.error = 'Invalid stored credentials or URL';
  }

  if (!isAdmin) {
    const folderCount = webdav.folders?.length ?? 0;
    webdav = {
      configured: webdav.configured,
      connected: webdav.connected,
      url: webdav.connected ? sanitizeFileServerUrlForClient(baseUrl) : '',
      username: '',
      endpoint: '',
      folders: webdav.connected ? webdav.folders.slice(0, 5) : [],
      folderCount,
      error: webdav.error,
    };
  }

  let remoteAuth = await fetchRemoteAuthServerHealth();
  if (remoteAuth.configured && !isAdmin) {
    const host = sanitizeFileServerUrlForClient(EXTERNAL_AUTH_URL);
    remoteAuth = {
      configured: true,
      reachable: remoteAuth.reachable,
      service: remoteAuth.service || null,
      statusText: remoteAuth.statusText || null,
      host: host || 'Remote',
      error: remoteAuth.error,
    };
  }

  return res.json({
    storageMode: webdav.connected ? 'webdav' : hasCreds ? 'webdav_error' : 'local',
    webdav,
    localFolder: isAdmin ? FILE_SERVER_ROOT : path.basename(FILE_SERVER_ROOT),
    remoteAuth,
    remoteAuthUrl: isAdmin && EXTERNAL_AUTH_URL ? EXTERNAL_AUTH_URL : undefined,
    scope: isAdmin ? 'admin' : 'user',
    updatedAt: new Date().toISOString(),
  });
});

async function readAdminConfig() {
  try {
    const raw = await fs.readFile(ADMIN_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeAdminConfig(data) {
  await fs.mkdir(path.dirname(ADMIN_CONFIG_PATH), { recursive: true });
  await fs.writeFile(ADMIN_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/admin/setup-status', async (_req, res) => {
  let config = await readAdminConfig();
  if (!config?.username) {
    const users = await readUsers();
    const admin = users.find((u) => String(u.departmentId || '').toLowerCase() === 'admin');
    if (admin) {
      await writeAdminConfig({ email: admin.email || '', username: admin.employeeId });
      config = { email: admin.email || '', username: admin.employeeId };
    }
  }
  return res.json({ configured: Boolean(config?.username) });
});

app.post('/api/admin/setup', async (req, res) => {
  const config = await readAdminConfig();
  if (config?.username) {
    return res.status(400).json({ error: 'Admin already configured. Use System Settings to update.' });
  }
  const email = String(req.body?.email || '').trim();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const users = await readUsers();
  const adminIndex = users.findIndex((u) => String(u.departmentId || '').toLowerCase() === 'admin');
  if (adminIndex === -1) {
    users.push({
      employeeId: username,
      password,
      name: username,
      email: email || undefined,
      role: 'Project Manager',
      departmentId: 'admin',
    });
  } else {
    users[adminIndex] = {
      ...users[adminIndex],
      employeeId: username,
      password,
      name: username,
      email: email || users[adminIndex].email,
    };
  }
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
  await writeAdminConfig({ email, username });
  return res.json({ ok: true });
});

app.put('/api/admin/credentials', authRequired, async (req, res) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const email = String(req.body?.email || '').trim();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const users = await readUsers();
  const adminIndex = users.findIndex((u) => String(u.departmentId || '').toLowerCase() === 'admin');
  if (adminIndex === -1) return res.status(500).json({ error: 'Admin user not found' });
  const oldUsername = users[adminIndex].employeeId;
  users[adminIndex] = {
    ...users[adminIndex],
    employeeId: username,
    password,
    name: username,
    email: email || users[adminIndex].email,
  };
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
  await writeAdminConfig({ email, username });
  return res.json({ ok: true });
});

app.get('/api/admin/credentials', authRequired, async (req, res) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const config = await readAdminConfig();
  return res.json({ email: config?.email || '', username: config?.username || '' });
});

app.post('/api/login', async (req, res) => {
  const employeeId = String(req.body?.employeeId || '').trim();
  const password = String(req.body?.password || '').trim();
  const role = String(req.body?.role || '').trim() || 'Engineer';
  const selectedDepartmentId = String(req.body?.departmentId || '').trim().toLowerCase();
  if (!employeeId || !password) {
    return res.status(400).json({ error: 'employeeId and password are required' });
  }
  if (!selectedDepartmentId) {
    return res.status(400).json({ error: 'Department must be selected first' });
  }

  const config = await getDynamicConfig();
  let departments = [...(config.departments || [])];
  if (EXTERNAL_AUTH_URL && REMOTE_API_BEARER_TOKEN) {
    const r = await fetchRemoteDepartments(REMOTE_API_BEARER_TOKEN, null);
    departments = mergeDepartmentLists(departments, r);
  }

  let ext = null;
  if (EXTERNAL_AUTH_URL) {
    ext = await verifyExternalAuth(employeeId, password, selectedDepartmentId);
    if (ext?.ok && ext.remoteAccessToken) {
      const r = await fetchRemoteDepartments(ext.remoteAccessToken, ext?.user || { username: employeeId, employeeId });
      departments = mergeDepartmentLists(departments, r);
    }
    if (ext?.ok && ext.departmentsFromAuth?.length) {
      departments = mergeDepartmentLists(departments, ext.departmentsFromAuth);
    }
  }

  const departmentsById = departments.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, {});
  const department = departmentsById[selectedDepartmentId];
  if (!department) {
    return res.status(400).json({ error: 'Invalid department' });
  }

  let user = null;
  let authSource = 'local';

  if (EXTERNAL_AUTH_URL && ext?.ok) {
    authSource = 'external';
    const extUser = ext.user || {};
    const deptFromExternal = String(extUser.departmentId || extUser.department || '').trim().toLowerCase();
    const resolvedDeptId = departmentsById[deptFromExternal] ? deptFromExternal : selectedDepartmentId;
    const resolvedDept = departmentsById[resolvedDeptId] || department;
    user = {
      employeeId,
      name: extUser.name || extUser.displayName || employeeId,
      departmentId: resolvedDeptId,
      department: resolvedDept.label,
      // Effective permission for THIS user in the selected department root.
      permission: extUser.permission || resolvedDept.permission || 'edit',
    };
  } else if (EXTERNAL_AUTH_URL && !ext?.ok && !EXTERNAL_AUTH_FALLBACK_TO_LOCAL) {
    return res.status(401).json({ error: ext?.error || 'Invalid credentials' });
  }

  if (!user && NEXTCLOUD_PORTAL_AUTH === 'groups' && getUsingWebDav()) {
    const ncAuth = await authenticateWithNextcloudGroups({
      employeeId,
      password,
      department,
      selectedDepartmentId,
      config,
      role,
    });
    if (!ncAuth.ok) {
      return res.status(ncAuth.status || 403).json({ error: ncAuth.error });
    }
    user = ncAuth.user;
    authSource = ncAuth.authSource || 'nextcloud-groups';
  }

  if (!user) {
    const users = config.users;
    const localUser = users.find((u) => u.employeeId?.toLowerCase() === employeeId.toLowerCase());
    if (!localUser) return res.status(401).json({ error: 'Invalid credentials' });
    const storedPassword = String(localUser.password || '').trim();
    if (storedPassword !== password) return res.status(401).json({ error: 'Invalid credentials' });
    user = localUser;
  }

  const userDeptId = String(user.departmentId || user.department || '').trim().toLowerCase();
  const isAdmin = userDeptId === 'admin';
  const deptId = String(department.id || '').toLowerCase();
  const deptLabel = String(department.label || '').toLowerCase();
  const deptPath = String(department.folderPath || '').toLowerCase();
  const deptMatches =
    isAdmin ||
    userDeptId === selectedDepartmentId ||
    userDeptId === deptId ||
    deptId.startsWith(userDeptId) ||
    userDeptId.startsWith(deptId) ||
    deptId.includes(userDeptId) ||
    userDeptId.includes(deptId) ||
    deptLabel.includes(userDeptId) ||
    deptPath.includes(userDeptId);
  if (!deptMatches) {
    return res.status(403).json({ error: 'Access denied. Credentials do not match this department.' });
  }

  const resolvedDept = user
    ? resolveDepartmentByAny(departmentsById, user.departmentId || user.department || user.employeeId, user.employeeId)
    : department;
  const displayDept = departmentsById[selectedDepartmentId] || resolvedDept;
  const permission = user?.permission || displayDept.permission || 'edit';

  const empId = user?.employeeId || employeeId;
  const empName = user?.name || employeeId;
  const empRole = role || user?.role || 'Engineer';

  const adminDeptRecord = departmentsById.admin || {
    id: 'admin',
    label: 'IT Administration',
    folderPath: '/',
  };

  const remoteAccessToken =
    authSource === 'external' && ext?.remoteAccessToken ? ext.remoteAccessToken : undefined;

  const payload = isAdmin
    ? {
        employeeId: empId,
        name: empName,
        role: empRole,
        department: adminDeptRecord.label,
        departmentId: 'admin',
        folderPath: adminDeptRecord.folderPath,
        permission: 'edit',
        isAdmin: true,
        ...(remoteAccessToken ? { remoteAccessToken } : {}),
      }
    : {
        employeeId: empId,
        name: empName,
        role: empRole,
        department: displayDept.label,
        departmentId: displayDept.id,
        folderPath: displayDept.folderPath,
        permission,
        isAdmin: false,
        ...(remoteAccessToken ? { remoteAccessToken } : {}),
      };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

  return res.json({
    token,
    user: {
      employeeId: empId,
      name: empName,
      role: empRole,
      department: payload.department,
      departmentId: payload.departmentId,
      folderPath: payload.folderPath,
      permission: payload.permission,
      isAdmin: payload.isAdmin === true,
    },
  });
});

function canUserAccessDepartment(userDeptId, department) {
  if (!userDeptId || userDeptId === 'admin') return true;
  const deptId = String(department?.id || '').toLowerCase();
  const deptLabel = String(department?.label || '').toLowerCase();
  const deptPath = String(department?.folderPath || '').toLowerCase();
  return (
    userDeptId === deptId ||
    deptId.startsWith(userDeptId) ||
    userDeptId.startsWith(deptId) ||
    deptId.includes(userDeptId) ||
    userDeptId.includes(deptId) ||
    deptLabel.includes(userDeptId) ||
    deptPath.includes(userDeptId)
  );
}

/** Users visible in portal lists: admins see all; others see same department (aligned with stats scope). */
function filterUsersJsonForRequest(req, users) {
  if (isAdminUser(req)) return [...users];
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  return users.filter((u) => canUserAccessDepartment(userDeptId, { id: u.departmentId }));
}

function normalizePortalUserRecord(user, config) {
  const department = resolveDepartmentByAny(
    config.departmentsById,
    user.departmentId || user.department || user.employeeId,
    user.employeeId
  );
  return {
    employeeId: user.employeeId,
    name: user.name || user.employeeId,
    role: user.role || 'Engineer',
    department: department.label,
    departmentId: department.id,
    folderPath: department.folderPath,
    permission: user.permission || department.permission || 'edit',
  };
}

/** Group normalized users by department for /api/users?grouped=1 */
function buildUsersGroupedByDepartment(normalized) {
  const byDept = new Map();
  for (const row of normalized) {
    const key = String(row.departmentId || '').toLowerCase();
    if (!byDept.has(key)) {
      byDept.set(key, {
        departmentId: row.departmentId,
        label: row.department,
        folderPath: row.folderPath,
        users: [],
      });
    }
    byDept.get(key).users.push({
      employeeId: row.employeeId,
      name: row.name,
      role: row.role,
    });
  }
  return Array.from(byDept.values()).sort((a, b) =>
    String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' }),
  );
}

app.get('/api/departments', async (req, res) => {
  const forceRefresh = req.query?.refresh === '1';
  if (forceRefresh) clearRemoteDepartmentCaches();
  const config = await getDynamicConfig(forceRefresh);
  const { departments } = await mergeRemoteDepartmentsIntoConfig(config, req);

  const authToken = req.headers.authorization?.replace(/^Bearer /i, '') || req.query?.token || '';
  let userDeptId = '';
  let isAdmin = false;
  let tokenUser = null;
  if (authToken) {
    try {
      tokenUser = jwt.verify(authToken, JWT_SECRET);
      userDeptId = String(tokenUser?.departmentId || '').trim().toLowerCase();
      isAdmin = Boolean(tokenUser?.isAdmin === true || userDeptId === 'admin');
    } catch {
      /* no token or invalid - treat as all access */
    }
  }

  const result = await Promise.all(
    departments.map(async (d) => {
      const deptHasAccess = !userDeptId || isAdmin || canUserAccessDepartment(userDeptId, d);
      const deptPerm = isDepartmentViewOnly(d) ? 'view' : 'edit';
      const portalViewOnly = !isAdmin && isDepartmentViewOnly(d);
      const bearer = getEffectiveRemoteBearer({ user: tokenUser, headers: req.headers });
      let remoteRows = [];
      if (EXTERNAL_AUTH_URL && bearer) {
        try {
          remoteRows = await getCachedRemoteFiles(bearer, d.id, false, tokenUser);
        } catch {
          remoteRows = [];
        }
      }
      let rawFolders = [];
      try {
        rawFolders = await listDepartmentFolders(d);
      } catch {
        rawFolders = [];
      }
      if (!rawFolders.length && remoteRows.length) {
        const names = new Set();
        for (const row of remoteRows) {
          const p = String(row.folder || row.project || row.subfolder || 'General').trim() || 'General';
          names.add(p);
        }
        rawFolders = Array.from(names)
          .sort((a, b) => a.localeCompare(b))
          .map((n) => ({ id: n, name: n }));
      }
      const inheritFromFileServer = trustFileServerAcl() && remoteRows.length > 0;
      const deptPermForFolders = inheritFromFileServer
        ? 'edit'
        : isDepartmentViewOnly(d)
          ? 'view'
          : 'edit';
      const effectivePortalViewOnly = inheritFromFileServer ? false : portalViewOnly;
      const folders = rawFolders.map((f) => {
        const restricted = RESTRICTED_PROJECTS.has((f.name || '').toLowerCase());
        const fp = folderPermissionFromRemote(f.name, remoteRows, deptPermForFolders);
        const folderCanEdit = fp === 'edit' && !restricted;
        return {
          id: f.id,
          name: f.name,
          type: 'folder',
          permission: fp,
          can_edit: folderRowCanEditForUser(
            deptHasAccess,
            folderCanEdit,
            effectivePortalViewOnly,
            deptPermForFolders,
            fp,
            isAdmin,
            restricted,
          ),
          has_access: deptHasAccess && (isAdmin || !restricted),
        };
      });
      return {
        id: d.id,
        department: d.label || d.id,
        label: d.label || d.id,
        folderPath: d.folderPath || '/',
        permission: deptPerm,
        has_access: deptHasAccess,
        folders,
      };
    })
  );

  return res.json({ departments: result });
});

app.post('/api/departments/refresh', authRequired, async (req, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ error: 'Admin access required' });
  invalidateCache();
  clearRemoteDepartmentCaches();
  clearRemoteFileCaches();
  const config = await getDynamicConfig(true);
  return res.json({ ok: true, departments: config.departments });
});

/** Folders restricted for non-admin (configurable) */
const RESTRICTED_PROJECTS = new Set(['site reports', 'design documents']);

/** List subfolders for a department (WebDAV or local FS) */
async function listDepartmentFolders(department) {
  const wdc = getWebdavClient();
  if (wdc) {
    try {
      const entries = await wdc.getDirectoryContents(normalizeWebDavPath(department.folderPath));
      return entries
        .filter((entry) => entry.type === 'directory')
        .map((entry) => ({ id: entry.basename, name: entry.basename }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
  const deptDir = path.join(FILE_SERVER_ROOT, folderPathToFsRelative(department.folderPath));
  if (!withinRoot(deptDir)) return [];
  const stat = await safeStat(deptDir);
  if (!stat?.isDirectory()) return [];
  const entries = await fs.readdir(deptDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, name: entry.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

app.get('/api/files', authRequired, async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const department = await getDepartmentContext(req);
  let project = String(req.query.project || '').trim();
  const pathParam = String(req.query.path || '').trim();
  if (!project && pathParam) {
    project = pathParam.replace(/^\/+|\/+$/g, '').split('/').pop() || '';
  }
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  const deptHasAccess = isAdminUser(req) || canUserAccessDepartment(userDeptId, department);
  const canEditPortal = canSessionEditDepartment(req, department);
  const forceRemote =
    (canEditPortal || trustFileServerAcl()) && String(req.query.refresh || '').trim() === '1';
  try {
    const bearer = getEffectiveRemoteBearer(req);
    const { files: combined, remoteRows } = await listFilesCombined(
      department,
      project,
      q,
      bearer,
      forceRemote,
      req?.user,
    );
    const users = await readUsers();
    let files = enrichFilesWithUploader(combined, users);
    const merged = enrichFilesWithRemoteAccess(files, department, remoteRows, { req, deptHasAccess });
    const withPermissions = merged.map((f) => ({ ...f, type: 'file' }));
    return res.json({
      files: withPermissions,
      department: department.label,
      departmentId: department.id,
      folderPath: department.folderPath,
      project: project || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not list files' });
  }
});

/** Clears remote file + department caches so the next list hits Nextcloud / file server. */
app.post('/api/files/refresh-cache', authRequired, async (req, res) => {
  const portalViewOnly = !canSessionEditDepartment(req, await getDepartmentContext(req));
  if (portalViewOnly && !trustFileServerAcl()) {
    return res.json({
      ok: true,
      serverCachesCleared: false,
      reason: 'View-only users use client refresh only; server cache unchanged.',
    });
  }
  clearRemoteFileCaches();
  clearRemoteDepartmentCaches();
  try {
    invalidateCache();
  } catch {
    /* ignore */
  }
  return res.json({ ok: true, serverCachesCleared: true });
});

app.get('/api/files/all', authRequired, async (req, res) => {
  const config = await getDynamicConfig();
  const { departments: mergedDepts } = await mergeRemoteDepartmentsIntoConfig(config, req);
  const q = String(req.query.q || '').toLowerCase();
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  const departments = isAdminUser(req)
    ? mergedDepts
    : mergedDepts.filter((d) => canUserAccessDepartment(userDeptId, d));
  const bearer = getEffectiveRemoteBearer(req);
  const allFiles = [];
  for (const dep of departments) {
    try {
      const deptHasAccess = isAdminUser(req) || canUserAccessDepartment(userDeptId, dep);
      const { files: combined, remoteRows } = await listFilesCombined(dep, null, q, bearer, false, req?.user);
      const merged = enrichFilesWithRemoteAccess(combined, dep, remoteRows, { req, deptHasAccess });
      allFiles.push(...merged.map((f) => ({ ...f, type: 'file' })));
    } catch {
      /* skip failed departments */
    }
  }
  allFiles.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
  const users = await readUsers();
  const enriched = enrichFilesWithUploader(allFiles, users);
  return res.json({ files: enriched });
});

app.get('/api/projects', authRequired, async (req, res) => {
  const department = await getDepartmentContext(req);
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  const deptHasAccess = isAdminUser(req) || canUserAccessDepartment(userDeptId, department);
  const portalViewOnly = !canSessionEditDepartment(req, department);
  const bearer = getEffectiveRemoteBearer(req);
  let remoteRows = [];
  if (EXTERNAL_AUTH_URL && bearer) {
    try {
      remoteRows = await getCachedRemoteFiles(bearer, department.id, false, req?.user);
    } catch {
      remoteRows = [];
    }
  }
  let raw = await listDepartmentFolders(department);
  if (!raw.length && remoteRows.length) {
    const names = new Set();
    for (const row of remoteRows) {
      const p = String(row.folder || row.project || row.subfolder || 'General').trim() || 'General';
      names.add(p);
    }
    raw = Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ id: n, name: n }));
  }
  /** When the bridge returns file rows, subfolder edit/view and upload follow NTFS/bridge only. */
  const inheritFromFileServer = trustFileServerAcl() && remoteRows.length > 0;
  const deptPermForFolders = inheritFromFileServer
    ? 'edit'
    : isDepartmentViewOnly(department)
      ? 'view'
      : 'edit';
  const effectivePortalViewOnly = inheritFromFileServer ? false : portalViewOnly;
  const projects = raw.map((p) => {
    const restricted = RESTRICTED_PROJECTS.has((p.name || '').toLowerCase());
    const fp = folderPermissionFromRemote(p.name, remoteRows, deptPermForFolders);
    const folderCanEdit = fp === 'edit' && !restricted;
    return {
      id: p.id,
      name: p.name,
      department: department.label,
      type: 'folder',
      permission: fp,
      can_edit: folderRowCanEditForUser(
        deptHasAccess,
        folderCanEdit,
        effectivePortalViewOnly,
        deptPermForFolders,
        fp,
        isAdminUser(req),
        restricted,
      ),
      has_access: deptHasAccess && (isAdminUser(req) || !restricted),
    };
  });
  return res.json({ projects, folderPath: department.folderPath });
});

app.post('/api/upload', authRequired, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const department = await getDepartmentContext(req, req.body?.department, req.body?.department);
  const trustAcl = trustFileServerAcl();
  if (!canSessionEditDepartment(req, department) && !trustAcl) {
    return res.status(403).json({ error: 'View-only access. You cannot upload files.' });
  }
  if (isDepartmentViewOnly(department) && !trustAcl) {
    return res.status(403).json({ error: 'View-only department on file server. Upload is not allowed.' });
  }
  const dynCfg = await getDynamicConfig(false);
  const naming = dynCfg.portalPolicy?.uploadFileNaming === 'preserve-name' ? 'preserve-name' : 'unique-suffix';
  /** Driven by inyatsi-config.json portal.uploadFileNaming or PORTAL_UPLOAD_FILE_NAMING — not the web UI. */
  const replaceExisting = naming === 'preserve-name';
  const project = sanitizeSegment(req.body?.project || 'General');
  const projectAccess = await assertProjectUploadAllowed(req, department, project);
  if (!projectAccess.ok) {
    return res.status(403).json({ error: projectAccess.reason || 'Upload is not allowed in this folder.' });
  }
  const fileNameRaw = sanitizeSegment(req.body?.name || req.file.originalname || `upload-${Date.now()}`);
  if (!fileNameRaw) {
    return res.status(400).json({ error: 'Invalid file name' });
  }
  const storedName = replaceExisting ? fileNameRaw : `${Date.now()}-${fileNameRaw}`;
  let fileId = '';

  if (getWebdavClient()) {
    const targetPath = joinWebDav(department.folderPath, project, storedName);
    const targetDir = joinWebDav(department.folderPath, project);

    await fs.mkdir(path.join(TEMP_UPLOAD_ROOT, department.id, project), { recursive: true });
    const tempPath = path.join(TEMP_UPLOAD_ROOT, department.id, project, storedName);
    await fs.writeFile(tempPath, req.file.buffer);

    try {
      const wdc = getWebdavClient();
      try {
        await wdc.createDirectory(targetDir, { recursive: true });
      } catch (dirErr) {
        const status = dirErr?.response?.status ?? dirErr?.status;
        if (status !== 405 && status !== 409) {
          throw dirErr;
        }
      }
      await wdc.putFileContents(targetPath, req.file.buffer, { overwrite: replaceExisting });
      fileId = encodeFileId(targetPath);
    } finally {
      try {
        await fs.unlink(tempPath);
      } catch {
        /* ignore */
      }
    }

    addActivity(
      {
        employeeId: req.user?.employeeId || 'unknown',
        visitorName: req.user?.name || req.user?.employeeId,
        departmentId: department.id,
        department: department.label,
        project,
        action: replaceExisting ? 'updated' : 'uploaded',
        fileName: storedName,
        fileId,
      },
      req,
    );
  } else {
    const targetDir = path.join(FILE_SERVER_ROOT, folderPathToFsRelative(department.folderPath), project);
    const targetPath = path.join(targetDir, storedName);
    if (!withinRoot(targetDir) || !withinRoot(targetPath)) {
      return res.status(400).json({ error: 'Invalid upload path' });
    }
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, req.file.buffer);
    fileId = encodeFileId(path.relative(FILE_SERVER_ROOT, targetPath));

    addActivity(
      {
        employeeId: req.user?.employeeId || 'unknown',
        visitorName: req.user?.name || req.user?.employeeId,
        departmentId: department.id,
        department: department.label,
        project,
        action: replaceExisting ? 'updated' : 'uploaded',
        fileName: storedName,
        fileId,
      },
      req,
    );
  }

  clearRemoteFileCaches();

  const statusCode = replaceExisting ? 200 : 201;
  return res.status(statusCode).json({
    ok: true,
    replaced: replaceExisting,
    file: {
      id: fileId,
      name: storedName,
      department: department.label,
      departmentId: department.id,
      folderPath: department.folderPath,
      project,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    },
  });
});

app.get('/api/download', authRequired, async (req, res) => {
  const fileId = String(req.query.fileId || '').trim();
  const preview = req.query.preview === '1';
  if (!fileId) return res.status(400).json({ error: 'fileId is required' });
  let relPath = '';
  try {
    relPath = decodeFileId(fileId);
  } catch {
    return res.status(400).json({ error: 'Invalid file id' });
  }
  const department = await getDepartmentContext(req);

  if (String(relPath).startsWith('remote://')) {
    const parsed = parseRemoteVirtualPath(relPath);
    if (!parsed) return res.status(400).json({ error: 'Invalid remote file id' });
    if (
      String(department.id).toLowerCase() !== String(parsed.orgId).toLowerCase() &&
      department.id !== 'admin'
    ) {
      return res.status(403).json({ error: 'Access denied for requested department path' });
    }
    const bearer = getEffectiveRemoteBearer(req);
    if (!bearer) {
      return res.status(503).json({ error: 'Remote file server token not available. Sign in with external auth.' });
    }
    const rows = await getCachedRemoteFiles(bearer, parsed.orgId, true, req?.user);
    const row = findRemoteFileRow(rows, parsed.fileName, parsed.project);
    if (!row?.id) return res.status(404).json({ error: 'File not found on file server' });
    const accessCheck = preview
      ? await assertRemoteFileReadAllowed(req, department, parsed.fileName, parsed.project)
      : await assertRemoteFileDownloadAllowed(req, department, parsed.fileName, parsed.project);
    if (!accessCheck.ok) {
      return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
    }
    const streamRes = await fetchRemoteFileDownloadStream(bearer, parsed.orgId, row.id);
    if (!streamRes) {
      return res.status(502).json({ error: 'Could not download from file server (check API /download or /content route).' });
    }
    const buf = Buffer.from(await streamRes.arrayBuffer());
    const fileName = parsed.fileName || row.name || 'file';
    addActivity(
      {
        employeeId: req.user?.employeeId || 'unknown',
        visitorName: req.user?.name || req.user?.employeeId || 'unknown',
        departmentId: department.id,
        department: department.label,
        action: 'visited',
        fileName,
        fileId,
        project: parsed.project || 'General',
      },
      req,
    );
    const contentType = mime.lookup(fileName) || 'application/octet-stream';
    const disposition = preview ? 'inline' : 'attachment';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
    return res.send(buf);
  }

  if (getWebdavClient()) {
    const normalized = normalizeWebDavPath(relPath);
    const allowedBase = normalizeWebDavPath(department.folderPath);
    if (department.id !== 'admin' && !(normalized === allowedBase || normalized.startsWith(`${allowedBase}/`))) {
      return res.status(403).json({ error: 'Access denied for requested department path' });
    }
    const { project: projFromPath, fileName } = projectAndFileNameFromWebDavPath(normalized, department.folderPath);
    const accessCheck = preview
      ? await assertRemoteFileReadAllowed(req, department, fileName, projFromPath)
      : await assertRemoteFileDownloadAllowed(req, department, fileName, projFromPath);
    if (!accessCheck.ok) {
      return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
    }
    const wdc = getWebdavClient();
    const content = await wdc.getFileContents(normalized, { format: 'binary' });
    addActivity(
      {
        employeeId: req.user?.employeeId || 'unknown',
        visitorName: req.user?.name || req.user?.employeeId || 'unknown',
        departmentId: department.id,
        department: department.label,
        action: 'visited',
        fileName,
        fileId,
        project: projFromPath || 'General',
      },
      req,
    );
    const contentType = mime.lookup(fileName) || 'application/octet-stream';
    const disposition = preview ? 'inline' : 'attachment';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
    return res.send(Buffer.from(content));
  }

  const absPath = path.join(FILE_SERVER_ROOT, relPath);
  if (!withinRoot(absPath)) return res.status(400).json({ error: 'Invalid file path' });
  const stat = await safeStat(absPath);
  if (!stat || !stat.isFile()) return res.status(404).json({ error: 'File not found' });
  const { project: projFs, fileName: fileNameFs } = projectAndFileNameFromFsRel(relPath, department.folderPath);
  const accessCheck = preview
    ? await assertRemoteFileReadAllowed(req, department, fileNameFs, projFs)
    : await assertRemoteFileDownloadAllowed(req, department, fileNameFs, projFs);
  if (!accessCheck.ok) {
    return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
  }
  const fileName = path.basename(absPath);
  addActivity(
    {
      employeeId: req.user?.employeeId || 'unknown',
      visitorName: req.user?.name || req.user?.employeeId || 'unknown',
      departmentId: department.id,
      department: department.label,
      action: 'visited',
      fileName,
      fileId,
      project: projFs || 'General',
    },
    req,
  );
  const contentType = mime.lookup(fileName) || 'application/octet-stream';
  const disposition = req.query.preview === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(absPath)}"`);
  return res.sendFile(absPath);
});

app.get('/api/files/:fileId/download', authRequired, async (req, res) => {
  const fileId = encodeURIComponent(String(req.params.fileId || '').trim());
  return res.redirect(307, `/api/download?fileId=${fileId}`);
});

app.delete('/api/delete', authRequired, async (req, res) => {
  const fileId = String(req.body?.fileId || '').trim();
  const requestedDeptId = String(req.body?.departmentId || '').trim();
  
  if (!fileId) return res.status(400).json({ error: 'fileId is required' });
  
  const department = await getDepartmentContext(req, requestedDeptId);

  if (!canSessionEditDepartment(req, department) && !trustFileServerAcl()) {
    return res.status(403).json({ error: 'View-only access. You cannot delete files.' });
  }

  let relPath = '';
  try {
    relPath = decodeFileId(fileId);
  } catch {
    return res.status(400).json({ error: 'Invalid file id' });
  }
  
  try {
    if (String(relPath).startsWith('remote://')) {
      const parsed = parseRemoteVirtualPath(relPath);
      if (!parsed) return res.status(400).json({ error: 'Invalid remote file id' });
      if (
        String(department.id).toLowerCase() !== String(parsed.orgId).toLowerCase() &&
        department.id !== 'admin'
      ) {
        return res.status(403).json({ error: 'Access denied for requested department path' });
      }
      const bearer = getEffectiveRemoteBearer(req);
      if (!bearer) {
        return res.status(503).json({ error: 'Remote file server token not available.' });
      }
      const rows = await getCachedRemoteFiles(bearer, parsed.orgId, true, req?.user);
      const row = findRemoteFileRow(rows, parsed.fileName, parsed.project);
      if (!row?.id) return res.status(404).json({ error: 'File not found on file server' });
      const editOk = await assertRemoteFileEditAllowed(req, department, parsed.fileName, parsed.project);
      if (!editOk.ok) {
        return res.status(403).json({ error: editOk.reason || 'Access denied' });
      }
      const base = EXTERNAL_AUTH_URL.trim().replace(/\/+$/, '');
      const delRes = await fetch(`${base}/api/files/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: {
          ...remoteApiHeaders(),
          Authorization: `Bearer ${bearer}`,
          'x-org-id': String(parsed.orgId),
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!delRes.ok) {
        const t = await delRes.text().catch(() => '');
        return res.status(502).json({
          error: `File server delete failed (${delRes.status}). ${t.slice(0, 120)}`,
        });
      }
      addActivity(
        {
          employeeId: req.user?.employeeId || 'unknown',
          visitorName: req.user?.name || req.user?.employeeId,
          departmentId: department.id,
          department: department.label,
          action: 'deleted',
          fileName: parsed.fileName,
          project: parsed.project || 'General',
          fileId,
        },
        req,
      );
      clearRemoteFileCaches();
      return res.json({ ok: true, message: 'File deleted successfully' });
    }
    if (getWebdavClient()) {
      const normalized = normalizeWebDavPath(relPath);
      const allowedBase = normalizeWebDavPath(department.folderPath);
      if (department.id !== 'admin' && !(normalized === allowedBase || normalized.startsWith(`${allowedBase}/`))) {
        return res.status(403).json({ error: 'Access denied for requested department path' });
      }
      const { project: projDel, fileName: fnDel } = projectAndFileNameFromWebDavPath(normalized, department.folderPath);
      const editOk = await assertRemoteFileEditAllowed(req, department, fnDel, projDel);
      if (!editOk.ok) {
        return res.status(403).json({ error: editOk.reason || 'Access denied' });
      }
      const wdc = getWebdavClient();
      await wdc.deleteFile(normalized);
    } else {
      const absPath = path.join(FILE_SERVER_ROOT, relPath);
      if (!withinRoot(absPath)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const allowedBase = path.join(FILE_SERVER_ROOT, folderPathToFsRelative(department.folderPath));
      if (!absPath.startsWith(allowedBase) && department.id !== 'admin') {
        return res.status(403).json({ error: 'Access denied for requested department path' });
      }
      const { project: projFs, fileName: fnFs } = projectAndFileNameFromFsRel(relPath, department.folderPath);
      const editFs = await assertRemoteFileEditAllowed(req, department, fnFs, projFs);
      if (!editFs.ok) {
        return res.status(403).json({ error: editFs.reason || 'Access denied' });
      }
      await fs.unlink(absPath);
    }

    let delProject = 'General';
    let delFileName = path.basename(relPath);
    if (getWebdavClient()) {
      const normalizedDel = normalizeWebDavPath(relPath);
      const parsedDel = projectAndFileNameFromWebDavPath(normalizedDel, department.folderPath);
      delProject = parsedDel.project;
      delFileName = parsedDel.fileName || delFileName;
    } else {
      const parsedFsDel = projectAndFileNameFromFsRel(relPath, department.folderPath);
      delProject = parsedFsDel.project;
      delFileName = parsedFsDel.fileName || delFileName;
    }

    addActivity(
      {
        employeeId: req.user?.employeeId || 'unknown',
        visitorName: req.user?.name || req.user?.employeeId,
        departmentId: department.id,
        department: department.label,
        action: 'deleted',
        fileName: delFileName,
        project: delProject,
        fileId,
      },
      req,
    );

    clearRemoteFileCaches();

    return res.json({ ok: true, message: 'File deleted successfully' });
  } catch (error) {
    const status = error?.response?.status ?? error?.status;
    if (status === 404) return res.status(404).json({ error: 'File not found' });
    return res.status(500).json({ error: error?.message || 'Could not delete file' });
  }
});

app.get('/api/activity', authRequired, async (req, res) => {
  const config = await getDynamicConfig();
  const scoped = activityLog.filter((e) => activityEntryInScope(req, e, config));
  const keepFlags = await Promise.all(scoped.map((entry) => activityEntryMatchesCurrentFileServer(entry, config)));
  const filtered = scoped.filter((_, index) => keepFlags[index]);
  const limit = isAdminUser(req) ? 500 : 150;
  return res.json({ activity: filtered.slice(0, limit) });
});

app.get('/api/users', authRequired, async (req, res) => {
  const config = await getDynamicConfig();
  const users = filterUsersJsonForRequest(req, config.users);
  const normalized = users.map((user) => normalizePortalUserRecord(user, config));
  const wantGrouped = req.query?.grouped === '1' || req.query?.grouped === 'true';
  if (!wantGrouped) {
    return res.json({ users: normalized });
  }
  const groups = buildUsersGroupedByDepartment(normalized);
  return res.json({
    users: normalized,
    groups,
    /** Department context for the signed-in viewer (from JWT). */
    viewer: {
      departmentId: req.user?.departmentId,
      departmentLabel: req.user?.department,
      isAdmin: isAdminUser(req),
    },
  });
});

/**
 * Stats from the actual file server (Nextcloud/WebDAV or Windows SMB mount).
 * - Departments & file counts: filtered by logged-in user (admin sees all)
 * - FILE_SERVER_ROOT can point to a mounted Windows share (e.g. /mnt/inyatsi-files)
 */
app.get('/api/stats', authRequired, async (req, res) => {
  const config = await getDynamicConfig();
  const userDeptId = String(req.user?.departmentId || '').trim().toLowerCase();
  const departments = isAdminUser(req)
    ? config.departments
    : config.departments.filter((d) => canUserAccessDepartment(userDeptId, d));

  const users = isAdminUser(req)
    ? config.users
    : config.users.filter((u) => canUserAccessDepartment(userDeptId, { id: u.departmentId }));

  const filesByDepartment = {};
  let totalFiles = 0;

  for (const dep of departments) {
    if (getWebdavClient()) {
      try {
        const wdc = getWebdavClient();
        const entries = await wdc.getDirectoryContents(normalizeWebDavPath(dep.folderPath), { deep: true });
        const count = entries.filter((entry) => entry.type === 'file').length;
        filesByDepartment[dep.label] = count;
        totalFiles += count;
      } catch {
        filesByDepartment[dep.label] = 0;
      }
      continue;
    }
    const depDir = path.join(FILE_SERVER_ROOT, folderPathToFsRelative(dep.folderPath));
    const st = await safeStat(depDir);
    if (!st || !st.isDirectory()) {
      filesByDepartment[dep.label] = 0;
      continue;
    }
    const files = await walkDirectory(depDir);
    filesByDepartment[dep.label] = files.length;
    totalFiles += files.length;
  }

  const scopedUploads = activityLog
    .filter((a) => a.action === 'uploaded' || a.action === 'updated')
    .filter((a) => {
      if (isAdminUser(req)) return true;
      const actDept = String(a.department || '').toLowerCase();
      return departments.some(
        (d) =>
          actDept === (d.label || '').toLowerCase() ||
          actDept === (d.id || '').toLowerCase() ||
          actDept.includes((d.label || '').toLowerCase())
      );
    });
  const uploadKeepFlags = await Promise.all(
    scopedUploads.map((entry) => activityEntryMatchesCurrentFileServer(entry, config)),
  );
  const recentUploads = scopedUploads.filter((_, index) => uploadKeepFlags[index]).slice(0, 10);

  return res.json({
    totalDepartments: departments.length,
    totalUsers: users.length,
    totalFiles,
    filesByDepartment,
    recentUploads,
  });
});

/** Effective portal session: mirrors users.json / admin policy (view = read-only on file actions). */
app.get('/api/me/session', authRequired, async (req, res) => {
  const caps = capabilitiesFromPermission(req);
  let portalPolicy = { uploadFileNaming: 'unique-suffix', policySource: 'default' };
  try {
    const dyn = await getDynamicConfig(false);
    if (dyn.portalPolicy) portalPolicy = dyn.portalPolicy;
  } catch {
    /* keep default */
  }
  return res.json({
    employeeId: req.user?.employeeId,
    name: req.user?.name,
    role: req.user?.role,
    departmentId: req.user?.departmentId,
    department: req.user?.department,
    folderPath: req.user?.folderPath,
    permission: req.user?.permission || 'edit',
    isAdmin: isAdminUser(req),
    capabilities: caps,
    portalPolicy,
    policy: 'Permissions follow users.json, JWT, and the connected file server or bridge.',
  });
});

/**
 * Effective rights for a path (same rules as upload/delete guards).
 * When FastAPI is not used, Node derives flags from JWT permission.
 */
app.get('/api/permissions', authRequired, (req, res) => {
  const p = String(req.query.path || '').trim();
  if (!p) return res.status(400).json({ error: 'path is required' });
  const caps = capabilitiesFromPermission(req);
  return res.json({
    path: p,
    read: caps.read,
    write: caps.upload,
    delete: caps.delete,
  });
});

const LISTEN_HOST = String(process.env.LISTEN_HOST || '0.0.0.0').trim() || '0.0.0.0';
app.listen(PORT, LISTEN_HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `File backend listening on http://${LISTEN_HOST}:${PORT} (reachable from phone at your PC Wi‑Fi IPv4, e.g. ipconfig)`,
  );
});
