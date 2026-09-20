# Studio-first workspace implementation

Date: 2026-09-20
Status: implemented on an isolated feature branch; not an operating deployment.
Branch: `feat/studio-first-workspace-20260920`
Base: `847e49616043d131ed4329cd45e7001201b6c68d`

## Implemented scope

- `/` and `/home`: one project-backed studio home, with spatial preview and list views.
- `/team`: project member/access settings, recruitment and conversation/interview preparation are separate destinations.
- `/hub`: public works, materials, people and learning; private drafts are not published by navigation.
- Four visible global destinations: 스튜디오 / 작품 / 팀 / 둘러보기, consistent in desktop and mobile headers.
- The project selector reads the existing active project library. The resume action uses the established exact document/workspace resume resolver.
- Explicit missing, archived or trashed projects never silently resume another project. `scope=personal` is separate from project identity.
- Fresh desktop defaults to spatial view; fresh narrow devices default to list view. Explicit legacy preferences remain valid.
- Original studio artwork remains unchanged. The home artwork is labelled as a preview; real presence and playable movement are in `/studio/p/:projectId/space`.
- The live project shell retains Phaser, presence, NPC, slot, social-consent and document authorities. Its promotional grid and oversized navigation are removed.
- Space settings and people/conversations live in one initially closed native dialog. Closing it does not grant consent or end a conversation.
- Opening actual media or a separate tool closes the inspector so the dialog cannot cover or make those controls inert.
- Theme tokens, readable labels, 44px primary touch targets, visible focus and reduced-motion handling replace independent decorative chrome.

## Boundaries

This is a product navigation and presentation implementation, not a replacement rendering/storage engine. It adds no server, paid service, migration, secrets or public data writes. Interview preparation connects existing project spaces and permission settings; it does not claim a new applicant-tracking service, automatic matching, isolated guest waiting-room backend or completed hiring workflow.

Public reader URLs and existing creation/import/recovery endpoints remain available. The brand name in existing artwork and workspace chrome is preserved because brand consolidation is a separate concurrent workstream.

Local browser QA uses a new ephemeral browser profile and a synthetic project made through the actual local project/document APIs. It does not modify the user's saved artwork. Remote two-user microphone/video delivery and production API integration are not established by those browser tests.

## Verification evidence

- Full repository TypeScript check: `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false`, with a 12GB heap limit; passed without diagnostics.
- Virtual-space, workspace, navigation, view preference and route-authority regressions: 48 files, 520 tests passed.
- Additional route-group/title, route metadata, editor-home boundary and authentication-surface checks: 6 files, 127 tests passed. Total scoped coverage: 54 files, 647 tests; this is not the entire repository test suite.
- ESLint on changed source/tests and the browser check script: passed.
- `scripts/check-studio-first-workspace.mjs`: 15 browser checks passed, no page JavaScript errors. Includes 1440px desktop, 390px and 320px mobile, real local project/document resume, missing-project safety, team destination separation, list preference persistence, native dialog focus/Escape/restoration, and actual live-space shell entry.
- Browser screenshots and results are local review artifacts under `.qa/studio-first-20260920/`, deliberately excluded from source control.
- Production build review artifacts are under `apps/web/.qa/studio-first-20260920/dist/`; this is a local build, not a deployment.

## Local review

Run Vite from this worktree with `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4179 --strictPort`. Open `/home`, `/team` or `/hub` on that Mac. Choose an existing local work, or create/import one, to enter its playable studio. Local browser origin storage is independent from the production origin.

Keep the feature branch separate until integration review. No main merge, remote push, protection-rule change or production release is performed by this implementation. Source changes are reversible without document or database migrations.
