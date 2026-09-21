# WorkSession recovery and reviewed wrap-up — 2026-09-21

## Implemented

- Session entry loads only after an explicit opening. A failed React lazy resource is replaced on explicit retry/reopening, instead of reusing the cached rejected promise.
- The loading resource remains stable during ordinary parent renders. Changing works closes the entry immediately; old pending loads cannot mount in the new work.
- The existing close form can generate a literal draft from recorded decisions, agenda outcomes, unresolved notes, unconcluded agenda, the latest material decision and linked results.
- Draft generation, preview and application do not send a server command. Existing text needs explicit replacement consent. Applying the draft clears the separate close confirmation.
- A changed session version or changed closing text invalidates an observed draft. Oversized drafts remain fully visible and cannot be silently truncated/applied past the existing 4,000-character limit.
- An open closing form disappears when the actor loses host permission or participation. Existing server authorization/CAS remains authoritative.

## Boundaries

No new schema, repository, API, migration, server command, permission grant, media capture or publication was added. A material choice is not a rights grant; an attached task is not evidence of task completion. Ordinary notes and AI review notes are not promoted into verified decisions. Closing still needs a user-edited/accepted summary and the existing explicit confirmation.

A fresh React resource permits another loader attempt; persistent network failures or browser-cached module evaluation errors are not guaranteed to recover. Repeated failures keep the retry UI and do not start an automatic loop.

## Validation

- Work-session model-facing controller/component/client suite: 9 files / 71 tests passed locally.
- Full web/API typecheck and API-owned browser runner typecheck passed.
- Changed source ESLint passed before the final integration rerun; normal commit/push gates remain required.
- A local-only UI fixture is provided at `apps/web/tools/browser-harnesses/session-recovery-wrapup.html`.
- New browser runner creation was denied by the connected tool. The fixture was not executed in Chromium/Firefox; do not count its presence as browser validation or production evidence.
- Core build/CI and final merge results are recorded on the PR after execution, not inferred from the focused suite.

## Remaining scope

This increment does not complete the original virtual-studio backlog. Native storyboard editing, high-frequency presenter streaming, external guest review, recording retention, native 3D review, verified AI execution evidence, publication/revocation, visual world packages and WAN/scale verification remain in `virtual-studio-purpose-workflows-20260921.md`. The attempted new spatial-authoring files were not created because their tool request was denied; they are not part of this change.
