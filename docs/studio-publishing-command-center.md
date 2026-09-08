# Studio publishing command center

## Goal

`/studio/publish` and `/studio/work/:workId/publish` now provide one staged publishing flow instead of a single upload-and-submit form:

1. prepare and order the rendered pages;
2. review title, description, tags, series, and challenge context;
3. choose release time, visibility, reader mode, interaction policy, content rating, and share metadata;
4. run blocking preflight checks and inspect a reader preview;
5. explicitly confirm draft save, immediate release, private save, or scheduled release.

The implementation reuses the existing upload image safety limits, shared-document authorization, CRDT sequence fence, optimistic revision checks, payload-size checks, and retained work revision history.

## Benchmark signals

| Service / source | Product signal used | ToonSpectrum response |
| --- | --- | --- |
| [WEBTOON CANVAS — Scheduling Episodes](https://www.webtoons.com/en/creators101/webtoon-canvas/scheduling-episodes) | Creator-controlled episode scheduling is part of the publishing workflow, alongside creator analytics and comment-management guidance. | A future wall-clock release is converted from an IANA timezone to canonical UTC, saved with the work revision, and promoted by the API scheduler. |
| [GlobalComix — Publish](https://globalcomix.com/publish) | Immediate or date/time scheduled publishing, follower-facing releases, and support for both vertical-scroll and traditional layouts. | Immediate/scheduled modes and vertical/paged reader metadata are first-class publication settings. |
| Existing `studio-publish-package.ts` and `studio-publish-preflight.ts` | Destination packaging, AI disclosure, audience/rights checks, and structural validation already existed in the editor. | The command center keeps those contracts intact and adds site-distribution policy rather than creating a competing export-package model. |
| Existing `studio-release-schedule.ts` | DST-safe IANA timezone resolution and explicit rejection of nonexistent/ambiguous wall-clock values. | The same resolver is reused for actual site release scheduling. The older release-planning calendar remains an editorial planning tool. |

External WEBTOON or Tapas auto-publishing is deliberately not implied. Their profiles continue to be packaging/preflight targets; this change automates publication only on ToonSpectrum.

## Publication contract

The owner-authored policy lives at `creator_works.doc.publication` and is versioned independently of the SQL schema.

```ts
interface CreatorPublicationDirective {
  version: 1;
  mode: "immediate" | "scheduled";
  visibility: "public" | "unlisted" | "private";
  scheduledAt: string | null;       // canonical UTC ISO timestamp
  timeZone: string;                 // IANA zone used for authoring/display
  comments: "open" | "closed";
  allowRemix: boolean;
  readingMode: "vertical" | "paged";
  readingDirection: "ltr" | "rtl";
  contentRating: "all" | "teen" | "mature";
  searchIndexing: boolean;
  socialTitle: string;
  socialDescription: string;
  canonicalSlug: string;
  publishedAt: string | null;
}
```

Normalization is shared by web and API code. It enforces these invariants:

- non-public work cannot opt into search indexing;
- vertical scrolling always uses top-to-bottom/left-to-right progression metadata;
- scheduled private work is rejected instead of creating an unreachable timer;
- challenge entries must be public;
- malformed timezones, timestamps, enums, slugs, and overlong social fields fail to bounded values;
- legacy published works without `doc.publication` retain their historical public behavior.

## State transitions

| Requested action | Publication settings | Stored work status | Result |
| --- | --- | --- | --- |
| Save draft | any | `draft` | Owner/editor content is revisioned without public exposure. |
| Publish | immediate + public | `published` | Appears in discovery and is readable by direct URL. |
| Publish | immediate + unlisted | `published` | Readable by exact URL, excluded from work/series/challenge discovery. |
| Publish | private | `draft` | Remains owner/collaborator-only. |
| Publish | future schedule + public/unlisted | `draft` | Becomes `published` after the deadline, with a new retained revision. |
| Scheduled deadline | valid, non-private, unpublished directive | `published` | `publishedAt` is stamped and the existing revision-fenced update transaction is used. |

The scheduler uses two complementary mechanisms:

- a bounded 30-second process-local sweep for long-running API instances;
- a bounded request-path sweep as a cold-start/serverless fallback.

Every promotion delegates to the existing `updateWork` transaction with `baseRevision`. Multiple replicas can observe the same due row, but only one revision update succeeds; the others safely retry on a later sweep. No database migration or queue dependency is required.

## Visibility and interaction enforcement

The API, not only the UI, applies publication policy:

- normal work discovery includes only `public` works;
- `unlisted` works remain readable by exact URL but are removed from series neighbours, remix child discovery, and challenge entries;
- `private` works remain drafts and are not returned to non-owners;
- new comment creation is rejected when comments are closed, while existing comments remain readable;
- creating a remix is rejected when the parent has disabled remixing;
- private schedule data and the authoring timezone are removed from the public document projection;
- legacy editor saves that replace `doc` preserve an existing publication directive instead of silently resetting privacy.

Discovery metadata reads fail closed: if the API cannot load a work's publication document, it omits that work from discovery rather than assuming it is public.

## Command-center preflight

Blocking errors include:

- missing title or pages;
- more than 40 pages;
- duplicate internal page identifiers or invalid image dimensions;
- missing/too-soon/too-distant schedule time;
- private scheduled releases;
- non-public challenge releases.

Warnings include:

- missing description or tags and duplicate tags;
- landscape or materially inconsistent-width pages in vertical mode;
- extremely tall pages in paged mode;
- weak social-card metadata or missing readable slug;
- mature-audience confirmation.

Warnings never silently become blockers. The final review lists both severities and disables release only for errors.

## Collaboration and failure behavior

- Editors can update the content revision but cannot change top-level publication status.
- The command center also preserves the stored publication directive for non-owner saves.
- Before each shared save, the client re-reads server metadata and verifies membership role, status, revision, and CRDT frontier.
- Focus/visibility revalidation fails closed after a role or access change.
- Scope changes and unmounts abort in-flight image conversion and publication requests.
- Dirty local changes register a browser unload guard and survive an access/revision error until the author explicitly reloads.

The collaboration endpoint still accepts owner-editable JSON as part of the shared document contract. A malicious custom client with a valid editor credential could attempt to mutate nested JSON even though it cannot change top-level status; hardening nested-field authorization in the collaboration repository is a separate defense-in-depth follow-up.

## Tests

The change adds focused tests for:

- contract normalization, privacy invariants, public projection, and status derivation;
- API mutation preparation, legacy-doc policy preservation, challenge restrictions, and discovery filtering;
- IANA timezone conversion including DST overlap rejection;
- content/layout/social preflight classifications.

The existing upload safety, shared-document revision/CRDT tests, and creator API integration suites remain the regression safety net for the reused pipeline.

## Deliberate non-goals

- No external platform credentials or WEBTOON/Tapas automatic submission.
- No follower notification preference until a durable notification/outbox contract exists.
- `readingMode`, `readingDirection`, `contentRating`, social metadata, and canonical slug are now durable public contracts and previewed in Studio; consuming every field in the public reader/HTML head can be rolled out independently without another data migration.
- No SQL migration: the JSON contract is backward compatible and can be rolled back by restoring the creator barrel, route, and scheduler provider while leaving unknown `doc.publication` data inert.
