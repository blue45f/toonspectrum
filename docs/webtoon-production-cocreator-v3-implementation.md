# ToonSpectrum Webtoon Production Co-Creation v3

## Delivery metadata

- Source pull request: `blue45f/toonspectrum#1427`
- Source branch: `consolidation/all-unmerged-20260914`
- Source commit: `923e5155ad199a62d680596cad44133b36a02189`
- Implementation branch: `feat/webtoon-production-cocreator-v3`
- Database migration: `0053_production_collaboration_core.sql`

This implementation turns the existing Studio production surfaces into a revisioned webtoon production operating system. It covers planning, story-to-art handoff, isolated creative branches, review, procurement, contracts, delivery, credits, rights and compensation without treating those concerns as interchangeable.

## Product invariants

### Role is not authorship

The platform stores the following independently:

1. `RoleAssignment`: what a participant is currently expected and allowed to do.
2. `ContributionRecord`: which immutable content revision the participant actually created.
3. `DecisionAuthorityRule`: who may propose, approve, decide, mediate or veto a decision domain.
4. `RightsInterest`: an asserted or verified legal/contractual interest and its evidence.
5. `CreditManifest`: how approved contributors are displayed for a concrete publication revision.
6. `CompensationPlan`: fixed fees and revenue-source-specific shares established by an agreement revision.

Uploading a file never creates an authorship claim. Administrative access never implies creative authority. Contribution volume never rewrites compensation automatically.

### Three canonical lineages

- Narrative lineage: brief, bible, script, StoryLock and story amendments.
- Visual lineage: visual explorations, thumbnail branches, art checkpoints and ArtLock.
- Integrated lineage: assembled episode, lettering, JointProof and publication snapshot.

Work branches are isolated from canonical lineages. A `CreativeMergeRequest` records the source branch, target lineage, base revision, proposed revision, changed scopes, affected decisions and approvals, required review lanes and the eventual merged revision.

### Work is not a deliverable

- `ProductionTask` is work performed by people.
- `Deliverable` is a contract or production completion definition.
- `Submission` is an immutable revision submitted at a specific time.
- `DeliveryRevision` packages one or more submissions with source objects, licenses, AI-use receipts and a checksum.

A task may be done while a submission is rejected. An approved submission is never silently mutated; it is superseded by a later revision.

### Procurement scope is immutable

A published `ScopePackage` fixes:

- referenced episode, scene, cut and asset scopes;
- input revisions;
- deliverables and acceptance criteria;
- schedule and review response SLA;
- included revision rounds;
- rights, AI, credit and compensation policy references;
- disclosure level.

Changing published scope requires `amend-scope-package`. The previous revision is retained in `scopePackageRevisionArchive` and a `ScopePackageAddendum` links the previous and replacement digests. Contract changes use a separate `ContractChangeOrder` linked to the source production change and addendum.

### Payment records are evidence-based

The platform does not claim to hold funds or provide escrow. A `PaymentRecord` initially records an external payment assertion as `recorded-pending-verification`. It may become `verified-paid` only when provider, external reference, evidence, verifier assignment and paid timestamp are present and the amount and parties match the invoice.

## Planning model

The planning hierarchy is revisioned independently of the drawing document:

```text
ProjectBrief
└── SeriesMaster
    └── SeasonPlan
        └── EpisodePlan
            └── ScenePlan
                └── CutPlan
```

Supporting records:

- `PlanningSnapshot` freezes source revisions, planning documents, scope and approvers.
- `AssetRequirement` connects story breakdown to internal production, procurement or existing assets.
- `ProductionRisk` records probability, impact, owner, trigger and mitigation.
- `DecisionRecord` stores a scoped decision, rationale, alternatives, evidence and authority.

Approved or locked planning documents require active assignments and recorded review decisions. They cannot be edited in place; a new revision must supersede the old one. StoryLock, ThumbnailLock, JointProof and publication are represented by deterministic planning snapshots.

## Collaboration lifecycle

```text
Episode planning
→ Story drafting
→ Story review
→ StoryLock
→ Story-to-art handoff
→ Clarification
→ Art accepts handoff
→ Thumbnail branch
→ Joint thumbnail review
→ ThumbnailLock
→ Final art
→ Lettering and integration
→ JointProof
→ Publication preflight
→ Published snapshot
```

A handoff distinguishes:

- `MUST_PRESERVE`: story approval is required to change it.
- `INTENT`: the purpose is canonical, while visual implementation remains open.
- `SUGGESTION`: optional interpretation.
- `ARTIST_CHOICE`: final visual choice belongs to art authority.
- `REFERENCE_ONLY`: evidence or inspiration, not a copying instruction.
- `DO_NOT_USE`: prohibited content or interpretation.

Readiness uses both a score and hard gates. A high score cannot bypass a missing StoryLock, blocking clarification, missing critical reference, unresolved rights policy or missing decision owner.

## Review and publication

Review policy is lane-based:

- narrative;
- canon and continuity;
- visual direction;
- production;
- lettering and localization;
- accessibility;
- rights and compliance;
- client or publisher.

Each lane defines eligible assignments, required assignments, quorum, veto holders and whether it blocks publication. Expired review never auto-approves; the policy chooses escalation, replacement review or schedule re-baselining.

