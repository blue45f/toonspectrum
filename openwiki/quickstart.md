# ToonSpectrum repository quickstart

Status: **bootstrap page**. OpenWiki may enrich or replace generated pages, but `openwiki/INSTRUCTIONS.md` is user-authored policy and must be preserved.

## Reading order

1. `AGENTS.md` — deployment/operations policy and agent rules.
2. `ARCHITECTURE.md` — current repository architecture.
3. `docs/architecture/modular-monorepo-target.md` — agreed migration target.
4. Relevant domain/runtime source and tests.
5. Relevant ADRs under `docs/adr/` when present.

## Application boundaries

- `apps/web`: user-facing browser application.
- `apps/admin`: independent administrator surface being introduced incrementally.
- `apps/api`: backend modular application.
- Other `apps/*` entries are specialized runtimes/tools and should not be folded into Web or Admin without an explicit decision.

Logical domains stay inside applications. There is intentionally no `packages/domains` target at this stage.

## Studio

Studio is an architectural exception to ordinary page-oriented organization. Follow runtime authority and the existing Studio core packages. Do not move Studio code merely to make folder shapes look uniform.

## OpenWiki commands

```sh
npm install -g openwiki@0.4.3
openwiki code --init
openwiki code --update
```

The scheduled workflow is intentionally non-auto-merge. It only runs generation when repository OpenWiki provider/model variables and the corresponding credential secret are configured.
