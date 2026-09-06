# Architecture
- apps/web/: Vite and React browser application.
- apps/api/: NestJS backend; HTTP, websocket, persistence, and infrastructure stay server-only.
- packages/: shared contracts and Studio engines consumed by either application.
- scripts/, tools/, e2e/, tests/: repository tooling and verification.
- api/: minimal Vercel adapters; implementation stays in apps/api.

The root contains monorepo configuration, CI/deployment configuration, and documentation. The @/* alias resolves to apps/web/*; backend code must not import from the web app.

Generated QA output belongs in CI artifacts and is ignored under qa-results/.
