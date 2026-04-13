import Constants from 'expo-constants';

/**
 * Metro may inline process.env.EXPO_PUBLIC_*; if not, app.config.js puts the same value in expo.extra
 * (fixes "Network error" on device when .env was ignored and URL fell back to localhost).
 */
const fromMetro =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL
    ? String(process.env.EXPO_PUBLIC_API_BASE_URL).trim()
    : '';
const fromExtra = String(
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? '',
).trim();

const raw = fromMetro || fromExtra || 'http://localhost:3000';

/** No trailing slash — paths are joined in api.js */
export const API_BASE_URL = raw.replace(/\/+$/, '');

/** True when the phone will never reach the dev machine (wrong fallback). */
export function apiUrlLooksLikeLocalDevMachine() {
  try {
    const u = new URL(API_BASE_URL);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return true;
  }
}
