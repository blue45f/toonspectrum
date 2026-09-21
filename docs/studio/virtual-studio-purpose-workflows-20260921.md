# Virtual Studio purpose workflows — 2026-09-21

Status: implemented and locally verified; final PR/CI/main identity is recorded separately after execution. The user's current request authorizes implementation and main merge, not production deployment.

## Actual user paths

### Pinned storyboard/reading agenda

The existing WorkSession detail now includes a server-persisted agenda for reading, storyboard, scene review, mentoring and review sessions. Each entry refers to a page/cut in the session's actual immutable producer capture, with title, discussion purpose, dialogue/direction proposal and an explicitly joined assignee. Users can add, edit and reorder entries with buttons, inspect the exact pinned page, select the active agenda item, and record one explicit outcome. In reading sessions the active item's participant becomes the reading turn; leaving clears the existing reader pointer.

Order and dialogue here belong to the discussion agenda. They do not rewrite source page order, script text, camera state, approvals, tasks or publication. Native authoring changes still require the existing editor. A scene-review or mentoring kind is not evidence of native shared 3D camera synchronization or external student/mentor isolation.

### Shared material decision board

Invited participants who have explicitly joined and retain comment access can propose actual immutable work assets, with exact ID/type/SHA-256, rationale and stated usage conditions. Each actor owns one current ballot and can change or withdraw it. Only the current host can record a selection or reopen it, with the exact observed session version and a snapshot of the ballots. Withdrawal retains proposal history. Selecting or voting rechecks that the asset still exists under the same work and digest.

Image preview is explicit, uses the existing bounded/hash-verified private asset reader, and releases object URLs on expiration, hiding or unmount. 3D candidates retain identity/conditions but this increment does not load another WebGL runtime to preview them. Selection is not insertion, payment, legal permission, approval or publication.

## Data and permission boundaries

- Existing graph revision/operation/receipt tables remain the authority; no new table or migration is required.
- Historical v1 session events omit the optional `workflow` property. No default is injected into old create/reduce output, preserving historical state hashes and receipts.
- New commands use existing request IDs, request hashes, receipt recovery, exact session CAS and the 128-operation budget. The UI shows remaining operations and reserves existing close/cancel behavior.
- Agenda edits/removals/conclusions carry an observed item revision. Reorders carry the full observed order. Material decisions carry the observed session version. Background refresh cannot silently retarget stale forms.
- Item edits and outcomes are actor/work/session/item-scoped tab drafts. Errors, remounts and fresh reads preserve unsent text. Current item revisions and explicit discard/reinspection prevent replacing newer content.
- The resources endpoint first verifies current work access and session invitation, then verifies the exact pin. It exposes a 15-second metadata lease only: at most 25 mapped pages and 250 existing work assets. No manuscript body, signed media URL, blob bytes or access token is returned.
- Page identities come from the real producer capture and its immutable receipt/lineage, never current `creator_work.doc`. Unmapped legacy captures do not get invented source identities.
- Assigned participants must still have active user/work membership. A session invitation does not grant new work or media permissions.
- Existing generic graph APIs continue excluding reserved WorkSession artifacts.
- New API must be deployed before exposing these resources in a production Web release. Old API responses still parse because `workflow` is optional; old APIs do not implement the new commands/resources and the UI reports unavailable resources. Once new commands have been written, an older API without these replay variants must not be used as a rollback target. This turn performs no deployment.

## Preview and accessibility

Exact-page inspection verifies original page ID, source revision, digest and cut ID before opening. Ordinary scrolling, pointer interaction or zoom never makes a mismatched requested source valid. Manual page choice is a separate explicit action. A keyboard pan control cancels following and supports arrows, Page Up/Down, Home/End and Space without changing editor selection.

Responsive controls preserve native labels and 44px target intent. The fixture browser verification covers 1440/390/320px with no horizontal overflow and WCAG2 A/AA automated violations. It is not a complete screen-reader certification.

## Executed evidence

