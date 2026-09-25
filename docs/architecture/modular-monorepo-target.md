# Modular monorepo target

Status: **migration target**. This document separates current reality from the intended end state.

## Decisions

- Keep one repository and one modular Core API service.
- Keep logical business domains inside each application; do **not** create `packages/domains/*`.
- Use explicit deployable applications: `web`, `admin-web`, `api`, `mobile`, and `desktop-sync`.
- Promote only stable contracts or pure models after a real second deployable consumer exists.
- Preserve Studio's runtime-authority architecture and focused engine/model packages instead of
  forcing page-oriented CRUD folders onto the editor.

## Current state

- `apps/web` remains driven by the root frontend toolchain.
- `apps/admin-web` is now a separate workspace package with app-owned Vite, TypeScript and
  Playwright configuration, but most production administrator capability still remains under
  `apps/web/src/domains/admin` and must migrate capability by capability.
- `apps/api` is a separate workspace package, while existing API→Web imports remain measured
  migration debt rather than an accepted final boundary.
- Mobile native projects, desktop-sync duplication, root tool configuration and large static
  assets still require later migration slices.

## Target application layout

```text
apps/
  web/
    src/{app,domains,platform,shared}
  admin-web/
    src/{app,domains,platform,shared}
  api/
    src/{app,modules,platform,shared}
  mobile/
  desktop-sync/
services/
  creator-inference/
```

A capability is colocated under the application and domain that owns its behavior. Local
components, hooks, models, styles and tests stay with the capability until reuse is proven.

## Dependency direction

```text
web       ─┐
admin-web ─┼──> focused shared packages
api       ─┘
```

Applications never import another application's source. `shared` never depends on `domains`;
platform adapters never own business rules. Cross-domain deep imports converge toward narrow
`public` or `integrations` boundaries.

## Focused shared packages

`packages/contracts` contains runtime-neutral DTOs, schemas, protocol constants and pure
validation with real cross-application consumers. A candidate must remain free of React, DOM,
NestJS, database, storage and transport implementation dependencies. Pure catalog models may
move to a focused `catalog-model` package when both Web and API consume the same implementation.

Do not use a package to hide application coupling and do not create `packages/domains`.

## Migration sequence

1. Establish the independent `admin-web` package and app-owned configuration.
2. Eliminate API→Web source imports by classifying contracts, pure models and runtime adapters.
3. Move the user-Web administrator console to Admin Web capability by capability.
4. Replace Web top-level `compat/components/hooks/infrastructure/styles/types` with explicit
   app/domain/platform/shared ownership.
5. Move API `server/common/infrastructure/db` code to modules and platform boundaries.
6. Consolidate desktop sync, mobile ownership and root app-specific configuration.
7. Ratchet Creator root files downward and migrate Studio by authority and lifecycle.
8. Move large immutable runtime assets to manifest-addressed object storage with verified fallback.

## Ratchet strategy

`scripts/validate-app-boundaries.mjs` records current debt in
`config/architecture-boundary-ratchet.json`. New Admin boundary violations have zero tolerance.
After each stable migration slice, update the baseline downward; never raise a budget to make a
new violation pass.

## Studio exception

Studio remains organized by document, commands, history, persistence, rendering, collaboration,
durability, assets and tools. It may continue to use focused core packages. It must not be moved
into `packages/domains` or flattened into generic component/hook/util folders.

## Documentation states

OpenWiki and architecture documents must label **current**, **migration**, **target**, and
**legacy exception** states so planned structure is never presented as already implemented.
