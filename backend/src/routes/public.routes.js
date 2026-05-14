/** Minimal routes with no shared domain services (keep wiring obvious). */
export function registerPublicRoutes(app) {
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
}
