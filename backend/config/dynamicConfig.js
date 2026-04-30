/**
 * Dynamic config loaded from file server.
 * - Departments: optional inyatsi-config.json "departments" on the server; else live scan of root folders
 *   (automatic inheritance of folder layout); else static fallback from the API host.
 * - Reads optional inyatsi-config.json for labels, department permission (view/edit), user→department mapping
 * - Portal login: either users.json or a connected file-server auth source — see server.js
 */

import fs from 'fs/promises';
import path from 'path';
import { createClient as createWebdavClient } from 'webdav';

const CONFIG_FILENAME = 'inyatsi-config.json';
const CACHE_TTL_MS = 60 * 1000; // 1 min cache

/** Common system folders - exclude from department list */
const EXCLUDED_FOLDER_NAMES = new Set([
  'documents', 'photos', 'templates', 'trashbin', '.trash', '.recycle',
  'shared', 'external', 'files', 'appdata', 'appdata_external', 'appdata_encrypted',
]);

let cache = null;
let cacheTime = 0;

function toId(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

function normalizePath(value) {
  const raw = String(value || '/').replace(/\\/g, '/');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

async function listRootFoldersFs(fileServerRoot) {
  try {
    const entries = await fs.readdir(fileServerRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== CONFIG_FILENAME)
      .map((e) => ({
        id: toId(e.name),
        folderPath: normalizePath(e.name),
        label: e.name,
        permission: 'edit',
      }));
  } catch {
    return [];
  }
}

function isDirectoryEntry(e) {
  const t = String(e.type || '').toLowerCase();
  return t === 'directory' || t === 'folder' || t === '2' || (e.type === 2);
}

function extractFolderName(entry) {
  const fn = entry.filename || entry.basename || '';
  const bn = entry.basename || '';
  if (bn && bn !== '.' && bn !== '..') return bn;
  const normalized = String(fn).replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || bn || '';
}

/** Exported for server: merge discovered root folders with configured departments when using a WebDAV-compatible source. */
export async function listRootFoldersWebDav(webdavClient) {
  try {
    const entries = await webdavClient.getDirectoryContents('/', { deep: false });
    return entries
      .filter((e) => isDirectoryEntry(e) && !String(e.basename || '').startsWith('.'))
      .filter((e) => {
        const name = extractFolderName(e);
        if (!name || name === '.' || name === '..') return false;
        const id = toId(name);
        return !EXCLUDED_FOLDER_NAMES.has(id);
      })
      .map((e) => {
        const name = extractFolderName(e);
        const rawPath = e.filename || e.basename || name;
        const fp = normalizePath(typeof rawPath === 'string' ? rawPath : name);
        return {
          id: toId(name),
          folderPath: fp,
          label: name,
          permission: 'edit',
        };
      });
  } catch (err) {
    console.warn('[dynamicConfig] File-server scan failed:', err?.message || err);
    return [];
  }
}

async function readConfigFileFs(fileServerRoot) {
  const configPath = path.join(fileServerRoot, CONFIG_FILENAME);
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readConfigFileWebDav(webdavClient) {
  try {
    const content = await webdavClient.getFileContents(`/${CONFIG_FILENAME}`, { format: 'text' });
    return typeof content === 'string' ? JSON.parse(content) : JSON.parse(String(content));
  } catch {
    return null;
  }
}

function mergeDepartments(scanned, configDepartments) {
  // Config is the source of truth - only show configured departments (no duplicates from scan)
  const seen = new Set();
  const scannedByPath = new Map();
  scanned.forEach((d) => {
    scannedByPath.set(normalizePath(d.folderPath), d);
    scannedByPath.set(d.id, d);
  });

  const result = [];
  const raw = [...(configDepartments || [])];
  for (const c of raw) {
    const id = (c.id || toId(c.label || c.folderPath)).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const fp = normalizePath(c.folderPath || c.folder || `/${(c.label || c.id || '').replace(/^\/+/, '')}`);
    const scannedMatch = scannedByPath.get(fp) || scannedByPath.get(id);

    result.push({
      id,
      folderPath: fp,
      label: (c.label || scannedMatch?.label || id).trim(),
      permission: c.permission === 'view' ? 'view' : 'edit',
    });
  }

  return result;
}

function mergeUsers(usersJson, configUsers) {
  const byId = new Map();
  (usersJson || []).forEach((u) => {
    const perm = u.permission === 'view' ? 'view' : (u.permission || 'edit');
    byId.set(String(u.employeeId || '').toLowerCase(), { ...u, permission: perm });
  });
  (configUsers || []).forEach((c) => {
    const key = String(c.employeeId || c.userId || '').toLowerCase();
    const existing = byId.get(key);
    if (key && existing) {
      byId.set(key, {
        ...existing,
        departmentId: c.departmentId ?? c.department ?? existing.departmentId,
        permission: c.permission === 'view' ? 'view' : (existing.permission || 'edit'),
      });
    }
  });
  return Array.from(byId.values());
}

/** Users listed in file-server config but missing from users.json (need a portal row to sign in). */
const DEFAULT_PORTAL_POLICY = {
  /** unique-suffix: timestamp prefix (safe default). preserve-name: same filename as upload — overwrite follows server ACL. */
  uploadFileNaming: 'unique-suffix',
};

/**
 * Portal behaviour is defined on the file server in inyatsi-config.json → "portal".
 * Optional env override via load options (PORTAL_UPLOAD_FILE_NAMING on the API host).
 */
function mergePortalPolicy(fileConfig, overrides = {}) {
  const fromFile = fileConfig?.portal && typeof fileConfig.portal === 'object' ? fileConfig.portal : {};
  const valid = (v) => v === 'preserve-name' || v === 'unique-suffix';

  let uploadFileNaming = valid(fromFile.uploadFileNaming) ? fromFile.uploadFileNaming : null;
  let policySource = 'default';

  if (uploadFileNaming) {
    policySource = 'inyatsi-config';
  } else if (valid(overrides.uploadFileNaming)) {
    uploadFileNaming = overrides.uploadFileNaming;
    policySource = 'environment';
  } else {
    uploadFileNaming = DEFAULT_PORTAL_POLICY.uploadFileNaming;
  }

  return {
    uploadFileNaming,
    policySource,
  };
}

function listUsersOnlyInFileConfig(usersJson, configUsers) {
  const ids = new Set(
    (usersJson || []).map((u) => String(u.employeeId || u.userId || '').toLowerCase()).filter(Boolean),
  );
  const out = [];
  (configUsers || []).forEach((c) => {
    const id = String(c.employeeId || c.userId || '').toLowerCase();
    if (id && !ids.has(id)) out.push(c.employeeId || c.userId);
  });
  return out;
}

export async function loadDynamicConfig(options = {}) {
  const {
    fileServerRoot,
    webdavClient,
    usersJson = [],
    staticFallbackDepartments = [],
    portalPolicyOverrides = {},
    forceRefresh = false,
    /** When true, do not inject synthetic IT Administration — departments come only from the connected server. */
    skipAutoAdminDepartment = false,
  } = options;

  const now = Date.now();
  if (!forceRefresh && cache && now - cacheTime < CACHE_TTL_MS) {
    return cache;
  }

  let scanned = [];
  let fileConfig = null;

  if (webdavClient) {
    scanned = await listRootFoldersWebDav(webdavClient);
    fileConfig = await readConfigFileWebDav(webdavClient);
  } else if (fileServerRoot) {
    scanned = await listRootFoldersFs(fileServerRoot);
    fileConfig = await readConfigFileFs(fileServerRoot);
  }

  const fromFile = Array.isArray(fileConfig?.departments) ? fileConfig.departments : null;
  let effectiveDeptConfig = [];
  let departmentsSource = 'static';

  if (fromFile && fromFile.length > 0) {
    effectiveDeptConfig = fromFile;
    departmentsSource = 'inyatsi-config';
  } else if (scanned.length > 0) {
    effectiveDeptConfig = scanned;
    departmentsSource = 'live-scan';
  } else {
    effectiveDeptConfig = staticFallbackDepartments || [];
    departmentsSource = 'static';
  }

  const departments = mergeDepartments(scanned, effectiveDeptConfig);
  const users = mergeUsers(usersJson, fileConfig?.users);

  // Add admin department if not present (skipped when departments are driven entirely by the connected server)
  if (!skipAutoAdminDepartment) {
    const hasAdmin = departments.some((d) => d.id === 'admin');
    if (!hasAdmin) {
      departments.unshift({
        id: 'admin',
        folderPath: '/',
        label: 'IT Administration',
        permission: 'edit',
      });
    }
  }

  const inheritanceMeta = {
    departmentsSource,
    inyatsiConfigPresent: Boolean(fileConfig),
    rootFoldersScanned: scanned.length,
    usersInFileConfigNotInUsersJson: listUsersOnlyInFileConfig(usersJson, fileConfig?.users),
  };

  const portalPolicy = mergePortalPolicy(fileConfig, portalPolicyOverrides);

  return {
    departments,
    users,
    departmentsById: departments.reduce((acc, d) => {
      acc[d.id] = d;
      return acc;
    }, {}),
    departmentsByFolder: departments.reduce((acc, d) => {
      acc[normalizePath(d.folderPath)] = d;
      return acc;
    }, {}),
    inheritanceMeta,
    portalPolicy,
  };
}

export function invalidateCache() {
  cache = null;
  cacheTime = 0;
}

export function setCache(data) {
  cache = data;
  cacheTime = Date.now();
}
