# Modular monorepo target

Status: **migration target**. This document deliberately separates current reality from the intended end state.

## Decisions

- Keep one repository and one modular API service.
- Keep logical business domains inside each application; do **not** create `packages/domains/*` yet.
- Maintain `apps/web` and establish `apps/admin` as separately buildable/deployable frontend surfaces while retaining `apps/api`.
- Promote only stable shared contracts or primitives after a real second consumer exists.
- Preserve Studio's runtime-oriented architecture and existing Studio core packages instead of forcing CRUD-style folders onto it.

## Current state

The root package still owns the frontend toolchain. `apps/web` is the production browser surface and `apps/api` is a separate workspace package. The new `apps/admin` boundary intentionally follows the root-owned frontend toolchain first, avoiding another lockfile/workspace migration in the same change.

## Target application layout

```text
apps/
  web/
    src/{app,domains,shared,platform}
  admin/
    src/{app,domains,shared,platform}
  api/
    src/{app,modules,platform}
```

Domain folders remain logical application boundaries. A capability should be colocated under its domain, and local components/hooks/types stay with the capability until reuse is proven.

## Dependency direction

```text
web   ─┐
admin ─┼─> focused shared packages
api   ─┘
```

Applications must never import another application's source. `shared` must not depend on `domains`. Cross-domain deep imports are migration debt and should converge toward explicit public or integration boundaries.

## Ratchet strategy

`scripts/validate-app-boundaries.mjs` records boundary counts against `config/architecture-boundary-ratchet.json`. New cross-application dependencies and all new Admin boundary violations start with zero tolerance. Existing Web shared/domain and cross-domain debt is observed first; after a migration slice stabilizes, run the validator with `--write-baseline` and ratchet those budgets downward rather than performing a high-risk mass move.

## Studio exception

Studio remains organized by runtime authority (document, commands, history, storage, rendering, collaboration, durability, tools) and may continue to use focused core packages. It should not be moved into `packages/domains` or flattened into generic page/component folders.

## OpenWiki

`openwiki/INSTRUCTIONS.md` defines documentation authority and naming. Generated pages must label **current**, **migration**, and **target** states so planned architecture is never presented as already implemented.
