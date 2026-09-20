# Studio workspace continuity and safe recovery

Date: 2026-09-20
Status: implemented follow-up to merged studio-first PR #1861; not a production deployment.
Base main: 2087abccd46885520138608bd4d5cf2d0b59a96d

## User-visible changes

- Home, team and explore preserve the current selected work, including an older work rather than silently choosing the newest one.
- Personal studio remains personal through menu navigation and the spatial team hotspot, even when other works exist.
- The first automatically selected work is pinned to that browser history entry with replace. A later library update does not switch the user's work; Back keeps the previous destination.
- Only the project pointer or explicit personal scope crosses these three workspace routes. Tabs, panels and arbitrary query data do not leak to another surface, the hiring platform, the materials marketplace or external URLs.
- Live-studio route identity takes precedence over contradictory query values. An unresolved explicit identity is not converted into another work.
- Library loading, unavailable works and storage errors are different visible states. Neither the spatial view, list view nor work inspector exposes stale artwork actions while validation is unresolved.
- Missing works have an explicit library/personal recovery path. Storage failures retain retry and storage inspection; public exploration remains available.
- The lazy spatial-view loader offers list view without waiting for imagery. The original image-error fallback is covered by a component regression.
- Work and tools launchers announce their dialog and expanded state. Existing media consent, document storage and editor authorities are unchanged.

## Verification

- Focused workspace, navigation, preference, introduction and live-space regression: 11 files / 136 tests passed.
- Browser journeys: 20 checks passed across desktop 1440px, tablet 820px and phones 390px/320px; no uncaught page errors. Synthetic projects are created in a fresh isolated browser context through existing project/document APIs, never in the user's normal browser profile.
- Browser assertions cover a competing newer work, exact document resume, menu identity continuity, Back/category restoration, personal scope, missing-work recovery in both views, dialog focus/Escape and the real live-space shell.
- Screenshot capture waits for tablet artwork decoding before checking the rendered spatial layout.
- Full Web/API typecheck and architecture/lint/secret gates are run by the normal pre-push hook. Production-build verification and final merge identity are reported separately after completion.

## Scope boundaries

No production deploy, database migration, public/private permission change, package upgrade, avatar artwork replacement or new AI service. This is a presentation/navigation continuity change, not cloud synchronization or a guarantee that a local work is accessible from another device.

Local review artifacts remain untracked under `.qa/studio-first-20260920/`. Reproduce with Vite on a free localhost port and `WORKSPACE_QA_URL=http://127.0.0.1:PORT node scripts/check-studio-first-workspace.mjs`.


## CI fixture isolation follow-up

The first full-suite CI attempt stopped before application tests: its PostgreSQL health command connected to `studio_full_integration` every five seconds while bootstrap requires zero other clients. The two full-suite workflows now probe the maintenance database `postgres`, leaving the application database, runtime role, NOLOGIN checks and full-suite execution unchanged. A regression contract prevents reintroducing the competing health probe. No production bootstrap SQL or database migration was changed.
