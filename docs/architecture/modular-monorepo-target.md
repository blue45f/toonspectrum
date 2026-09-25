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

- `apps/web` remains driven by the root frontend toolchain, but its source now uses only the
  `app`, `domains`, `platform`, and `shared` top-level ownership boundaries.
- `apps/admin-web` is a separate workspace package with app-owned Vite, TypeScript and
  Playwright configuration, but most production administrator capability still remains under
  `apps/web/src/domains/admin` and must migrate capability by capability.
- `apps/api` is a separate workspace package, while existing API→Web imports and the
  `server/common/infrastructure/db` layout remain measured migration debt.
- `apps/desktop-sync` is the single desktop synchronization workspace. The previous focused
  watcher/journal companion is preserved under `apps/desktop-sync/src/local-agent` and exposed
  through the `@toonspectrum/desktop-sync/local-agent` subpath.
- Reviewed historical release evidence lives under `data/asset-releases`; generated `.qa` and
  `artifacts` paths are ignored and may not be tracked.
- `apps/mobile` now owns Capacitor configuration, Android/iOS native projects, launch shell,
  resources and native validation as an independent workspace package.
- Non-runtime authoring and automation now live under `tools/media` and `tools/automation`;
  marketplace comparison material lives under `tests/benchmarks/marketplace`.
- Remaining root app-specific configuration and large static assets still require later slices.

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
4. Keep the completed Web `app/domain/platform/shared` ownership split from regressing.
5. Move API `server/common/infrastructure/db` code to modules and platform boundaries.
6. Preserve the completed mobile and desktop-sync application boundaries while moving remaining
   root app-specific configuration to its owning application.
7. Ratchet Creator root files downward and migrate Studio by authority and lifecycle.
8. Move large immutable runtime assets to manifest-addressed object storage with verified fallback.

## Ratchet strategy

`scripts/validate-app-boundaries.mjs` records dependency debt in
`config/architecture-boundary-ratchet.json`. `scripts/validate-source-layout.mjs` records source
placement debt in `config/architecture-source-ratchet.json`. New Admin violations and removed
legacy paths have zero tolerance. After each stable migration slice, update baselines downward;
never raise a budget to make a new violation pass.

## Studio exception

Studio remains organized by document, commands, history, persistence, rendering, collaboration,
durability, assets and tools. It may continue to use focused core packages. It must not be moved
into `packages/domains` or flattened into generic component/hook/util folders.

## Documentation states

OpenWiki and architecture documents must label **current**, **migration**, **target**, and
**legacy exception** states so planned structure is never presented as already implemented.
