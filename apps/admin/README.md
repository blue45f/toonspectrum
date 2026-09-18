# ToonSpectrum Admin

`apps/admin` is the independently buildable administrator surface.

The repository root continues to own the shared frontend toolchain during this migration, matching the existing `apps/web` arrangement. The admin app is therefore built with the root dependencies instead of introducing another workspace package and lockfile importer in the first migration slice.

## Commands

```sh
pnpm exec tsc -p apps/admin/tsconfig.json
pnpm exec vite --config vite.admin.config.ts
pnpm exec vite build --config vite.admin.config.ts
```

Production output is written to `dist-admin/`, so a future Cloudflare Static Assets project can deploy Admin independently from the user-facing `dist/` build.

## Ownership

- `src/app`: bootstrap, providers, router/shell composition.
- `src/domains`: admin capabilities grouped by business domain and feature.
- `src/shared`: admin-only reusable UI/helpers that do not depend on a domain.
- `src/platform`: HTTP, telemetry and environment adapters.

Admin must never import source from `apps/web`. Shared API contracts may be promoted to `packages/contracts` only when a real second consumer exists.
