# ToonSpectrum Admin Web

`apps/admin-web` is the independently buildable administrator browser application.
It is a pnpm workspace package named `@toonspectrum/admin-web`; its source and build
configuration are owned by this directory instead of the repository root.

## Commands

```sh
pnpm --filter @toonspectrum/admin-web dev
pnpm --filter @toonspectrum/admin-web typecheck
pnpm --filter @toonspectrum/admin-web test
pnpm --filter @toonspectrum/admin-web build
pnpm --filter @toonspectrum/admin-web test:e2e
```

Production output is written to `apps/admin-web/dist/`. Deployment remains a separate,
explicitly approved operation and is not implied by a build or merge.

## Ownership

```text
src/app       bootstrap, providers, routes, shell and application-wide styles
src/domains   administrator capabilities grouped by business responsibility
src/platform  HTTP, authentication, telemetry and browser/runtime adapters
src/shared    Admin-only reusable UI and helpers with no domain dependency
```

Admin Web must never import source from `apps/web` or `apps/api`. Shared runtime-neutral
DTOs and schemas may be promoted to `packages/contracts` only after a real second consumer
exists. The existing user-Web administrator console is migration debt and moves capability
by capability; it must not become a shared source dependency of this application.
