# Private interview and team-meeting lifecycle — 2026-09-20

Status: implemented browser follow-up. This document describes the existing hiring waiting-room/text surface, not the independent virtual-space media engine.

## Scope

- Room reads validate the expected room, current participant, host identity, role/status projection, bounded message shape and not-configured media contract before rendering. Guest views reject an accidentally over-disclosed participant roster. Browser checks supplement, never replace, the existing server authorization.
- Reads use the verified room epoch, a ten-second request timeout and no transport retries. One session performs one read at a time. A successful nonterminal read schedules the next check five seconds after completion; an error requires an explicit retry or an actual connection/visibility recovery.
- Hidden, offline and pagehide transitions cancel the current request, clear visible private results and stop timers. Returning triggers a fresh read. Ended/left/removed states stop polling; ended rooms do not mount device capture or sending controls. This is polling, not instant server-side revocation or a real-time media session.
- Writes are singular within the room session and are never automatically retried. Only a validated acknowledgement is reported as stored. A timeout, navigation or browser cancellation cannot establish whether the server rolled back. The UI asks the user to check the latest state before retrying an uncertain write.
- Unsent message drafts remain only in the mounted room/account component's memory through recoverable errors. Switching room/account clears the draft. A successful send clears only the submitted text; unrelated host actions do not clear the composition. No localStorage, IndexedDB, logging, analytics or external AI receives interview text.
- Scheduling is keyed to the kind/application/team/sorted participant identity. Late acknowledgements from a former scope cannot navigate the current form. Duplicate submits are blocked while pending; the server still owns collision and authorization decisions. Invalid end-before-start or longer-than-four-hour intervals fail before sending.
- Room listing initially shows loading, not a fabricated empty inbox. Account changes remount the private meeting panel.

## Local device checks

The existing device-test entry point is retained. The user can select microphone-only, camera-only or both before explicitly starting. Captured tracks stop on close, pagehide, hidden state, unmount, changing mode, a stop gesture or the existing thirty-second capture limit. No recording, audio playback or remote publication is added.

Permission prompts can remain unresolved. After thirty seconds the app invalidates the pending capture, explains that the browser permission dialog must be handled in the browser, and discards/stops any late stream. It does not claim it can close that dialog or cancel an underlying browser permission promise. It does not issue another concurrent permission request while one is unresolved, and a late rejection cannot overwrite the stopped state.

## Verification

Commands:

```sh
pnpm exec vitest run apps/web/src/domains/collaboration/hiring/creator-meeting-client.test.ts apps/web/src/domains/collaboration/hiring/creator-meeting-session.test.ts apps/web/src/domains/collaboration/hiring/CreatorMeetingRoom.test.tsx apps/web/src/domains/collaboration/hiring/CreatorMeetingScheduleForm.test.tsx apps/web/src/domains/collaboration/hiring/DeviceTest.test.tsx
CREATOR_HUB_E2E_PORT=5331 pnpm exec playwright test --config playwright.creator-hub.config.ts
pnpm run typecheck
```

The focused client/session/device/scheduling/rendered-room selection passed 49 tests with no failures or skips before upstream reconciliation. The complete existing creator-hub browser selection plus the new meeting file passed 16 desktop/mobile cases. New browser cases exercise failed-send draft recovery, current-room isolation and ended-room controls against the actual application route. Browser authentication and API responses are explicitly synthetic; these are not live-user or production end-to-end claims. Device unit tests use fake streams and do not attest physical hardware quality.

The browser configuration now includes the meeting file alongside, not instead of, existing creator-hub tests. The existing hiring workflow already selects the complete hiring UI test directory. No validation command, check, runtime permission, database migration, operator setting, external media provider or deployment has been removed or activated. Existing active worktrees, especially the separately-owned candidate discovery changes, are preserved.

Reference implementation guidance was checked against React useEffect cleanup and MDN getUserMedia/Page Visibility documentation. Test fixtures and logs remain under the local untracked QA directory, not in production code or public artifacts.

Pre-integration regression: 111 tests across 17 files passed, including all existing hiring UI, meeting API unit, injection, landmark and sitemap checks. Whole Web/API typecheck and changed-source lint passed after correcting the command discriminants and the post-permission visibility reread. No type inputs or strictness were reduced.
