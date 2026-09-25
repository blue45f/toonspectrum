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
- `apps/admin-web`: independent administrator surface being introduced incrementally.
- `apps/api`: backend modular application.
- Other `apps/*` entries are specialized runtimes/tools and should not be folded into Web or Admin without an explicit decision.

Logical domains stay inside applications. There is intentionally no `packages/domains` target at this stage.

## Studio

Studio is an architectural exception to ordinary page-oriented organization. Follow runtime authority and the existing Studio core packages. Do not move Studio code merely to make folder shapes look uniform.

## OpenWiki commands

```sh
npm install -g openwiki@0.5.2
openwiki --init
openwiki --update
```

For local/manual maintenance, the repository includes the project-scoped Codex integration under `.agents/skills/openwiki` and `.codex/config.toml`. Restart Codex after checkout, then ask it to initialize or update this repository's OpenWiki. Host-driven generation uses the coding agent's authenticated model session, so it does not require a separate OpenWiki provider credential.

The scheduled workflow is intentionally non-auto-merge and runs weekly to bound inference cost. It only generates when `OPENWIKI_PROVIDER` and `OPENWIKI_MODEL_ID` repository variables plus `OPENROUTER_API_KEY` and the dedicated `OPENWIKI_PR_TOKEN` secrets are configured. `.openwikiignore` keeps generated, binary, and high-volume runtime assets outside the documentation read boundary.