- Focused existing/new model, controller, component and service suite: 10 files / 87 tests passed.
- Disposable PostgreSQL, real immutable graph constraints and producer capture: 2 files / 38 integration tests passed. Includes new agenda pin/legacy source divergence/item-CAS and material ballot/decision/asset deletion/ACL scenarios, plus the existing producer and session regressions.
- Browser + actual repository + the same disposable PostgreSQL: reading add/turn/inspect/edit/reload/outcome and separate host/guest material propose/vote/select passed at 1440, 390 and 320px; 0 page errors, 0 automated accessibility violations. User identities and private object-storage service are explicit fixtures. This is not real-account sign-in, production object storage or WAN evidence.
- Browser artifacts: `/tmp/toon-session-purpose-browser/`; run log `/tmp/toon-workflows-browser-final.log`.
- Two initial browser runner attempts failed because exact text-label selectors included select/textarea child text, and the fixture initially lacked the existing 10-second session refresh. Failures are preserved; final verification uses accessible roles/names and the same refresh cadence as production, without longer timeouts or forced clicks.
- First root typecheck of the new Node runner accidentally pulled Nest decorators into the Web compiler. The runner was moved into `apps/api/tools`, with a separate mandatory API-owned typecheck. Product TypeScript settings and existing checked inputs were not relaxed.

## Reproduction

Use an explicitly new loopback test database with the existing `scripts/prepare-studio-review-test-db.mjs`; never inherit production `DATABASE_URL`. Start the normal Vite development harness on loopback, then:

```sh
TEST_DATABASE_URL=postgresql://studio_review_test@127.0.0.1:32772/studio_workflows_integration \
STUDIO_QA_BASE_URL=http://127.0.0.1:5367 \
pnpm run verify:studio-work-session-workflows
```

The runner checks the target policy, admits only its generated fixture identities and token, routes actual commands through the service/repository, and cleans up only its own test rows. The API helper is typechecked by the normal API typecheck and is not part of the production server build.

## Original requirement linkage and remaining scope

This closes the persisted discussion agenda/reading-turn/decision-candidate portions of VS03/VS06/VS20/VS22 and improves VS01/VS02/VS29. It does not turn those partial original requirements into a blanket completion of all 30 features.

Still separate: native storyboard authoring/reorder acceptance; high-frequency presenter streaming; version-pinned external guest reviews and mentoring-only access; recorded explanation upload/retention/deletion; native 3D scene/camera review integration; structured verified AI execution evidence/cost/diffs; approved public release and revocation; visual world editor/package/template/rule expansion; all-skin original animation coverage; multi-client offline world adoption and WAN/scale certification; remaining exhaustive #1905 lanes. Existing #1918 saved views/calendar and #1919 private review draft publication are preserved on main, not reimplemented here.


## Production world diagnostic repaired in this continuation

The outstanding `qa-studio-main-release.mjs` failure is repaired without restoring development-only `data-local-x/y` attributes. The checker opens the real public minimap and reads the player's actual painted percentage position. It still verifies that keyboard input moves the avatar and that search owns its keys without moving the avatar; absent, malformed and non-finite positions are rejected rather than converted to zero. The six viewport, private-session admission, canvas-size, navigation, list-mode and accessibility assertions remain intact.

Executed on the fresh integrated production build: all six viewport journeys and the keyboard/search/accessibility branch passed, with zero page errors, private admissions, horizontal overflow and accessibility violations. Evidence: `/tmp/toon-purpose-public-world/report.json`. The minimap parser's 11 focused tests passed. This closes that specific helper failure, not the other #1905 exhaustive lanes.

Final integrated runtime checks also passed: foundation 242 files / 5,717 tests; editing 186 files / 2,712 tests; four canonical PostgreSQL suites / 151 tests; and the API-owned real-DB browser command at 1440/390/320px. The full production bundle, notices, CSP and bundle structural/ratchet checks passed with no static regression. These scopes overlap the focused results above and are not added together as a single total.
