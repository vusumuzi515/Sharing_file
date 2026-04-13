import { API_BASE_URL } from '../config';

/** Free ngrok often serves an HTML interstitial; API clients must send this or JSON parse fails. */
function ngrokClientHeaders() {
  try {
    const host = new URL(API_BASE_URL).hostname;
    if (/ngrok/i.test(host) || /\.ng$/i.test(host)) {
      return {
        'ngrok-skip-browser-warning': 'true',
        'bypass-tunnel-reminder': 'true',
      };
    }
  } catch {
    /* invalid URL */
  }
  return {};
}

function normalizeApiErrorMessage(message, status) {
  const msg = String(message || '').trim();
  if (status === 403) {
    return (
      msg ||
      'Access denied (403). Your account may be view-only or not allowed for this department on the file server.'
    );
  }
  if (status === 502) {
    return (
      msg ||
      'File server gateway error (502). The remote tunnel may be down or the server rejected the request.'
    );
  }
  if (/network request failed|failed to fetch|fetch failed|timeout|timed out/i.test(msg)) {
    return 'Network error. Check your connection and try again.';
  }
  return msg || `Request failed${status ? ` (${status})` : ''}`;
}

async function parseError(res) {
  const text = await res.text().catch(() => '');
  try {
    const json = text ? JSON.parse(text) : {};
    const raw = json?.error || json?.message || text || '';
    return normalizeApiErrorMessage(raw, res.status);
  } catch {
    return normalizeApiErrorMessage(text, res.status);
  }
}

const DEFAULT_TIMEOUT_MS = 25000;
const TUNNEL_TIMEOUT_MS = 45000;

function adaptiveTimeoutMs() {
  try {
    const host = new URL(API_BASE_URL).hostname;
    if (/ngrok/i.test(host) || /\.ng$/i.test(host)) return TUNNEL_TIMEOUT_MS;
  } catch {
    /* ignore */
  }
  return DEFAULT_TIMEOUT_MS;
}

export async function apiRequest(
  path,
  { token, method = 'GET', headers = {}, body, timeoutMs = adaptiveTimeoutMs() } = {},
) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const doFetch = (signal) =>
    fetch(url, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'InyatsiMobile/1.0',
        'X-Portal-Client': 'inyatsi-mobile',
        ...ngrokClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
      body,
    });

  const run = async () => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(controller.signal);
    } finally {
      clearTimeout(tid);
    }
  };

  let res;
  try {
    res = await run();
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Request timed out. Check the API address and your network.');
    }
    // 1 retry on network-level failure (common on mobile radio switches)
    try {
      res = await run();
    } catch (e2) {
      if (e2?.name === 'AbortError') {
        throw new Error('Request timed out. Check the API address and your network.');
      }
      throw new Error(normalizeApiErrorMessage(e?.message || 'Network request failed'));
    }
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(await parseError(res));
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      'API returned non-JSON (often ngrok warning page or wrong URL). Use ngrok http 3000, set EXPO_PUBLIC_API_BASE_URL to the https Forwarding URL, restart expo --clear.',
    );
  }
}

export function buildDownloadUrl(fileId, token) {
  const t = encodeURIComponent(token || '');
  const id = encodeURIComponent(fileId || '');
  // backend supports token in query
  return `${API_BASE_URL}/api/download?fileId=${id}${t ? `&token=${t}` : ''}`;
}

