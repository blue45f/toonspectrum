# ToonStudio session implementation status

Updated: 2026-09-11

This document records the user-visible implementation completed in the ToonStudio information-architecture session. Executable routes, stores, domain contracts, UI tests, and workflow checks remain the authoritative source of truth.

## Canonical product structure

- `/studio` is the single Studio entry point for recent projects, creation, import, assets, learning, and account state.
- `/studio/p/:projectId/{overview,story,production,assets,review,export,settings}` is the canonical project workspace.
- Query-string views switch project-owned work without opening duplicate shells.
- Specialist editors remain intentional destinations only for immersive canvas or character editing.
- Legacy paths normalize into the canonical product structure instead of creating competing sources of truth.

## Implemented project workflows

### Overview and analytics

- Project progress, release readiness, review state, audience events, completion, scroll depth, reactions, revenue, production cost, and net result share one project context.
- Analytics events are project-scoped and persisted locally until a remote connector is configured.

### Story and continuity

- Story beats can be added, removed, ordered, and converted into storyboard recommendations.
- Storyboard planning derives shot size, camera intent, dialogue space, scroll gaps, and estimated manuscript height without silently changing artwork.
- The story Bible tracks characters, locations, facts, scene states, and transitions.
- Continuity checks report unexplained costume, appearance, injury, prop, knowledge, and location changes.
- Localization manages source and translated text, terminology, cleanup, lettering fit, font coverage, reading order, review, and approval.

### Production

- Production tasks model stage, assignee, estimate, dependencies, status, blocked reason, progress, ready work, bottlenecks, critical path, and workload.
- Webtoon quality checks cover mobile type size, balloon overlap, reading order, face obstruction, scene spacing, cut density, and scroll rhythm.
- 3D render planning validates camera, lighting, scene load, asset rights, editable scene preservation, and color, line, shadow, depth, and object-mask passes.
- Voice and motion planning regenerates only changed dialogue, validates commercial-use and attribution requirements, and calculates scene timing.
- Template and presentation workflows validate typed slots, required assets, rights, title length, slide overlap, text size, and recommended layouts.

### Assets and Series Kit

- The asset hub provides project assets, installed assets, marketplace discovery, rights review, missing-asset recovery, team access, and seller entry points.
- Series Kit persists project colors, type styles, balloon styles, reusable components, export defaults, versions, validation, save, and restore behavior.
- Rights and provenance checks are retained across asset, font, AI-result, export, and publishing workflows.

### Review and version protection

- Comments, change requests, drawing annotations, target locations, assignees, resolution, and reviewer decisions are project-owned.
- A reviewer may submit a decision after their own blocking requests are resolved; final approval still requires every required reviewer.
- Approved revisions are protected and preserved. Later edits create a new draft rather than overwriting the approved result.
- Version history and comparison retain both sides of the comparison.

### Export and publishing preparation

- Destination-first export supports webtoon platforms, social media, print, images, PDF, editable documents, ebooks, video, and full project backups.
- Preflight validates dimensions, splitting, file size, DPI, color space, fonts, assets, rights, AI disclosure, reading order, alternative text, captions, localization, and unresolved review work.
- Export packages and history are reproducible from stored project state.
- Direct publishing remains blocked until credentials, provider capability, rights, and explicit external-write confirmation are available.

### AI and automation safety

- AI requests carry project and section context into the existing editor execution surface.
- Handoffs expire, are consumed once, reject another project, and prevent duplicate execution.
- Generated work is applied as a copy instead of silently replacing the source.
- External transfer, paid execution, destructive operations, and publication require explicit confirmation.
- Automation recipes run safe quality and preflight steps directly while gating external-write, paid, and destructive steps.
- Missing providers produce an explicit blocked state rather than a false success result.

## Persistence and integrity

- Project feature state, readiness, localization, review history, Series Kit, and export snapshots use versioned project-scoped storage keys.
- Storage readers reject malformed or mismatched project data and restore safe defaults.
- Updates cannot change project identity.
- Cross-tab update events keep project surfaces synchronized.
- Route and destination audits reject self-loops, unreachable specialist routes, and implementation terminology in user-facing copy.

## Verification contract

The branch is verified with independent gates so a large TypeScript graph cannot hide lint or behavior results:

1. Scoped TypeScript 6 compilation with an 8 GB heap.
2. ESLint with zero warnings for integrated Studio sources.
3. Domain and UI regression coverage for archive manifests, assets, providers, automation, fonts, marketplace submissions, plugins, readiness, publishing, rights, Series Kit, templates, project destinations, feature-suite persistence, asset hub, project assistant, review, and the integrated feature panel.
4. Permanent PR integration checks for canonical routes, project composition, transient editor handoff, diagnostics, localization, review, export, and AI execution.

## Deliberate external boundaries

The following require infrastructure or credentials outside the browser implementation and therefore remain explicit, safe boundaries rather than simulated completion:

- remote AI inference and paid provider calls;
- marketplace purchase, entitlement sync, and protected downloads;
- platform publishing APIs and credential storage;
- organization-wide collaboration persistence, notifications, and server-side audit retention;
- physical GPU, browser-driver, and device-specific long-session qualification.

When these services are not configured, the UI reports the required connection, right, credential, payment, or confirmation instead of claiming the operation completed.
