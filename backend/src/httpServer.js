import { createApp } from './app.js';
import { LISTEN_HOST, PORT } from './config/env.js';

export function startHttpServer() {
  const app = createApp();
  app.listen(PORT, LISTEN_HOST, () => {
    // eslint-disable-next-line no-console
    console.log(
      `File backend listening on http://${LISTEN_HOST}:${PORT} (reachable from phone at your PC Wi‑Fi IPv4, e.g. ipconfig)`,
    );
  });
}
