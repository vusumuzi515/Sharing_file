import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo folder containing `package.json`, `config/`, `file-server/`, `.env`. */
export const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

export const PORT = Number(process.env.PORT || 3000);
export const LISTEN_HOST = String(process.env.LISTEN_HOST || '0.0.0.0').trim() || '0.0.0.0';
export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export const EXTERNAL_AUTH_URL = String(process.env.EXTERNAL_AUTH_URL || '').trim().replace(/\/+$/, '');
export const EXTERNAL_AUTH_FALLBACK_TO_LOCAL = process.env.EXTERNAL_AUTH_FALLBACK_TO_LOCAL !== 'false';
export const REMOTE_API_BEARER_TOKEN = String(process.env.REMOTE_API_BEARER_TOKEN || '').trim();
export const REMOTE_API_KEY = String(process.env.REMOTE_API_KEY || '').trim();

export const REMOTE_DEPARTMENTS_PATHS = String(
  process.env.REMOTE_DEPARTMENTS_PATHS ||
    '/api/external/dashboard/departments?username={username},/api/departments,/api/v1/departments',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const REMOTE_FILES_PATHS = String(
  process.env.REMOTE_FILES_PATHS ||
    '/api/files?department={orgId},/api/files?department={orgId}&username={username},/api/external/dashboard/files?orgId={orgId}&username={username},/api/external/dashboard/departments/{orgId}/files?username={username}',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const REMOTE_UPLOAD_PATHS = String(process.env.REMOTE_UPLOAD_PATHS || '/api/files/upload,/api/upload')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** When set, sent as `x-org-id` on remote API calls (required by some routes e.g. GET /api/files). */
export const REMOTE_X_ORG_ID = String(process.env.REMOTE_X_ORG_ID || '').trim();
/** inyatsi-secure-access-api requires this on GET /api/departments and related routes. */
export const REMOTE_X_DEVICE_ID = String(process.env.REMOTE_X_DEVICE_ID || 'inyatsi-portal-web').trim();

export const REMOTE_DEPARTMENTS_ONLY = ['1', 'true', 'yes'].includes(
  String(process.env.REMOTE_DEPARTMENTS_ONLY || '').trim().toLowerCase(),
);

const parsedDeptCacheMs = Number(process.env.REMOTE_DEPT_CACHE_MS);
export const REMOTE_DEPT_CACHE_MS =
  Number.isFinite(parsedDeptCacheMs) && parsedDeptCacheMs >= 0
    ? parsedDeptCacheMs
    : REMOTE_DEPARTMENTS_ONLY
      ? 8 * 1000
      : 60 * 1000;

/** ngrok free: bypass interstitial; use `1` or `69420` per tunnel docs. */
export const NGROK_SKIP_BROWSER_WARNING = String(process.env.NGROK_SKIP_BROWSER_WARNING ?? '1').trim();

/**
 * When `groups`, portal login verifies the password with Nextcloud WebDAV, then checks that the user
 * belongs to a Nextcloud group matching the selected department (OCS, using the service account).
 */
export const NEXTCLOUD_PORTAL_AUTH = String(process.env.NEXTCLOUD_PORTAL_AUTH || '').trim().toLowerCase();

export const FILE_SERVER_ROOT = path.resolve(
  process.env.FILE_SERVER_ROOT || path.join(BACKEND_ROOT, 'file-server'),
);
export const TEMP_UPLOAD_ROOT = path.resolve(
  process.env.TEMP_UPLOAD_ROOT || path.join(BACKEND_ROOT, 'temp-uploads'),
);
export const USERS_PATH = path.resolve(
  process.env.USERS_FILE || path.join(BACKEND_ROOT, 'config', 'users.json'),
);
export const ADMIN_CONFIG_PATH = path.resolve(
  process.env.ADMIN_CONFIG || path.join(BACKEND_ROOT, 'config', 'admin-config.json'),
);
export const LANDING_CONTENT_PATH = path.resolve(
  process.env.LANDING_CONTENT_PATH || path.join(BACKEND_ROOT, 'config', 'landing-content.json'),
);
export const NEXTCLOUD_CONFIG_PATH = path.resolve(
  process.env.NEXTCLOUD_CONFIG || path.join(BACKEND_ROOT, 'config', 'nextcloud-config.json'),
);
export const ACTIVITY_LOG_PATH = path.resolve(
  process.env.ACTIVITY_LOG_PATH || path.join(BACKEND_ROOT, 'data', 'activity-log.json'),
);

export const ACTIVITY_LOG_MAX = Math.min(5000, Math.max(100, Number(process.env.ACTIVITY_LOG_MAX || 2000)));
