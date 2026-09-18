# ToonStudio engineering field notes

## Purpose

The public field-notes route documents implementation patterns that can be reused outside ToonStudio. It is not a marketing dependency list and does not turn a design candidate into a live product claim.

The typed content source is:

```text
apps/web/src/domains/legal/technology/engineering-field-notes-content.ts
```

The route is:

```text
/about/technology/field-notes
```

## Repository-verified inventory

The page publishes review-date-bound implementation counts and tests them against the repository:

- 59 dedicated `*.worker.ts` entries;
- 56 `*worker-client.ts` boundaries;
- 9 non-test service-worker runtime modules;
- 2 browser-local inference runtimes: ONNX Runtime Web and MediaPipe Tasks Vision;
- 8 allowlisted Blender MCP commands;
- 8 reviewed Open API adapters.

The counts are evidence, not a feature-quality score. They exist to make architecture claims auditable and to fail tests when the implementation drifts.

## Content groups

### Worker topology

Workers are scoped by workload rather than shared as a universal background thread. Every protocol documents:

- request identity and response schema;
- byte, queue and memory limits;
- transferable ownership;
- timeout and cancellation;
- late-result fencing;
- fatal cleanup and worker recreation;
- the explicit main-thread commit boundary.

A worker may calculate, decode, validate or render, but it does not own the canonical project document.

### PWA and offline runtime

The PWA section separates runtime caching from project storage:

- service-worker caches contain reproducible runtime assets;
- OPFS, SQLite and recovery journals contain work state;
- APIs remain network-only;
- navigation and immutable assets use different strategies;
- generated precache plans carry schema and content hashes;
- activation is controlled and reload loops have an emergency cleanup path.

### Browser-local AI

ONNX Runtime Web and MediaPipe Tasks Vision are treated as capability-bound local providers rather than universal offline fallbacks. The contracts cover:

- model ID, version, SHA-256 and input/output schema;
- model and tensor byte budgets before allocation;
- explicit WebGPU or WASM provider selection with no silent backend retry;
- request, stroke and document epoch fencing;
- webcam and model-origin consent boundaries;
- process-wide FIFO initialization for MediaPipe task factories that share ambient module state.

### AI-assisted engineering

AI assists repository search, drafts, review suggestions, documentation, test candidates and bounded Blender operations. Completion still requires ordinary diffs, deterministic tests, browser evidence, license/security gates and human approval.

MCP tools expose typed, outcome-oriented commands and do not grant arbitrary shell, network, `eval` or `exec`. AI review configuration is never treated as proof that a review actually ran; PR comments, workflow runs and artifacts are checked separately.

### Free-first AI

Free-first AI is an operating policy:

- exact provider/model allowlists;
- explicit operator confirmation;
- durable quota and idempotency records;
- safe advance only after machine-verifiable pre-inference rejection;
- no retry after ambiguous timeout, 5xx or malformed success;
- BYOK credentials scoped to explicit work and never used as a silent fallback;
- no hidden model, resolution or output-quality downgrade.

### Minimum-cost infrastructure

The infrastructure note separates static delivery, edge liveness, dynamic API, realtime rooms, large immutable objects and the durable ledger. It also documents cold starts, free-tier ceilings and the absence of automatic paid promotion.

A reviewed immutable commit SHA and release receipt are required for production changes.

### Blender MCP and 3D

The Blender facade is an allowlisted command surface, not an arbitrary Python or shell executor. Browser-owned project documents remain authoritative. Blender is used for bounded DCC work such as topology, shape keys, hair LODs, MToon/VRM output, review renders and packaging.

The realtime 3D architecture keeps one Scene3D document and projects it into a primary Three runtime or explicitly activated specialist kernels. Engine objects are not persisted as project truth.

### Open APIs

Every provider entry records:

- official endpoint and authentication requirements;
- response schema and request budgets;
- rights predicates and source attribution;
- image and link host allowlists;
- cache and rate-limit behavior;
- timeout, schema-drift and partial-failure handling.

Public API access, public-domain metadata and asset redistribution are kept as separate decisions.

### Troubleshooting

Each incident-style entry follows the same structure:

```text
symptom → root cause → fix → prevention → repository evidence
```

Only failures with inspectable implementation or regression evidence are presented as resolved.

## Reference products

Reference products are labelled with one of five roles:

| Role | Meaning |
| --- | --- |
| `applied-pattern` | a public workflow or quality pattern was translated into a product contract |
| `specialist` | a bounded external tool is used without owning product authority |
| `reference-only` | quality or architecture reference, not embedded in the product |
| `planned-evaluation` | candidate with explicit gates, not a live feature |
| `not-adopted` | deliberately excluded because of duplicated authority, cost or compatibility |

Do not copy commercial assets, private APIs, protected UI or non-public implementation details when updating these notes.

## Review rules

Official documentation links carry a review date. Recheck provider pricing, free tiers, browser support, API terms, model identifiers and engine support before implementation or publication.

Public field-note content must never include:

- secrets, tokens or real account identifiers;
- private endpoints or operational access details;
- unpublished exploit steps;
- claims that a candidate or harness is live;
- claims that a free tier is unlimited or guaranteed.

## Verification

```bash
pnpm exec vitest run \
  apps/web/src/domains/legal/technology/engineering-field-notes-content.test.ts \
  apps/web/src/domains/legal/technology/engineering-story-content.test.ts \
  apps/web/src/domains/legal/technology/EngineeringStoryPage.test.tsx \
  apps/web/src/app/routes/groups/about-routes.test.tsx \
  apps/web/src/shared/lib/__tests__/sitemap-routes.test.ts

pnpm exec playwright test \
  e2e/engineering-story.spec.ts \
  --config playwright.non-studio.config.ts
```
