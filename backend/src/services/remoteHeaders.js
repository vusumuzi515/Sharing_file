import { NGROK_SKIP_BROWSER_WARNING, REMOTE_API_KEY, REMOTE_X_DEVICE_ID } from '../config/env.js';

/** Headers merged into outbound requests to the Windows bridge / ngrok edge. */
export function remoteApiHeaders(extra = {}) {
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
