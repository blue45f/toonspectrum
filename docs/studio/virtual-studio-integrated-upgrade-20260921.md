# Virtual Studio integrated upgrade — 2026-09-21

Status: implementation/integration checkpoint. Not all 30 design requirements are complete. No production deployment is claimed here.

Integrated sources: UI `588b2548f` and inbox ACL `79d5b9766`; session `8130d16f0`; world authority/private media through `0c2439ec9`; remote main `033461143`; studio-first redesign v2 `5347d89c1`.

## Integrated journeys

- Live-space current work and exact resume, visible room/person search, one filtered people list retaining original appearance and social consent actions, adaptive desktop inspector.
- Existing review/tasks/receipt-backed handoff inbox, with immediate actor invalidation and a bounded access-check lease. Work sessions are explicitly reachable from this inbox and the production board.
- Server-authorized world publication, atomic per-client adoption, original layout retained on load failure, server door/session grants and symmetric private conversation consent consumed by scoped media.
- Pinned work-session draft/start/pause/close, explicit participation, notes, reading turns, periodic opt-in shared review viewport, validated outcome references and exact-intent receipt recovery.
- No replacement manuscript store, automatic approval/publication, automatic mic/recording, new paid infrastructure or production database mutation.

## Verification

Before integration: 60 UI/workspace files, 634 tests passed; dependency guard 4; inbox privacy 4; session model/controller/service/module 31 and detail UI 5 (overlapping runs are not summed).
Integrated run: 91 files / 893 tests; 892 passed and one failed because the private-room controls were in the space panel instead of the people panel. Corrected the actual component placement; the failing suite and inbox suite passed on rerun.
Integrated TypeScript identified old private-room fixture/harness typing issues. Corrected role/status literal typing, an inferred callback parameter, unsupported Testing Library option and harness `this` access. Final exact-head push/CI/build results remain mandatory.
Architecture and i18n generation checks passed. CI preserves existing required checks and adds both world and work-session real PostgreSQL suites. Database suite coverage now includes 16 suites in the full runner, with exact partition verification.

Local disposable PostgreSQL bootstrap execution was blocked by the tool safety check and stopped. New PostgreSQL integration scenarios are registered for the existing normal GitHub CI environment; local database success is not claimed. Synthetic browser/transport fixtures are not production WAN/media proof.

## Outstanding scope

See `virtual-studio-session-upgrade-20260921.md` for exact limits. Native shared storyboard editing, high-frequency presenter streaming, material voting, structured AI execution evidence, pinned external guest review, explanation upload/retention, full mentoring isolation, public approved showcase, advanced visual world editing/rules/templates, all-skin art expansion and scale/device certification are not completed by session-kind labels or these adapter changes.
