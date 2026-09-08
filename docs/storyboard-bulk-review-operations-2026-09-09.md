# Storyboard bulk review operations — benchmark and implementation note

Date: 2026-09-09  
Scope: `/studio` page review workflow, following the Storyboard Control Room delivered in #967

## Why this follow-up exists

The Control Room made storyboard health visible through review queues, search, filters, readiness metrics, and CSV export. The next high-impact production gap was actionability: editors still had to open every page and repeat the same status, assignee, or lock change.

Professional storyboard workflows converge on three principles:

1. **Board-level overview and shot-level detail must stay connected.** StudioBinder exposes storyboard/shot-list organization and collaboration around individual shots, while Toon Boom keeps timing and panel metadata attached to the panel itself.
2. **Review decisions need explicit workflow state.** A production board needs clear ownership, approval state, and an intentional lock boundary rather than relying on visual inspection alone.
3. **Automation must preserve creative control.** Recent storyboard-agent research emphasizes editable intermediate structure and iterative refinement instead of replacing the artist's decision loop.

Primary references reviewed:

- Toon Boom Storyboard Pro documentation: Panel Timer, scene length, record audio, animatic workflow, Storyboard Pro 27 release notes
- StudioBinder storyboard application and shot-planning workflow
- AnimAgents: A Multi-Agent Framework for Customizable Storyboard-to-Animation Production
- Existing repository benchmark: `docs/storyboard-control-room-benchmark-2026-09-09.md`

## Implemented interaction model

### Search and filter

- Search across page label, localized review status, assignee, and review note.
- Filter by `draft`, `needs-review`, `changes-requested`, or `approved`.
- Show displayed, selected, and hidden-selected counts so a filtered bulk operation cannot silently affect off-screen pages.
- Provide a one-click filter reset empty state.

### Multi-select

- Native accessible checkbox per page.
- Select or clear all currently displayed pages.
- Clear the complete selection independently from the active filter.
- Preserve selection while changing filters and disclose how many selected pages are outside the current result set.

### Bulk operations

- Apply review status to the selected pages.
- Apply or clear assignee.
- Lock or unlock editing.
- Preserve the existing single-page rule that approval automatically locks the page.
- Keep non-approval status changes from implicitly unlocking a page.

### Reliability guardrails

The existing `onPatchReview` command is intentionally retained because it routes through the document commit, autosave, history, and review-lock bypass policy already used by the single-page review panel.

Calling that command repeatedly in the same render would be unsafe: every callback can capture the same pre-change page array, so later calls could overwrite earlier changes. The panel therefore uses an acknowledged sequential queue:

1. Build a deterministic minimal patch plan in document order.
2. Submit one page patch.
3. Wait until the normalized document state contains that patch.
4. Continue with the next page using the latest callback and latest document state.
5. Skip a page after a bounded confirmation timeout instead of blocking the remaining batch indefinitely.

This is not a server transaction, but it avoids stale-render overwrite while preserving the existing persistence contract. A future host-level `patchPageReviews` command can collapse the queue into one atomic history entry without changing the UI model.

### Accessibility and responsive behavior

- Search and filters have programmatic labels.
- Selection uses native checkboxes.
- Batch progress and completion are announced through an `aria-live` region and also shown visually.
- Controls are disabled while a batch is in flight to avoid conflicting edits.
- The existing movable desktop surface and full-screen mobile dialog contracts are preserved.

## Domain model additions

`studio-page-review.ts` now owns the reusable policy instead of embedding it in JSX:

- shared assignee/note length constants
- `PageReviewPatch`
- `PageReviewBulkOperation`
- deterministic `buildPageReviewBulkPatchPlan`
- `pageReviewStateIncludesPatch` for persistence acknowledgement

The planner ignores stale and duplicate selections, skips no-op changes, normalizes assignees, and returns minimal patches.

## Test coverage

- document-order planning with stale/duplicate selection IDs
- approval auto-lock and minimal patches
- non-approval status preserving the existing lock
- assignee trimming, maximum length, clearing, and no-op suppression
- persisted-state acknowledgement
- desktop floating-surface regression
- mobile modal regression
- controlled multi-page integration proving sequential application against fresh document state

## Deferred production increments

- Atomic host-level multi-page review command and single Undo entry
- Revision/conflict tokens for concurrent reviewer edits
- Server-authoritative permissions and lease locks
- Checklist/reason codes and immutable audit trail
- Scene/sequence hierarchy and animatic readiness gates
- Version compare and pinned frame comments
