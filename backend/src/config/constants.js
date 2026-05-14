/** Default landing copy when no admin JSON exists yet. */
export const DEFAULT_LANDING_CONTENT = {
  slogan: "Africa's leading integrated business partner",
  principle: 'Zero Tolerance',
  coreValues: ['Accountability', 'Agility', 'Commitment', 'Embrace Change', 'Teamwork', 'Tempo'],
};

/** Folders restricted for non-admin (aligned with department listing rules). */
export const RESTRICTED_PROJECTS = new Set(['site reports', 'design documents']);

/** Cached GET /api/files TTL — same ACL as file server. */
export const REMOTE_FILE_CACHE_MS = 45 * 1000;
export const REMOTE_UPLOAD_PROBE_MS = 30 * 1000;

/** Nextcloud group list cache for portal login when NEXTCLOUD_PORTAL_AUTH=groups */
export const NC_GROUPS_LIST_CACHE_MS = 60 * 1000;