Publication requires:

- JointProof approval;
- integrated revision in the snapshot;
- CreditManifest content revisions matching the candidate revisions;
- required credit approvals;
- contribution and rights evidence preflight;
- publication snapshot stored in the append-only project history.

## Commercial lifecycle

```text
Procurement demand
→ immutable ScopePackage
→ proposal
→ selection
→ agreement
→ contract milestones
→ submissions and DeliveryRevision
→ acceptance
→ invoice
→ external payment record
→ evidence verification
```

Implemented records:

- `ProcurementProposal`
- `ProductionAgreement`
- `ContractChangeOrder`
- `ContractMilestone`
- `DeliveryRevision`
- `ProductionInvoice`
- `PaymentRecord`
- `ProductionDispute`

Money uses integer minor units and ISO 4217-style three-letter currencies. Proposal milestone totals must match the proposal total. Agreements pin the exact ScopePackage revision and selected proposal. Completed agreements require milestone totals to match the agreement. Accepted delivery requires source revision references and license evidence.

## Server architecture

### Aggregate authority

`production_project` stores the latest project aggregate and an integer optimistic revision. Commands execute in a transaction with a row lock and require `expectedRevision`. A successful command:

1. verifies creator work ownership or collaboration access;
2. checks command-specific comment, edit or manage capability;
3. checks the idempotency receipt;
4. validates domain invariants;
5. increments aggregate revision exactly once;
6. appends one audit event;
7. stores a mutation receipt and response.

### Append-only evidence

- `production_project_event` stores one event per aggregate revision.
- `production_project_mutation_receipt` makes client mutation IDs idempotent per actor and project.
- a reused mutation ID with another request digest is rejected.

### API

```text
POST /production/projects
GET  /production/projects/:projectId
GET  /production/works/:workId/project
POST /production/projects/:projectId/commands
```

The command endpoint accepts typed discriminated commands for:

- collaboration configuration;
- episode lifecycle and handoff;
- clarification and review;
- tasks and change requests;
- creative branch, merge request, deliverable and submission;
- planning documents and planning snapshots;
- ScopePackage publication and addendum;
- proposals, agreements, change orders, milestones, delivery, invoice, payment and dispute;
- contribution, credit, rights and compensation.

## Web surfaces

```text
/production
/production/projects/:projectId/overview
/production/projects/:projectId/planning
/production/projects/:projectId/episodes
/production/projects/:projectId/episodes/:episodeId
/production/projects/:projectId/production
/production/projects/:projectId/handoff
/production/projects/:projectId/review
/production/projects/:projectId/procurement
/production/projects/:projectId/rights
/production/projects/:projectId/settings
```

The project shell offers story, art and producer perspectives without changing canonical data. The Episode Room displays Story Intent, locked planning data, handoff instructions, branch lineage, current submissions, role-specific questions and lane approvals.

The existing Studio project production section contains a bridge to the new hub while retaining the same project identity. Canvas editing remains in ToonStudio; production authority and commercial records remain server-backed.

## Existing local Studio data

The previous local Studio project feature suite remains available. It is not silently promoted to server authority. Migration should be an explicit import operation that:

1. reads local Story Bible, beats and tasks;
2. maps them to draft planning records;
3. shows a diff and unresolved identities;
4. requires an authorized user to confirm;
5. creates one atomic server command batch or no server changes.

This implementation deliberately avoids a hidden local fallback for contracts, rights, approvals or payment state.

## Security and privacy

- creator work owner and collaborator access is reused for the project boundary;
- command capability is selected server-side, never trusted from the client;
- creative authority is checked against active assignments and scoped rules;
- external suppliers receive scoped assignments rather than whole-project access;
- contract, rights and payment state cannot be edited with ordinary comment access;
- review, snapshot and publication approval needs stored decision evidence;
- corrupt aggregate identity or revision fails closed;
- API responses use private no-store caching.

## Validation

Primary validation commands:

```bash
pnpm --filter @webtoon-nest/api run typecheck
NODE_OPTIONS='--max-old-space-size=8192' pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec vitest run \
  packages/core/src/production/production.test.ts \
  apps/api/src/modules/production-collaboration/production-collaboration.service.test.ts \
  apps/web/src/domains/creator/production-hub/ProductionHubPage.test.tsx \
  apps/web/src/app/routes/groups/production.routes.test.ts
pnpm run lint:quick
pnpm run validate:architecture
pnpm run build
```

The focused suite covers scope containment, authority, handoff gates, lifecycle transitions, review quorum and veto, late-change impact, immutable procurement scope, credit preflight, branch and merge isolation, immutable submissions, planning snapshots, proposal/agreement/milestone money, evidence-based payment state, optimistic revision conflict and route/UI behavior.

## External adapter boundaries

The following are intentionally adapter boundaries rather than simulated platform capabilities:

- electronic signature provider;
- payment provider and escrow;
- tax invoice provider;
- external calendar and notification delivery;
- legal identity verification;
- C2PA signing and verification;
- platform publishing APIs.

Records and validation contracts are present. The UI must not claim these external actions succeeded until an adapter returns verifiable evidence.
