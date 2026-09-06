# Architecture
- apps/web/: Vite and React browser application.
- apps/api/: NestJS backend; HTTP, websocket, persistence, and infrastructure stay server-only.
- packages/: shared contracts and Studio engines consumed by either application.
- scripts/, tools/, e2e/, tests/: repository tooling and verification.
- api/: minimal Vercel adapters; implementation stays in apps/api.

The root contains monorepo configuration, CI/deployment configuration, and documentation. The @/* alias resolves to apps/web/*; backend code must not import from the web app.

Generated QA output belongs in CI artifacts and is ignored under qa-results/.

## Source layout

The repository keeps deployment wiring at the root and separates runtime applications:

```text
apps/web/
  src/app/           bootstrap, routing, service workers, shell
  src/domains/      feature pages and feature-local UI/state
  src/shared/        cross-feature UI, runtime helpers, catalog, and compatibility code
    components/      reusable product UI pending domain ownership
    lib/             catalog/data contracts and server-shaped client helpers
    catalog/         static catalog runtime (eager installer + lazy engine)
  public/             shipped browser assets and generated catalog data
apps/api/
  src/modules/      Nest feature modules
  src/infrastructure/ adapters and external services
  src/db/           persistence schema and migrations
api/                 thin Vercel adapters only
packages/            shared contracts and engines
```

New cross-feature web code belongs in `apps/web/src/shared` for cross-feature runtime. The former `apps/web/components` and `apps/web/lib` roots are now consolidated under `src/shared/components` and `src/shared/lib`; use the `@/shared/...` alias for new imports. The remaining `src/compat`, `src/hooks`, `src/infrastructure`, and `src/types` directories stay explicit until their ownership is clear. Feature behavior belongs in the matching `src/domains/<feature>` directory, with tests colocated beside the implementation. The static catalog runtime is under `src/shared/catalog` so its eager installer and lazy engine have one discoverable home.

This is a pragmatic layered/feature hybrid rather than a forced FSD rename: route composition stays in `app`, product behavior stays in existing domain slices, and shared code is promoted only when it has multiple consumers. The dependency direction is UI/app → domain/application → infrastructure; `packages/*` expose cross-app contracts through package exports instead of deep relative imports. Keeping root configuration thin and preserving stable domain names avoids churn while making new code discoverable.
