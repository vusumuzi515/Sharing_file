/**
 * URL of the main portal (file access app with login).
 * Set VITE_PORTAL_URL in .env to point to the portal.
 * If unset, uses same origin (assumes portal is at root when admin is at /admin).
 */
export const portalUrl =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_PORTAL_URL
    ? import.meta.env.VITE_PORTAL_URL
    : typeof window !== 'undefined'
      ? window.location.origin
      : '';
