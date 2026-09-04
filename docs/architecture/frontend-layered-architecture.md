# ToonSpectrum frontend layered architecture

Status: adopted on 2026-09-04

## Why this architecture

ToonSpectrum is a large Vite SPA with catalogue, community, creator, market, admin, and a desktop-class Studio editor. A universal feature taxonomy would add another naming system without removing the editor's real coupling. The repository therefore uses a small dependency-directed layered architecture and colocates code by product ownership.

The quality goal is **change locality**: a change should be discoverable from its URL or product domain, and should cross as few ownership boundaries as possible. Line count is a guardrail, not the architecture itself. A split that merely moves a closure bag or hundreds of opaque props into another file is not accepted.

## Layers and dependency direction

```text
src/app            application bootstrap, providers, URL composition, global boundaries
    ↓
src/domains/*      product modules and use-case orchestration
    ↓
src/infrastructure platform and transport adapters
    ↓
src/components
src/hooks
src/compat
src/styles         shared UI and cross-domain utilities
```

The dependency direction mechanically enforced by ESLint is:

- `app` may compose every lower layer.
- `domains` may use domain contracts, infrastructure, and shared code, but may not import `app`.
- `infrastructure` may use infrastructure and shared code only.
- shared code may not know product domains.

The root `components/` and `lib/` trees predate this boundary map and remain a documented migration exception; new product logic must not be added there. Cross-domain imports should target a stable contract instead of another domain's page internals, and broad `index.ts` barrels are avoided. Those two rules are review conventions today and will become mechanical checks as legacy imports are reduced. This refactor tightens the current model rather than introducing an FSD parallel tree.

## Design inputs and stack review

The structure follows the same practical principle emphasized in Toss Frontend Fundamentals and Toss frontend discussions: organize code so a reader can locate it from the product change, keep related behavior close, and avoid speculative abstraction. Route declarations are therefore grouped by URL ownership, while stateful Studio work is split by authority and lifecycle rather than by generic `features`, `entities`, or line-count folders.

The 2026 stack was reviewed before adding dependencies. ToonSpectrum already uses React 19, React Router 7, Vite 8/Rolldown, TypeScript 6, Zustand 5, Vitest 4, and the React Compiler. No architecture framework or new state container was added. React Router framework-mode route modules can provide deeper automatic route splitting, but adopting them would replace the reviewed declarative `BrowserRouter` security boundary and change data-loading semantics. This pass keeps the current router mode and uses typed registries plus existing dynamic imports. Vite 8 already provides the production bundler upgrade, so performance work stays focused on chunk ownership and startup waterfalls rather than another toolchain migration.

References:

- https://frontend-fundamentals.com
- https://toss.tech/article/firesidechat_frontend_10
- https://reactrouter.com/changelog
- https://api.reactrouter.com/v7/index.html
- https://vite.dev/blog/announcing-vite8

## Application routing

`src/app/routes/AppRouter.tsx` owns only cross-domain behavior:

- React Router `<Routes>` / `<Route>` composition
- route transition staging
- the global error boundary and fallback
- document-title synchronization
- Studio cross-origin-isolation gating

Product URLs live in `src/app/routes/groups/*.routes.tsx`. Each entry has a stable semantic `id`, a `path`, and a lazy page element. `groups/app-routes.tsx` defines ordering once, with the catch-all route last. The registry test rejects duplicate IDs and paths and guarantees one canonical `/studio/*` entry.

A domain route group may select a page and its delivery boundary, but it must not own application-wide chrome or providers. Heavy Studio code remains behind a dynamic import so catalogue and community visits do not initialize editor subsystems.

## Studio route ownership

`src/domains/creator/studio-router/StudioRouter.tsx` is a small resolver and dispatcher. It owns canonical URL resolution and chooses a semantic surface only.

```text
StudioRouter
├── routes/StudioEditorRoute.tsx   document identity, runtime boundary, layout, editor chunk
├── routes/StudioPublishRoute.tsx  publish identity and publish chunk
├── StudioLift3dPage               independent tool surface
└── StudioToolsCompanionPage       companion surface
```

Editor document lifetime is keyed outside the legacy adapter. The document layout survives canvas/DCC surface switches, while the editor implementation remains lazy. Inspector preloading belongs to the editor route because it is a route-delivery concern, not editor business logic.

## Studio editor application services

`StudioCuttoonEditorHost.tsx` is still a migration host, not the desired long-term module boundary. New stateful logic must move to narrowly named, typed services under:

```text
src/domains/creator/studio-cuttoon-editor/runtime/
```

Current runtime ownership includes:

- CRDT document lifecycle
- source and work hydration
- collaboration access projection
- draft collaboration provisioning
- mutation authority and stale-result tickets
- history snapshots, sidecars, retention, and durability
- preferences and comment documents
- raster publication
- vector-operation cancellation epochs
- layer-lift worker and preview resources
- live-session and tournament persistence boot

Every runtime module has one explicit lifecycle reason to change, uses typed inputs/outputs, and may not import the host back. New runtime modules are kept below 300 lines. Larger flows must be split by authority or lifecycle rather than by arbitrary line ranges.

Pure transformations live next to their domain, for example Writer Room page projection under `writer-room/`. Stateful browser or persistence behavior is exposed through intent-level commands, such as the brush quick-slot controller and the live-resource lease controller.

## File and API guardrails

- Application and Studio router seams: at most 100 lines.
- New Studio runtime modules: at most 300 lines and zero explicit `any`.
- The legacy Studio host line ceiling is a ratchet and may only decrease.
- UI components do not receive new raw React setter bags. Prefer intent-level commands or a typed client.
- Runtime modules do not import `StudioCuttoonEditorHost`.
- Route IDs and paths are unique and the catch-all is last.
- Browser workers, service workers, dynamic imports, and generated assets must be checked before deleting an apparently unused file.

Exceptions must be recorded in the existing legacy-exception ledger and may only decrease. New files are not added to that ledger to bypass lint or React Compiler rules.

## Performance policy

Architecture is the first performance boundary:

1. Split by URL and high-cost surface with dynamic imports.
2. Preload only a surface that is predictably needed, such as the desktop inspector next to the Studio editor request.
3. Keep document-scoped workers and abort controllers under a single lifecycle owner.
4. Keep hot canvas projections identity-stable and avoid subscribing the full editor host to transient pointer state.
5. Validate the production chunk graph with the existing Studio bundle gate before adding manual chunk rules.

React Router framework-mode route modules were reviewed, but ToonSpectrum currently uses a declarative `BrowserRouter` boundary that is also part of the security review. Migrating router modes would combine architecture, security, and data-loading changes. This refactor instead obtains the route-ownership and code-splitting benefits with the current reviewed runtime and Vite dynamic imports.

## Repository hygiene

Execution receipts and one-off soak trigger notes belong in GitHub Actions artifacts, not source control. The architecture validator rejects the old `.github/qa` and `scripts/qa/runs` receipt directories. Durable findings belong in an ADR, an architecture document, or a maintained runbook.

## Migration rule

When touching the legacy host:

1. Identify one authority or lifecycle boundary.
2. Define typed inputs, outputs, and intent-level commands.
3. Move state and cleanup together; do not move callbacks alone.
4. Preserve the route, document key, and async cancellation contract.
5. Lower the host ratchet after the extraction.
6. Add a focused contract test when the behavior can regress without a type error.

The target is not a zero-line host. The target is a thin editor-session composition root whose dependencies are understandable without reading the canvas engine, collaboration transport, persistence adapters, and every panel at once.
