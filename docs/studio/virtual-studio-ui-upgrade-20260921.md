# Virtual Studio interaction upgrade — 2026-09-21

Status: implementation checkpoint, not a production release. Base: `cb2913ecf67241f3055111a1b23f600b91e90505`.

## Implemented

- Added a visible live-space command bar with current-work context, exact manuscript resume, room/person search and review/task/handoff inbox entry.
- The read-only resume adapter rechecks the actual current work/document before navigation. List destinations are labelled as manuscript lists; missing documents never select another work.
- Room/person search preserves direct Open versus Walk semantics, ranks matching names before descriptions and supports explicit keyboard selection without consuming IME composition Enter.
- People use one All/Nearby/In-conversation directory, retaining all social invitations, acceptance, cancellation, block controls and validated character thumbnails. Removed redundant nearby/chat/member copies without removing supported appearance fallback.
- Desktop inspectors opt into non-modal presentation at wide widths. Consent and narrow-screen panels remain modal. Closing a panel is not leaving media or granting consent.
- The inbox reads existing production and pinned-review sources and embeds the existing receipt-backed handoff inbox. It does not invent counts, mark read/accepted automatically or complete tasks.
- Added a workspace dependency ownership check: foreign-worktree, dangling and missing workspace package links fail explicitly. Existing dev/build/typecheck/root-test entrypoints run the check instead of aliasing packages to make tests pass.

## Executed validation

- Current worktree links: 22 dependencies across 14 packages verified.
- Full virtual-space/workspace/shared-workspace scoped run: 60 test files, 634 tests passed.
- Dependency ownership guard: 4 tests passed.
- The initially failing thumbnail regressions were fixed by restoring validated avatars to the unified picker and checking the new retained surface. They were not deleted or skipped.
- Earlier full web TypeScript check passed; integrated-branch type/lint/build checks remain required after merging world/session and current main changes.
- These tests do not certify production API behavior, real multi-user WAN media, all devices, or all 30 design requirements.

No production deployment, schema migration, paid infrastructure, credentials or protection rules were changed at this checkpoint. Further integration must preserve the concurrent studio-first redesign and existing renderer/document authorities.
